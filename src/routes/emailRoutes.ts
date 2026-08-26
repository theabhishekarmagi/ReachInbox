import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/index.js';
import { ensureAuth } from '../middleware/ensureAuth.js';
import { emailQueue } from '../queue/emailQueue.js';
import { scheduleCampaign } from '../services/schedulerService.js';

const router = Router();

router.use(ensureAuth);

const scheduleSchema = z.object({
  senderEmail: z.string().email().optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
  recipients: z.array(z.string().email()).min(1),
  startTime: z.string(),
  delayMs: z.number().int().positive().optional(),
  hourlyLimit: z.number().int().positive().optional(),
  attachments: z.array(
    z.object({
      filename: z.string(),
      contentType: z.string().optional(),
      content: z.string().optional(),
      size: z.string().optional(),
      previewUrl: z.string().optional()
    })
  ).optional()
});

router.post('/schedule', async (req, res, next) => {
  try {
    const payload = scheduleSchema.parse(req.body);
    const senderEmail = payload.senderEmail ?? req.user?.email;

    if (!senderEmail) {
      res.status(400).json({ message: 'Sender email is required' });
      return;
    }

    const result = await scheduleCampaign({ ...payload, senderEmail });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/scheduled', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, recipient_email AS email, sender_email, subject, body, scheduled_at, status, attachments, COALESCE(is_starred, false) AS is_starred
       FROM email_jobs
       WHERE status IN ('scheduled', 'deferred', 'sending')
       ORDER BY scheduled_at ASC`
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get('/sent', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, recipient_email AS email, sender_email, subject, body, sent_at, status, error_message, attachments, COALESCE(is_starred, false) AS is_starred
       FROM email_jobs
       WHERE status IN ('sent', 'failed')
       ORDER BY sent_at DESC NULLS LAST, updated_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get('/starred', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, recipient_email AS email, sender_email, subject, body, scheduled_at, sent_at, status, error_message, attachments, COALESCE(is_starred, false) AS is_starred
       FROM email_jobs
       WHERE is_starred = TRUE
       ORDER BY COALESCE(sent_at, scheduled_at, created_at) DESC`
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, recipient_email AS email, sender_email, subject, body, scheduled_at, sent_at, status, error_message, attachments, COALESCE(is_starred, false) AS is_starred, created_at
       FROM email_jobs
       WHERE id = $1`,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Email not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/star', async (req, res, next) => {
  try {
    const { id } = req.params;
    const isStarred = Boolean(req.body.is_starred);
    const result = await pool.query(
      `UPDATE email_jobs
       SET is_starred = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, is_starred`,
      [isStarred, id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Email not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const jobRes = await pool.query('SELECT queue_job_id, status FROM email_jobs WHERE id = $1', [id]);
    if (jobRes.rowCount === 0) {
      res.status(404).json({ message: 'Email not found' });
      return;
    }

    const { queue_job_id, status } = jobRes.rows[0];
    if (status === 'scheduled' || status === 'deferred') {
      try {
        const queueJob = await emailQueue.getJob(queue_job_id);
        if (queueJob) {
          await queueJob.remove();
        }
      } catch (queueErr) {
        console.error('Failed to remove job from queue:', queueErr);
      }
    }

    await pool.query('DELETE FROM email_jobs WHERE id = $1', [id]);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
