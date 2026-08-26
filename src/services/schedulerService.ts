import { PoolClient } from 'pg';
import { emailQueue } from '../queue/emailQueue.js';
import { pool } from '../db/index.js';
import { env } from '../config/env.js';
import { ScheduleEmailRequest } from '../types/email.js';

function toDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid startTime');
  }
  return date;
}

function queueJobId(emailJobId: string, scheduledAt: Date): string {
  return `${emailJobId}_${scheduledAt.getTime()}`;
}

export async function scheduleCampaign(payload: ScheduleEmailRequest) {
  const startTime = toDate(payload.startTime);
  const delayMs = payload.delayMs ?? env.MIN_DELAY_BETWEEN_EMAILS_MS;
  const hourlyLimit = payload.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const attachmentsJson = JSON.stringify(payload.attachments || []);

    const campaignRes = await client.query(
      `INSERT INTO campaigns (subject, body, sender_email, start_time, per_email_delay_ms, hourly_limit, attachments)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING id`,
      [payload.subject, payload.body, payload.senderEmail, startTime.toISOString(), delayMs, hourlyLimit, attachmentsJson]
    );

    const campaignId: string = campaignRes.rows[0].id;
    const jobsToEnqueue: Array<{ queueId: string; runAt: Date; emailJobId: string; senderEmail: string; hourlyLimit: number }> = [];

    for (const [index, recipient] of payload.recipients.entries()) {
      const scheduledAt = new Date(startTime.getTime() + index * delayMs);
      const jobRes = await insertEmailJob(client, {
        campaignId,
        recipient,
        senderEmail: payload.senderEmail,
        subject: payload.subject,
        body: payload.body,
        scheduledAt,
        attachmentsJson
      });

      const qId = queueJobId(jobRes.id, scheduledAt);
      await client.query('UPDATE email_jobs SET queue_job_id = $1 WHERE id = $2', [qId, jobRes.id]);

      jobsToEnqueue.push({
        queueId: qId,
        runAt: scheduledAt,
        emailJobId: jobRes.id,
        senderEmail: payload.senderEmail,
        hourlyLimit
      });
    }

    await client.query('COMMIT');

    await Promise.all(
      jobsToEnqueue.map((job) =>
        emailQueue.add(
          'send-email',
          {
            emailJobId: job.emailJobId,
            senderEmail: job.senderEmail,
            hourlyLimit: job.hourlyLimit
          },
          {
            jobId: job.queueId,
            delay: Math.max(0, job.runAt.getTime() - Date.now())
          }
        )
      )
    );

    return { campaignId, scheduledCount: jobsToEnqueue.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function insertEmailJob(
  client: PoolClient,
  params: {
    campaignId: string;
    recipient: string;
    senderEmail: string;
    subject: string;
    body: string;
    scheduledAt: Date;
    attachmentsJson: string;
  }
): Promise<{ id: string }> {
  const res = await client.query(
    `INSERT INTO email_jobs (campaign_id, recipient_email, sender_email, subject, body, scheduled_at, status, queue_job_id, attachments)
     VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', 'pending', $7::jsonb)
     RETURNING id`,
    [
      params.campaignId,
      params.recipient,
      params.senderEmail,
      params.subject,
      params.body,
      params.scheduledAt.toISOString(),
      params.attachmentsJson
    ]
  );

  return { id: res.rows[0].id };
}

export async function reconcilePendingJobs() {
  try {
    const result = await pool.query(
      `SELECT id, sender_email, scheduled_at,
              (SELECT hourly_limit FROM campaigns WHERE campaigns.id = email_jobs.campaign_id) AS hourly_limit,
              queue_job_id
       FROM email_jobs
       WHERE status IN ('scheduled', 'deferred')`
    );

    for (const row of result.rows) {
      const sanitizedQueueId = row.queue_job_id?.replace(/:/g, '_') || queueJobId(row.id, new Date(row.scheduled_at));
      if (sanitizedQueueId !== row.queue_job_id) {
        await pool.query('UPDATE email_jobs SET queue_job_id = $1 WHERE id = $2', [sanitizedQueueId, row.id]);
      }

      const existing = await emailQueue.getJob(sanitizedQueueId);
      if (existing) {
        continue;
      }

      await emailQueue.add(
        'send-email',
        {
          emailJobId: row.id,
          senderEmail: row.sender_email,
          hourlyLimit: Number(row.hourly_limit)
        },
        {
          jobId: sanitizedQueueId,
          delay: Math.max(0, new Date(row.scheduled_at).getTime() - Date.now())
        }
      );
    }
  } catch (error) {
    console.error('Error during reconcilePendingJobs:', error);
  }
}
