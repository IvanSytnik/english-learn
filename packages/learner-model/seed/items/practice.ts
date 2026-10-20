/**
 * Practice questions for the seed items (Item.content.practice), keyed by
 * item id and merged into the content by seed/items/run.ts.
 *
 * Authoring rules:
 *   - one question tests exactly the item's pattern, nothing else;
 *   - every distractor must be WRONG in the given sentence, not merely less
 *     natural — no "also acceptable" options (e.g. never offer "will meet"
 *     next to "are meeting");
 *   - the correct option moves around (no "always the first one" tell);
 *   - cloze prompts carry a "(base form)" cue so the answer is unambiguous.
 *
 * Every seed item must have an entry — enforced by
 * src/__tests__/seed-practice.test.ts.
 */

import type { Practice } from '@englishlearn/db/schemas';

const choice = (prompt: string, options: string[], correctIndex: number): Practice => ({
  type: 'choice',
  prompt,
  options,
  correctIndex,
});

const cloze = (prompt: string, ...acceptedAnswers: string[]): Practice => ({
  type: 'cloze',
  prompt,
  acceptedAnswers,
});

export const ITEM_PRACTICE: Readonly<Record<string, Practice>> = {
  // ── grammar.articles_basic ─────────────────────────────────────────────────
  'item.articles_basic.a_an_first_mention': choice(
    'Guess what? I saw ___ funny dog in the park this morning.',
    ['the', 'a', 'an', '—'],
    1,
  ),
  'item.articles_basic.the_known_reference': choice(
    'I saw a dog in the park. ___ dog was very friendly.',
    ['A', 'An', 'The'],
    2,
  ),
  'item.articles_basic.an_before_vowel_sound': choice(
    'It takes ___ hour to get there by bus.',
    ['an', 'a'],
    0,
  ),
  'item.articles_basic.zero_article_general': choice(
    'In general, ___ dogs are loyal animals.',
    ['the', '—', 'a'],
    1,
  ),

  // ── grammar.plurals ────────────────────────────────────────────────────────
  'item.plurals.regular_s_es': cloze('There are three ___ on the shelf. (box)', 'boxes'),
  'item.plurals.irregular_common': choice(
    'Two ___ are playing in the garden.',
    ['childs', 'childrens', 'children', 'child'],
    2,
  ),
  'item.plurals.uncountable_no_plural': choice(
    'Can you give me some ___ about my CV?',
    ['advices', 'advice', 'an advice'],
    1,
  ),
  'item.plurals.same_form_plurals': choice(
    'The farmer has twenty ___.',
    ['sheeps', 'sheepes', 'sheep'],
    2,
  ),

  // ── grammar.comparatives ───────────────────────────────────────────────────
  'item.comparatives.er_est_short': cloze('My brother is ___ than me. (tall)', 'taller'),
  'item.comparatives.more_most_long': choice(
    'This hotel is ___ than the one we stayed in last year.',
    ['expensiver', 'most expensive', 'more expensive', 'the more expensive'],
    2,
  ),
  'item.comparatives.irregular_good_bad': choice(
    "Today's weather is ___ than yesterday's. It's raining again.",
    ['worse', 'badder', 'more bad', 'worst'],
    0,
  ),
  'item.comparatives.than_and_as_as': choice(
    'He is as tall ___ his father.',
    ['than', 'like', 'as', 'that'],
    2,
  ),

  // ── grammar.prepositions_time_place ────────────────────────────────────────
  'item.prepositions_time_place.in_time': choice('My birthday is ___ July.', ['on', 'in', 'at'], 1),
  'item.prepositions_time_place.on_time': choice(
    'The meeting is ___ Monday.',
    ['on', 'at', 'in'],
    0,
  ),
  'item.prepositions_time_place.at_time': choice(
    "The film starts ___ 7 o'clock.",
    ['in', 'on', 'at'],
    2,
  ),
  'item.prepositions_time_place.in_on_at_place': choice(
    "I'll wait for you ___ the bus stop.",
    ['at', 'on', 'in'],
    0,
  ),

  // ── grammar.question_formation ─────────────────────────────────────────────
  'item.question_formation.yes_no_do_does': choice('___ she work here?', ['Do', 'Is', 'Does'], 2),
  'item.question_formation.wh_word_order': choice(
    'Where ___?',
    ['you live', 'do you live', 'you do live', 'does you live'],
    1,
  ),
  'item.question_formation.be_inversion': choice(
    '___ ready to go?',
    ['Do you be', 'Be you', 'Is you', 'Are you'],
    3,
  ),
  'item.question_formation.subject_questions_no_do': choice(
    'Who ___ you last night?',
    ['did called', 'called', 'has called', 'does call'],
    1,
  ),

  // ── grammar.present_simple ─────────────────────────────────────────────────
  'item.present_simple.third_person_s': cloze('She ___ in a bank. (work)', 'works'),
  'item.present_simple.negative_dont_doesnt': choice(
    'He ___ smoke.',
    ["don't", 'not', "doesn't", "isn't"],
    2,
  ),
  'item.present_simple.habits_adverbs': choice(
    'I ___ at 7 every morning.',
    ['get usually up', 'usually get up', 'usually getting up', 'am usually get up'],
    1,
  ),
  'item.present_simple.schedules_future': choice(
    'Hurry up! According to the timetable, the train ___ at 9:15.',
    ['leave', 'leaving', 'is leave', 'leaves'],
    3,
  ),

  // ── grammar.present_continuous ─────────────────────────────────────────────
  'item.present_continuous.form_be_ving': cloze('Look outside! It ___. (snow)', 'is snowing'),
  'item.present_continuous.now_vs_around_now': choice(
    'I ___ with friends this week while my flat is being painted.',
    ['am staying', 'stay', 'stays', 'staying'],
    0,
  ),
  'item.present_continuous.future_arrangements': choice(
    "We ___ Anna on Friday — it's in my calendar.",
    ['meeting', 'meets', 'are meeting', 'will meeting'],
    2,
  ),
  'item.present_continuous.stative_verbs_no_ing': choice(
    'I ___ the answer to this question.',
    ['am knowing', 'knowing', 'am know', 'know'],
    3,
  ),

  // ── grammar.past_simple ────────────────────────────────────────────────────
  'item.past_simple.regular_ed': cloze('Yesterday we ___ football in the park. (play)', 'played'),
  'item.past_simple.irregular_v2': choice(
    'Last summer we ___ to Spain.',
    ['goed', 'gone', 'go', 'went'],
    3,
  ),
  'item.past_simple.negative_didnt': choice(
    "I didn't ___ him yesterday.",
    ['see', 'saw', 'seen', 'seeing'],
    0,
  ),
  'item.past_simple.questions_did': choice(
    '___ the report on time?',
    ['Did you finished', 'You did finish', 'Did you finish', 'Do you finished'],
    2,
  ),

  // ── grammar.past_participle ────────────────────────────────────────────────
  'item.past_participle.regular_v3_equals_v2': cloze(
    'I have ___ here since 2020. (work)',
    'worked',
  ),
  'item.past_participle.irregular_v3_distinct': choice(
    'She has ___ home already.',
    ['went', 'gone', 'go', 'goed'],
    1,
  ),
  'item.past_participle.v3_same_all_forms': choice(
    'Have you ___ the milk in the fridge?',
    ['putted', 'puted', 'put', 'putten'],
    2,
  ),
  'item.past_participle.v3_after_have_be': choice(
    'The house was ___ in 1990.',
    ['built', 'build', 'builded', 'building'],
    0,
  ),

  // ── grammar.present_perfect_basic ──────────────────────────────────────────
  'item.present_perfect_basic.form_have_v3': choice(
    'Look — she ___ her homework, so she can go out now.',
    ['have finished', 'has finish', 'has finished', 'finished has'],
    2,
  ),
  'item.present_perfect_basic.experience_ever_never': choice(
    '___ to Japan?',
    ['Did you ever been', 'Have you ever been', 'Have you ever went', 'Are you ever been'],
    1,
  ),
  'item.present_perfect_basic.recent_just_already_yet': choice(
    'Have you finished your report ___?',
    ['just', 'ago', 'yet'],
    2,
  ),
  'item.present_perfect_basic.for_since_unfinished': choice(
    "I've lived here ___ five years.",
    ['since', 'for', 'from', 'during'],
    1,
  ),

  // ── grammar.modal_verbs_basic ──────────────────────────────────────────────
  'item.modal_verbs_basic.can_ability': choice(
    'She ___ swim very well.',
    ['cans', 'can to', 'is can', 'can'],
    3,
  ),
  'item.modal_verbs_basic.could_past_ability': choice(
    'When I was five, I ___ already read.',
    ['could', 'can', 'could to', 'cans'],
    0,
  ),
  'item.modal_verbs_basic.should_advice': choice(
    'You look ill. You ___ see a doctor.',
    ['should to', 'should', 'shoulds', 'must to'],
    1,
  ),
  'item.modal_verbs_basic.must_obligation': choice(
    "You ___ smoke here. It's against the rules.",
    ["don't must", 'must', "mustn't", "needn't"],
    2,
  ),

  // ── grammar.conditional_0_1 ────────────────────────────────────────────────
  'item.conditional_0_1.zero_general_truths': choice(
    'If you heat water to 100°C, it ___.',
    ['boil', 'boils', 'boiled', 'will boiling'],
    1,
  ),
  'item.conditional_0_1.first_real_future': choice(
    'If it rains tomorrow, we ___ at home.',
    ['would stay', 'stayed', 'will staying', 'will stay'],
    3,
  ),
  'item.conditional_0_1.no_will_in_if_clause': choice(
    "If it ___ tomorrow, we'll cancel the picnic.",
    ['rains', 'will rain', 'rained', 'is rain'],
    0,
  ),
  'item.conditional_0_1.unless_negative_if': choice(
    "You'll miss the train ___ you hurry.",
    ['if', 'unless', 'when'],
    1,
  ),

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
};
