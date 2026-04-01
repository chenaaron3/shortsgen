import type { DefaultSession, NextAuthConfig } from "next-auth";
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import { env } from '~/env';
import { ensureCreditBalance } from '~/server/credits';
import { db } from '~/server/db';

import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { account, session, SIGNUP_CREDITS, user, verificationToken } from '@shortgen/db';

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

const providers = [
  Google({
    clientId: env.AUTH_GOOGLE_ID,
    clientSecret: env.AUTH_GOOGLE_SECRET,
  }),
];

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers,
  adapter: DrizzleAdapter(db, {
    usersTable: user,
    accountsTable: account,
    sessionsTable: session,
    verificationTokensTable: verificationToken,
  }),
  callbacks: {
    session: ({ session, user }) => ({
      ...session,
      user: {
        ...session.user,
        id: user.id,
      },
    }),
  },
  events: {
    createUser: async ({ user }) => {
      if (user.id) await ensureCreditBalance(db, user.id, SIGNUP_CREDITS);
    },
  },
} satisfies NextAuthConfig;
