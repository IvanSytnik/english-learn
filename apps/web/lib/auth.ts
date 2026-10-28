import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@englishlearn/db';
import { compare } from 'bcryptjs';
import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { clientIp, emailSubject, RATE_LIMITED_CODE, withinAuthLimits } from './auth/rate-limit';
import { jwtWithRevocation } from './auth/session-revocation';
import { authConfig } from './auth.config';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// bcrypt (cost 10, same as real hashes) of a discarded random string. Compared
// against when there is no hash to check, so an unknown email takes as long as
// a wrong password and response time does not reveal which accounts exist.
const DUMMY_HASH = '$2b$10$4QIKH6DGwwh048z8q8ARUOzDTmPgnatnXjQj0uMQqj52YwCTmEDci';

/** Lets the login action tell throttling from a wrong password. */
class RateLimitedSignin extends CredentialsSignin {
  override code = RATE_LIMITED_CODE;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  callbacks: { ...authConfig.callbacks, jwt: jwtWithRevocation },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      // Throttled here, not in the login action: POST /api/auth/callback/credentials
      // reaches authorize without the action.
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const allowed = await withinAuthLimits([
          ['login:ip', clientIp(request.headers)],
          ['login:email', emailSubject(email)],
        ]);
        if (!allowed) throw new RateLimitedSignin();

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) {
          await compare(password, DUMMY_HASH);
          return null;
        }

        const ok = await compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
});
