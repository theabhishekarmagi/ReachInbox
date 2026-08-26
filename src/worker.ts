import { Job, Worker } from 'bullmq';
import { env } from './config/env.js';
import { pool } from './db/index.js';
import { emailQueue } from './queue/emailQueue.js';
import { redis } from './queue/redis.js';
import { sendEmail } from './services/emailService.js';
import { tryAcquireHourlySlot } from './services/rateLimiter.js';
import { QueuePayload } from './types/email.js';

function queueJobId(emailJobId: string, scheduledAt: Date): string {
  return `${emailJobId}_${scheduledAt.getTime()}`;
}

async function processEmailJob(job: Job<QueuePayload>) {
  const { emailJobId, senderEmail, hourlyLimit } = job.data;

  const emailJobResult = await pool.query(
    `SELECT id, recipient_email, subject, body, sender_email, status, attachments
     FROM email_jobs
     WHERE id = $1`,
    [emailJobId]
  );

  if (emailJobResult.rowCount === 0) {
    return;
  }

  const emailJob = emailJobResult.rows[0] as {
    id: string;
    recipient_email: string;
    subject: string;
    body: string;
    sender_email: string;
    status: string;
    attachments: Array<{ filename: string; content?: string; contentType?: string }>;
  };

  if (emailJob.status === 'sent') {
    return;
  }

  const slot = await tryAcquireHourlySlot(senderEmail, hourlyLimit);

  if (!slot.allowed) {
    const nextAt = new Date(Date.now() + slot.retryInMs + env.MIN_DELAY_BETWEEN_EMAILS_MS);
    const nextQueueId = queueJobId(emailJobId, nextAt);

    await pool.query(
      `UPDATE email_jobs
       SET status = 'deferred', scheduled_at = $1, queue_job_id = $2, updated_at = NOW()
       WHERE id = $3`,
      [nextAt.toISOString(), nextQueueId, emailJobId]
    );

    await pool.query(
      `INSERT INTO email_events (email_job_id, event_type, metadata)
       VALUES ($1, 'deferred_rate_limit', $2::jsonb)`,
      [emailJobId, JSON.stringify({ retryInMs: slot.retryInMs })]
    );

    await emailQueue.add(
      'send-email',
      { emailJobId, senderEmail, hourlyLimit },
      {
        jobId: nextQueueId,
        delay: Math.max(0, nextAt.getTime() - Date.now())
      }
    );

    return;
  }

  await pool.query(`UPDATE email_jobs SET status = 'sending', updated_at = NOW() WHERE id = $1`, [emailJobId]);

  try {
    const info = await sendEmail({
      to: emailJob.recipient_email,
      subject: emailJob.subject,
      body: emailJob.body,
      senderEmail: emailJob.sender_email,
      attachments: emailJob.attachments
    });

    await pool.query(
      `UPDATE email_jobs
       SET status = 'sent', sent_at = NOW(), error_message = NULL, updated_at = NOW()
       WHERE id = $1`,
      [emailJobId]
    );

    await pool.query(
      `INSERT INTO email_events (email_job_id, event_type, metadata)
       VALUES ($1, 'sent', $2::jsonb)`,
      [emailJobId, JSON.stringify({ messageId: info.messageId })]
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown send error';

    await pool.query(
      `UPDATE email_jobs
       SET status = 'failed', error_message = $1, updated_at = NOW()
       WHERE id = $2`,
      [message, emailJobId]
    );

    await pool.query(
      `INSERT INTO email_events (email_job_id, event_type, metadata)
       VALUES ($1, 'failed', $2::jsonb)`,
      [emailJobId, JSON.stringify({ message })]
    );

    throw error;
  }
}

const worker = new Worker<QueuePayload>(
  env.QUEUE_NAME,
  async (job) => processEmailJob(job),
  {
    connection: redis,
    concurrency: env.WORKER_CONCURRENCY
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} processed.`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

console.log(`Worker started with concurrency=${env.WORKER_CONCURRENCY}`);
