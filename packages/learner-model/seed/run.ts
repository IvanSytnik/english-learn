/**
 * Seed runner: validates the in-memory graph, then upserts concepts + edges
 * into the database.
 *
 * Run from packages/learner-model:
 *   pnpm seed:concepts
 *
 * Note: we instantiate PrismaClient directly here (instead of importing the
 * `prisma` singleton from @englishlearn/db) because that module is marked
 * "server-only" for Next.js safety, which blocks plain Node CLI execution.
 * A fresh client per CLI invocation is fine — HMR concerns don't apply here.
 */

import { PrismaClient } from '@englishlearn/db/generated/client/index.js';
import { buildGraph } from '../src/core/graph/build';
import { SEED_GRAPH } from './index';

const prisma = new PrismaClient();

async function main() {
  // 1. Validate the graph in memory first. If this throws, nothing hits the DB.
  const graph = buildGraph(SEED_GRAPH);
  console.log(
    `[seed:concepts] validated: ${graph.concepts.size} concepts, ${graph.edges.length} edges`,
  );

  // 2. Upsert concepts.
  for (const concept of SEED_GRAPH.concepts) {
    await prisma.concept.upsert({
      where: { id: concept.id },
      create: {
        id: concept.id,
        name: concept.name,
        description: concept.description ?? null,
        cefrLevel: concept.cefrLevel,
        category: concept.category,
      },
      update: {
        name: concept.name,
        description: concept.description ?? null,
        cefrLevel: concept.cefrLevel,
        category: concept.category,
      },
    });
  }
  console.log(`[seed:concepts] upserted ${SEED_GRAPH.concepts.length} concepts`);

  // 3. Upsert edges (compound unique = @@unique([fromId, toId, kind])).
  for (const edge of SEED_GRAPH.edges) {
    await prisma.conceptEdge.upsert({
      where: {
        fromId_toId_kind: {
          fromId: edge.from,
          toId: edge.to,
          kind: edge.kind,
        },
      },
      create: {
        fromId: edge.from,
        toId: edge.to,
        kind: edge.kind,
        weight: edge.weight,
      },
      update: {
        weight: edge.weight,
      },
    });
  }
  console.log(`[seed:concepts] upserted ${SEED_GRAPH.edges.length} edges`);
}

main()
  .catch((err) => {
    console.error('[seed:concepts] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
