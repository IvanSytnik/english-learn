import type { HeteronymRow } from './ipa';

/**
 * The hand-written pronunciation choices for catalogue words with several
 * CMUdict pronunciations (B6.4a): [lemmaKey, pos, 1-based CMUdict variant].
 * A row always wins (./ipa.ts); without one, rules 2–5 of V2-9 decide (another
 * syllable count → null, a stress shift by part of speech, the strong form
 * for one syllable, else the first variant). At most 50 rows (B6-SPEC).
 */
export const IPA_HETERONYMS: readonly HeteronymRow[] = [
  // Heteronyms: the pronunciation depends on the part of speech or sense.
  ['close', 'VERB', 2], // kloʊz
  ['excuse', 'VERB', 2], // ɪkˈskjuz
  ['graduate', 'VERB', 2], // ˈɡrædʒəˌweɪt
  ['lead', 'ADJECTIVE', 2], // lid (the lead singer)
  ['lead', 'NOUN', 2], // lid (take the lead)
  ['lead', 'VERB', 2], // lid
  ['live', 'VERB', 2], // lɪv
  ['read', 'VERB', 2], // rid (the base form, not the past)
  ['record', 'VERB', 3], // rɪˈkɔrd
  ['separate', 'ADJECTIVE', 2], // ˈsɛpɚɪt
  ['tear', 'NOUN', 2], // tɪr (a tear from the eye)
  ['use', 'VERB', 2], // juz
  ['wind', 'NOUN', 2], // wɪnd (moving air)
  ['wound', 'NOUN', 2], // wund (an injury)
  ['because', 'CONJUNCTION', 1], // bɪˈkɔz
  ['family', 'NOUN', 1], // ˈfæməli
  // B6.2b: A1 words whose variants differ in stress (else null).
  ['eighteen', 'OTHER', 1], // eɪˈtin
  ['eleven', 'OTHER', 1], // ɪˈlɛvən
  ['fifteen', 'OTHER', 1], // fɪfˈtin
  ['fourteen', 'OTHER', 2], // ˌfɔrˈtin
  ['inside', 'ADVERB', 1], // ˌɪnˈsaɪd
  ['inside', 'PREPOSITION', 1],
  ['into', 'PREPOSITION', 1], // ˈɪntu
  ['museum', 'NOUN', 1], // mjuˈziəm
  ['sixteen', 'OTHER', 1], // sɪkˈstin
  ['sometimes', 'ADVERB', 2], // ˈsʌmˌtaɪmz
  ['umbrella', 'NOUN', 1], // əmˈbrɛlə
  // B6.2c: a rare stress variant would win by the part-of-speech rule (3).
  ['effect', 'NOUN', 1], // ɪˈfɛkt, not ˈifɛkt
  ['effective', 'ADJECTIVE', 1], // ɪˈfɛktɪv
  ['emergency', 'NOUN', 1], // ɪˈmɝdʒənsi
  ['emotion', 'NOUN', 1], // ɪˈmoʊʃən
  ['emotional', 'ADJECTIVE', 1], // ɪˈmoʊʃənəl
  ['forbidden', 'ADJECTIVE', 2], // stress on -bid- (CMUdict spells it ER0 R)
  ['information', 'NOUN', 1], // ˌɪnfɚˈmeɪʃən (variant 2 has two primary stresses)
  ['unfair', 'ADJECTIVE', 1], // ənˈfɛr
  ['upset', 'ADJECTIVE', 1], // əpˈsɛt (predicative)
  // B6.2c: verbs in -ate whose first CMUdict variant is the adjective's -ət (rule 5).
  ['associate', 'VERB', 2], // əˈsoʊsiˌeɪt
  ['estimate', 'VERB', 2], // ˈɛstəˌmeɪt
];
