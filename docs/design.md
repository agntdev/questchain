# DESIGN — QuestChain

Architecture, command set and conversation flows for the QuestChain
Telegram bot. Satisfies every entity, dependency and feature in
`docs/general.md`.

## 1. Architecture

```
Telegram ⇄ grammY bot (long polling)
              │
              ├─ command router  (/start /newchallenge /join /verify /stats /help …)
              ├─ callback router (ch:* vfy:* comp:* join:*)
              ├─ session store   (per-chat finite-state machine)
              ├─ service layer   (challenges, evidence, reputation, seasons)
              ├─ cron job        (deadline reminders, season rollover)
              └─ SQLite persistence
                   (users, challenges, evidence, sessions, competitions,
                    teams, reputation, reminders)
```

- **Runtime**: single Node.js process, grammY, long polling (no inbound
  ports). Media (photos, documents) is fetched from Telegram via
  `getFile` and stored on the local volume (or S3 if `MEDIA_BUCKET` is set).
- **State machine** per chat covers challenge creation, evidence
  submission, and the verifier flow. Other commands are stateless.
- **Reputation**: a single `reputation_score` column on `users`, updated
  atomically whenever a verification outcome is decided. The leaderboard
  is a SQL view sorted by it.
- **Cron**: a single in-process scheduler that ticks every 60s and fans
  out deadline reminders, recomputes streaks, and rolls over a season
  when its `end_date` passes.

## 2. Data model (implements General "Core Entities")

| Entity | Table | Fields |
| --- | --- | --- |
| **User** | `users` | `tg_id` PK, `name`, `reputation_score` (default 100), `crypto_balance` (default 0), `created_at` |
| **Challenge** | `challenges` | `id` PK, `creator_tg_id` FK→users, `title`, `description`, `reward_type` (`points`/`crypto`/`token`), `reward_amount`, `duration_days`, `verifier_count` (default 1), `status` (`active`/`completed`/`failed`/`cancelled`), `created_at`, `ends_at`, `recurrence` (`none`/`weekly`/`monthly`) |
| **VerificationEvidence** | `evidence` | `id` PK, `challenge_id` FK→challenges, `user_tg_id` FK→users, `kind` (`photo`/`document`/`text`), `media_url` NULL, `text_body` NULL, `submitted_at`, `verdict` (`pending`/`approved`/`rejected`), `verifier_tg_id` FK→users NULL |
| **VerificationSession** | `sessions` | `id` PK, `user_tg_id` FK→users, `challenge_id` FK→challenges, `start_date`, `end_date`, `current_streak`, `verified_status` (`in_progress`/`approved`/`failed`) |
| **GroupCompetition** | `competitions` | `id` PK, `group_chat_id` (Telegram group), `name`, `start_date`, `end_date`, `prize_pool` (points or token units) |
| **Team** | `teams` | `id` PK, `competition_id` FK→competitions, `name`, `captain_tg_id` FK→users |
| **TeamMember** | `team_members` | `team_id` FK, `user_tg_id` FK, PK(team_id, user_tg_id) |
| **Leaderboard** | view `v_leaderboard` | `user_tg_id`, `display_name`, `reputation_score`, `rank()` desc |
| **ReputationRecord** | `reputation_log` | `id` PK, `user_tg_id` FK→users, `delta`, `reason`, `challenge_id` NULL, `at` |

Relationships preserved exactly as General states: user 1—N challenges
(created), user 1—N evidence, user 1—N sessions, challenge 1—N evidence,
challenge 1—N sessions, competition 1—N teams, team 1—N members,
leaderboard aggregates from all the above.

## 3. Command set

| Command | Purpose |
| --- | --- |
| `/start` | register user + onboarding + main menu |
| `/help` | command reference |
| `/newchallenge` | create a challenge (text-driven flow) |
| `/mychallenges` | list your active and past challenges |
| `/join <challenge_id>` | join a public challenge; opens evidence flow |
| `/submit <challenge_id>` | submit fresh evidence (photo/doc/text) |
| `/verify` | open the verifier queue (challenges assigned to you) |
| `/stats` | your accuracy, streak, reputation, rank |
| `/leaderboard` | global leaderboard |
| `/export` | DM yourself a CSV of your challenge history |
| `/schedule` | (creator only) set up a recurring weekly/monthly challenge |

Group-scoped (only meaningful in a group chat):

| Command | Purpose |
| --- | --- |
| `/newseason <name> <days> <prize>` | create a group competition |
| `/jointeam <team_name>` | join a team in the active season |
| `/standings` | current season team ranking |

Admin (not user-facing, restricted to `ADMIN_TG_ID`):

| Command | Purpose |
| --- | --- |
| `/admin_credit <user> <amount> <reason>` | manual reputation grant (anti-abuse escape hatch) |
| `/admin_cancel <challenge_id>` | force-cancel a challenge and refund stakes |

## 4. Conversation / UX flows

### 4.1 Onboarding (`/start`)
1. Upsert `users` row.
2. First contact: "Pick your vibe" with three inline buttons:
   `🏋 Athlete` `📚 Learner` `🎨 Creator` — only affects the suggested
   challenge list later, not behaviour. (Optional: skipped on second
   /start.)
3. Show main menu: `➕ New challenge` `🎯 My challenges` `📊 Stats`
   `🏆 Leaderboard`.

### 4.2 Create a challenge (`/newchallenge`)
1. Bot asks for **title** (1–80 chars) → state `nc:title`.
2. **Description** (≤ 500 chars).
3. **Reward type** — inline buttons: `points` `crypto` `token`
   (CB `ch:reward:<type>`). On `crypto`/`token` the bot warns
   "On-chain payouts are a v2 feature; for now we credit `crypto_balance`
   off-chain points and show them in /stats."
4. **Reward amount** (integer ≥ 1).
5. **Duration** — quick buttons `3d` `7d` `14d` `30d` or custom
   (1–365). Stored on the challenge; `ends_at = created_at + duration_days`.
6. **Verifier count** — `1` (default) or `3` for higher-stakes challenges.
7. **Recurrence** — `none` / `weekly` / `monthly`. On `weekly`/`monthly`
   a cron job spawns the next instance when the current one ends (creator
   can /cancel that).
8. **Confirm card** with everything → `✅ Create` (CB `ch:create`).
9. Insert; reply with a shareable card "⚔️ Challenge #N — <title> ·
   <reward>. /join N to participate."

### 4.3 Join + submit evidence (`/join <id>` → `/submit <id>`)
1. `/join` opens the challenge card inline. If `verifier_count=1` the
   creator picks a single verifier via `👥 Pick verifier` (CB `vfy:assign`).
   If 3, three distinct verifiers are auto-assigned from the creator's
   recent interactors.
2. After assignment, a `session` row is created and the participant
   gets a card: "Submit your evidence — photo, document, or text." CB
   `submit:start` opens a text-step flow.
3. **Text-step flow**:
   - Step 1: kind — `📷 Photo` `📄 Document` `📝 Text` (CB `ev:kind:<k>`).
   - Step 2 (photo/doc): bot waits for the next media message, downloads
     via `getFile`, stores URL or local path. (Text: skip.)
   - Step 3: optional caption (≤ 200 chars).
   - On submit: insert `evidence` row with `verdict=pending`; notify the
     assigned verifier(s) with the evidence card and
     `✅ Approve` / `❌ Reject` buttons (CB `vfy:approve:<id>`,
     `vfy:reject:<id>`).

### 4.4 Verifier flow
When a verifier taps `✅ Approve` / `❌ Reject`:
1. Bot records `verdict`, sets `verifier_tg_id`, recomputes session status.
2. If `verifier_count=1` → final. If `verifier_count=3` → wait for all
   three; final verdict = majority. Tie → `approved` (favours participant).
3. On `approved`:
   - mark the session `approved`, increment `current_streak`, credit
     `reward_amount` to the participant's `crypto_balance`.
   - add +5 to verifier reputation; -1 to participant if rejected.
4. The participant gets "✅ Approved! +<reward> · streak: N".
5. The verifier gets "+5 reputation · accuracy: 87%".

### 4.5 Streak & deadline reminders (System)
- Cron tick every 60s.
- For every active session where `ends_at - 24h <= now < ends_at` and no
  reminder sent yet → DM participant "⏰ <title> ends in 24h — submit
  evidence if you haven't."
- For every session where `ends_at <= now` and `verified_status=in_progress`
  → mark `failed`, notify the creator, free the verifier queue.

### 4.6 Recurring challenges
When a recurring challenge's `ends_at` passes and the next instance is not
cancelled, a new `challenges` row is inserted with `created_at = ends_at`
and a fresh `ends_at`. The original is kept for history.

### 4.7 Stats (`/stats`)
Card: `Reputation: R · Rank: #K · Accuracy: P% · Current streak: S ·
Active challenges: A · Completed: C · Failed: F · Crypto balance: B`.

### 4.8 Leaderboard (`/leaderboard`)
Top 20: `1. <name> · 240 rep · 92% acc`. "You: #K · R" footer.

### 4.9 Export (`/export`)
DM the user a CSV of their challenges + evidence verdicts, header:
`challenge_id,title,reward,status,verdict,verifier,submitted_at,resolved_at`.

### 4.10 Group season
- In a group chat, `/newseason` creates a `competitions` row and a
  `team_creation` window. Members `/jointeam <name>` to form teams
  (captains create teams via inline `➕ Create team` → name).
- During the season, the group leaderboard shows `Team · Members · Points`.
- On `end_date`, the top team is announced and the prize pool is credited
  to each member's `crypto_balance` pro-rata.

### 4.11 Admin — manual credit / cancel
- `/admin_credit` writes a `reputation_log` row with the given delta; the
  user's `reputation_score` is bumped accordingly.
- `/admin_cancel` marks a challenge `cancelled` and refunds any staked
  balances (for v1: no stakes are taken, so this is a no-op except for
  the status change).

## 5. Edge cases & rules

- **One session per user per challenge** — enforced by the
  `(user_tg_id, challenge_id)` unique key on `sessions`. Re-joining
  resumes the existing session.
- **Verifier rotation** — a verifier who is also a participant in the
  same challenge cannot verify it (self-deal guard). The picker
  auto-excludes the creator and any user with an existing session on the
  challenge.
- **Evidence cap** — max 5 evidence rows per session (most recent wins
  for the verifier view). Older ones are kept for history.
- **Tie on 3-verifier challenges** — `approved` (favours the participant).
- **Recurring rollover race** — the cron uses
  `INSERT … WHERE NOT EXISTS` to avoid double-spawning the next
  instance on a restart.
- **Media storage** — Telegram file IDs are short-lived; on submit we
  download via `getFile` and persist a local copy (or upload to S3 if
  configured). The `media_url` is stable.
- **Privacy** — `/export` returns only the caller's data; no global
  data export.
- **Timezones** — `ends_at` stored UTC, rendered in the user's local
  timezone. Recurrence is wall-clock UTC.

## 6. External dependencies (mirrors General)

- **Telegram Bot API** via grammY — long polling, inline keyboards,
  callback queries, group chat permissions, media handling, scheduled
  messages.
- **Database** — SQLite (users, challenges, evidence, sessions,
  competitions, teams, team_members, reputation_log, reminders).
- **Cloud storage** — S3-compatible (optional via `MEDIA_BUCKET` env) for
  evidence media; falls back to a local volume.
- **Blockchain** — out of scope for v1 (the design says "ERC-20 compatible
  tokens" but the off-chain `crypto_balance` is the source of truth; on-chain
  payouts are explicitly a v2 task).

## 7. Non-goals (inherited from General)

No full project management (no delegation, no Gantt), no social media
beyond evidence sharing, no complex blockchain features, no cross-platform
sync, no AI evidence validation, no fitness/health API integration.

## 8. Feature → design traceability

| General feature | Design section |
| --- | --- |
| Custom time-bound challenges | 4.2 |
| Stake points/crypto as reward | 4.2 step 4 (off-chain) |
| Invite verifiers | 4.3 step 1 |
| Submit evidence (photo/doc/text) | 4.3 step 3 |
| Verify with approve/reject | 4.4 |
| Track streaks | 4.5, 2 (`sessions.current_streak`) |
| Global + group leaderboards | 4.8, 4.10 |
| Reputation scores | 2, 4.7, 4.8 |
| Recurring challenges | 4.6 |
| Seasonal group competitions | 4.10 |
| Auto-distribute rewards | 4.4 step 3 |
| Deadline reminders | 4.5 |
| Challenge statistics | 4.7 |
| Export history as CSV | 4.9 |
| Multiple reward currencies | 4.2 step 3 (off-chain for v1) |
