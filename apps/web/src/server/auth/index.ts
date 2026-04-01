import NextAuth from 'next-auth';
import { cache } from 'react';

import { authConfig } from './config';

const { auth: authUncached, handlers, signIn, signOut } = NextAuth(authConfig);

const auth = cache(authUncached);

export { auth, authUncached, handlers, signIn, signOut };
