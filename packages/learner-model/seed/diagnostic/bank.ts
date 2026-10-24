/**
 * Diagnostic question bank (decision 2026-10-24): GRAMMAR and VOCAB, each
 * A2 × 6, B1 × 8, B2 × 6, C1 × 6 — 52 questions. B1 gets two more because
 * the ladder starts there and a learner who alternates right/wrong stays on
 * B1 for all eight questions of an axis.
 *
 * Authoring rules (same spirit as seed/items/practice.ts):
 *   - exactly one option is right on any reading; every distractor is WRONG
 *     in the sentence, not merely less natural (no "also acceptable" synonym
 *     or regional variant next to the key);
 *   - no tell in the form of the options (length, the only one with an
 *     article, the only grammatical one);
 *   - levels follow the CEFR profiles (English Grammar / Vocabulary Profile)
 *     as a guide: A2 core tenses, comparatives, frequent words; C1 inversion,
 *     modal perfects, idiomatic collocations;
 *   - VOCAB tests meaning or collocation in context, never translation (the
 *     UI speaks four languages, the test is English);
 *   - stems never repeat the practice bank (test), one "___" gap each;
 *   - the explanation is short, in English, for the post-test review screen.
 *
 * Written by the assistant; needs a native/methodologist review (HANDOFF §8 #12)
 * before it is trusted for placement.
 *
 * Ids are stable: `seed-diag-{grammar|vocab}-{a2|b1|b2|c1}-{nn}`. Never reuse an
 * id for a different question once answers reference it — retire it instead
 * (seed:diagnostic archives seed-diag-* ids that leave the bank).
 */

import type { DiagnosticContent } from '@englishlearn/db/schemas';

export type DiagnosticAxis = 'GRAMMAR' | 'VOCAB';
export type DiagnosticBankLevel = 'A2' | 'B1' | 'B2' | 'C1';

export type SeedDiagnosticItem = {
  id: string;
  kind: DiagnosticAxis;
  cefrLevel: DiagnosticBankLevel;
  content: DiagnosticContent;
};

type Question = {
  stem: string;
  answer: string;
  distractors: [string, string, string];
  why: string;
};

/**
 * One cell of the bank. The key's position rotates from `offset` through the
 * cell (offset, offset+1, … mod 4); the offsets below are chosen so that each
 * position holds the key exactly 13 times across the 52 questions.
 */
function cell(
  kind: DiagnosticAxis,
  level: DiagnosticBankLevel,
  offset: number,
  questions: Question[],
): SeedDiagnosticItem[] {
  return questions.map((q, i) => {
    const correctIndex = (offset + i) % 4;
    const choices = [...q.distractors];
    choices.splice(correctIndex, 0, q.answer);
    return {
      id: `seed-diag-${kind.toLowerCase()}-${level.toLowerCase()}-${String(i + 1).padStart(2, '0')}`,
      kind,
      cefrLevel: level,
      content: {
        source: { stem: q.stem, choices, correctIndex },
        localized: { explanation: { en: q.why } },
      },
    };
  });
}

// ── GRAMMAR ─────────────────────────────────────────────────────────────────

const GRAMMAR_A2 = cell('GRAMMAR', 'A2', 0, [
  {
    stem: 'She ___ to work by bus every day.',
    answer: 'goes',
    distractors: ['go', 'going', 'is go'],
    why: 'Present simple, third person singular: she goes.',
  },
  {
    stem: 'We ___ dinner when the phone rang.',
    answer: 'were having',
    distractors: ['are having', 'have had', 'was have'],
    why: 'Past continuous for an action in progress when another one interrupted it.',
  },
  {
    stem: 'This box is ___ than that one.',
    answer: 'bigger',
    distractors: ['more big', 'biggest', 'bigest'],
    why: 'One-syllable adjective: big → bigger (double the final consonant) + than.',
  },
  {
    stem: "There isn't ___ milk in the fridge.",
    answer: 'any',
    distractors: ['some', 'many', 'a'],
    why: "Negative with an uncountable noun: isn't any.",
  },
  {
    stem: "She ___ her keys yesterday, so she couldn't get in.",
    answer: 'lost',
    distractors: ['has lost', 'loses', 'losing'],
    why: 'A finished past time (yesterday) takes the past simple.',
  },
  {
    stem: "You ___ wear a seatbelt in the car. It's the law.",
    answer: 'must',
    distractors: ["mustn't", "can't", "needn't"],
    why: 'Must expresses an obligation; the law requires it.',
  },
]);

const GRAMMAR_B1 = cell('GRAMMAR', 'B1', 0, [
  {
    stem: 'If I ___ more time, I would learn to play the piano.',
    answer: 'had',
    distractors: ['have', 'will have', 'would have'],
    why: 'Second conditional: if + past simple, would + infinitive.',
  },
  {
    stem: 'I ___ in this town since 2019.',
    answer: 'have lived',
    distractors: ['live', 'am living', 'lived'],
    why: 'Since + a starting point needs the present perfect.',
  },
  {
    stem: 'The bridge ___ in 1890.',
    answer: 'was built',
    distractors: ['built', 'has built', 'is building'],
    why: 'Passive in the past: the bridge did not build anything; it was built.',
  },
  {
    stem: 'When I was a child, I ___ play football every weekend.',
    answer: 'used to',
    distractors: ['use to', 'was used to', 'am used to'],
    why: 'Used to + infinitive for a past habit that no longer happens.',
  },
  {
    stem: "That's the man ___ car was stolen.",
    answer: 'whose',
    distractors: ['who', 'which', 'whom'],
    why: 'Whose shows possession: the man’s car.',
  },
  {
    stem: "I'm looking forward to ___ you next week.",
    answer: 'seeing',
    distractors: ['see', 'saw', 'have seen'],
    why: 'Look forward to + -ing: "to" is a preposition here.',
  },
  {
    stem: "If it ___ tomorrow, we'll stay at home.",
    answer: 'rains',
    distractors: ['will rain', 'rained', 'would rain'],
    why: 'First conditional: if + present simple, will + infinitive.',
  },
  {
    stem: "She isn't old ___ to drive a car.",
    answer: 'enough',
    distractors: ['too', 'very', 'so'],
    why: 'Adjective + enough + to-infinitive.',
  },
]);

const GRAMMAR_B2 = cell('GRAMMAR', 'B2', 2, [
  {
    stem: "If we ___ earlier, we wouldn't have missed the train.",
    answer: 'had left',
    distractors: ['left', 'would leave', 'have left'],
    why: 'Third conditional: if + past perfect, would have + past participle.',
  },
  {
    stem: 'I feel sick. I wish I ___ so much yesterday.',
    answer: "hadn't eaten",
    distractors: ["didn't eat", "wouldn't eat", "haven't eaten"],
    why: 'Wish about the past takes the past perfect.',
  },
  {
    stem: 'She ___ have left already: her coat is still here.',
    answer: "can't",
    distractors: ['must', 'might', "needn't"],
    why: "Can't have + past participle: a confident deduction that something did not happen.",
  },
  {
    stem: "I'm going to ___ my hair cut tomorrow.",
    answer: 'have',
    distractors: ['make', 'let', 'do'],
    why: 'Have something done: someone else does it for you.',
  },
  {
    stem: 'By next June, she ___ here for ten years.',
    answer: 'will have worked',
    distractors: ['will work', 'works', 'is working'],
    why: 'Future perfect for a duration completed by a future point.',
  },
  {
    stem: 'My brother, ___ lives in Berlin, is a doctor.',
    answer: 'who',
    distractors: ['that', 'which', 'whose'],
    why: 'A non-defining clause about a person takes who, never that.',
  },
]);

const GRAMMAR_C1 = cell('GRAMMAR', 'C1', 1, [
  {
    stem: 'Not only ___ late, but he also forgot the tickets.',
    answer: 'was he',
    distractors: ['he was', 'he is', 'did he be'],
    why: 'After a fronted "not only", subject and auxiliary invert.',
  },
  {
    stem: 'Hardly ___ arrived when it started to rain.',
    answer: 'had we',
    distractors: ['we had', 'did we', 'have we'],
    why: 'Hardly … when: inversion with the past perfect.',
  },
  {
    stem: 'If she ___ the job last year, she would be living in London now.',
    answer: 'had taken',
    distractors: ['takes', 'would take', 'has taken'],
    why: 'Mixed conditional: an unreal past condition (past perfect) with a present result.',
  },
  {
    stem: '___ it not for your help, I would be completely lost.',
    answer: 'Were',
    distractors: ['Had', 'Should', 'Did'],
    why: 'Were it not for … = if it were not for …, with a present result.',
  },
  {
    stem: 'Little ___ that the decision would change everything.',
    answer: 'did she know',
    distractors: ['she knew', 'she did know', 'knew she'],
    why: 'Fronted "little" inverts with the auxiliary do: little did she know.',
  },
  {
    stem: "He ___ have taken the wrong train; there's no other way he could be this late.",
    answer: 'must',
    distractors: ['should', 'need', 'can'],
    why: 'Must have + past participle: a confident deduction about the past.',
  },
]);

// ── VOCAB ───────────────────────────────────────────────────────────────────

const VOCAB_A2 = cell('VOCAB', 'A2', 3, [
  {
    stem: "Can you ___ the window? It's cold in here.",
    answer: 'close',
    distractors: ['open', 'wash', 'break'],
    why: 'It is cold, so you close the window.',
  },
  {
    stem: "I'm hungry. Let's ___ lunch now.",
    answer: 'have',
    distractors: ['drink', 'wear', 'sleep'],
    why: 'Have lunch = eat lunch.',
  },
  {
    stem: "It's raining, so take your ___ with you.",
    answer: 'umbrella',
    distractors: ['sunglasses', 'swimsuit', 'toothbrush'],
    why: 'An umbrella keeps you dry in the rain.',
  },
  {
    stem: 'My sister is a ___; she works in a hospital and looks after patients.',
    answer: 'nurse',
    distractors: ['pilot', 'waiter', 'farmer'],
    why: 'A nurse looks after patients in a hospital.',
  },
  {
    stem: "The shop is ___ on Sundays, so we can't buy anything.",
    answer: 'closed',
    distractors: ['open', 'busy', 'cheap'],
    why: "Closed: you can't buy anything because it is not open.",
  },
  {
    stem: 'Turn ___ at the bank, and the station is on your right.',
    answer: 'left',
    distractors: ['up', 'over', 'into'],
    why: 'Turn left / turn right give directions.',
  },
]);

const VOCAB_B1 = cell('VOCAB', 'B1', 1, [
  {
    stem: 'Could you ___ me a favour and post this letter?',
    answer: 'do',
    distractors: ['make', 'give', 'take'],
    why: 'The collocation is "do someone a favour".',
  },
  {
    stem: 'I need to ___ a decision by Friday.',
    answer: 'make',
    distractors: ['do', 'say', 'put'],
    why: 'The collocation is "make a decision".',
  },
  {
    stem: 'The film was so ___ that I fell asleep.',
    answer: 'boring',
    distractors: ['bored', 'exciting', 'frightening'],
    why: 'Boring describes the film; bored describes how a person feels.',
  },
  {
    stem: 'She ___ her driving test on the first try and got her licence.',
    answer: 'passed',
    distractors: ['failed', 'lost', 'missed'],
    why: 'You pass a test when you succeed in it.',
  },
  {
    stem: 'Prices have ___ by 10% this year.',
    answer: 'risen',
    distractors: ['raised', 'arisen', 'aroused'],
    why: 'Rise (risen) has no object; raise needs one: they raised prices.',
  },
  {
    stem: "Can you ___ after my cat while I'm away?",
    answer: 'look',
    distractors: ['take', 'care', 'see'],
    why: 'Look after = take care of.',
  },
  {
    stem: "I'm not used to getting up so early; it's hard to ___ to the new timetable.",
    answer: 'adjust',
    distractors: ['admit', 'attend', 'avoid'],
    why: 'Adjust to = get used to something new.',
  },
  {
    stem: 'We had to ___ the meeting until next week because the manager was ill.',
    answer: 'postpone',
    distractors: ['prevent', 'pretend', 'provide'],
    why: 'Postpone = move to a later time.',
  },
]);

const VOCAB_B2 = cell('VOCAB', 'B2', 0, [
  {
    stem: "The police don't have ___ evidence to prove that he did it.",
    answer: 'sufficient',
    distractors: ['efficient', 'deficient', 'proficient'],
    why: 'Sufficient = enough. Efficient (works well), deficient (lacking) and proficient (skilled) do not fit.',
  },
  {
    stem: "It's too early to ___ any conclusions from the data.",
    answer: 'draw',
    distractors: ['pull', 'put', 'set'],
    why: 'The collocation is "draw a conclusion".',
  },
  {
    stem: 'After months of talks, the two sides finally ___ an agreement.',
    answer: 'reached',
    distractors: ['arrived', 'came', 'went'],
    why: 'Reach an agreement (arrive and come would need "at" / "to").',
  },
  {
    stem: "I can't ___ the noise from the street any longer.",
    answer: 'stand',
    distractors: ['keep', 'last', 'hold'],
    why: "Can't stand = can't tolerate.",
  },
  {
    stem: 'The concert has been ___ until next month because of the storm.',
    answer: 'put off',
    distractors: ['put out', 'put up', 'put away'],
    why: 'Put off = postpone.',
  },
  {
    stem: "She's very ___: she always does what she promises.",
    answer: 'reliable',
    distractors: ['reluctant', 'relevant', 'redundant'],
    why: 'Reliable = you can trust someone to do what they say.',
  },
]);

const VOCAB_C1 = cell('VOCAB', 'C1', 2, [
  {
    stem: 'Politicians often pay lip ___ to environmental issues but do very little.',
    answer: 'service',
    distractors: ['support', 'attention', 'respect'],
    why: 'Pay lip service to something = say you support it without acting on it.',
  },
  {
    stem: 'Her decision to resign came as a ___ from the blue.',
    answer: 'bolt',
    distractors: ['flash', 'storm', 'shock'],
    why: 'A bolt from the blue = a complete surprise.',
  },
  {
    stem: 'We need to ___ the root causes of the problem, not just the symptoms.',
    answer: 'address',
    distractors: ['adhere', 'adjourn', 'admonish'],
    why: 'Address a problem = start dealing with it.',
  },
  {
    stem: 'He gave a ___ account of the events, leaving nothing out.',
    answer: 'comprehensive',
    distractors: ['comprehensible', 'compulsive', 'complacent'],
    why: 'Comprehensive = complete; comprehensible only means easy to understand.',
  },
  {
    stem: 'The new policy is likely to have far-___ consequences.',
    answer: 'reaching',
    distractors: ['going', 'running', 'coming'],
    why: 'Far-reaching consequences affect many people or areas.',
  },
  {
    stem: "Let's not ___ hairs: the two versions are essentially the same.",
    answer: 'split',
    distractors: ['cut', 'pull', 'comb'],
    why: 'Split hairs = argue about tiny, unimportant differences.',
  },
]);

export const DIAGNOSTIC_BANK: readonly SeedDiagnosticItem[] = [
  ...GRAMMAR_A2,
  ...GRAMMAR_B1,
  ...GRAMMAR_B2,
  ...GRAMMAR_C1,
  ...VOCAB_A2,
  ...VOCAB_B1,
  ...VOCAB_B2,
  ...VOCAB_C1,
];
