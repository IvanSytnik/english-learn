import { choice, cloze } from '../practice';
import { grammarItems } from './gp';

export const COMPARATIVES = grammarItems('grammar.comparatives', [
  {
    slug: 'er_est_short',
    level: 'A2',
    pattern: 'short adj + -er / -est',
    example: 'tall → taller → the tallest; big → bigger → the biggest',
    explanation: {
      en: 'One-syllable adjectives take -er/-est; final consonant doubles after a short vowel.',
      ru: 'Односложные прилагательные получают -er/-est; конечная согласная удваивается после краткой гласной.',
    },
    practice: cloze('My brother is ___ than me. (tall)', 'taller'),
  },
  {
    slug: 'more_most_long',
    level: 'A2',
    pattern: 'more / the most + long adjective',
    example: 'expensive → more expensive → the most expensive',
    contrast: 'expensiver (wrong)',
    explanation: {
      en: 'Adjectives of 2+ syllables (mostly) use more/most instead of -er/-est.',
      ru: 'Прилагательные из 2+ слогов (в основном) используют more/most вместо -er/-est.',
    },
    practice: choice(
      'This hotel is ___ than the one we stayed in last year.',
      ['expensiver', 'most expensive', 'more expensive', 'the more expensive'],
      2,
    ),
  },
  {
    slug: 'irregular_good_bad',
    level: 'A2',
    pattern: 'irregular: good/bad/far',
    example: 'good → better → the best; bad → worse → the worst',
    explanation: {
      en: 'good, bad, far have suppletive comparative forms.',
      ru: 'good, bad, far имеют супплетивные формы сравнения.',
    },
    practice: choice(
      "Today's weather is ___ than yesterday's. It's raining again.",
      ['worse', 'badder', 'more bad', 'worst'],
      0,
    ),
  },
  {
    slug: 'than_and_as_as',
    level: 'A2',
    pattern: 'comparative + than; as + adj + as',
    example: 'She is taller than me. He is as tall as his father.',
    explanation: {
      en: 'than after comparatives; as...as for equality.',
      ru: 'than после сравнительной степени; as...as для равенства.',
    },
    practice: choice('He is as tall ___ his father.', ['than', 'like', 'as', 'that'], 2),
  },
  {
    slug: 'y_to_ier',
    level: 'A2',
    pattern: 'consonant + y → -ier / -iest',
    example: 'busy → busier → the busiest; happy → happier',
    explanation: {
      en: 'Adjectives ending in consonant + y change y to i before -er/-est: busier, happiest.',
      ru: 'У прилагательных на согласную + y буква y меняется на i перед -er/-est: busier, happiest.',
      uk: 'У прикметниках на приголосну + y літера y змінюється на i перед -er/-est: busier, happiest.',
      de: 'Bei Adjektiven auf Konsonant + y wird y vor -er/-est zu i: busier, happiest.',
    },
    practice: cloze('This week I am ___ than last week. (busy)', 'busier'),
  },
  {
    slug: 'superlative_in_place',
    level: 'A2',
    pattern: 'the + superlative + in + place / group',
    example: 'the best student in the class, the tallest building in the city',
    explanation: {
      en: 'After a superlative, use in with places and groups: the best in the class, the biggest in the world.',
      ru: 'После превосходной степени с местом или группой ставится in: the best in the class, the biggest in the world.',
      uk: 'Після найвищого ступеня з місцем або групою вживається in: the best in the class, the biggest in the world.',
      de: 'Nach dem Superlativ steht bei Orten und Gruppen in: the best in the class, the biggest in the world.',
    },
    practice: choice('She is the best student ___ her class.', ['than', 'in', 'on', 'at'], 1),
  },
  {
    slug: 'the_most_long',
    level: 'A2',
    pattern: 'the most + long adjective',
    example: 'the most beautiful beach, the most interesting book',
    contrast: "most beautiful beach I've ever seen (wrong)",
    explanation: {
      en: 'The superlative of a long adjective is the most + adjective — the cannot be left out.',
      ru: 'Превосходная степень длинного прилагательного — the most + прилагательное; the не опускается.',
      uk: 'Найвищий ступінь довгого прикметника — the most + прикметник; the не пропускають.',
      de: 'Der Superlativ eines langen Adjektivs ist the most + Adjektiv; das the fällt nicht weg.',
    },
    practice: choice("This is ___ most beautiful beach I've ever seen.", ['more', '—', 'the'], 2),
  },
  {
    slug: 'not_as_as',
    level: 'A2',
    pattern: 'not as + adjective + as',
    example: "My car isn't as fast as yours.",
    explanation: {
      en: 'not as … as says that one thing is less than another: not as fast as = slower than.',
      ru: 'not as … as означает, что одно уступает другому: not as fast as = медленнее, чем.',
      uk: 'not as … as означає, що одне поступається іншому: not as fast as = повільніше, ніж.',
      de: 'not as … as heißt, dass etwas weniger ist als etwas anderes: not as fast as = langsamer als.',
    },
    practice: choice("My car isn't ___ fast as yours.", ['than', 'as', 'more', 'such'], 1),
  },
  {
    slug: 'much_far_comparative',
    level: 'B1',
    pattern: 'much / far / a lot + comparative',
    example: 'much bigger, far more expensive, a lot cheaper',
    contrast: 'very bigger (wrong)',
    explanation: {
      en: 'To make a comparative stronger, use much, far or a lot — not very.',
      ru: 'Чтобы усилить сравнительную степень, используйте much, far или a lot, а не very.',
      uk: 'Щоб посилити вищий ступінь, використовуйте much, far або a lot, а не very.',
      de: 'Um einen Komparativ zu verstärken, nimm much, far oder a lot, nicht very.',
    },
    practice: choice(
      'Your new flat is ___ bigger than the old one.',
      ['very', 'more', 'most', 'much'],
      3,
    ),
  },
  {
    slug: 'less_than',
    level: 'B1',
    pattern: 'less + adjective + than',
    example: 'This phone is less expensive than that one.',
    contrast: 'fewer expensive (wrong)',
    explanation: {
      en: 'less + adjective + than is the opposite of more … than; fewer is only for countable nouns.',
      ru: 'less + прилагательное + than — противоположность more … than; fewer — только с исчисляемыми существительными.',
      uk: 'less + прикметник + than — протилежність more … than; fewer — лише з обчислюваними іменниками.',
      de: 'less + Adjektiv + than ist das Gegenteil von more … than; fewer steht nur bei zählbaren Nomen.',
    },
    practice: choice(
      'This phone is ___ expensive than the old model, so I bought it.',
      ['less', 'fewer', 'least', 'littler'],
      0,
    ),
  },
]);
