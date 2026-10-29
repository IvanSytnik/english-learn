-- Activation funnel by signup source.
--
-- Read-only analytics: runs inside a READ ONLY transaction, so any accidental
-- write fails instead of landing. Safe to paste into the Neon SQL Editor or
-- run with `psql "$DATABASE_URL" -f packages/db/sql/activation-funnel.sql`.
--
-- Stages are nested — each one counts only users who also passed the previous
-- stage — so every conversion rate is a true step-to-step ratio:
--   1. total_registered        STUDENT accounts (admins/tutors are excluded)
--   2. diagnostic_completed    ... with at least one COMPLETED DiagnosticAttempt
--   3. first_practice_attempt  ... with at least one ITEM_ATTEMPTED LearnerEvent
--   4. weekly_active_learners  ... with practice on >= 3 distinct days inside
--                              some rolling 7-day window (any time, not only
--                              the current week)
--
-- Practice days are UTC calendar days of LearnerEvent."occurredAt" (Unix ms).
-- LEARNER_BOOTSTRAPPED events are not practice and are ignored.
-- One row per signupSource (NULL -> 'direct') plus an 'ALL' total row.

BEGIN READ ONLY;

WITH users AS (
  SELECT u."id" AS user_id,
         COALESCE(u."signupSource", 'direct') AS source
  FROM "User" u
  WHERE u."role" = 'STUDENT'
),

diagnostic AS (
  SELECT DISTINCT a."userId" AS user_id
  FROM "DiagnosticAttempt" a
  WHERE a."status" = 'COMPLETED'
),

practice_days AS (
  SELECT DISTINCT e."userId" AS user_id,
         (to_timestamp(e."occurredAt" / 1000.0) AT TIME ZONE 'UTC')::date AS day
  FROM "LearnerEvent" e
  WHERE e."type" = 'ITEM_ATTEMPTED'
),

practiced AS (
  SELECT DISTINCT user_id FROM practice_days
),

-- A user is weekly-active if, for some practice day d, the window
-- [d, d + 6] holds at least 3 distinct practice days.
weekly_active AS (
  SELECT DISTINCT d1.user_id
  FROM practice_days d1
  JOIN practice_days d2
    ON d2.user_id = d1.user_id
   AND d2.day BETWEEN d1.day AND d1.day + 6
  GROUP BY d1.user_id, d1.day
  HAVING COUNT(*) >= 3
),

stages AS (
  SELECT u.source,
         (dg.user_id IS NOT NULL) AS s2,
         (dg.user_id IS NOT NULL AND p.user_id IS NOT NULL) AS s3,
         (dg.user_id IS NOT NULL AND p.user_id IS NOT NULL AND w.user_id IS NOT NULL) AS s4
  FROM users u
  LEFT JOIN diagnostic    dg ON dg.user_id = u.user_id
  LEFT JOIN practiced     p  ON p.user_id  = u.user_id
  LEFT JOIN weekly_active w  ON w.user_id  = u.user_id
),

funnel AS (
  SELECT CASE WHEN GROUPING(source) = 1 THEN 'ALL' ELSE source END AS signup_source,
         GROUPING(source) AS is_total,
         COUNT(*)                    AS total_registered,
         COUNT(*) FILTER (WHERE s2) AS diagnostic_completed,
         COUNT(*) FILTER (WHERE s3) AS first_practice_attempt,
         COUNT(*) FILTER (WHERE s4) AS weekly_active_learners
  FROM stages
  GROUP BY GROUPING SETS ((source), ())
)

SELECT signup_source,
       total_registered,
       diagnostic_completed,
       first_practice_attempt,
       weekly_active_learners,
       -- Step-to-step conversion, percent; NULL when the previous stage is empty.
       ROUND(100.0 * diagnostic_completed   / NULLIF(total_registered, 0), 1)       AS registered_to_diagnostic_pct,
       ROUND(100.0 * first_practice_attempt / NULLIF(diagnostic_completed, 0), 1)   AS diagnostic_to_practice_pct,
       ROUND(100.0 * weekly_active_learners / NULLIF(first_practice_attempt, 0), 1) AS practice_to_weekly_active_pct,
       -- End-to-end: registered -> weekly active.
       ROUND(100.0 * weekly_active_learners / NULLIF(total_registered, 0), 1)       AS registered_to_weekly_active_pct
FROM funnel
ORDER BY is_total, total_registered DESC, signup_source;

COMMIT;
