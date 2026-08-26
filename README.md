# ReachInbox — Full-Stack Email Job Scheduler

A distributed, production-grade Email Job Scheduler built with **Node.js/Express**, **PostgreSQL**, **BullMQ**, **Redis**, and a modern **React (Vite + Tailwind CSS + Lucide Icons)** frontend.

---

## 📑 Table of Contents
1. [Project Overview & Architecture](#-project-overview--architecture)
   - [How Scheduling Works (Zero Cron)](#1-how-scheduling-works-zero-cron)
   - [How Persistence Across Restarts is Handled](#2-how-persistence-across-restarts-is-handled)
   - [How Rate Limiting & Concurrency are Implemented](#3-how-rate-limiting--concurrency-are-implemented)
   - [Behavior Under Load (1000+ Emails)](#4-behavior-under-load-1000-emails)
2. [Features Implemented](#-features-implemented)
   - [Backend Features](#backend-features)
   - [Frontend Features](#frontend-features)
3. [Environment Variables & Ethereal Setup](#-environment-variables--ethereal-setup)
   - [Setting Up Free Ethereal SMTP Credentials](#setting-up-free-ethereal-smtp-credentials)
   - [Setting Up Google OAuth 2.0 Credentials](#setting-up-google-oauth-20-credentials)
   - [Full `.env` Configuration](#full-env-configuration)
4. [Step-by-Step Run Instructions](#-step-by-step-run-instructions)
   - [1. Prerequisites](#1-prerequisites)
   - [2. Start Infrastructure (Postgres + Redis)](#2-start-infrastructure-postgres--redis)
   - [3. Run Database Migrations](#3-run-database-migrations)
   - [4. Start Backend API Server](#4-start-backend-api-server)
   - [5. Start BullMQ Worker](#5-start-bullmq-worker)
   - [6. Start Frontend App](#6-start-frontend-app)
5. [API Reference](#-api-reference)
6. [Build & Verification Commands](#-build--verification-commands)

---

## 🏗 Project Overview & Architecture

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  React Frontend │ ────> │ Express API     │ ────> │ PostgreSQL DB   │
│  (Port 3000)    │       │ (Port 5001)     │       │ (Port 5433)     │
└─────────────────┘       └────────┬────────┘       └────────┬────────┘
                                   │                         │
                                   ▼                         │
                          ┌─────────────────┐                │
                          │ Redis + BullMQ  │ <──────────────┘ (Reconciliation)
                          │ (Port 6379)     │
                          └────────┬────────┘
                                   │
                                   ▼
                          ┌─────────────────┐       ┌─────────────────┐
                          │ BullMQ Worker   │ ────> │ Ethereal SMTP   │
                          │ (Concurrency=5) │       │ (Nodemailer)    │
                          └─────────────────┘       └─────────────────┘
```

### 1. How Scheduling Works (Zero Cron)
- **Strictly No Cron**: No OS-level cron (`crontab`), no Node libraries (`node-cron`, `agenda`, etc.).
- When an email campaign is created via `POST /api/emails/schedule`, the backend calculates the exact millisecond delay for each recipient:
  $$\text{delay}_i = \max\Big(0, (\text{startTime} + i \times \text{delayMs}) - \text{Date.now()}\Big)$$
- Each job is enqueued into **BullMQ** as a native delayed job:
  ```ts
  await emailQueue.add(
    'send-email',
    { emailJobId, senderEmail, hourlyLimit },
    { jobId: `${emailJobId}_${scheduledAt.getTime()}`, delay }
  );
  ```
- BullMQ leverages Redis Sorted Sets (`ZSET`) where the score is the target execution timestamp. Redis triggers job availability when the scheduled time arrives without periodic polling.

### 2. How Persistence Across Restarts is Handled
- **Relational Storage (PostgreSQL)**: Every scheduling request writes the parent campaign to `campaigns` and individual recipient jobs to `email_jobs` inside an atomic transaction (`BEGIN ... COMMIT`).
- **Redis AOF**: Redis is configured with Append-Only File (`appendonly yes`), ensuring delayed queue state is persisted to disk across restarts.
- **Crash Recovery & Reconciliation**:
  When the backend API starts up (`src/server.ts`), it runs `reconcilePendingJobs()`:
  1. Queries PostgreSQL for any jobs with status `scheduled` or `deferred`.
  2. Checks Redis via `emailQueue.getJob(queue_job_id)`.
  3. If a job is missing from Redis (e.g. after a hard Redis flush or server crash), it automatically re-enqueues it with the remaining delay:
     $$\text{remainingDelay} = \max(0, \text{scheduledAt} - \text{Date.now()})$$
- **Idempotency**:
  - Jobs already in status `sent` in PostgreSQL are never re-enqueued.
  - Worker performs an atomic status check before dispatching: `if (emailJob.status === 'sent') return;`.
  - Deterministic BullMQ job IDs (`${emailJobId}_${scheduledAt.getTime()}`) prevent duplicate queue entries.

### 3. How Rate Limiting & Concurrency are Implemented
- **Configurable Worker Concurrency**:
  - Defined via `WORKER_CONCURRENCY` in `.env` (e.g., `5`).
  - Worker is instantiated with `{ connection: redis, concurrency: env.WORKER_CONCURRENCY }` to process jobs in parallel safely.
- **Per-Email Delay**:
  - Configured via `MIN_DELAY_BETWEEN_EMAILS_MS` (default: `2000` ms / 2 seconds).
  - Recipient dispatches within a campaign are staggered to avoid provider throttling.
- **Per-Sender Hourly Rate Limiting (Distributed & Safe)**:
  - Configured via `MAX_EMAILS_PER_HOUR_PER_SENDER` (default: `200` emails/hour).
  - Enforced across multiple worker processes using an **atomic Redis Lua script**:
    ```lua
    local key = KEYS[1]
    local maxAllowed = tonumber(ARGV[1])
    local ttlMs = tonumber(ARGV[2])
    local current = tonumber(redis.call('GET', key) or '0')
    if current >= maxAllowed then
      return {0, redis.call('PTTL', key)}
    end
    current = redis.call('INCR', key)
    if current == 1 then
      redis.call('PEXPIRE', key, ttlMs)
    end
    return {1, current}
    ```
  - **Key Structure**: `email-rate:<sender_email>:<hour_window_iso>`
- **No Dropped Jobs (Automatic Deferral)**:
  - If the rate limit is exceeded, the Lua script returns `{0, pttl}` (milliseconds remaining in the hour).
  - The job status in PostgreSQL is updated to `deferred`, and an event is logged in `email_events`.
  - The worker reschedules the job with BullMQ delayed queue for the **start of the next hour window**:
    $$\text{nextRunAt} = \text{Date.now()} + \text{retryInMs} + \text{MIN\_DELAY\_BETWEEN\_EMAILS\_MS}$$

### 4. Behavior Under Load (1000+ Emails)
- **High Ingestion**: 1,000+ recipients are batched into PostgreSQL in a single transaction and registered into BullMQ in parallel.
- **Controlled Execution**: The worker pool picks up jobs according to `WORKER_CONCURRENCY`.
- **Automatic Spillover**: The first 200 emails send in the current hour window. The remaining 800 emails are automatically deferred into subsequent hour windows (200/hr) with zero dropped emails and zero duplicates.

---

## 🌟 Features Implemented

### Backend Features
- [x] **RESTful Scheduling API**: `POST /api/emails/schedule` supporting subject, rich body, multiple recipients, per-email delay, hourly limits, and file attachments.
- [x] **Relational Schema & Migrations**: Automated PostgreSQL migrations with `pgcrypto` (`campaigns`, `email_jobs`, `email_events`).
- [x] **BullMQ Delayed Jobs**: Native delay-based event queue in Redis without cron.
- [x] **Multi-Sender Ethereal SMTP**: Nodemailer integration supporting multiple sender accounts with TLS.
- [x] **Atomic Redis Rate Limiting**: Distributed Lua script rate limiter per sender/hour.
- [x] **Queue Re-scheduling & Deferral**: Automatic rollover to next hour window on limit exhaustion.
- [x] **Startup Reconciliation**: Recovery mechanism restoring pending delayed jobs on server boot.
- [x] **Document & Attachment Storage**: Base64 attachment ingestion, JSONB persistence, and Nodemailer MIME attachment encoding.
- [x] **Email Management API**:
  - `GET /api/emails/scheduled` (lists pending and deferred jobs)
  - `GET /api/emails/sent` (lists sent and failed jobs)
  - `GET /api/emails/:id` (retrieves full email details)
  - `DELETE /api/emails/:id` (cancels active queue job and deletes database record)
- [x] **Google OAuth 2.0 Authentication**: Session-based passport auth with secure cookie credentials.

### Frontend Features
- [x] **Google OAuth Login Screen**: Clean login card with Google Sign-In redirect.
- [x] **Dashboard Layout**:
  - Pixel font (**Press Start 2P**) for `ONB` brand logo.
  - Sidebar with active state highlights, user profile card, and live badge counts for Scheduled & Sent tabs.
  - Search bar with Lucide `Search` icon and Filter/Refresh buttons.
- [x] **List Views (Scheduled & Sent)**:
  - Extracted sender/recipient name formatting (`To: John Smith`).
  - Orange date/time indicator pill for scheduled items.
  - Bold subject line + preview snippet layout with star hover actions.
- [x] **Compose Email Interface**:
  - Inline recipient chips with keyboard shortcuts (`Enter` / `,`).
  - **Upload List button** (`↑ Upload List`) supporting CSV, TXT, or any text file to auto-populate recipients.
  - **Rich Text Editor Toolbar**: Undo, Redo, Heading, Bold, Italic, Underline, Align, Lists, Indents, Quote, Code, and Strikethrough.
  - **Document & Image Attachments**:
    - Upload any file format via the Paperclip icon.
    - Real-time attachment counter badge (`Paperclip 1`).
    - Attachment preview cards below text editor with image thumbnails, document icons, file sizes, and delete buttons.
  - **Send Later Popover**:
    - Calendar date & time picker input.
    - Quick-select preset options (`Tomorrow`, `Tomorrow, 10:00 AM`, `Tomorrow, 11:00 AM`, `Tomorrow, 3:00 PM`).
    - `Cancel` and `Done` confirmation actions.
- [x] **Authentic Gmail-Format Email Detail View (`/mail/:id`)**:
  - Full email header with real subject, status badge (`SENT`, `SCHEDULED`, `FAILED`).
  - Sender initial avatar, sender address, and collapsible recipient details dropdown (From, To, Date, Subject, TLS security).
  - Exact unadulterated message body preserving formatting.
  - **Attachment Gallery**: Downloadable preview cards for images and documents.
  - **Action Toolbar**: Back, Inbox navigation, Delete email (with queue cancellation), Print, Star, and Reply/Forward buttons pre-filling the compose window.

---

## ⚙️ Environment Variables & Ethereal Setup

### Setting Up Free Ethereal SMTP Credentials
Ethereal is a free, fake SMTP service created for testing email delivery.

1. Navigate to **[https://ethereal.email/create](https://ethereal.email/create)**.
2. Click **"Create Ethereal Account"**.
3. It will generate test credentials:
   - **Account**: `your_account@ethereal.email`
   - **Password**: `your_password`
   - **Host**: `smtp.ethereal.email`
   - **Port**: `587`
4. Copy these values into your `.env` file under `SMTP_USER` and `SMTP_PASS`.
5. You can view all sent emails at **[https://ethereal.email/messages](https://ethereal.email/messages)** by logging in.

### Setting Up Google OAuth 2.0 Credentials
1. Go to the **[Google Cloud Console](https://console.cloud.google.com/)** -> **APIs & Services** -> **Credentials**.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Add Authorized Redirect URI: `http://localhost:5001/auth/google/callback`.
4. Copy Client ID and Client Secret to `.env`.

### Full `.env` Configuration
Create a `.env` file in the root directory:

```env
# Server & Client
PORT=5001
CLIENT_URL=http://localhost:3000

# PostgreSQL Database (Docker Port 5433)
DATABASE_URL=postgres://reachinbox:reachinbox@localhost:5433/reachinbox

# Redis Cache & Queue (Docker Port 6379)
REDIS_URL=redis://localhost:6379

# BullMQ Queue & Concurrency Limits
QUEUE_NAME=email-dispatch
WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_EMAILS_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200

# Ethereal SMTP Configuration
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_ethereal_user@ethereal.email
SMTP_PASS=your_ethereal_password
SMTP_FROM_NAME=ReachInbox Team

# Google OAuth 2.0
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5001/auth/google/callback
SESSION_SECRET=a_strong_random_session_secret_key
```

---

## 🚀 Step-by-Step Run Instructions

### 1. Prerequisites
- **Node.js** >= 18.0.0
- **Docker Desktop** installed and running

### 2. Start Infrastructure (Postgres + Redis)
Start PostgreSQL on port `5433` and Redis on port `6379`:
```bash
docker compose up -d
```
Verify containers are running:
```bash
docker ps
```

### 3. Run Database Migrations
Create tables (`campaigns`, `email_jobs`, `email_events`) and extensions:
```bash
npm run migrate
```

### 4. Start Backend API Server
Runs Express server with authentication, reconciliation, and scheduler endpoints on port `5001`:
```bash
npm run dev:api
```

### 5. Start BullMQ Worker
In a **new terminal window**, start the BullMQ email dispatch worker:
```bash
npm run dev:worker
```

### 6. Start Frontend App
In a **new terminal window**, start the Vite React development server on port `3000`:
```bash
npm run dev:web
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/emails/schedule` | Schedule email campaign with delay, rate limit, and attachments |
| `GET` | `/api/emails/scheduled` | List upcoming scheduled and deferred emails |
| `GET` | `/api/emails/sent` | List successfully delivered and failed emails |
| `GET` | `/api/emails/:id` | Get full email details (subject, body, sender, recipient, attachments) |
| `DELETE` | `/api/emails/:id` | Cancel pending BullMQ queue job and delete email from DB |
| `GET` | `/health` | Server health check endpoint |
| `GET` | `/auth/google` | Trigger Google OAuth 2.0 authentication |
| `GET` | `/auth/google/callback` | Google OAuth callback handler |
| `GET` | `/auth/me` | Get current authenticated user session |
| `POST` | `/auth/logout` | Destroy user session and clear auth cookies |

---

## 🔍 Build & Verification Commands

To verify TypeScript types and build production bundles:

```bash
# Type-check frontend code
npx tsc -p tsconfig.web.json --noEmit

# Type-check backend code
npx tsc -p tsconfig.json --noEmit

# Build production bundle for web
npm run build:web

# Build production bundle for API
npm run build:api
```
