import { choice, cloze } from '../practice';
import { grammarItems } from './gp';

export const PAST_PARTICIPLE = grammarItems('grammar.past_participle', [
  {
    slug: 'regular_v3_equals_v2',
    level: 'B1',
    pattern: 'regular V3 = V2 (-ed)',
    example: 'work → worked → worked',
    explanation: {
      en: 'For regular verbs the past participle equals the past simple form.',
      ru: 'У правильных глаголов причастие прошедшего времени совпадает с формой Past Simple.',
    },
    practice: cloze('I have ___ here since 2020. (work)', 'worked'),
  },
  {
    slug: 'irregular_v3_distinct',
    level: 'B1',
    pattern: 'irregular V3 ≠ V2',
    example: 'go → went → gone; see → saw → seen; do → did → done',
    contrast: 'I have went (wrong) → I have gone',
    explanation: {
      en: 'Many irregular verbs have a third form distinct from V2 — learn triples.',
      ru: 'У многих неправильных глаголов третья форма отличается от V2 — учите тройки.',
    },
    practice: choice('She has ___ home already.', ['went', 'gone', 'go', 'goed'], 1),
  },
  {
    slug: 'v3_same_all_forms',
    level: 'B1',
    pattern: 'invariant verbs (put/cut/cost)',
    example: 'put → put → put; cut → cut → cut',
    explanation: {
      en: 'Some verbs keep one form across V1/V2/V3.',
      ru: 'Некоторые глаголы сохраняют одну форму во всех трёх позициях.',
    },
    practice: choice(
      'Have you ___ the milk in the fridge?',
      ['putted', 'puted', 'put', 'putten'],
      2,
    ),
  },
  {
    slug: 'v3_after_have_be',
    level: 'B1',
    pattern: 'V3 after have (perfect) / be (passive)',
    example: 'She has finished. The house was built in 1990.',
    explanation: {
      en: 'V3 follows have in perfect tenses and be in the passive voice.',
      ru: 'V3 следует за have в перфектных временах и за be в пассивном залоге.',
    },
    practice: choice('The house was ___ in 1990.', ['built', 'build', 'builded', 'building'], 0),
  },
]);
