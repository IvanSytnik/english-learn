import type { HeteronymRow } from './ipa';

/**
 * The hand-written pronunciation choices for catalogue words that have
 * several CMUdict pronunciations beyond stress-neutral variants (B6.4a):
 * [lemmaKey, pos, 1-based CMUdict variant]. At most 50 rows (B6-SPEC); a
 * word with several pronunciations and no row here gets no IPA.
 */
export const IPA_HETERONYMS: readonly HeteronymRow[] = [
  // Heteronyms: the pronunciation depends on the part of speech or sense.
  ['close', 'ADJECTIVE', 1], // kloʊs
  ['close', 'VERB', 2], // kloʊz
  ['excuse', 'NOUN', 1], // ɪkˈskjus
  ['excuse', 'VERB', 2], // ɪkˈskjuz
  ['graduate', 'NOUN', 1], // ˈɡrædʒəwət
  ['graduate', 'VERB', 2], // ˈɡrædʒəˌweɪt
  ['lead', 'ADJECTIVE', 2], // lid (the lead singer)
  ['lead', 'NOUN', 2], // lid (take the lead)
  ['lead', 'VERB', 2], // lid
  ['live', 'ADJECTIVE', 1], // laɪv
  ['live', 'VERB', 2], // lɪv
  ['minute', 'NOUN', 1], // ˈmɪnət (60 seconds)
  ['perfect', 'ADJECTIVE', 2], // ˈpɝˌfɪkt
  ['present', 'ADJECTIVE', 1], // ˈprɛzənt
  ['present', 'NOUN', 1], // ˈprɛzənt
  ['read', 'VERB', 2], // rid (the base form, not the past)
  ['reading', 'NOUN', 1], // ˈridɪŋ
  ['record', 'NOUN', 2], // ˈrɛkɚd
  ['record', 'VERB', 3], // rɪˈkɔrd
  ['separate', 'ADJECTIVE', 2], // ˈsɛpɚɪt
  ['tear', 'NOUN', 2], // tɪr (a tear from the eye)
  ['tear', 'VERB', 1], // tɛr (to rip)
  ['use', 'NOUN', 1], // jus
  ['use', 'VERB', 2], // juz
  ['wind', 'NOUN', 2], // wɪnd (moving air)
  ['wound', 'NOUN', 2], // wund (an injury)
  // Free variants of the most frequent words: the General American one.
  ['again', 'ADVERB', 1], // əˈɡɛn
  ['as', 'CONJUNCTION', 1], // æz
  ['as', 'PREPOSITION', 1],
  ['because', 'CONJUNCTION', 1], // bɪˈkɔz
  ['family', 'NOUN', 1], // ˈfæməli
  ['for', 'CONJUNCTION', 1], // fɔr
  ['for', 'PREPOSITION', 1],
  ['get', 'VERB', 1], // ɡɛt
  ['new', 'ADJECTIVE', 1], // nu
  ['often', 'ADVERB', 1], // ˈɔfən
  ['on', 'ADVERB', 1], // ɑn
  ['on', 'PREPOSITION', 1],
  ['or', 'CONJUNCTION', 1], // ɔr
  ['question', 'NOUN', 1], // ˈkwɛstʃən
  ['really', 'ADVERB', 1], // ˈrɪli
  ['want', 'VERB', 1], // wɑnt
  ['what', 'PRONOUN', 1], // wʌt
  ['when', 'ADVERB', 1], // wɛn
  ['when', 'CONJUNCTION', 1],
  ['where', 'ADVERB', 1], // wɛr
  ['where', 'CONJUNCTION', 1],
  ['which', 'PRONOUN', 1], // wɪtʃ
  ['why', 'ADVERB', 1], // waɪ
  ['with', 'PREPOSITION', 1], // wɪð
];
