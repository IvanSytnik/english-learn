// packages/db/src/seed.ts
//
// Idempotent dev seed: the fixed admin + student accounts only. Content
// (concepts, items, diagnostic bank) is seeded by @englishlearn/learner-model.

import { createPrismaClient } from './create-client';
import { seedUsers } from './seed-users';

const prisma = createPrismaClient(process.env.DATABASE_URL);

async function main() {
  console.log('→ Seeding users…');
  const { admin, student } = await seedUsers(prisma);
  console.log(`  ✓ admin: ${admin.email}`);
  console.log(`  ✓ student: ${student.email}`);

  console.log('✓ Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
