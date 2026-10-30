/** GRAMMAR_PATTERN seed items, one file per concept (in curriculum order). */

import type { SeedItem } from '../types';
import { ARTICLES_BASIC } from './articles-basic';
import { COMPARATIVES } from './comparatives';
import { CONDITIONAL_0_1 } from './conditional-0-1';
import { CONDITIONAL_2 } from './conditional-2';
import { CONDITIONAL_3 } from './conditional-3';
import { MODAL_VERBS_BASIC } from './modal-verbs-basic';
import { MODALS_DEDUCTION } from './modals-deduction';
import { PASSIVE_VOICE } from './passive-voice';
import { PAST_PARTICIPLE } from './past-participle';
import { PAST_SIMPLE } from './past-simple';
import { PLURALS } from './plurals';
import { PREPOSITIONS_TIME_PLACE } from './prepositions-time-place';
import { PRESENT_CONTINUOUS } from './present-continuous';
import { PRESENT_PERFECT_BASIC } from './present-perfect-basic';
import { PRESENT_SIMPLE } from './present-simple';
import { QUESTION_FORMATION } from './question-formation';

export const GRAMMAR_ITEMS: SeedItem[] = [
  ...ARTICLES_BASIC,
  ...PLURALS,
  ...COMPARATIVES,
  ...PREPOSITIONS_TIME_PLACE,
  ...QUESTION_FORMATION,
  ...PRESENT_SIMPLE,
  ...PRESENT_CONTINUOUS,
  ...PAST_SIMPLE,
  ...PAST_PARTICIPLE,
  ...PRESENT_PERFECT_BASIC,
  ...MODAL_VERBS_BASIC,
  ...CONDITIONAL_0_1,
  ...CONDITIONAL_2,
  ...PASSIVE_VOICE,
  ...CONDITIONAL_3,
  ...MODALS_DEDUCTION,
];
