import cors from 'cors';
import express from 'express';
import session from 'express-session';
import { env } from './config/env.js';
import { pool } from './db/index.js';
import { passport } from './services/passport.js';
import authRoutes from './routes/authRoutes.js';
import emailRoutes from './routes/emailRoutes.js';
import { reconcilePendingJobs } from './services/schedulerService.js';

const app = express();

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(
  session({
    secret: env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.get('/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/api/emails', emailRoutes);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);

  if (error instanceof Error && 'issues' in error) {
    res.status(400).json({ message: 'Validation failed', details: error });
    return;
  }

  res.status(500).json({ message: error instanceof Error ? error.message : 'Internal server error' });
});

const server = app.listen(env.PORT, async () => {
  await reconcilePendingJobs();
  console.log(`API server running on port ${env.PORT}`);
});

process.on('SIGTERM', async () => {
  server.close();
  await pool.end();
  process.exit(0);
});
