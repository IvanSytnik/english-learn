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
 *   - the explanation is short, for the post-test review screen: written in
 *     English, translated into every learner language (ru/uk/de). Grammar
 *     terms and quoted English forms stay English; ru/uk address the learner
 *     as «вы», de as du. The translations are the assistant's too — same
 *     review caveat as below.
 *
 * Written by the assistant; needs a native/methodologist review (HANDOFF §8 #12)
 * before it is trusted for placement.
 *
 * Ids are stable: `seed-diag-{grammar|vocab}-{a2|b1|b2|c1}-{nn}`. Never reuse an
 * id for a different question once answers reference it — retire it instead
 * (seed:diagnostic archives seed-diag-* ids that leave the bank).
 * Pre-launch exception (2026-10-26, §8 #17): four review flags were fixed in
 * place under their ids (grammar-b1-04, vocab-a2-02, vocab-c1-04, vocab-c1-05)
 * — no real users yet.
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
  /** All four languages, required: the review shows the learner's own (contentLocale). */
  why: { en: string; ru: string; uk: string; de: string };
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
        localized: { explanation: q.why },
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
    why: {
      en: 'Present simple, third person singular: she goes.',
      ru: 'Present simple, третье лицо единственного числа: she goes.',
      uk: 'Present simple, третя особа однини: she goes.',
      de: 'Present Simple, dritte Person Singular: she goes.',
    },
  },
  {
    stem: 'We ___ dinner when the phone rang.',
    answer: 'were having',
    distractors: ['are having', 'have had', 'was have'],
    why: {
      en: 'Past continuous for an action in progress when another one interrupted it.',
      ru: 'Past continuous — для действия, которое было в процессе, когда его прервало другое.',
      uk: 'Past continuous — для дії, що тривала, коли її перервала інша.',
      de: 'Past Continuous für eine Handlung, die gerade im Gange war, als eine andere sie unterbrach.',
    },
  },
  {
    stem: 'This box is ___ than that one.',
    answer: 'bigger',
    distractors: ['more big', 'biggest', 'bigest'],
    why: {
      en: 'One-syllable adjective: big → bigger (double the final consonant) + than.',
      ru: 'Односложное прилагательное: big → bigger (конечная согласная удваивается) + than.',
      uk: 'Односкладовий прикметник: big → bigger (кінцевий приголосний подвоюється) + than.',
      de: 'Einsilbiges Adjektiv: big → bigger (der Endkonsonant wird verdoppelt) + than.',
    },
  },
  {
    stem: "There isn't ___ milk in the fridge.",
    answer: 'any',
    distractors: ['some', 'many', 'a'],
    why: {
      en: "Negative with an uncountable noun: isn't any.",
      ru: "Отрицание с неисчисляемым существительным: isn't any.",
      uk: "Заперечення з незлічуваним іменником: isn't any.",
      de: "Verneinung mit einem unzählbaren Nomen: isn't any.",
    },
  },
  {
    stem: "She ___ her keys yesterday, so she couldn't get in.",
    answer: 'lost',
    distractors: ['has lost', 'loses', 'losing'],
    why: {
      en: 'A finished past time (yesterday) takes the past simple.',
      ru: 'С законченным моментом в прошлом (yesterday) используется past simple.',
      uk: 'Із завершеним моментом у минулому (yesterday) вживається past simple.',
      de: 'Ein abgeschlossener Zeitpunkt in der Vergangenheit (yesterday) verlangt das Past Simple.',
    },
  },
  {
    stem: "You ___ wear a seatbelt in the car. It's the law.",
    answer: 'must',
    distractors: ["mustn't", "can't", "needn't"],
    why: {
      en: 'Must expresses an obligation; the law requires it.',
      ru: 'Must выражает обязанность: этого требует закон.',
      uk: 'Must виражає обов’язок: цього вимагає закон.',
      de: 'Must drückt eine Pflicht aus: Das Gesetz schreibt es vor.',
    },
  },
]);

const GRAMMAR_B1 = cell('GRAMMAR', 'B1', 0, [
  {
    stem: 'If I ___ more time, I would learn to play the piano.',
    answer: 'had',
    distractors: ['have', 'will have', 'would have'],
    why: {
      en: 'Second conditional: if + past simple, would + infinitive.',
      ru: 'Second conditional — нереальное условие в настоящем: if + past simple, would + infinitive.',
      uk: 'Second conditional — нереальна умова в теперішньому: if + past simple, would + infinitive.',
      de: 'Second Conditional – irreale Bedingung in der Gegenwart: if + past simple, would + infinitive.',
    },
  },
  {
    stem: 'I ___ in this town since 2019.',
    answer: 'have lived',
    distractors: ['live', 'am living', 'lived'],
    why: {
      en: 'Since + a starting point needs the present perfect.',
      ru: 'Since + момент начала требует present perfect.',
      uk: 'Since + момент початку потребує present perfect.',
      de: 'Since + Anfangszeitpunkt verlangt das Present Perfect.',
    },
  },
  {
    stem: 'The bridge ___ in 1890.',
    answer: 'was built',
    distractors: ['built', 'has built', 'is building'],
    why: {
      en: 'Passive in the past: the bridge did not build anything; it was built.',
      ru: 'Passive в прошедшем времени: мост ничего не строил — его построили (was built).',
      uk: 'Passive у минулому часі: міст нічого не будував — його збудували (was built).',
      de: 'Passive in der Vergangenheit: Die Brücke hat nichts gebaut – sie wurde gebaut (was built).',
    },
  },
  {
    stem: 'When I was a child, I ___ play football every weekend.',
    answer: 'used to',
    distractors: ['usually', 'was used to', 'am used to'],
    why: {
      en: 'Used to + infinitive for a past habit that no longer happens. Be used to needs -ing, and usually would need a past verb (usually played).',
      ru: 'Used to + infinitive — привычка в прошлом, которой больше нет. После be used to нужна форма -ing, а с usually понадобился бы глагол в прошедшем времени (usually played).',
      uk: 'Used to + infinitive — звичка в минулому, якої вже немає. Після be used to потрібна форма -ing, а з usually знадобилося б дієслово в минулому часі (usually played).',
      de: 'Used to + infinitive für eine frühere Gewohnheit, die es nicht mehr gibt. Nach be used to steht -ing, und mit usually bräuchtest du ein Verb in der Vergangenheit (usually played).',
    },
  },
  {
    stem: "That's the man ___ car was stolen.",
    answer: 'whose',
    distractors: ['who', 'which', 'whom'],
    why: {
      en: 'Whose shows possession: the man’s car.',
      ru: 'Whose указывает на принадлежность: the man’s car.',
      uk: 'Whose вказує на належність: the man’s car.',
      de: 'Whose drückt Besitz aus: the man’s car.',
    },
  },
  {
    stem: "I'm looking forward to ___ you next week.",
    answer: 'seeing',
    distractors: ['see', 'saw', 'have seen'],
    why: {
      en: 'Look forward to + -ing: "to" is a preposition here.',
      ru: 'Look forward to + -ing: здесь «to» — предлог.',
      uk: 'Look forward to + -ing: тут «to» — прийменник.',
      de: 'Look forward to + -ing: „to“ ist hier eine Präposition.',
    },
  },
  {
    stem: "If it ___ tomorrow, we'll stay at home.",
    answer: 'rains',
    distractors: ['will rain', 'rained', 'would rain'],
    why: {
      en: 'First conditional: if + present simple, will + infinitive.',
      ru: 'First conditional — реальное условие в будущем: if + present simple, will + infinitive.',
      uk: 'First conditional — реальна умова в майбутньому: if + present simple, will + infinitive.',
      de: 'First Conditional – reale Bedingung in der Zukunft: if + present simple, will + infinitive.',
    },
  },
  {
    stem: "She isn't old ___ to drive a car.",
    answer: 'enough',
    distractors: ['too', 'very', 'so'],
    why: {
      en: 'Adjective + enough + to-infinitive.',
      ru: 'Прилагательное + enough + to-infinitive.',
      uk: 'Прикметник + enough + to-infinitive.',
      de: 'Adjektiv + enough + to-infinitive.',
    },
  },
]);

const GRAMMAR_B2 = cell('GRAMMAR', 'B2', 2, [
  {
    stem: "If we ___ earlier, we wouldn't have missed the train.",
    answer: 'had left',
    distractors: ['left', 'would leave', 'have left'],
    why: {
      en: 'Third conditional: if + past perfect, would have + past participle.',
      ru: 'Third conditional — нереальное условие в прошлом: if + past perfect, would have + past participle.',
      uk: 'Third conditional — нереальна умова в минулому: if + past perfect, would have + past participle.',
      de: 'Third Conditional – irreale Bedingung in der Vergangenheit: if + past perfect, would have + past participle.',
    },
  },
  {
    stem: 'I feel sick. I wish I ___ so much yesterday.',
    answer: "hadn't eaten",
    distractors: ["didn't eat", "wouldn't eat", "haven't eaten"],
    why: {
      en: 'Wish about the past takes the past perfect.',
      ru: 'После wish о прошлом нужен past perfect.',
      uk: 'Після wish про минуле потрібен past perfect.',
      de: 'Nach wish über die Vergangenheit steht das Past Perfect.',
    },
  },
  {
    stem: 'She ___ have left already: her coat is still here.',
    answer: "can't",
    distractors: ['must', 'might', "needn't"],
    why: {
      en: "Can't have + past participle: a confident deduction that something did not happen.",
      ru: "Can't have + past participle — уверенный вывод о том, что чего-то не произошло.",
      uk: "Can't have + past participle — упевнений висновок, що чогось не сталося.",
      de: "Can't have + past participle: eine sichere Schlussfolgerung, dass etwas nicht passiert ist.",
    },
  },
  {
    stem: "I'm going to ___ my hair cut tomorrow.",
    answer: 'have',
    distractors: ['make', 'let', 'do'],
    why: {
      en: 'Have something done: someone else does it for you.',
      ru: 'Have something done — это делает для вас кто-то другой.',
      uk: 'Have something done — це робить для вас хтось інший.',
      de: 'Have something done: Jemand anderes erledigt das für dich.',
    },
  },
  {
    stem: 'By next June, she ___ here for ten years.',
    answer: 'will have worked',
    distractors: ['will work', 'works', 'is working'],
    why: {
      en: 'Future perfect for a duration completed by a future point.',
      ru: 'Future perfect — для периода, который завершится к определённому моменту в будущем.',
      uk: 'Future perfect — для періоду, що завершиться до певного моменту в майбутньому.',
      de: 'Future Perfect für einen Zeitraum, der bis zu einem Zeitpunkt in der Zukunft abgeschlossen ist.',
    },
  },
  {
    stem: 'My brother, ___ lives in Berlin, is a doctor.',
    answer: 'who',
    distractors: ['that', 'which', 'whose'],
    why: {
      en: 'A non-defining clause about a person takes who, never that.',
      ru: 'В non-defining clause о человеке ставится who, но никогда не that.',
      uk: 'У non-defining clause про людину вживається who, але ніколи не that.',
      de: 'In einer Non-defining Clause über eine Person steht who, niemals that.',
    },
  },
]);

const GRAMMAR_C1 = cell('GRAMMAR', 'C1', 1, [
  {
    stem: 'Not only ___ late, but he also forgot the tickets.',
    answer: 'was he',
    distractors: ['he was', 'he is', 'did he be'],
    why: {
      en: 'After a fronted "not only", subject and auxiliary invert.',
      ru: 'Если «not only» стоит в начале, подлежащее и вспомогательный глагол меняются местами.',
      uk: 'Якщо «not only» стоїть на початку, підмет і допоміжне дієслово міняються місцями.',
      de: 'Steht „not only“ am Satzanfang, tauschen Subjekt und Hilfsverb die Plätze.',
    },
  },
  {
    stem: 'Hardly ___ arrived when it started to rain.',
    answer: 'had we',
    distractors: ['we had', 'did we', 'have we'],
    why: {
      en: 'Hardly … when: inversion with the past perfect.',
      ru: 'Hardly … when: инверсия с past perfect.',
      uk: 'Hardly … when: інверсія з past perfect.',
      de: 'Hardly … when: Inversion mit dem Past Perfect.',
    },
  },
  {
    stem: 'If she ___ the job last year, she would be living in London now.',
    answer: 'had taken',
    distractors: ['takes', 'would take', 'has taken'],
    why: {
      en: 'Mixed conditional: an unreal past condition (past perfect) with a present result.',
      ru: 'Mixed conditional: нереальное условие в прошлом (past perfect) с результатом в настоящем.',
      uk: 'Mixed conditional: нереальна умова в минулому (past perfect) з результатом у теперішньому.',
      de: 'Mixed Conditional: eine irreale Bedingung in der Vergangenheit (Past Perfect) mit einem Ergebnis in der Gegenwart.',
    },
  },
  {
    stem: '___ it not for your help, I would be completely lost.',
    answer: 'Were',
    distractors: ['Had', 'Should', 'Did'],
    why: {
      en: 'Were it not for … = if it were not for …, with a present result.',
      ru: 'Were it not for … = if it were not for …, с результатом в настоящем.',
      uk: 'Were it not for … = if it were not for …, з результатом у теперішньому.',
      de: 'Were it not for … = if it were not for …, mit einem Ergebnis in der Gegenwart.',
    },
  },
  {
    stem: 'Little ___ that the decision would change everything.',
    answer: 'did she know',
    distractors: ['she knew', 'she did know', 'knew she'],
    why: {
      en: 'Fronted "little" inverts with the auxiliary do: little did she know.',
      ru: '«Little» в начале предложения вызывает инверсию со вспомогательным do: little did she know.',
      uk: '«Little» на початку речення спричиняє інверсію з допоміжним do: little did she know.',
      de: 'Steht „little“ am Satzanfang, folgt eine Inversion mit dem Hilfsverb do: little did she know.',
    },
  },
  {
    stem: "He ___ have taken the wrong train; there's no other way he could be this late.",
    answer: 'must',
    distractors: ['should', 'need', 'can'],
    why: {
      en: 'Must have + past participle: a confident deduction about the past.',
      ru: 'Must have + past participle — уверенный вывод о прошлом.',
      uk: 'Must have + past participle — упевнений висновок про минуле.',
      de: 'Must have + past participle: eine sichere Schlussfolgerung über die Vergangenheit.',
    },
  },
]);

// ── VOCAB ───────────────────────────────────────────────────────────────────

const VOCAB_A2 = cell('VOCAB', 'A2', 3, [
  {
    stem: "Can you ___ the window? It's cold in here.",
    answer: 'close',
    distractors: ['open', 'wash', 'break'],
    why: {
      en: 'It is cold, so you close the window.',
      ru: 'Холодно, поэтому окно нужно закрыть: close.',
      uk: 'Холодно, тому вікно треба зачинити: close.',
      de: 'Es ist kalt, also machst du das Fenster zu: close.',
    },
  },
  {
    stem: 'Can you ___ me the time, please?',
    answer: 'tell',
    distractors: ['say', 'speak', 'talk'],
    why: {
      en: 'Tell someone something: tell me the time. Say, speak and talk cannot take "me" like this.',
      ru: 'Tell someone something: tell me the time. Say, speak и talk не могут так присоединять «me».',
      uk: 'Tell someone something: tell me the time. Say, speak і talk не можуть так приєднувати «me».',
      de: 'Tell someone something: tell me the time. Say, speak und talk können „me“ nicht auf diese Weise anschließen.',
    },
  },
  {
    stem: "It's raining, so take your ___ with you.",
    answer: 'umbrella',
    distractors: ['sunglasses', 'swimsuit', 'toothbrush'],
    why: {
      en: 'An umbrella keeps you dry in the rain.',
      ru: 'Umbrella защищает вас от дождя.',
      uk: 'Umbrella захищає вас від дощу.',
      de: 'Mit einem umbrella bleibst du im Regen trocken.',
    },
  },
  {
    stem: 'My sister is a ___; she works in a hospital and looks after patients.',
    answer: 'nurse',
    distractors: ['pilot', 'waiter', 'farmer'],
    why: {
      en: 'A nurse looks after patients in a hospital.',
      ru: 'Nurse ухаживает за пациентами в больнице.',
      uk: 'Nurse доглядає пацієнтів у лікарні.',
      de: 'Nurse – kümmert sich im Krankenhaus um Patientinnen und Patienten.',
    },
  },
  {
    stem: "The shop is ___ on Sundays, so we can't buy anything.",
    answer: 'closed',
    distractors: ['open', 'busy', 'cheap'],
    why: {
      en: "Closed: you can't buy anything because it is not open.",
      ru: 'Closed: вы ничего не купите, потому что магазин не открыт.',
      uk: 'Closed: ви нічого не купите, бо магазин не відчинений.',
      de: 'Closed: Du kannst nichts kaufen, weil der Laden nicht geöffnet ist.',
    },
  },
  {
    stem: 'Turn ___ at the bank, and the station is on your right.',
    answer: 'left',
    distractors: ['up', 'over', 'into'],
    why: {
      en: 'Turn left / turn right give directions.',
      ru: 'Turn left / turn right — так указывают направление.',
      uk: 'Turn left / turn right — так вказують напрямок.',
      de: 'Mit turn left / turn right gibst du eine Richtung an.',
    },
  },
]);

const VOCAB_B1 = cell('VOCAB', 'B1', 1, [
  {
    stem: 'Could you ___ me a favour and post this letter?',
    answer: 'do',
    distractors: ['make', 'give', 'take'],
    why: {
      en: 'The collocation is "do someone a favour".',
      ru: 'Устойчивое сочетание — «do someone a favour».',
      uk: 'Стале словосполучення — «do someone a favour».',
      de: 'Die feste Wendung lautet „do someone a favour“.',
    },
  },
  {
    stem: 'I need to ___ a decision by Friday.',
    answer: 'make',
    distractors: ['do', 'say', 'put'],
    why: {
      en: 'The collocation is "make a decision".',
      ru: 'Устойчивое сочетание — «make a decision».',
      uk: 'Стале словосполучення — «make a decision».',
      de: 'Die feste Wendung lautet „make a decision“.',
    },
  },
  {
    stem: 'The film was so ___ that I fell asleep.',
    answer: 'boring',
    distractors: ['bored', 'exciting', 'frightening'],
    why: {
      en: 'Boring describes the film; bored describes how a person feels.',
      ru: 'Boring описывает фильм, а bored — то, что чувствует человек.',
      uk: 'Boring описує фільм, а bored — те, що відчуває людина.',
      de: 'Boring beschreibt den Film, bored dagegen, wie sich eine Person fühlt.',
    },
  },
  {
    stem: 'She ___ her driving test on the first try and got her licence.',
    answer: 'passed',
    distractors: ['failed', 'lost', 'missed'],
    why: {
      en: 'You pass a test when you succeed in it.',
      ru: 'Pass a test — это когда вы успешно сдаёте экзамен.',
      uk: 'Pass a test — це коли ви успішно складаєте іспит.',
      de: 'Pass a test heißt, dass du eine Prüfung bestehst.',
    },
  },
  {
    stem: 'Prices have ___ by 10% this year.',
    answer: 'risen',
    distractors: ['raised', 'arisen', 'aroused'],
    why: {
      en: 'Rise (risen) has no object; raise needs one: they raised prices.',
      ru: 'Rise (risen) не требует дополнения, а raise требует: they raised prices.',
      uk: 'Rise (risen) не потребує додатка, а raise потребує: they raised prices.',
      de: 'Rise (risen) hat kein Objekt, raise braucht eines: they raised prices.',
    },
  },
  {
    stem: "Can you ___ after my cat while I'm away?",
    answer: 'look',
    distractors: ['take', 'care', 'see'],
    why: {
      en: 'Look after = take care of.',
      ru: 'Look after — заботиться, присматривать (= take care of).',
      uk: 'Look after — піклуватися, доглядати (= take care of).',
      de: 'Look after – sich um jemanden kümmern (= take care of).',
    },
  },
  {
    stem: "I'm not used to getting up so early; it's hard to ___ to the new timetable.",
    answer: 'adjust',
    distractors: ['admit', 'attend', 'avoid'],
    why: {
      en: 'Adjust to = get used to something new.',
      ru: 'Adjust to — привыкнуть, приспособиться к чему-то новому.',
      uk: 'Adjust to — звикнути, пристосуватися до чогось нового.',
      de: 'Adjust to – sich an etwas Neues gewöhnen oder anpassen.',
    },
  },
  {
    stem: 'We had to ___ the meeting until next week because the manager was ill.',
    answer: 'postpone',
    distractors: ['prevent', 'pretend', 'provide'],
    why: {
      en: 'Postpone = move to a later time.',
      ru: 'Postpone — перенести на более позднее время.',
      uk: 'Postpone — перенести на пізніший час.',
      de: 'Postpone – auf einen späteren Zeitpunkt verschieben.',
    },
  },
]);

const VOCAB_B2 = cell('VOCAB', 'B2', 0, [
  {
    stem: "The police don't have ___ evidence to prove that he did it.",
    answer: 'sufficient',
    distractors: ['efficient', 'deficient', 'proficient'],
    why: {
      en: 'Sufficient = enough. Efficient (works well), deficient (lacking) and proficient (skilled) do not fit.',
      ru: 'Sufficient — достаточный (= enough). Efficient (эффективный), deficient (с нехваткой чего-то) и proficient (умелый) не подходят.',
      uk: 'Sufficient — достатній (= enough). Efficient (ефективний), deficient (з нестачею чогось) і proficient (вправний) не підходять.',
      de: 'Sufficient – ausreichend (= enough). Efficient (effizient), deficient (mangelhaft) und proficient (versiert) passen nicht.',
    },
  },
  {
    stem: "It's too early to ___ any conclusions from the data.",
    answer: 'draw',
    distractors: ['pull', 'put', 'set'],
    why: {
      en: 'The collocation is "draw a conclusion".',
      ru: 'Устойчивое сочетание — «draw a conclusion».',
      uk: 'Стале словосполучення — «draw a conclusion».',
      de: 'Die feste Wendung lautet „draw a conclusion“.',
    },
  },
  {
    stem: 'After months of talks, the two sides finally ___ an agreement.',
    answer: 'reached',
    distractors: ['arrived', 'came', 'went'],
    why: {
      en: 'Reach an agreement (arrive and come would need "at" / "to").',
      ru: 'Reach an agreement (с arrive и come понадобились бы «at» / «to»).',
      uk: 'Reach an agreement (з arrive і come знадобилися б «at» / «to»).',
      de: 'Reach an agreement (arrive und come bräuchten „at“ / „to“).',
    },
  },
  {
    stem: "I can't ___ the noise from the street any longer.",
    answer: 'stand',
    distractors: ['keep', 'last', 'hold'],
    why: {
      en: "Can't stand = can't tolerate.",
      ru: "Can't stand — не выносить, не терпеть (= can't tolerate).",
      uk: "Can't stand — не виносити, не терпіти (= can't tolerate).",
      de: "Can't stand – etwas nicht ausstehen können (= can't tolerate).",
    },
  },
  {
    stem: 'The concert has been ___ until next month because of the storm.',
    answer: 'put off',
    distractors: ['put out', 'put up', 'put away'],
    why: {
      en: 'Put off = postpone.',
      ru: 'Put off — отложить, перенести (= postpone).',
      uk: 'Put off — відкласти, перенести (= postpone).',
      de: 'Put off – verschieben (= postpone).',
    },
  },
  {
    stem: "She's very ___: she always does what she promises.",
    answer: 'reliable',
    distractors: ['reluctant', 'relevant', 'redundant'],
    why: {
      en: 'Reliable = you can trust someone to do what they say.',
      ru: 'Reliable — на такого человека можно положиться: он делает то, что обещает.',
      uk: 'Reliable — на таку людину можна покластися: вона робить те, що обіцяє.',
      de: 'Reliable – du kannst dich darauf verlassen, dass jemand hält, was versprochen wurde.',
    },
  },
]);

const VOCAB_C1 = cell('VOCAB', 'C1', 2, [
  {
    stem: 'Politicians often pay lip ___ to environmental issues but do very little.',
    answer: 'service',
    distractors: ['support', 'attention', 'respect'],
    why: {
      en: 'Pay lip service to something = say you support it without acting on it.',
      ru: 'Pay lip service to something — на словах поддерживать что-то, ничего для этого не делая.',
      uk: 'Pay lip service to something — на словах підтримувати щось, нічого для цього не роблячи.',
      de: 'Pay lip service to something – etwas nur mit Worten unterstützen, ohne danach zu handeln.',
    },
  },
  {
    stem: 'Her decision to resign came as a ___ from the blue.',
    answer: 'bolt',
    distractors: ['flash', 'storm', 'shock'],
    why: {
      en: 'A bolt from the blue = a complete surprise.',
      ru: 'A bolt from the blue — полная неожиданность, как гром среди ясного неба.',
      uk: 'A bolt from the blue — повна несподіванка, як грім серед ясного неба.',
      de: 'A bolt from the blue – eine völlige Überraschung, wie ein Blitz aus heiterem Himmel.',
    },
  },
  {
    stem: 'We need to ___ the root causes of the problem, not just the symptoms.',
    answer: 'address',
    distractors: ['adhere', 'adjourn', 'admonish'],
    why: {
      en: 'Address a problem = start dealing with it.',
      ru: 'Address a problem — взяться за решение проблемы.',
      uk: 'Address a problem — узятися за розв’язання проблеми.',
      de: 'Address a problem – ein Problem angehen.',
    },
  },
  {
    stem: 'The school offers a ___ range of courses, from art to engineering.',
    answer: 'comprehensive',
    distractors: ['comprehensible', 'compulsive', 'complacent'],
    why: {
      en: 'A comprehensive range covers everything; comprehensible (easy to understand) cannot describe a range.',
      ru: 'Comprehensive range охватывает всё; comprehensible (понятный) не может описывать range.',
      uk: 'Comprehensive range охоплює все; comprehensible (зрозумілий) не може описувати range.',
      de: 'Eine comprehensive range deckt alles ab; comprehensible (verständlich) kann keine range beschreiben.',
    },
  },
  {
    stem: 'The new policy is likely to have far-___ consequences.',
    answer: 'reaching',
    distractors: ['fetched', 'sighted', 'flung'],
    why: {
      en: 'Far-reaching = with a wide effect; far-fetched (unlikely), far-sighted (planning ahead) and far-flung (distant) do not describe consequences.',
      ru: 'Far-reaching — масштабный, с широким влиянием; far-fetched (надуманный), far-sighted (дальновидный) и far-flung (отдалённый) не описывают последствия.',
      uk: 'Far-reaching — масштабний, із широким впливом; far-fetched (надуманий), far-sighted (далекоглядний) і far-flung (віддалений) не описують наслідки.',
      de: 'Far-reaching – weitreichend; far-fetched (weit hergeholt), far-sighted (vorausschauend) und far-flung (weit entfernt) beschreiben keine Folgen.',
    },
  },
  {
    stem: "Let's not ___ hairs: the two versions are essentially the same.",
    answer: 'split',
    distractors: ['cut', 'pull', 'comb'],
    why: {
      en: 'Split hairs = argue about tiny, unimportant differences.',
      ru: 'Split hairs — спорить о мелких, несущественных различиях.',
      uk: 'Split hairs — сперечатися через дрібні, несуттєві відмінності.',
      de: 'Split hairs – über winzige, unwichtige Unterschiede streiten.',
    },
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
