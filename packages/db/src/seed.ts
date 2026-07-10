// packages/db/src/seed.ts
//
// NOTE: This is a REPLACEMENT for the existing seed file.
// Re-seeds users + exercises in the new JSON content format.
//
// Existing patterns kept from previous seed:
//   - bcryptjs password hashing
//   - PrismaClient imported directly from generated/client (CLI-safe)
//   - Admin + student fixed accounts

import { hash } from 'bcryptjs';
import { PrismaClient } from './generated/client/index.js';
import type { DiagnosticContent, GrammarContent, VocabContent } from './schemas';

const prisma = new PrismaClient();

async function seedUsers() {
  const adminPassword = await hash('admin1234', 10);
  const studentPassword = await hash('student1234', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@englishlearn.dev' },
    update: {},
    create: {
      email: 'admin@englishlearn.dev',
      name: 'Admin',
      role: 'ADMIN',
      passwordHash: adminPassword,
      locale: 'en',
    },
  });

  const student = await prisma.user.upsert({
    where: { email: 'student@englishlearn.dev' },
    update: {},
    create: {
      email: 'student@englishlearn.dev',
      name: 'Student',
      role: 'STUDENT',
      passwordHash: studentPassword,
      locale: 'ru',
      profile: {
        create: {
          nativeLanguage: 'ru',
          selfReportedLevel: 'B1',
          goal: 'WORK',
        },
      },
    },
  });

  return { admin, student };
}

async function seedVocab(adminId: string) {
  const samples: VocabContent[] = [
    {
      source: {
        targetLexeme: 'ephemeral',
        exampleSentence: 'The beauty of cherry blossoms is ephemeral.',
      },
      localized: {
        instructions: {
          en: 'Choose the best definition for the word.',
          ru: 'Выберите наиболее точное определение слова.',
          uk: 'Оберіть найточніше визначення слова.',
          de: 'Wählen Sie die beste Definition für das Wort.',
        },
        prompt: {
          en: 'What does "ephemeral" mean?',
          ru: 'Что означает слово "ephemeral"?',
          uk: 'Що означає слово "ephemeral"?',
          de: 'Was bedeutet "ephemeral"?',
        },
        explanation: {
          en: '"Ephemeral" describes something that lasts for a very short time.',
          ru: '"Ephemeral" описывает то, что длится очень короткое время.',
        },
        exampleTranslation: {
          en: 'The beauty of cherry blossoms is ephemeral.',
          ru: 'Красота вишнёвого цвета мимолётна.',
        },
      },
      choices: ['lasting briefly', 'permanent', 'expensive', 'ancient'],
      correctIndex: 0,
    },
    {
      source: { targetLexeme: 'concise' },
      localized: {
        instructions: {
          en: 'Choose the best definition.',
          ru: 'Выберите лучшее определение.',
        },
        prompt: {
          en: 'What does "concise" mean?',
          ru: 'Что означает "concise"?',
        },
      },
      choices: ['brief and clear', 'long and detailed', 'complicated', 'loud'],
      correctIndex: 0,
    },
  ];

  for (const content of samples) {
    await prisma.vocabExercise.create({
      data: {
        cefrLevel: 'B1',
        source: 'CURATED',
        status: 'PUBLISHED',
        content: content as object,
        createdById: adminId,
        reviewedById: adminId,
      },
    });
  }
}

async function seedGrammar(adminId: string) {
  const samples: GrammarContent[] = [
    {
      source: {
        template: 'I ___ to school every day.',
        acceptedAnswers: ['go', 'walk'],
      },
      localized: {
        instructions: {
          en: 'Fill in the blank with the correct verb form.',
          ru: 'Заполните пропуск глаголом в правильной форме.',
          uk: 'Заповніть пропуск дієсловом у правильній формі.',
          de: 'Füllen Sie die Lücke mit der richtigen Verbform aus.',
        },
        hint: {
          en: 'Use Present Simple — habitual action.',
          ru: 'Используйте Present Simple — привычное действие.',
        },
        explanation: {
          en: 'Present Simple is used for habits and routines.',
          ru: 'Present Simple используется для привычек и регулярных действий.',
        },
      },
    },
    {
      source: {
        template: 'She ___ been to Paris three times.',
        acceptedAnswers: ['has'],
      },
      localized: {
        instructions: {
          en: 'Choose the correct auxiliary verb.',
          ru: 'Выберите правильный вспомогательный глагол.',
        },
        explanation: {
          en: "Present Perfect with 3rd person singular requires 'has'.",
          ru: "Present Perfect с 3-м лицом единственного числа требует 'has'.",
        },
      },
    },
  ];

  for (const content of samples) {
    await prisma.grammarExercise.create({
      data: {
        cefrLevel: 'B1',
        source: 'CURATED',
        status: 'PUBLISHED',
        content: content as object,
        createdById: adminId,
        reviewedById: adminId,
      },
    });
  }
}

async function seedDiagnostic(adminId: string) {
  const samples: Array<{
    kind: 'VOCAB' | 'GRAMMAR' | 'LISTENING';
    level: string;
    content: DiagnosticContent;
  }> = [
    {
      kind: 'GRAMMAR',
      level: 'A2',
      content: {
        source: {
          stem: 'I ___ a student.',
          choices: ['am', 'is', 'are', 'be'],
          correctIndex: 0,
        },
        localized: {
          explanation: {
            en: "1st person singular uses 'am'.",
            ru: "1-е лицо единственного числа использует 'am'.",
          },
        },
      },
    },
    {
      kind: 'GRAMMAR',
      level: 'B1',
      content: {
        source: {
          stem: 'If I ___ rich, I would travel the world.',
          choices: ['was', 'were', 'am', 'be'],
          correctIndex: 1,
        },
        localized: {
          explanation: {
            en: "Second conditional uses 'were' for all persons.",
            ru: "Второе условное использует 'were' для всех лиц.",
          },
        },
      },
    },
    {
      kind: 'VOCAB',
      level: 'B2',
      content: {
        source: {
          stem: "The professor's explanation was so ___ that nobody understood.",
          choices: ['lucid', 'convoluted', 'concise', 'simple'],
          correctIndex: 1,
        },
        localized: {
          explanation: {
            en: "'Convoluted' means complicated and hard to follow.",
            ru: "'Convoluted' означает запутанный и трудный для понимания.",
          },
        },
      },
    },
  ];

  for (const s of samples) {
    await prisma.diagnosticItem.create({
      data: {
        cefrLevel: s.level as 'A2' | 'B1' | 'B2',
        kind: s.kind,
        source: 'CURATED',
        status: 'PUBLISHED',
        content: s.content as object,
        createdById: adminId,
        reviewedById: adminId,
      },
    });
  }
}

async function main() {
  console.log('→ Seeding users…');
  const { admin } = await seedUsers();
  console.log(`  ✓ admin: ${admin.email}`);

  console.log('→ Seeding vocab exercises…');
  await seedVocab(admin.id);

  console.log('→ Seeding grammar exercises…');
  await seedGrammar(admin.id);

  console.log('→ Seeding diagnostic items…');
  await seedDiagnostic(admin.id);

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
