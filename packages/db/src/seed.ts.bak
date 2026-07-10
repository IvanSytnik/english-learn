/**
 * Seed script. Run with: pnpm db:seed
 *
 * Seeds:
 *  - 1 admin user (admin@englishlearn.dev / password: admin1234 — CHANGE IN PROD)
 *  - 1 student user (student@englishlearn.dev / password: student1234)
 *  - Skill tags taxonomy
 *  - A handful of PUBLISHED diagnostic items across CEFR levels
 *  - A handful of PUBLISHED exercises so the dashboard isn't empty
 */
import { hash } from 'bcryptjs';
import {
  CefrLevel,
  ContentStatus,
  DiagnosticItemType,
  ExerciseSource,
  PrismaClient,
  SkillCategory,
  UserRole,
} from './generated/client/index';

const prisma = new PrismaClient();

async function main() {
  console.info('🌱 Seeding database...');

  // Users ────────────────────────────────────────────────────
  const adminPassword = await hash('admin1234', 10);
  const studentPassword = await hash('student1234', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@englishlearn.dev' },
    update: {},
    create: {
      email: 'admin@englishlearn.dev',
      name: 'Admin',
      role: UserRole.ADMIN,
      passwordHash: adminPassword,
      emailVerified: new Date(),
    },
  });

  await prisma.user.upsert({
    where: { email: 'student@englishlearn.dev' },
    update: {},
    create: {
      email: 'student@englishlearn.dev',
      name: 'Student',
      role: UserRole.STUDENT,
      passwordHash: studentPassword,
      emailVerified: new Date(),
      profile: {
        create: {
          nativeLanguage: 'ru',
          selfReportedLevel: CefrLevel.B1,
          dailyGoalMin: 15,
        },
      },
    },
  });

  // Skill tags ───────────────────────────────────────────────
  const skillTags = [
    {
      slug: 'present-simple',
      category: SkillCategory.GRAMMAR,
      cefrLevel: CefrLevel.A1,
      title: 'Present Simple',
    },
    {
      slug: 'present-perfect',
      category: SkillCategory.GRAMMAR,
      cefrLevel: CefrLevel.B1,
      title: 'Present Perfect',
    },
    {
      slug: 'conditionals-2',
      category: SkillCategory.GRAMMAR,
      cefrLevel: CefrLevel.B2,
      title: 'Second Conditional',
    },
    {
      slug: 'everyday-vocab',
      category: SkillCategory.VOCABULARY,
      cefrLevel: CefrLevel.A2,
      title: 'Everyday vocabulary',
    },
    {
      slug: 'business-vocab',
      category: SkillCategory.VOCABULARY,
      cefrLevel: CefrLevel.B2,
      title: 'Business vocabulary',
    },
    {
      slug: 'phrasal-verbs',
      category: SkillCategory.VOCABULARY,
      cefrLevel: CefrLevel.B2,
      title: 'Phrasal verbs',
    },
    {
      slug: 'listening-conversations',
      category: SkillCategory.LISTENING,
      cefrLevel: CefrLevel.B1,
      title: 'Everyday conversations',
    },
  ];

  for (const tag of skillTags) {
    await prisma.skillTag.upsert({
      where: { slug: tag.slug },
      update: {},
      create: tag,
    });
  }

  const grammarA1 = await prisma.skillTag.findUniqueOrThrow({ where: { slug: 'present-simple' } });
  const grammarB1 = await prisma.skillTag.findUniqueOrThrow({ where: { slug: 'present-perfect' } });
  const vocabA2 = await prisma.skillTag.findUniqueOrThrow({ where: { slug: 'everyday-vocab' } });
  const vocabB2 = await prisma.skillTag.findUniqueOrThrow({ where: { slug: 'business-vocab' } });

  // Diagnostic items (small pool, expand later) ──────────────
  console.info('  • Seeding diagnostic items...');
  const diagnosticItems = [
    // A1
    {
      type: DiagnosticItemType.VOCAB,
      cefrLevel: CefrLevel.A1,
      prompt: 'Choose the correct word: "I ___ a student."',
      choices: ['am', 'is', 'are', 'be'],
      correctIndex: 0,
      skillTagId: grammarA1.id,
    },
    // A2
    {
      type: DiagnosticItemType.GRAMMAR,
      cefrLevel: CefrLevel.A2,
      prompt: 'Fill the blank: "She ___ to school every day."',
      template: 'She ___ to school every day.',
      acceptedAnswers: ['goes', 'walks'],
      skillTagId: grammarA1.id,
    },
    // B1
    {
      type: DiagnosticItemType.VOCAB,
      cefrLevel: CefrLevel.B1,
      prompt: 'Choose the best meaning of "to give up".',
      choices: ['to start', 'to quit', 'to win', 'to repeat'],
      correctIndex: 1,
      skillTagId: vocabA2.id,
    },
    // B1
    {
      type: DiagnosticItemType.GRAMMAR,
      cefrLevel: CefrLevel.B1,
      prompt: 'Fill the blank: "I ___ here since 2020."',
      template: 'I ___ here since 2020.',
      acceptedAnswers: ['have lived', 'have been living'],
      skillTagId: grammarB1.id,
    },
    // B2
    {
      type: DiagnosticItemType.VOCAB,
      cefrLevel: CefrLevel.B2,
      prompt: 'Pick the synonym of "to mitigate".',
      choices: ['to worsen', 'to lessen', 'to ignore', 'to multiply'],
      correctIndex: 1,
      skillTagId: vocabB2.id,
    },
    // C1
    {
      type: DiagnosticItemType.GRAMMAR,
      cefrLevel: CefrLevel.C1,
      prompt: 'Fill the blank: "Had I ___ earlier, I would have caught the train."',
      template: 'Had I ___ earlier, I would have caught the train.',
      acceptedAnswers: ['left', 'departed'],
    },
  ];

  for (const item of diagnosticItems) {
    const exists = await prisma.diagnosticItem.findFirst({
      where: { prompt: item.prompt },
    });
    if (!exists) {
      await prisma.diagnosticItem.create({
        data: {
          ...item,
          status: ContentStatus.PUBLISHED,
          publishedAt: new Date(),
          createdById: admin.id,
          reviewedById: admin.id,
          reviewedAt: new Date(),
        },
      });
    }
  }

  // Sample exercises ─────────────────────────────────────────
  console.info('  • Seeding sample exercises...');
  const vocabSamples = [
    {
      cefrLevel: CefrLevel.B1,
      prompt: 'What does "to postpone" mean?',
      targetLexeme: 'postpone',
      choices: ['to cancel', 'to delay', 'to repeat', 'to finish'],
      correctIndex: 1,
      explanation: '"To postpone" means to delay an event to a later time.',
      skillTagId: vocabA2.id,
    },
    {
      cefrLevel: CefrLevel.B2,
      prompt: 'Choose the synonym of "to allocate".',
      targetLexeme: 'allocate',
      choices: ['to spend', 'to assign', 'to refuse', 'to collect'],
      correctIndex: 1,
      explanation: '"To allocate" means to distribute resources for a particular purpose.',
      skillTagId: vocabB2.id,
    },
  ];

  for (const sample of vocabSamples) {
    const exists = await prisma.vocabExercise.findFirst({ where: { prompt: sample.prompt } });
    if (!exists) {
      await prisma.vocabExercise.create({
        data: {
          ...sample,
          source: ExerciseSource.CURATED,
          status: ContentStatus.PUBLISHED,
          publishedAt: new Date(),
          createdById: admin.id,
          reviewedById: admin.id,
          reviewedAt: new Date(),
        },
      });
    }
  }

  const grammarSamples = [
    {
      cefrLevel: CefrLevel.A2,
      template: 'She usually ___ (drink) coffee in the morning.',
      acceptedAnswers: ['drinks'],
      hint: 'Third person singular, present simple.',
      explanation: 'In the present simple, add -s for he/she/it.',
      grammarPoint: 'present-simple-3rd-person',
      skillTagId: grammarA1.id,
    },
    {
      cefrLevel: CefrLevel.B1,
      template: 'I ___ (live) in Berlin for five years.',
      acceptedAnswers: ['have lived', 'have been living'],
      hint: 'Present perfect or present perfect continuous.',
      explanation: 'Use present perfect for actions starting in the past and continuing now.',
      grammarPoint: 'present-perfect',
      skillTagId: grammarB1.id,
    },
  ];

  for (const sample of grammarSamples) {
    const exists = await prisma.grammarExercise.findFirst({ where: { template: sample.template } });
    if (!exists) {
      await prisma.grammarExercise.create({
        data: {
          ...sample,
          source: ExerciseSource.CURATED,
          status: ContentStatus.PUBLISHED,
          publishedAt: new Date(),
          createdById: admin.id,
          reviewedById: admin.id,
          reviewedAt: new Date(),
        },
      });
    }
  }

  console.info('✅ Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
