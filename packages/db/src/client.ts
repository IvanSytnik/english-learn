import 'server-only';
import { PrismaClient } from './generated/client/index';

/**
 * Singleton Prisma client.
 * In development, attach to globalThis to survive HMR reloads.
 * In production, a fresh client per process is fine.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
