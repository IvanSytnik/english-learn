import 'server-only';

import { prisma } from '@englishlearn/db';
import { getAttemptEvents } from '@englishlearn/db/queries/learner-activity';
import { computeWeekRhythm, type WeekRhythm, weekQueryWindow } from '@englishlearn/learner-model';

/**
 * This ISO week's sessions for the learner, with day boundaries in the
 * client's time zone (validated in computeWeekRhythm; invalid → UTC).
 */
export async function loadWeekRhythm(args: {
  userId: string;
  timeZone: unknown;
  nowMs?: number;
}): Promise<WeekRhythm> {
  const nowMs = args.nowMs ?? Date.now();
  const events = await getAttemptEvents(prisma, { userId: args.userId, ...weekQueryWindow(nowMs) });
  return computeWeekRhythm({ events, timeZone: args.timeZone, nowMs });
}
