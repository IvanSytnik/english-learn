import { describe, expect, it } from "vitest";

import {
  DiagnosticContentSchema,
  GrammarContentSchema,
  ListeningContentSchema,
  VocabContentSchema,
} from "../exercises";

describe("VocabContentSchema", () => {
  const valid = {
    source: {
      targetLexeme: "ephemeral",
      exampleSentence: "The beauty of cherry blossoms is ephemeral.",
    },
    localized: {
      instructions: { en: "Choose the best definition.", ru: "Выберите лучшее определение." },
      prompt: { en: "What does \"ephemeral\" mean?", ru: "Что означает \"ephemeral\"?" },
      explanation: {
        en: "\"Ephemeral\" means lasting for a very short time.",
        ru: "\"Ephemeral\" значит длящийся очень короткое время.",
      },
    },
    choices: ["lasting briefly", "permanent", "expensive", "ancient"],
    correctIndex: 0,
  };

  it("accepts a well-formed payload", () => {
    expect(VocabContentSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects correctIndex out of range", () => {
    const bad = { ...valid, correctIndex: 99 };
    expect(VocabContentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects missing English in instructions", () => {
    const bad = {
      ...valid,
      localized: { ...valid.localized, instructions: { ru: "..." } as never },
    };
    expect(VocabContentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown locale keys in localized strings", () => {
    const bad = {
      ...valid,
      localized: {
        ...valid.localized,
        instructions: { en: "...", fr: "..." } as never,
      },
    };
    expect(VocabContentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects extra top-level keys", () => {
    const bad = { ...valid, mysteryField: "x" };
    expect(VocabContentSchema.safeParse(bad).success).toBe(false);
  });
});

describe("GrammarContentSchema", () => {
  const valid = {
    source: {
      template: "I ___ to school every day.",
      acceptedAnswers: ["go", "walk"],
    },
    localized: {
      instructions: { en: "Fill in the blank with the correct verb form." },
      explanation: { en: "Present Simple: habitual action." },
    },
  };

  it("accepts a well-formed payload", () => {
    expect(GrammarContentSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects empty acceptedAnswers", () => {
    const bad = { ...valid, source: { ...valid.source, acceptedAnswers: [] } };
    expect(GrammarContentSchema.safeParse(bad).success).toBe(false);
  });

  it("allows omitting explanation and hint", () => {
    const minimal = {
      source: valid.source,
      localized: { instructions: { en: "Fill in the blank." } },
    };
    expect(GrammarContentSchema.safeParse(minimal).success).toBe(true);
  });
});

describe("ListeningContentSchema", () => {
  const valid = {
    source: {
      audioUrl: "https://r2.example.com/audio/lesson1.mp3",
      durationSec: 42,
      transcript: "Hello and welcome to our podcast.",
    },
    localized: {
      instructions: { en: "Listen and answer the questions below." },
    },
    questions: [
      {
        id: "q1",
        prompt: { en: "What is the speaker doing?", ru: "Что делает говорящий?" },
        choices: [
          { en: "Welcoming listeners", ru: "Приветствует слушателей" },
          { en: "Saying goodbye", ru: "Прощается" },
        ],
        correctIndex: 0,
      },
    ],
  };

  it("accepts a well-formed payload", () => {
    expect(ListeningContentSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid audio URL", () => {
    const bad = { ...valid, source: { ...valid.source, audioUrl: "not-a-url" } };
    expect(ListeningContentSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty questions array", () => {
    expect(
      ListeningContentSchema.safeParse({ ...valid, questions: [] }).success,
    ).toBe(false);
  });

  it("rejects question with out-of-range correctIndex", () => {
    const bad = {
      ...valid,
      questions: [{ ...valid.questions[0], correctIndex: 5 }],
    };
    expect(ListeningContentSchema.safeParse(bad).success).toBe(false);
  });
});

describe("DiagnosticContentSchema", () => {
  const valid = {
    source: {
      stem: "Choose the correct form: I ___ to school every day.",
      choices: ["go", "goes", "going", "went"],
      correctIndex: 0,
    },
  };

  it("accepts minimal payload (no localized)", () => {
    expect(DiagnosticContentSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts payload with localized explanation", () => {
    const withExpl = {
      ...valid,
      localized: { explanation: { en: "Present Simple, 1st person singular." } },
    };
    expect(DiagnosticContentSchema.safeParse(withExpl).success).toBe(true);
  });

  it("rejects correctIndex out of range", () => {
    const bad = { source: { ...valid.source, correctIndex: 99 } };
    expect(DiagnosticContentSchema.safeParse(bad).success).toBe(false);
  });
});
