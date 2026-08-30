# Landing Page — Shape Brief

Target: `apps/web/app/[locale]/(marketing)/page.tsx` (Hero + Problem/Shift + Value Props sections only).
Produced via `$impeccable shape landing`. Confirmed and settled — no code written yet.

---

## How the visual world was arrived at

Started from the product's actual mechanism (a live per-skill diagnostic feeding continuous BKT/FSRS recalibration) and the audience's real cultural world (adults 18–40, work/immigration/travel stakes, plain-voice, skeptical of gamified ed-tech), then listed seven concrete visual systems that audience already knows by heart and could plausibly carry that mechanism: a medical lab report, a CEFR/exam certificate, a physiotherapist's/trainer's assessment chart, a precision instrument gauge, a tailor's bespoke pattern, a radio operator's S-meter/log, and a darkroom contact sheet. Ranked by resonance, the assessment chart came out on top — it maps almost literally onto "find the weak spot, build the program from it" while staying warm and coaching-toned rather than cold or technical.

The process deliberately did not allow shipping that top pick unchallenged: a randomization step assigned a different candidate (the radio operator's S-meter/log world) as the one to build, specifically to prevent defaulting to the safest option. Six catalog alternates were weighed against that assigned instrument-panel world; all six lost on audience fit or product clarity. Because the assignment was not the top-ranked candidate, one "MY PICK" card was added alongside it, carrying the assessment-chart world — and that card was chosen directly by the user. This is a legitimate, deliberate override, not an inherited default.

**One genuinely different world considered and rejected:** the CEFR/exam certificate — official band-score reports, seals, signature lines, the actual paperwork this audience holds when applying for visas or jobs. Arguably more on-brand than the chart (CEFR is literally the product's framework), but ranked below it because that register reads as bureaucratic and exam-adjacent — for an audience already carrying real visa/work-permit paperwork anxiety, an interface that looks like more official paperwork risks feeling transactional and stressful rather than reassuring, working against what a landing page needs to do in the first few seconds. The chart/tick-sheet world keeps the same precision and legibility without that institutional weight.

---

## 1. Job and audience

Adults 18–40, CEFR A2–C1, learning for work, immigration, or travel — practical stakes, not hobbyists. They arrive skeptical of one-size-fits-all courses and gamified ed-tech. Visitor mode: **Persuade**. The page has seconds to be understood and to earn the diagnostic click.

## 2. Outcome and proof

Primary action: "Take the free diagnostic" → `/register`. The page must *demonstrate* personalization mechanically (show a flagged weak spot) rather than assert it in adjectives. Product-specific truth to carry: a live per-skill diagnostic feeding a continuously-recalibrating engine — not a fixed syllabus.

## 3. Selected visual direction — "Assessment & Program"

World: a physiotherapist's/trainer's intake-and-program chart — warm paper ground, a skill map marked with flagged zones, tick-sheet grid typography, a program built directly from what's flagged.

- **Information architecture / section order:** Header → Hero → Problem/Shift → Value Props (3 cards). Nothing else in this build.
- **Hero:** the first viewport *is* the chart, not a centered headline over whitespace. A skill-map panel shows three zones — Vocabulary / Grammar / Listening — with one visibly flagged in the accent color and rendered larger than its siblings, physically dramatizing "AI knows where you're weak" in the first five seconds. H1, subhead, and both CTAs sit alongside the panel, not below a hero image.
- **Problem/Shift:** the locked copy's three-column contrast ("Typical course" vs. "EnglishLearn" vs. "The difference") renders as two charts side by side, in the same chart-marking grammar as the hero: a flat, unflagged "everyone gets the same plan" sheet on one side, the flagged, personalized sheet on the other. No generic icon-column layout.
- **Value props:** the three cards (from copy section 3: "AI that finds your gaps," "Practice that adapts in real time," "Progress you can actually read") render as program-line entries carrying the same tick/flag glyph system as the hero and problem/shift sections — one continuous instrument across the page, not three disconnected icon boxes.
- **Header:** minimal — a wordmark set like a chart letterhead, plus a quiet text-only "Sign in" link. No full nav (footer nav is out of scope this pass).
- **Color strategy:** Committed. Warm paper/bone ground (~85% of surface), one confident coral "flag" accent carrying the weak-zone signal through hero, problem/shift, value props, and both CTAs; a muted teal reserved only for "on-track" status marks; ink-charcoal text, never pure black.
- **Motion:** one orchestrated reveal — the hero's flagged zone "ticks" into place (a stamp/checkmark landing) on scroll-into-view. A subtle idle pulse on that same flagged zone keeps the chart reading as live instrumentation, not a printed graphic. No other competing motion.
- **Honest risk:** an assessment/diagnostic-chart shape is a familiar move in ed-tech onboarding. Differentiation depends on committing fully to the literal chart/tick-sheet material — real paper texture, tick-mark iconography, chart-line grid — rather than softening into a generic "radar chart" icon, which would collapse straight back into the category default this whole exercise exists to avoid.

## 4. Scope and boundaries

- In scope: Hero, Problem/Shift, Value Props (copy sections 1–3 of `docs/landing-copy.en.md`), plus a new minimal site header.
- Out of scope this pass: How it works, Progress/proof-of-method, Tutor roadmap block, Pricing, Final CTA, Footer.
- Untouched: `/register` and `/login` routes/pages; existing i18n routing; `@englishlearn/ui` Button/Input/Card as base primitives — extend with new chart-card variants rather than replacing them.
- Anti-goals: no gamified/mascot ed-tech look, no generic AI-SaaS gradient-blob look, no raw numeric mastery scores anywhere (CEFR bands only, per locked copy principle).

## 5. States and ranges

- Copy: locked EN text from sections 1–3, verbatim.
- i18n: this pass is EN-only. Replace the stale `marketing.hero` keys in `en.json` (which lead with "AI and real tutors," contradicting the locked personalization-first rule) with the personalization-first copy. Do **not** machine-translate RU/UK/DE — leave `ru.json`, `uk.json`, and `de.json` untouched; localization is a separate later pass with native review, per the working-language discipline.
- Responsive: the chart panel compresses to a stacked single-column read on mobile without losing the flagged-zone emphasis.
- No loading/error states needed — static marketing content.

## 6. Interaction and layout

- Primary hero CTA: "Take the free diagnostic" → `/register`.
- Secondary hero CTA: relabeled "Why we're different" → anchors down to the Problem/Shift section (replacing the original "See how it works," whose target section is out of scope).
- Header "Sign in" → `/login`.
- Scroll-triggered reveal on the hero's flagged zone only; every other element appears without competing motion.

## 7. Constraints and open decisions

- Platform: web, WCAG 2.1 AA.
- Execution: code-led — no image generation available, so no comp round.
- **Mandatory visual-commit checkpoint before any component code:** the build step must produce 2–3 concrete, distinct palette + type + tone candidates within the chosen chart/tick-sheet world — not one self-selected default — and present them for explicit user approval before writing a single component. Given the audience's trust/legibility priority over boldness, the candidates should span a legibility/trust axis: e.g. a quieter clinical-paper rendition, a warmer/more human chart rendition, and a higher-contrast/more confident rendition — all inside the same chart grammar, none reverting to a different world. The commit is the user's to make; DESIGN.md is written afterward from whichever candidate is approved, never before.
- Current `globals.css` brand-blue tokens are confirmed free to replace, but only within whichever candidate is approved.
- Exact hex values, typeface families, and whether chart iconography is hand-authored SVG vs. CSS-built are resolved as part of that same approval round.
