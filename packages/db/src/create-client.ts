import { PrismaPg } from '@prisma/adapter-pg';
import { type Prisma, PrismaClient } from './generated/client/index';

type CreatePrismaClientOptions = Omit<
  Prisma.PrismaClientOptions,
  'adapter' | 'datasources' | 'datasourceUrl'
>;

/**
 * The only place a PrismaClient is constructed in the monorepo.
 *
 * The client runs with `engineType = "client"` (no Rust query engine), so it
 * needs a driver adapter. Pass the pooled DATABASE_URL at runtime; the Prisma
 * CLI keeps using DIRECT_URL via `datasource.directUrl`.
 *
 * Deliberately free of `server-only` so seeds and scripts can import it.
 */
export function createPrismaClient(
  url: string | undefined,
  options?: CreatePrismaClientOptions,
): PrismaClient {
  if (!url) {
    throw new Error('createPrismaClient: database URL is not set');
  }
  return new PrismaClient({ ...options, adapter: new PrismaPg({ connectionString: url }) });
}
