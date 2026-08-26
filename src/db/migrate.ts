import { pool } from './index.js';

const migrationSql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  per_email_delay_ms INTEGER NOT NULL,
  hourly_limit INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'deferred', 'sending', 'sent', 'failed')),
  queue_job_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_email_jobs_status_scheduled_at ON email_jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_email_jobs_queue_job_id ON email_jobs(queue_job_id);

CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_job_id UUID NOT NULL REFERENCES email_jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE email_jobs ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE email_jobs ADD COLUMN IF NOT EXISTS is_starred BOOLEAN DEFAULT FALSE;
`;

async function runMigrations() {
  await pool.query(migrationSql);
  console.log('Database migrations completed.');
  await pool.end();
}

runMigrations().catch(async (error) => {
  console.error('Migration failed:', error);
  await pool.end();
  process.exit(1);
});
