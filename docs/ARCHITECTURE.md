High-level Architecture

[заполняется итеративно — Claude обновляет по мере развития]

Modules
web (Next.js app для учеников/учителей)
landing (отдельный Next.js — быстрый, SEO, многоязычный)
api (если выделим)
ai-service (LLM orchestration, prompt templates, evals)
db (Prisma schema, migrations, seed)
Data model (черновик)

User, Profile, TutorProfile, Lesson, Assignment, Exercise, Attempt, Progress, KnowledgeUnit, SkillTag, Subscription, Payment, ...