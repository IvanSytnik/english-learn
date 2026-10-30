/**
 * Practice questions for the vocabulary seed items (Item.content.practice),
 * keyed by item id and merged into the content by seed/items/index.ts.
 * Grammar questions live next to their item in seed/items/grammar/*.
 *
 * Authoring rules: see seed/items/practice.ts.
 */

import type { Practice } from '@englishlearn/db/schemas';
import { choice } from './practice';

export const VOCAB_PRACTICE: Readonly<Record<string, Practice>> = {
  // ── vocab.daily_life ───────────────────────────────────────────────────────
  'item.vocab.daily_life.schedule': choice(
    'My ___ is very busy this week — I have meetings every day.',
    ['luggage', 'groceries', 'schedule', 'boarding pass'],
    2,
  ),
  'item.vocab.daily_life.groceries': choice(
    'I buy ___ at the supermarket every Saturday.',
    ['groceries', 'luggage', 'schedule', 'boarding pass'],
    0,
  ),
  'item.vocab.daily_life.do_the_dishes': choice(
    'Whose turn is it to ___ the dishes tonight?',
    ['make', 'do', 'take', 'have'],
    1,
  ),
  'item.vocab.daily_life.early_bird': choice(
    "She's up at 5 every day. She's a real ___.",
    ['night owl', 'early worm', 'morning cat', 'early bird'],
    3,
  ),

  // ── vocab.travel ───────────────────────────────────────────────────────────
  'item.vocab.travel.boarding_pass': choice(
    'Please have your ___ and passport ready at the gate.',
    ['schedule', 'boarding pass', 'groceries', 'luggage'],
    1,
  ),
  'item.vocab.travel.luggage': choice(
    'How much ___ can I take on board?',
    ['luggages', 'a luggage', 'luggage', 'baggages'],
    2,
  ),
  'item.vocab.travel.check_in': choice(
    'We ___ online the night before the flight.',
    ['checked in', 'checked out', 'checked up', 'checked on'],
    0,
  ),
  'item.vocab.travel.off_beaten_track': choice(
    'We found a quiet little village off the ___ track.',
    ['beating', 'broken', 'beat', 'beaten'],
    3,
  ),

  // ── vocab.phrasal_verbs_basic ──────────────────────────────────────────────
  'item.vocab.phrasal_verbs_basic.get_up': choice(
    'I usually ___ at seven and have breakfast at half past.',
    ['give up', 'get up', 'look for', 'turn off'],
    1,
  ),
  'item.vocab.phrasal_verbs_basic.turn_on_off': choice(
    "It's dark in here. Could you ___ the light, please?",
    ['turn on', 'turn off', 'give up', 'get up'],
    0,
  ),
  'item.vocab.phrasal_verbs_basic.look_for': choice(
    "I'm ___ my keys. Have you seen them anywhere?",
    ['looking at', 'giving up', 'looking for', 'getting up'],
    2,
  ),
  'item.vocab.phrasal_verbs_basic.give_up': choice(
    "Don't ___ now — you're almost at the finish line!",
    ['get up', 'turn on', 'look for', 'give up'],
    3,
  ),

  // ── vocab.work_study ───────────────────────────────────────────────────────
  // No "to": "apply to a job" is spreading in American English.
  'item.vocab.work_study.apply_for': choice(
    'She has applied ___ a job at the city library.',
    ['for', 'on', 'at', 'with'],
    0,
  ),
  'item.vocab.work_study.deadline': choice(
    "The ___ for the essay is Friday, so I can't go out this week.",
    ['timetable', 'schedule', 'calendar', 'deadline'],
    3,
  ),
  'item.vocab.work_study.colleague': choice(
    'My ___ and I share a desk and work on the same projects.',
    ['customer', 'landlord', 'colleague', 'tenant'],
    2,
  ),
  // Three options: do / write / sit / pass / hold an exam are all right somewhere.
  'item.vocab.work_study.take_an_exam': choice(
    'Students have to ___ an exam at the end of every term.',
    ['make', 'take', 'give'],
    1,
  ),

  // ── vocab.phrasal_verbs_b2 ─────────────────────────────────────────────────
  'item.vocab.phrasal_verbs_b2.run_out_of': choice(
    "We've ___ out of coffee — can you buy some on your way home?",
    ['run', 'gone', 'got', 'come'],
    0,
  ),
  'item.vocab.phrasal_verbs_b2.come_up_with': choice(
    'She ___ up with a brilliant idea for the campaign.',
    ['went', 'came', 'took', 'put'],
    1,
  ),
  // No "get on": "How do you get on with…" is idiomatic.
  'item.vocab.phrasal_verbs_b2.put_up_with': choice(
    'How do you ___ with such a long commute every day?',
    ['come up', 'take up', 'put up', 'run out'],
    2,
  ),
  'item.vocab.phrasal_verbs_b2.turn_down': choice(
    'He ___ the job offer because the salary was too low.',
    ['turned up', 'turned over', 'turned out', 'turned down'],
    3,
  ),

  // ── vocab.collocations_b2 ──────────────────────────────────────────────────
  // No "give": "give attention to" exists.
  'item.vocab.collocations_b2.pay_attention': choice(
    'Please ___ attention to the safety instructions.',
    ['make', 'pay', 'take', 'do'],
    1,
  ),
  'item.vocab.collocations_b2.make_progress': choice(
    "Her English is getting better — she's ___ real progress this year.",
    ['making', 'doing', 'taking', 'getting'],
    0,
  ),
  // No "makes": "he always makes promises" is grammatical.
  'item.vocab.collocations_b2.keep_a_promise': choice(
    'He always ___ his promises, so you can trust him.',
    ['holds', 'saves', 'does', 'keeps'],
    3,
  ),
  'item.vocab.collocations_b2.take_responsibility': choice(
    'The manager ___ full responsibility for the mistake.',
    ['made', 'gave', 'took', 'did'],
    2,
  ),

  // ── vocab.idioms_everyday ──────────────────────────────────────────────────
  'item.vocab.idioms_everyday.piece_of_cake': choice(
    'The test was a piece of ___ — I finished it in ten minutes.',
    ['bread', 'cake', 'pie', 'sugar'],
    1,
  ),
  'item.vocab.idioms_everyday.under_the_weather': choice(
    "I'm feeling a bit under the ___ today, so I'll stay at home.",
    ['rain', 'sky', 'weather', 'cloud'],
    2,
  ),
  // "melt" is the Russian calque ("растопить лёд"); the English idiom is break.
  'item.vocab.idioms_everyday.break_the_ice': choice(
    'He told a funny story to ___ the ice at the start of the meeting.',
    ['melt', 'crack', 'cut', 'break'],
    3,
  ),
  'item.vocab.idioms_everyday.once_in_a_blue_moon': choice(
    'We only see each other once in a ___ moon, because she lives in Australia.',
    ['blue', 'full', 'new', 'red'],
    0,
  ),
};
