/**
 * Grammar theory per seed GRAMMAR concept (B3.2), keyed by concept id.
 *
 * Authoring rules (DECISIONS 2026-10-27, same as the item bank):
 *   - grammar terms and quoted English forms stay English in every locale
 *     (capitalised in German prose); ru/uk address the learner as «вы»/«ви»,
 *     de as du; quotes «…» in ru/uk, „…“ in de, ’ in Ukrainian words;
 *   - examples are new sentences: never a practice prompt, an item example or
 *     a diagnostic stem — the theory teaches the rule, not the answer;
 *   - `focus` lists the exact substrings of the example that carry the rule.
 *
 * Written by the assistant; needs the same native/methodologist review as the
 * item bank (HANDOFF §8 #12). Enforced by src/__tests__/seed-theory.test.ts.
 */

import type { ConceptTheory } from './theory';

export const GRAMMAR_THEORY: Readonly<Record<string, ConceptTheory>> = {
  'grammar.articles_basic': {
    formula: 'a / an + singular noun · the + known noun · no article + plural / uncountable',
    summary: {
      en: 'Use a/an the first time you mention one countable thing, and the when the listener already knows which one you mean. A or an depends on the first sound, not the letter: an hour, a university. Plurals and uncountable nouns in a general sense take no article: Cats like milk.',
      ru: 'Используйте a/an, когда впервые упоминаете один исчисляемый предмет, и the, когда собеседник уже знает, о каком именно идёт речь. Выбор между a и an зависит от первого звука, а не буквы: an hour, a university. Множественное число и неисчисляемые существительные в общем значении употребляются без артикля: Cats like milk.',
      uk: 'Вживайте a/an, коли вперше згадуєте один злічуваний предмет, і the, коли співрозмовник уже знає, про який саме йдеться. Вибір між a та an залежить від першого звука, а не літери: an hour, a university. Множина та незлічувані іменники в загальному значенні вживаються без артикля: Cats like milk.',
      de: 'Nimm a/an, wenn du ein zählbares Ding zum ersten Mal erwähnst, und the, wenn dein Gegenüber schon weiß, welches gemeint ist. Ob a oder an, hängt vom ersten Laut ab, nicht vom Buchstaben: an hour, a university. Pluralformen und unzählbare Nomen im allgemeinen Sinn stehen ohne Artikel: Cats like milk.',
    },
    examples: [
      {
        en: 'We found a kitten in the garden. The kitten was hungry.',
        focus: ['a kitten', 'The kitten'],
        translation: {
          ru: 'Мы нашли в саду котёнка. Котёнок был голодный.',
          uk: 'Ми знайшли в саду кошеня. Кошеня було голодне.',
          de: 'Wir haben im Garten ein Kätzchen gefunden. Das Kätzchen hatte Hunger.',
        },
      },
      {
        en: 'She is an engineer, and he works at a university.',
        focus: ['an engineer', 'a university'],
        translation: {
          ru: 'Она инженер, а он работает в университете.',
          uk: 'Вона інженерка, а він працює в університеті.',
          de: 'Sie ist Ingenieurin, und er arbeitet an einer Universität.',
        },
      },
      {
        en: 'Bees make honey.',
        focus: ['Bees', 'honey'],
        translation: {
          ru: 'Пчёлы делают мёд.',
          uk: 'Бджоли роблять мед.',
          de: 'Bienen machen Honig.',
        },
      },
    ],
  },

  'grammar.plurals': {
    formula: 'noun + -s / -es / -ies · irregular: man → men, child → children',
    summary: {
      en: 'Most nouns add -s; after -s, -sh, -ch, -x and often after -o they add -es (buses, dishes, tomatoes), and a consonant + y becomes -ies (city → cities). A few common nouns change completely: man → men, tooth → teeth, mouse → mice. Uncountable nouns such as information, advice and furniture have no plural.',
      ru: 'Большинство существительных получают -s; после -s, -sh, -ch, -x и часто после -o добавляется -es (buses, dishes, tomatoes), а согласная + y превращается в -ies (city → cities). Несколько частых слов меняются целиком: man → men, tooth → teeth, mouse → mice. У неисчисляемых существительных — information, advice, furniture — множественного числа нет.',
      uk: 'Більшість іменників отримують -s; після -s, -sh, -ch, -x і часто після -o додається -es (buses, dishes, tomatoes), а приголосна + y перетворюється на -ies (city → cities). Кілька частих слів змінюються повністю: man → men, tooth → teeth, mouse → mice. Незлічувані іменники — information, advice, furniture — форми множини не мають.',
      de: 'Die meisten Nomen bekommen -s; nach -s, -sh, -ch, -x und oft nach -o kommt -es dazu (buses, dishes, tomatoes), und Konsonant + y wird zu -ies (city → cities). Einige häufige Nomen ändern sich ganz: man → men, tooth → teeth, mouse → mice. Unzählbare Nomen wie information, advice und furniture haben keinen Plural.',
    },
    examples: [
      {
        en: 'Two ladies were waiting at the tram stop.',
        focus: ['ladies'],
        translation: {
          ru: 'Две женщины ждали на трамвайной остановке.',
          uk: 'Дві жінки чекали на трамвайній зупинці.',
          de: 'Zwei Damen warteten an der Straßenbahnhaltestelle.',
        },
      },
      {
        en: 'My little brother has lost two teeth this month.',
        focus: ['teeth'],
        translation: {
          ru: 'У моего младшего брата в этом месяце выпали два зуба.',
          uk: 'У мого молодшого брата цього місяця випали два зуби.',
          de: 'Mein kleiner Bruder hat diesen Monat zwei Zähne verloren.',
        },
      },
      {
        en: 'Can you give me some advice about flats in this area?',
        focus: ['some advice', 'flats'],
        translation: {
          ru: 'Можете дать мне совет насчёт квартир в этом районе?',
          uk: 'Можете дати мені пораду щодо квартир у цьому районі?',
          de: 'Kannst du mir einen Rat zu Wohnungen in dieser Gegend geben?',
        },
      },
    ],
  },

  'grammar.comparatives': {
    formula: 'adj-er / more + adj + than · the adj-est / the most + adj · as + adj + as',
    summary: {
      en: 'Short adjectives add -er and -est (cheap → cheaper → the cheapest); longer ones use more and the most (more useful, the most useful). Some forms are irregular: good → better → best, bad → worse → worst. Compare two things with than and show equality with as … as — never more and -er together (not more cheaper).',
      ru: 'Короткие прилагательные получают -er и -est (cheap → cheaper → the cheapest), длинные — more и the most (more useful, the most useful). Есть неправильные формы: good → better → best, bad → worse → worst. Два предмета сравнивают с помощью than, равенство выражают через as … as; more и -er вместе не используются (не more cheaper).',
      uk: 'Короткі прикметники отримують -er та -est (cheap → cheaper → the cheapest), довгі — more та the most (more useful, the most useful). Є неправильні форми: good → better → best, bad → worse → worst. Два предмети порівнюють за допомогою than, рівність виражають через as … as; more та -er разом не вживаються (не more cheaper).',
      de: 'Kurze Adjektive bekommen -er und -est (cheap → cheaper → the cheapest), längere stehen mit more und the most (more useful, the most useful). Manche Formen sind unregelmäßig: good → better → best, bad → worse → worst. Zwei Dinge vergleichst du mit than, Gleichheit drückst du mit as … as aus — more und -er nie zusammen (nicht more cheaper).',
    },
    examples: [
      {
        en: 'This backpack is lighter than my old one.',
        focus: ['lighter than'],
        translation: {
          ru: 'Этот рюкзак легче, чем мой старый.',
          uk: 'Цей рюкзак легший, ніж мій старий.',
          de: 'Dieser Rucksack ist leichter als mein alter.',
        },
      },
      {
        en: 'It was the most boring film of the festival.',
        focus: ['the most boring'],
        translation: {
          ru: 'Это был самый скучный фильм фестиваля.',
          uk: 'Це був найнудніший фільм фестивалю.',
          de: 'Das war der langweiligste Film des Festivals.',
        },
      },
      {
        en: "My cousin isn't as tall as his sister.",
        focus: ['as tall as'],
        translation: {
          ru: 'Мой двоюродный брат не такой высокий, как его сестра.',
          uk: 'Мій двоюрідний брат не такий високий, як його сестра.',
          de: 'Mein Cousin ist nicht so groß wie seine Schwester.',
        },
      },
    ],
  },

  'grammar.prepositions_time_place': {
    formula: 'at + exact point · on + day, date, surface · in + longer period, inside',
    summary: {
      en: "Think from small to big. At is for an exact point: at 7 o'clock, at the bus stop. On is for days, dates and surfaces: on Monday, on 3 May, on the wall. In is for longer periods and for being inside: in July, in 2019, in the kitchen. Fixed phrases break the pattern: at night, at the weekend, on the bus.",
      ru: "Двигайтесь от малого к большому. At — точный момент или точка: at 7 o'clock, at the bus stop. On — дни, даты и поверхности: on Monday, on 3 May, on the wall. In — более долгие периоды и нахождение внутри: in July, in 2019, in the kitchen. Устойчивые выражения выбиваются из схемы: at night, at the weekend, on the bus.",
      uk: "Рухайтеся від меншого до більшого. At — точний момент або точка: at 7 o'clock, at the bus stop. On — дні, дати й поверхні: on Monday, on 3 May, on the wall. In — довші періоди та перебування всередині: in July, in 2019, in the kitchen. Сталі вирази виходять за межі схеми: at night, at the weekend, on the bus.",
      de: "Denk vom Kleinen zum Großen. At steht für einen genauen Zeitpunkt oder Ort: at 7 o'clock, at the bus stop. On steht für Tage, Daten und Oberflächen: on Monday, on 3 May, on the wall. In steht für längere Zeiträume und für „drinnen“: in July, in 2019, in the kitchen. Feste Wendungen folgen dem Muster nicht: at night, at the weekend, on the bus.",
    },
    examples: [
      {
        en: 'The concert starts at half past eight on Friday.',
        focus: ['at half past eight', 'on Friday'],
        translation: {
          ru: 'Концерт начинается в пятницу в половине девятого.',
          uk: 'Концерт починається в п’ятницю о пів на дев’яту.',
          de: 'Das Konzert beginnt am Freitag um halb neun.',
        },
      },
      {
        en: 'There is a spider on the ceiling in the bathroom.',
        focus: ['on the ceiling', 'in the bathroom'],
        translation: {
          ru: 'В ванной на потолке сидит паук.',
          uk: 'У ванній на стелі сидить павук.',
          de: 'Im Badezimmer sitzt eine Spinne an der Decke.',
        },
      },
      {
        en: 'My grandparents met in 1974.',
        focus: ['in 1974'],
        translation: {
          ru: 'Мои бабушка и дедушка познакомились в 1974 году.',
          uk: 'Мої бабуся й дідусь познайомилися 1974 року.',
          de: 'Meine Großeltern haben sich 1974 kennengelernt.',
        },
      },
    ],
  },

  'grammar.question_formation': {
    formula: '(wh-word) + auxiliary + subject + verb?',
    summary: {
      en: 'In a question the auxiliary comes before the subject: She is tired → Is she tired? If the statement has no auxiliary, add do, does or did, and the main verb goes back to its base form: Where does he work? (not Where he works?). When who or what is itself the subject, there is no do: Who called you?',
      ru: 'В вопросе вспомогательный глагол стоит перед подлежащим: She is tired → Is she tired? Если в утверждении вспомогательного глагола нет, добавьте do, does или did, а смысловой глагол вернётся в начальную форму: Where does he work? (а не Where he works?). Когда who или what само является подлежащим, do не нужен: Who called you?',
      uk: 'У запитанні допоміжне дієслово стоїть перед підметом: She is tired → Is she tired? Якщо у ствердженні допоміжного дієслова немає, додайте do, does або did, а основне дієслово повернеться до початкової форми: Where does he work? (а не Where he works?). Коли who або what саме є підметом, do не потрібне: Who called you?',
      de: 'In einer Frage steht das Hilfsverb vor dem Subjekt: She is tired → Is she tired? Hat der Aussagesatz kein Hilfsverb, ergänzt du do, does oder did, und das Hauptverb steht wieder in der Grundform: Where does he work? (nicht Where he works?). Ist who oder what selbst das Subjekt, gibt es kein do: Who called you?',
    },
    examples: [
      {
        en: 'Did your parents enjoy the trip?',
        focus: ['Did', 'enjoy'],
        translation: {
          ru: 'Вашим родителям понравилась поездка?',
          uk: 'Вашим батькам сподобалася поїздка?',
          de: 'Hat deinen Eltern die Reise gefallen?',
        },
      },
      {
        en: 'How often does the ferry leave?',
        focus: ['does', 'leave'],
        translation: {
          ru: 'Как часто отходит паром?',
          uk: 'Як часто відходить пором?',
          de: 'Wie oft fährt die Fähre?',
        },
      },
      {
        en: 'Who broke the printer?',
        focus: ['Who broke'],
        translation: {
          ru: 'Кто сломал принтер?',
          uk: 'Хто зламав принтер?',
          de: 'Wer hat den Drucker kaputt gemacht?',
        },
      },
    ],
  },

  'grammar.present_simple': {
    formula: 'I / you / we / they + V1 · he / she / it + V1-s · do / does + not + V1',
    summary: {
      en: "Use the Present Simple for habits, facts and timetables: I cycle to work, Water boils at 100 °C, The film starts at nine. With he, she and it the verb takes -s or -es (she watches, it goes). In negatives and questions does carries the -s, so the main verb stays bare: She doesn't like tea, Does he drive?",
      ru: "Present Simple нужен для привычек, фактов и расписаний: I cycle to work, Water boils at 100 °C, The film starts at nine. С he, she и it глагол получает -s или -es (she watches, it goes). В отрицаниях и вопросах -s забирает does, поэтому смысловой глагол остаётся без окончания: She doesn't like tea, Does he drive?",
      uk: "Present Simple потрібен для звичок, фактів і розкладів: I cycle to work, Water boils at 100 °C, The film starts at nine. З he, she та it дієслово отримує -s або -es (she watches, it goes). У запереченнях і запитаннях -s забирає does, тому основне дієслово лишається без закінчення: She doesn't like tea, Does he drive?",
      de: "Das Present Simple brauchst du für Gewohnheiten, Fakten und Fahrpläne: I cycle to work, Water boils at 100 °C, The film starts at nine. Bei he, she und it bekommt das Verb -s oder -es (she watches, it goes). In Verneinungen und Fragen trägt does das -s, deshalb bleibt das Hauptverb ohne Endung: She doesn't like tea, Does he drive?",
    },
    examples: [
      {
        en: 'My neighbour feeds the birds every morning.',
        focus: ['feeds'],
        translation: {
          ru: 'Мой сосед каждое утро кормит птиц.',
          uk: 'Мій сусід щоранку годує птахів.',
          de: 'Mein Nachbar füttert jeden Morgen die Vögel.',
        },
      },
      {
        en: "The museum doesn't open on Mondays.",
        focus: ["doesn't open"],
        translation: {
          ru: 'По понедельникам музей не работает.',
          uk: 'По понеділках музей не працює.',
          de: 'Das Museum öffnet montags nicht.',
        },
      },
      {
        en: 'Does your sister speak Italian?',
        focus: ['Does', 'speak'],
        translation: {
          ru: 'Ваша сестра говорит по-итальянски?',
          uk: 'Ваша сестра розмовляє італійською?',
          de: 'Spricht deine Schwester Italienisch?',
        },
      },
    ],
  },

  'grammar.present_continuous': {
    formula: 'am / is / are + V-ing',
    summary: {
      en: "Use the Present Continuous for what is happening now or around now, for temporary situations and for fixed future plans: I'm cooking, She's staying with friends this week, We're flying to Rome on Sunday. Don't forget am, is or are before the -ing form. State verbs such as know, want, like and belong are not normally continuous: I know (not I'm knowing).",
      ru: "Present Continuous описывает то, что происходит прямо сейчас или в этот период, временные ситуации и договорённости на будущее: I'm cooking, She's staying with friends this week, We're flying to Rome on Sunday. Не забывайте am, is или are перед формой на -ing. Глаголы состояния — know, want, like, belong — обычно в длительной форме не используются: I know (а не I'm knowing).",
      uk: "Present Continuous описує те, що відбувається просто зараз або в цей період, тимчасові ситуації та домовленості на майбутнє: I'm cooking, She's staying with friends this week, We're flying to Rome on Sunday. Не забувайте am, is або are перед формою на -ing. Дієслова стану — know, want, like, belong — зазвичай у тривалій формі не вживаються: I know (а не I'm knowing).",
      de: "Das Present Continuous beschreibt, was gerade jetzt oder in dieser Zeit passiert, vorübergehende Situationen und feste Pläne: I'm cooking, She's staying with friends this week, We're flying to Rome on Sunday. Vergiss am, is oder are vor der -ing-Form nicht. Zustandsverben wie know, want, like und belong stehen normalerweise nicht in der Verlaufsform: I know (nicht I'm knowing).",
    },
    examples: [
      {
        en: 'Be quiet — the baby is sleeping.',
        focus: ['is sleeping'],
        translation: {
          ru: 'Тише, ребёнок спит.',
          uk: 'Тихіше, дитина спить.',
          de: 'Sei leise, das Baby schläft.',
        },
      },
      {
        en: "I'm working from home this month.",
        focus: ["I'm working"],
        translation: {
          ru: 'В этом месяце я работаю из дома.',
          uk: 'Цього місяця я працюю з дому.',
          de: 'Diesen Monat arbeite ich von zu Hause.',
        },
      },
      {
        en: 'They are getting married in June.',
        focus: ['are getting married'],
        translation: {
          ru: 'Они женятся в июне.',
          uk: 'Вони одружуються в червні.',
          de: 'Sie heiraten im Juni.',
        },
      },
    ],
  },

  'grammar.past_simple': {
    formula: 'V2 · did + not + V1 · did + subject + V1?',
    summary: {
      en: "Use the Past Simple for finished actions at a finished time: yesterday, last year, in 2015, two days ago. Regular verbs add -ed (walk → walked); irregular ones have their own form (go → went, buy → bought). In negatives and questions did already shows the past, so the main verb stays in the base form: We didn't go, Did you see it?",
      ru: "Past Simple — для завершённых действий в завершённом периоде: yesterday, last year, in 2015, two days ago. Правильные глаголы получают -ed (walk → walked), у неправильных своя форма (go → went, buy → bought). В отрицаниях и вопросах прошедшее время уже показывает did, поэтому смысловой глагол стоит в начальной форме: We didn't go, Did you see it?",
      uk: "Past Simple — для завершених дій у завершений період: yesterday, last year, in 2015, two days ago. Правильні дієслова отримують -ed (walk → walked), у неправильних своя форма (go → went, buy → bought). У запереченнях і запитаннях минулий час уже показує did, тому основне дієслово стоїть у початковій формі: We didn't go, Did you see it?",
      de: "Das Past Simple steht für abgeschlossene Handlungen in einem abgeschlossenen Zeitraum: yesterday, last year, in 2015, two days ago. Regelmäßige Verben bekommen -ed (walk → walked), unregelmäßige haben eine eigene Form (go → went, buy → bought). In Verneinungen und Fragen zeigt did schon die Vergangenheit, deshalb steht das Hauptverb in der Grundform: We didn't go, Did you see it?",
    },
    examples: [
      {
        en: 'We missed the last train, so we took a taxi.',
        focus: ['missed', 'took'],
        translation: {
          ru: 'Мы опоздали на последний поезд, поэтому взяли такси.',
          uk: 'Ми спізнилися на останній потяг, тому взяли таксі.',
          de: 'Wir haben den letzten Zug verpasst, also haben wir ein Taxi genommen.',
        },
      },
      {
        en: "She didn't call me last night.",
        focus: ["didn't call"],
        translation: {
          ru: 'Вчера вечером она мне не позвонила.',
          uk: 'Учора ввечері вона мені не зателефонувала.',
          de: 'Sie hat mich gestern Abend nicht angerufen.',
        },
      },
      {
        en: 'What time did you get home yesterday?',
        focus: ['did', 'get'],
        translation: {
          ru: 'Во сколько вы вчера вернулись домой?',
          uk: 'О котрій ви вчора повернулися додому?',
          de: 'Wann bist du gestern nach Hause gekommen?',
        },
      },
    ],
  },

  'grammar.past_participle': {
    formula: 'have / has + V3 · be + V3',
    summary: {
      en: 'The past participle (V3) is the third form of the verb. For regular verbs it looks like the Past Simple (open → opened → opened); irregular verbs are learned in sets of three (take → took → taken, see → saw → seen). V3 follows have/has in the Present Perfect and be in the passive — never V2 there (not I have went).',
      ru: 'Причастие прошедшего времени (V3) — третья форма глагола. У правильных глаголов она совпадает с Past Simple (open → opened → opened); неправильные глаголы учат тройками (take → took → taken, see → saw → seen). V3 нужна после have/has в Present Perfect и после be в пассиве — V2 там не ставится (не I have went).',
      uk: 'Дієприкметник минулого часу (V3) — третя форма дієслова. У правильних дієслів вона збігається з Past Simple (open → opened → opened); неправильні дієслова вчать трійками (take → took → taken, see → saw → seen). V3 потрібна після have/has у Present Perfect і після be в пасиві — V2 там не вживається (не I have went).',
      de: 'Das Partizip II (V3) ist die dritte Verbform. Bei regelmäßigen Verben sieht es aus wie das Past Simple (open → opened → opened); unregelmäßige Verben lernst du in Dreiergruppen (take → took → taken, see → saw → seen). V3 steht nach have/has im Present Perfect und nach be im Passiv — dort nie V2 (nicht I have went).',
    },
    examples: [
      {
        en: 'Have you ever ridden a camel?',
        focus: ['ridden'],
        translation: {
          ru: 'Вы когда-нибудь катались на верблюде?',
          uk: 'Ви коли-небудь каталися на верблюді?',
          de: 'Bist du schon mal auf einem Kamel geritten?',
        },
      },
      {
        en: 'These shoes are made in Portugal.',
        focus: ['made'],
        translation: {
          ru: 'Эти туфли сделаны в Португалии.',
          uk: 'Ці туфлі зроблені в Португалії.',
          de: 'Diese Schuhe werden in Portugal hergestellt.',
        },
      },
      {
        en: "I've already eaten, thanks.",
        focus: ['eaten'],
        translation: {
          ru: 'Я уже поел, спасибо.',
          uk: 'Я вже поїв, дякую.',
          de: 'Ich habe schon gegessen, danke.',
        },
      },
    ],
  },

  'grammar.present_perfect_basic': {
    formula: 'have / has + V3 (ever, never, just · for, since)',
    summary: {
      en: "The Present Perfect links the past to now: an experience (Have you ever been to Japan?), a fresh result (I've just finished) or a state that began in the past and continues (She has lived here for ten years / since 2016). Use for with a period and since with a starting point. Once you name a finished time such as yesterday or in 2020, switch to the Past Simple.",
      ru: "Present Perfect связывает прошлое с настоящим: жизненный опыт (Have you ever been to Japan?), свежий результат (I've just finished) или состояние, которое началось в прошлом и продолжается (She has lived here for ten years / since 2016). С отрезком времени — for, с точкой начала — since. Если называете завершённое время, например yesterday или in 2020, переходите на Past Simple.",
      uk: "Present Perfect пов’язує минуле з теперішнім: життєвий досвід (Have you ever been to Japan?), свіжий результат (I've just finished) або стан, що почався в минулому й триває (She has lived here for ten years / since 2016). З відрізком часу — for, з точкою початку — since. Якщо називаєте завершений час, наприклад yesterday чи in 2020, переходьте на Past Simple.",
      de: "Das Present Perfect verbindet die Vergangenheit mit dem Jetzt: eine Erfahrung (Have you ever been to Japan?), ein frisches Ergebnis (I've just finished) oder ein Zustand, der früher begann und noch andauert (She has lived here for ten years / since 2016). Mit einer Zeitspanne steht for, mit einem Startpunkt since. Nennst du eine abgeschlossene Zeit wie yesterday oder in 2020, wechselst du ins Past Simple.",
    },
    examples: [
      {
        en: "I've never tried Korean food.",
        focus: ["'ve never tried"],
        translation: {
          ru: 'Я никогда не пробовал корейскую еду.',
          uk: 'Я ніколи не куштував корейської їжі.',
          de: 'Ich habe noch nie koreanisches Essen probiert.',
        },
      },
      {
        en: 'They have known each other since school.',
        focus: ['have known', 'since'],
        translation: {
          ru: 'Они знают друг друга со школы.',
          uk: 'Вони знають одне одного зі школи.',
          de: 'Sie kennen sich seit der Schulzeit.',
        },
      },
      {
        en: 'Oh no, someone has taken my umbrella!',
        focus: ['has taken'],
        translation: {
          ru: 'О нет, кто-то взял мой зонт!',
          uk: 'О ні, хтось узяв мою парасольку!',
          de: 'Oh nein, jemand hat meinen Regenschirm genommen!',
        },
      },
    ],
  },

  'grammar.modal_verbs_basic': {
    formula: 'can / could / should / must + V1',
    summary: {
      en: "A modal verb is followed by the base form, with no to and no -s: She can swim (not She cans swim or She can to swim). Can is ability now, could is ability in the past or a polite request, should is advice, and must is a strong obligation or a firm opinion. Questions and negatives need no do: Can you help? You mustn't park here.",
      ru: "После модального глагола идёт начальная форма без to и без -s: She can swim (а не She cans swim или She can to swim). Can — умение сейчас, could — умение в прошлом или вежливая просьба, should — совет, must — строгая обязанность или твёрдое мнение. В вопросах и отрицаниях do не нужен: Can you help? You mustn't park here.",
      uk: "Після модального дієслова йде початкова форма без to і без -s: She can swim (а не She cans swim чи She can to swim). Can — уміння зараз, could — уміння в минулому або ввічливе прохання, should — порада, must — суворий обов’язок або тверда думка. У запитаннях і запереченнях do не потрібне: Can you help? You mustn't park here.",
      de: "Nach einem Modalverb steht die Grundform ohne to und ohne -s: She can swim (nicht She cans swim oder She can to swim). Can ist eine Fähigkeit jetzt, could eine Fähigkeit früher oder eine höfliche Bitte, should ein Rat und must eine starke Pflicht oder feste Meinung. Fragen und Verneinungen brauchen kein do: Can you help? You mustn't park here.",
    },
    examples: [
      {
        en: 'When I was six, I could already read.',
        focus: ['could', 'read'],
        translation: {
          ru: 'В шесть лет я уже умел читать.',
          uk: 'У шість років я вже вмів читати.',
          de: 'Mit sechs konnte ich schon lesen.',
        },
      },
      {
        en: 'You should drink more water.',
        focus: ['should drink'],
        translation: {
          ru: 'Вам стоит пить больше воды.',
          uk: 'Вам варто пити більше води.',
          de: 'Du solltest mehr Wasser trinken.',
        },
      },
      {
        en: 'Visitors must wear a helmet on the building site.',
        focus: ['must wear'],
        translation: {
          ru: 'На стройплощадке посетители обязаны носить каску.',
          uk: 'На будівельному майданчику відвідувачі мусять носити каску.',
          de: 'Besucher müssen auf der Baustelle einen Helm tragen.',
        },
      },
    ],
  },

  'grammar.conditional_0_1': {
    formula: 'if + Present Simple, Present Simple · if + Present Simple, will + V1',
    summary: {
      en: "The Zero Conditional states something that is always true: If you heat ice, it melts. The First Conditional describes a real possibility in the future and its likely result: If it rains, we'll stay in. In both, the if-clause takes the Present Simple even when it talks about the future — never will after if (not If it will rain).",
      ru: "Zero Conditional говорит о том, что верно всегда: If you heat ice, it melts. First Conditional описывает реальную возможность в будущем и её вероятный результат: If it rains, we'll stay in. В обоих типах в части с if стоит Present Simple, даже если речь о будущем, — will после if не ставится (не If it will rain).",
      uk: "Zero Conditional говорить про те, що правдиве завжди: If you heat ice, it melts. First Conditional описує реальну можливість у майбутньому та її ймовірний результат: If it rains, we'll stay in. В обох типах у частині з if стоїть Present Simple, навіть якщо йдеться про майбутнє, — will після if не вживається (не If it will rain).",
      de: "Das Zero Conditional beschreibt etwas, das immer gilt: If you heat ice, it melts. Das First Conditional beschreibt eine reale Möglichkeit in der Zukunft und ihre wahrscheinliche Folge: If it rains, we'll stay in. In beiden Typen steht im if-Satz das Present Simple, auch wenn es um die Zukunft geht — nach if nie will (nicht If it will rain).",
    },
    examples: [
      {
        en: 'If you mix blue and yellow, you get green.',
        focus: ['mix', 'get'],
        translation: {
          ru: 'Если смешать синий и жёлтый, получится зелёный.',
          uk: 'Якщо змішати синій і жовтий, вийде зелений.',
          de: 'Wenn du Blau und Gelb mischst, bekommst du Grün.',
        },
      },
      {
        en: "If the bus is late, I'll text you.",
        focus: ['is late', "I'll text"],
        translation: {
          ru: 'Если автобус опоздает, я вам напишу.',
          uk: 'Якщо автобус запізниться, я вам напишу.',
          de: 'Wenn der Bus Verspätung hat, schreibe ich dir.',
        },
      },
      {
        en: 'What will you do if they cancel the flight?',
        focus: ['will you do', 'cancel'],
        translation: {
          ru: 'Что вы будете делать, если рейс отменят?',
          uk: 'Що ви робитимете, якщо рейс скасують?',
          de: 'Was machst du, wenn sie den Flug streichen?',
        },
      },
    ],
  },

  'grammar.conditional_2': {
    formula: 'if + Past Simple, would + V1',
    summary: {
      en: 'The Second Conditional imagines a situation that is unreal now or unlikely in the future: If I had more time, I would learn the guitar. The if-clause takes the Past Simple, but it is not about the past. Would goes only in the result clause, never after if, and be can take were for every person: If I were you, …',
      ru: 'Second Conditional описывает ситуацию, нереальную сейчас или маловероятную в будущем: If I had more time, I would learn the guitar. В части с if стоит Past Simple, но речь не о прошлом. Would ставится только в части с результатом, никогда после if, а у be для всех лиц можно использовать were: If I were you, …',
      uk: 'Second Conditional описує ситуацію, нереальну зараз або малоймовірну в майбутньому: If I had more time, I would learn the guitar. У частині з if стоїть Past Simple, але йдеться не про минуле. Would ставиться лише в частині з результатом, ніколи після if, а з be для всіх осіб можна вживати were: If I were you, …',
      de: 'Das Second Conditional stellt sich eine Situation vor, die jetzt unwirklich oder in Zukunft unwahrscheinlich ist: If I had more time, I would learn the guitar. Im if-Satz steht das Past Simple, aber es geht nicht um die Vergangenheit. Would steht nur im Folgesatz, nie nach if, und bei be kannst du für alle Personen were verwenden: If I were you, …',
    },
    examples: [
      {
        en: 'If we had a garden, we would grow tomatoes.',
        focus: ['had', 'would grow'],
        translation: {
          ru: 'Если бы у нас был сад, мы бы выращивали помидоры.',
          uk: 'Якби в нас був сад, ми б вирощували помідори.',
          de: 'Wenn wir einen Garten hätten, würden wir Tomaten anbauen.',
        },
      },
      {
        en: 'If she were taller, she could reach the top shelf.',
        focus: ['were', 'could reach'],
        translation: {
          ru: 'Будь она повыше, она бы достала до верхней полки.',
          uk: 'Якби вона була вища, то дістала б до верхньої полиці.',
          de: 'Wenn sie größer wäre, könnte sie das oberste Regal erreichen.',
        },
      },
      {
        en: 'What would you do if you lost your passport abroad?',
        focus: ['would you do', 'lost'],
        translation: {
          ru: 'Что бы вы сделали, если бы потеряли паспорт за границей?',
          uk: 'Що б ви зробили, якби загубили паспорт за кордоном?',
          de: 'Was würdest du tun, wenn du im Ausland deinen Pass verlieren würdest?',
        },
      },
    ],
  },

  'grammar.passive_voice': {
    formula: 'be + V3 (+ by + agent)',
    summary: {
      en: 'Use the passive when the action or its result matters more than who does it: The bridge was built in 1890. Only be shows the tense — is/are made, was/were made, will be made, must be made — and the main verb is always V3. Add by + agent only when the doer is important or new: The song was written by a teenager.',
      ru: 'Пассив нужен, когда действие или его результат важнее того, кто его совершает: The bridge was built in 1890. Время показывает только be — is/are made, was/were made, will be made, must be made, — а смысловой глагол всегда стоит в форме V3. By + исполнитель добавляют, только если исполнитель важен или это новая информация: The song was written by a teenager.',
      uk: 'Пасив потрібен, коли дія або її результат важливіші за те, хто її виконує: The bridge was built in 1890. Час показує лише be — is/are made, was/were made, will be made, must be made, — а основне дієслово завжди стоїть у формі V3. By + виконавець додають, лише якщо виконавець важливий або це нова інформація: The song was written by a teenager.',
      de: 'Das Passiv nimmst du, wenn die Handlung oder ihr Ergebnis wichtiger ist als die Person, die handelt: The bridge was built in 1890. Nur be zeigt die Zeit — is/are made, was/were made, will be made, must be made —, das Hauptverb steht immer in V3. By + Handelnde fügst du nur hinzu, wenn sie wichtig oder neu sind: The song was written by a teenager.',
    },
    examples: [
      {
        en: 'Coffee beans are roasted before they are sold.',
        focus: ['are roasted', 'are sold'],
        translation: {
          ru: 'Кофейные зёрна обжаривают перед продажей.',
          uk: 'Кавові зерна обсмажують перед продажем.',
          de: 'Kaffeebohnen werden vor dem Verkauf geröstet.',
        },
      },
      {
        en: 'The thief was caught by a security guard.',
        focus: ['was caught by'],
        translation: {
          ru: 'Вора поймал охранник.',
          uk: 'Злодія спіймав охоронець.',
          de: 'Der Dieb wurde von einem Wachmann gefasst.',
        },
      },
      {
        en: 'All phones must be switched off during the exam.',
        focus: ['must be switched off'],
        translation: {
          ru: 'Во время экзамена все телефоны должны быть выключены.',
          uk: 'Під час іспиту всі телефони мають бути вимкнені.',
          de: 'Während der Prüfung müssen alle Handys ausgeschaltet sein.',
        },
      },
    ],
  },

  'grammar.conditional_3': {
    formula: 'if + Past Perfect, would / could / might have + V3',
    summary: {
      en: "The Third Conditional imagines a different past and a result that can no longer change: If we had left earlier, we wouldn't have missed the start. The if-clause takes the Past Perfect (had + V3), the result clause would, could or might + have + V3. In speech 'd can mean had or would — after if it is always had.",
      ru: "Third Conditional описывает другое прошлое и результат, который уже не изменить: If we had left earlier, we wouldn't have missed the start. В части с if — Past Perfect (had + V3), в части с результатом — would, could или might + have + V3. В речи 'd может означать had или would; после if это всегда had.",
      uk: "Third Conditional описує інше минуле та результат, який уже не змінити: If we had left earlier, we wouldn't have missed the start. У частині з if — Past Perfect (had + V3), у частині з результатом — would, could або might + have + V3. У мовленні 'd може означати had або would; після if це завжди had.",
      de: "Das Third Conditional stellt sich eine andere Vergangenheit vor und eine Folge, die sich nicht mehr ändern lässt: If we had left earlier, we wouldn't have missed the start. Im if-Satz steht das Past Perfect (had + V3), im Folgesatz would, could oder might + have + V3. Gesprochen kann 'd für had oder would stehen — nach if ist es immer had.",
    },
    examples: [
      {
        en: 'If the alarm had gone off, I would have caught the bus.',
        focus: ['had gone off', 'would have caught'],
        translation: {
          ru: 'Если бы будильник зазвонил, я бы успел на автобус.',
          uk: 'Якби будильник задзвонив, я встиг би на автобус.',
          de: 'Wenn der Wecker geklingelt hätte, hätte ich den Bus erwischt.',
        },
      },
      {
        en: "She might have won if she hadn't fallen.",
        focus: ['might have won', "hadn't fallen"],
        translation: {
          ru: 'Она, возможно, победила бы, если бы не упала.',
          uk: 'Вона, можливо, перемогла б, якби не впала.',
          de: 'Sie hätte vielleicht gewonnen, wenn sie nicht gestürzt wäre.',
        },
      },
      {
        en: "If they'd checked the map, they wouldn't have got lost.",
        focus: ["'d checked", "wouldn't have got lost"],
        translation: {
          ru: 'Если бы они посмотрели карту, они бы не заблудились.',
          uk: 'Якби вони подивилися на карту, то не заблукали б.',
          de: 'Hätten sie auf die Karte geschaut, hätten sie sich nicht verlaufen.',
        },
      },
    ],
  },

  'grammar.modals_deduction': {
    formula: "must / might / could / can't + V1 · past: + have + V3",
    summary: {
      en: "These modals turn evidence into a conclusion. Must means you are almost sure something is true, can't that you are almost sure it is not, and might or could that it is possible: She must be at home — the lights are on. For a conclusion about the past add have + V3: He can't have seen us. Here the opposite of must is can't, not mustn't.",
      ru: "Эти модальные глаголы помогают делать выводы из фактов. Must — вы почти уверены, что это правда, can't — почти уверены, что нет, might или could — это возможно: She must be at home — the lights are on. Для вывода о прошлом добавьте have + V3: He can't have seen us. Противоположность must здесь — can't, а не mustn't.",
      uk: "Ці модальні дієслова допомагають робити висновки з фактів. Must — ви майже впевнені, що це правда, can't — майже впевнені, що ні, might або could — це можливо: She must be at home — the lights are on. Для висновку про минуле додайте have + V3: He can't have seen us. Протилежність must тут — can't, а не mustn't.",
      de: "Mit diesen Modalverben ziehst du Schlüsse aus Hinweisen. Must heißt, du bist fast sicher, dass etwas stimmt, can't, dass es nicht stimmt, und might oder could, dass es möglich ist: She must be at home — the lights are on. Für einen Schluss über die Vergangenheit ergänzt du have + V3: He can't have seen us. Das Gegenteil von must ist hier can't, nicht mustn't.",
    },
    examples: [
      {
        en: "You've been travelling all day — you must be exhausted.",
        focus: ['must be'],
        translation: {
          ru: 'Вы весь день в дороге — вы, должно быть, совсем без сил.',
          uk: 'Ви цілий день у дорозі — ви, мабуть, геть виснажені.',
          de: 'Du warst den ganzen Tag unterwegs — du musst völlig erschöpft sein.',
        },
      },
      {
        en: "That can't be Tom's car; his is red.",
        focus: ["can't be"],
        translation: {
          ru: 'Это не может быть машина Тома: у него красная.',
          uk: 'Це не може бути машина Тома: у нього червона.',
          de: 'Das kann nicht Toms Auto sein, seins ist rot.',
        },
      },
      {
        en: 'They might have taken the earlier train.',
        focus: ['might have taken'],
        translation: {
          ru: 'Возможно, они поехали более ранним поездом.',
          uk: 'Можливо, вони поїхали ранішим потягом.',
          de: 'Vielleicht haben sie den früheren Zug genommen.',
        },
      },
    ],
  },
};
