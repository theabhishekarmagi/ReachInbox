import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import { redis } from './redis.js';

export const emailQueue = new Queue(env.QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: 1000,
    removeOnFail: 5000
  }
});
