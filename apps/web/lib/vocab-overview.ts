import 'server-only';
import { type CefrLevelValue, type Locale, localized } from '@englishlearn/db/schemas';
import {
  getVocabTopic,
  parseVocabConceptId,
  VOCAB_TOPICS,
  type VocabTopicId,
} from '@englishlearn/db/vocab/topics';
import type { StageCounts, VocabConceptProgress } from '@englishlearn/learner-model';
import { vocabSessionService } from '@/lib/learner';

/**
 * The `/words` dashboard (B2.6): today's allowance, what is due, and how far
 * each topic is — word counts per semantic stage only, never an FSRS number
 * (Axiom 4). One overview read (the session's own: cached catalogue, the
 * learner's review rows, today's new words, the profile); topics and their
 * titles are static. Titles follow the interface locale, like concept titles.
 */

export type VocabLevelProgress = {
  /** Starts a topic session at this level (`nextVocabCardAction({ conceptId })`). */
  conceptId: string;
  level: CefrLevelValue;
  total: number;
  started: number;
  stages: StageCounts;
};

export type VocabTopicProgress = {
  topicId: VocabTopicId;
  title: string;
  total: number;
  started: number;
  stages: StageCounts;
  /** Lowest level first. */
  levels: VocabLevelProgress[];
};

export type VocabOverviewView = {
  dueNow: number;
  newToday: number;
  dailyLimit: number;
  remainingNew: number;
  totalWords: number;
  startedWords: number;
  stages: StageCounts;
  /** In the taxonomy's order; topics without published words are left out. */
  topics: VocabTopicProgress[];
};

const addStages = (into: StageCounts, from: StageCounts) => {
  for (const key of Object.keys(into) as (keyof StageCounts)[]) into[key] += from[key];
};

export function groupByTopic(
  concepts: readonly VocabConceptProgress[],
  uiLocale: Locale,
): VocabTopicProgress[] {
  const byTopic = new Map<VocabTopicId, VocabTopicProgress>();
  for (const concept of concepts) {
    const parsed = parseVocabConceptId(concept.conceptId);
    if (!parsed) continue;
    let topic = byTopic.get(parsed.topic);
    if (!topic) {
      topic = {
        topicId: parsed.topic,
        title: localized(getVocabTopic(parsed.topic).title, uiLocale),
        total: 0,
        started: 0,
        stages: { new: 0, learning: 0, familiar: 0, known: 0, mastered: 0 },
        levels: [],
      };
      byTopic.set(parsed.topic, topic);
    }
    topic.total += concept.total;
    topic.started += concept.started;
    addStages(topic.stages, concept.stages);
    topic.levels.push({
      conceptId: concept.conceptId,
      level: parsed.level,
      total: concept.total,
      started: concept.started,
      stages: { ...concept.stages },
    });
  }
  for (const topic of byTopic.values()) {
    topic.levels.sort((a, b) => (a.level < b.level ? -1 : a.level > b.level ? 1 : 0));
  }
  return VOCAB_TOPICS.flatMap((t) => byTopic.get(t.id) ?? []);
}

export async function loadVocabOverview(args: {
  userId: string;
  uiLocale: Locale;
  timeZone: unknown;
}): Promise<VocabOverviewView> {
  const overview = await vocabSessionService.overview({
    userId: args.userId,
    timeZone: args.timeZone,
  });
  const topics = groupByTopic(overview.concepts, args.uiLocale);
  // Totals from the topics, so they always add up to what is listed.
  const stages: StageCounts = { new: 0, learning: 0, familiar: 0, known: 0, mastered: 0 };
  for (const t of topics) addStages(stages, t.stages);
  return {
    dueNow: overview.dueNow,
    newToday: overview.newToday,
    dailyLimit: overview.dailyLimit,
    remainingNew: overview.remainingNew,
    totalWords: topics.reduce((n, t) => n + t.total, 0),
    startedWords: topics.reduce((n, t) => n + t.started, 0),
    stages,
    topics,
  };
}
