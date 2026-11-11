# Daily tracking and experimental context evolution

## Status and scientific boundary

RF/A is still the original private contextual regressor. No model was retrained or changed.
It accepts 22 contextual inputs; it does not itself aggregate a longitudinal daily sequence.

The application now provides an **experimental adapter**, version
`daily-window/1.experimental`. Agreement between the backend result and a direct RF/A
call validates the software integration, **not** the daily adapter's scientific validity,
clinical utility, causal interpretation, calibration, or compatibility with the training
population and questionnaire timeframe. The team must review the training protocol and
evaluate this transformation before treating it as an established measurement.

Keep `DAILY_CONTEXT_EVOLUTION_ENABLED=false` in the committed environment template.
The expected TCC development and demo flow enables it explicitly in the ignored
`backend/.env`; see the [local setup guide](DAILY_TRACKING_LOCAL_SETUP.md).
No external generative AI receives account information, daily entries, notes, or predictions.

## Product flow

1. The student provides the complete initial 22-field context about the last four weeks.
   RF/A produces an index immediately; a month of daily records is not a prerequisite.
2. A two-step daily check-in collects mood, sleep hours, sleep quality, assessment
   pressure, study/rest difficulty and perceived personal support, with an optional note.
3. A date picker accepts today or a valid previous calendar day. Future and nonexistent
   dates are rejected server-side. There is one entry per owner/date; revisiting a date
   opens that day's actual saved answers for editing.
4. After saving, the enabled adapter builds a candidate full context and invokes RF/A
   only if its inputs differ from the latest saved context. Equal inputs do not generate
   duplicate assessments or a forced score movement.
5. Indexes are historical snapshots, except directly linked results are removed when
   their triggering check-in is deleted. The sidebar and panel refresh.
   The panel separately compares medians of the three most recent complete check-ins
   with the three preceding ones. All six dates must be within 14 days and the newest
   three within seven days. Sleep duration is descriptive, not inherently better or
   worse. Highlighted inline feedback requires two ordinal signals moving one level
   in the same direction, or one moving two levels, with no opposing signal.
   Feedback stays in the dashboard and links to topic choice without a modal.
   This is not another score or a diagnostic rule.
6. A guided review lets the student choose studies, work, relationships, or habits and
   finances. The four topics cover 12 fields that do not repeat daily questions.
   The dashboard suggests an applicable topic least recently confirmed after seven
   days without a full or guided review. Skipping hides the invite for seven days in
   that browser. Manual topic choice is always available.
   The review uses canonical questions without changing their reference periods. It predicts from all 22 fields
   and applies only confirmed changes. Its provenance is `guided_review`. The adapter
   preserves the existing evidence cutoff and a separate confirmed fallback baseline,
   so expiring daily observations are not silently turned into confirmed answers.

## Exact transformation

- The active calendar window is today minus 27 days through today inclusive, using
  `DAILY_REMINDER_TIMEZONE` (default `America/Sao_Paulo`), not the last 28 entries.
- The anchor is the latest owned **confirmed** assessment (`context` or
  `guided_review`), never a daily-derived result. A guided anchor stores its
  confirmed baseline separately so the same daily averages are never averaged again.
- Daily observations must have been saved/updated since the latest full context
  confirmation. A new full review resets that cutoff; a guided partial review preserves it.
- Only complete new-format daily observations in the active window participate.
  Legacy check-ins remain readable but energy/generic demand are not reinterpreted.
- `sleep_hours`: arithmetic mean of recorded sleep hours, rounded to three decimals.
- `sleep_quality`, `assessment_pressure`, `study_rest_difficulty`, `personal_support`:
  arithmetic mean of recorded ordinal values, rounded half up to an allowed integer 0-4.
- The other 17 context fields are carried from the manual anchor. Their original meaning
  is not inferred from mood, energy, prose notes or a changed sleep pattern.
- Mood and optional notes are stored for the student's history, not sent to RF/A.
- Missing days receive no zero, fabricated observation, baseline pseudo-count or weight.
  One recorded day can change the candidate inputs, but remains sparse experimental evidence.
- Backdated entries affect the present window, not old index snapshots. Entries outside
  the window remain in history but do not affect the current calculation.
- Edits replace the observation for that day, not add a second daily sample.
- Deletion removes the day and results explicitly linked through `triggerCheckInId`
  using a foreign-key cascade and the per-owner advisory lock. Other snapshots
  that merely used the day as evidence remain. Recalculation uses surviving
  observations or the confirmed baseline if none remain.
- A numerical increase/decrease is not guaranteed, is not forced by application rules,
  and must not be interpreted as proof that one habit caused a clinical change.
- No clinical bands, diagnostic probabilities or invented confidence percentages are added.

## Provenance and persistence

`esbeu_assessments.source` distinguishes `context` from `daily_experimental`.
Derived rows store the full 22-field input, actual model output/version, original consent,
adapter version, manual anchor ID, window dates, per-day evidence IDs/revision timestamps,
observed-day count, aggregation methods, aggregated/carried field names and fingerprint.
Complementary observed questionnaire scores are not copied into a new derived assessment.
New daily-derived results also snapshot the triggering check-in reference date,
original registration and revision timestamps. These differ from calculation time.
Legacy results are not backfilled by guessing origins from evidence or timestamps.
Unlinked recalculations record window refresh or deletion as their reason.

The chart uses the last calculation per Sao Paulo calendar day. Weekly
(Monday-Sunday, default) and monthly means weigh available days equally.
Missing periods are gaps, never zero. The full series is independent of
history pagination; dates are never backdated from a check-in reference.

Daily persistence commits before prediction. An AI failure never loses a saved day or
fabricates an index. The response says the day was saved and the update is pending; the
overview detects differing candidate inputs and offers a retry. Per-owner advisory locking
serializes derived calculations, and evidence/anchor are rechecked after inference to
avoid publishing a result from superseded observations.

## API

- `GET /daily-check-ins/overview`: today's date, recent days, distinct count, window start,
  feature status and whether the current candidate is awaiting calculation.
- `GET /daily-check-ins/day/:date`: the authenticated owner's entry or null for that date.
- `PUT /daily-check-ins`: date, mood, sleepHours, observations and optional note.
  observations contains exactly the four canonical ordinal field identifiers above.
- `PUT /daily-check-ins/today`: retained for old clients. Legacy entries without the new
  observations do not become model evidence.
- `POST /daily-check-ins/recalculate`: retries current context calculation without resaving.
- `GET /daily-check-ins`: owned cursor pagination.
- `DELETE /daily-check-ins/:id`: removes the owned entry, recalculates, returns update status
  with HTTP 200. Directly linked results are deleted; unrelated history is preserved.
- `GET /esbeu-assessments/current` and `POST /esbeu-assessments/review`: guided manual review
  with valid persisted consent reuse and explicit confirmation, as before.
- `POST /esbeu-assessments/guided-review`: a confirmed subset of permitted contextual
  changes for the selected topic, based on the current owned assessment. A stale
  assessment is rejected. History records changed field labels and the previous
  estimate so the UI can distinguish a saved review from a percentage change.
- `GET /esbeu-assessments/review-topics`: the four topics and a nonbinding suggestion.
- `GET /esbeu-assessments/trend`: complete owned series, calculation dates and
  linked check-in dates without context answers or notes.

The index percentage remains a presentation normalization of the original 0-4 output,
not probability of burnout. The two recommendation dashboard placeholders remain separate;
external generation is not enabled by this feature.

## Deployment and verification

Run Prisma generate, migrate deploy and backend build/restart. Migrations
`20261104010000_add_daily_check_ins` and
`20261104020000_add_daily_context_evolution` and
`20261110010000_add_guided_context_review` add the new data fields without
resetting accounts. `20261110020000_allow_guided_context_source` extends the
allowed assessment origins.
`20261110030000_link_check_in_predictions` adds trigger links without guessing
old origins; `20261110040000_track_daily_reminders` adds delivery tracking.
Python 3.12 and the private RF/A package remain separately configured; never commit secrets.

Tests cover available-day aggregation, ordinal boundaries, unchanged inputs, evidence
supersession, consent/provenance, timezone dates, invalid/future dates, account isolation,
backdated entry editing, persistence with AI offline, deletion and browser responsiveness.
Real-model integration compares each stored derived score to direct inference on its exact
persisted context; all automated entries/accounts are synthetic and cleaned up.
