import type { SessionUser } from './auth.js';

declare global {
  namespace Express {
    interface User extends SessionUser {}
  }
}

export {};
