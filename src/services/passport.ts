import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from '../config/env.js';
import type { SessionUser } from '../types/auth.js';

passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL
    },
    (_accessToken, _refreshToken, profile, done) => {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        return done(new Error('Google profile email missing'));
      }

      const user: SessionUser = {
        displayName: profile.displayName,
        email,
        picture: profile.photos?.[0]?.value || ''
      };

      return done(null, user);
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user: Express.User, done) => {
  done(null, user);
});

export { passport };
