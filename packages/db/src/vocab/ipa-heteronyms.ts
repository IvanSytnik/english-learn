import type { HeteronymRow } from './ipa';

/**
 * The hand-written pronunciation choices for catalogue words with several
 * CMUdict pronunciations (B6.4a): [lemmaKey, pos, 1-based CMUdict variant].
 * A row always wins (./ipa.ts); without one, variants of different shape get
 * no IPA and variants of one shape the strong form (B6.2b). At most 50 rows
 * (B6-SPEC).
 */
export const IPA_HETERONYMS: readonly HeteronymRow[] = [
  // Heteronyms: the pronunciation depends on the part of speech or sense.
  ['close', 'VERB', 2], // kloʊz
  ['excuse', 'VERB', 2], // ɪkˈskjuz
  ['graduate', 'NOUN', 1], // ˈɡrædʒəwət
  ['graduate', 'VERB', 2], // ˈɡrædʒəˌweɪt
  ['lead', 'ADJECTIVE', 2], // lid (the lead singer)
  ['lead', 'NOUN', 2], // lid (take the lead)
  ['lead', 'VERB', 2], // lid
  ['live', 'VERB', 2], // lɪv
  ['minute', 'NOUN', 1], // ˈmɪnət (60 seconds)
  ['perfect', 'ADJECTIVE', 2], // ˈpɝˌfɪkt
  ['present', 'ADJECTIVE', 1], // ˈprɛzənt
  ['present', 'NOUN', 1], // ˈprɛzənt
  ['read', 'VERB', 2], // rid (the base form, not the past)
  ['record', 'NOUN', 2], // ˈrɛkɚd
  ['record', 'VERB', 3], // rɪˈkɔrd
  ['separate', 'ADJECTIVE', 2], // ˈsɛpɚɪt
  ['tear', 'NOUN', 2], // tɪr (a tear from the eye)
  ['use', 'VERB', 2], // juz
  ['wind', 'NOUN', 2], // wɪnd (moving air)
  ['wound', 'NOUN', 2], // wund (an injury)
  ['because', 'CONJUNCTION', 1], // bɪˈkɔz
  ['family', 'NOUN', 1], // ˈfæməli
  // B6.2b: adjectives whose strong form is the verb's (-ate), a weekday.
  ['appropriate', 'ADJECTIVE', 1], // əˈproʊpriət
  ['moderate', 'ADJECTIVE', 1], // ˈmɑdɚət
  ['saturday', 'NOUN', 1], // ˈsætɚdi
  // B6.2b: A1 words whose variants differ in stress (else null).
  ['address', 'NOUN', 1], // ˈæˌdrɛs
  ['concert', 'NOUN', 1], // ˈkɑnsɚt
  ['contest', 'NOUN', 1], // ˈkɑntɛst
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
  ['subject', 'NOUN', 2], // ˈsʌbdʒɪkt
  ['survey', 'NOUN', 2], // ˈsɝˌveɪ
  ['umbrella', 'NOUN', 1], // əmˈbrɛlə
];
