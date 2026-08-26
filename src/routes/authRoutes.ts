import { Router } from 'express';
import { env } from '../config/env.js';
import { passport } from '../services/passport.js';

const router = Router();

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: `${env.FRONTEND_URL}/login?error=auth_failed` }),
  (_req, res) => {
    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  }
);

router.get('/me', (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  res.json({ user: req.user });
});

router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) {
      next(err);
      return;
    }

    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        next(destroyErr);
        return;
      }

      res.clearCookie('connect.sid');
      res.status(204).send();
    });
  });
});

export default router;
