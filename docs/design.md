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
              └─ PostgreSQL persistence
                   (users, challenges, evidence, sessions, competitions,
                    teams, reputation_log, user_balances, reminders)
```

- **Runtime**: single Node.js process, grammY, long polling (no inbound
  ports). Media (photos, documents) is fetched from Telegram via
  `getFile` and stored in S3-compatible storage (mandatory per General).
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
| **User** | `users` | `telegram_id` PK, `name`, `reputation_score` (default 100), `created_at` |
| **UserBalance** | `user_balances` | `user_id` FK→users, `currency_type` (`points`/`crypto`/`custom_token`), `token_address` (nullable), `amount`, PK(user_id, currency_type, token_address) |
| **Challenge** | `challenges` | `id` PK, `creator_telegram_id` FK→users, `title`, `description`, `reward_type` (`points`/`crypto`/`custom_token`), `reward_amount`, `token_address` (nullable), `duration_days`, `verifier_count` (default 1), `status` (`active`/`completed`/`failed`/`cancelled`), `created_at`, `deadline`, `recurrence` (`none`/`weekly`/`monthly`) |
| **VerificationEvidence** | `evidence` | `id` PK, `challenge_id` FK→challenges, `user_telegram_id` FK→users, `kind` (`photo`/`document`/`text`), `media_url`, `text_body`, `timestamp`, `verdict` (`pending`/`approved`/`rejected`), `verifier_telegram_id` FK→users, `verification_time` (timestamp) |
| **VerificationSession** | `sessions` | `id` PK, `user_telegram_id` FK→users, `challenge_id` FK→challenges, `start_date`, `end_date`, `current_streak`, `verified_status` (`in_progress`/`approved`/`failed`) |
| **GroupCompetition** | `competitions` | `id` PK, `group_chat_id` (Telegram group), `name`, `start_date`, `end_date`, `prize_pool_currency` (`points`/`crypto`/`custom_token`), `prize_pool_token_address` (nullable), `prize_pool_amount` |
| **Team** | `teams` | `id` PK, `competition_id` FK→competitions, `name`, `captain_telegram_id` FK→users |
| **TeamMember** | `team_members` | `team_id` FK, `user_telegram_id` FK, PK(team_id, user_telegram_id) |
| **Leaderboard** | view `v_leaderboard` | `user_telegram_id`, `display_name`, `reputation_score`, `points_balance`, `crypto_balance`, `custom_token_balance`, `rank()` desc |
| **ReputationRecord** | `reputation_log` | `id` PK, `user_telegram_id` FK→users, `delta`, `reason`, `challenge_id` NULL, `at` |

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
| `/stats` | your accuracy, streak, reputation, rank, average verification time |
| `/leaderboard` | global leaderboard |
| `/export` | DM yourself a CSV of your challenge history |
| `/schedule` | (creator only) set up a recurring weekly/monthly challenge |
| `/invite <challenge_id> <@username>` | invite specific user to verify your challenge |
| `/admin_credit <user> <currency_type> <token_address> <amount> <reason>` | manual balance credit (escape hatch) |
| `/admin_cancel <challenge_id>` | force-cancel a challenge and refund stakes |

Group-scoped (only meaningful in a group chat):

| Command | Purpose |
| --- | --- |
| `/newseason <name> <days> <currency_type> <token_address> <prize_amount>` | create a group competition |
| `/jointeam <team_name>` | join a team in the active season |
| `/standings` | current season team ranking |

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
3. **Reward type** — inline buttons: `points` `crypto` `custom_token` (CB `ch:reward:<type>`).
   - On `crypto`/`custom_token`: "Staking is required. Your balance will be deducted now. On-chain payouts are a v2 feature; for now we credit balances off-chain."
4. **Reward amount** (integer ≥ 1).
   - If `custom_token`, prompt for token address (CB `ch:token:<addr>`).
5. **Duration** — quick buttons `3d` `7d` `14d` `30d` or custom
   (1–365). Stored on the challenge; `deadline = created_at + duration_days`.
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
     via `getFile`, stores URL in S3. (Text: skip.)
   - Step 3: optional caption (≤ 200 chars).
   - On submit: insert `evidence` row with `verdict=pending`; notify the
     assigned verifier(s) with the evidence card and
     `✅ Approve` / `❌ Reject` buttons (CB `vfy:approve:<id>`,
     `vfy:reject:<id>`).

### 4.4 Verifier flow
When a verifier taps `✅ Approve` / `❌ Reject`:
1. Bot records `verdict`, sets `verifier_telegram_id`, logs `verification_time`.
2. If `verifier_count=1` → final. If `verifier_count=3` → wait for all
   three; final verdict = majority. Tie → `approved` (favours participant).
3. On `approved`:
   - mark the session `approved`, increment `current_streak`, transfer
     `reward_amount` from the creator's `user_balance` to the participant's.
   - add +5 to verifier reputation; -1 to participant if rejected.
4. The participant gets "✅ Approved! +<reward> · streak: N".
5. The verifier gets "+5 reputation · accuracy: 87% · avg verification time: X min".

### 4.5 Streak & deadline reminders (System)
- Cron tick every 60s.
- For every active session where `deadline - 24h <= now < deadline` and no
  reminder sent yet → DM participant "⏰ <title> ends in 24h — submit
  evidence if you haven't."
- For every session where `deadline <= now` and `verified_status=in_progress`
  → mark `failed`, notify the creator, free the verifier queue.

### 4.6 Recurring challenges
When a recurring challenge's `deadline` passes and the next instance is not
cancelled, a new `challenges` row is inserted with `created_at = deadline`
and a fresh `deadline`. The original is kept for history.

### 4.7 Stats (`/stats`)
Card: `Reputation: R · Rank: #K · Accuracy: P% · Current streak: S ·
Active challenges: A · Completed: C · Failed: F · Points: X · Crypto: Y · Custom Tokens: Z · Avg verification time: T min`.

### 4.8 Leaderboard (`/leaderboard`)
Top 20: `1. <name> · 240 rep · 92% acc`. "You: #K · R" footer.

### 4.9 Export (`/export`)
DM the user a CSV of their challenges + evidence verdicts, header:
`challenge_id,title,reward,status,verdict,verifier,submitted_at,verified_at,verification_time`.

### 4.10 Group season
- In a group chat, `/newseason` creates a `competitions` row and a
  `team_creation` window. Members `/jointeam <name>` to form teams
  (captains create teams via inline `➕ Create team` → name).
- During the season, the group leaderboard shows `Team · Members · Points`.
- On `end_date`, the top team is announced and the prize pool is credited
  to each member's `user_balance` in the specified currency.

### 4.11 Admin — manual credit / cancel
- `/admin_credit` writes a `user_balance` row with the given currency and token address.
- `/admin_cancel` marks a challenge `cancelled` and refunds staked
  balances to the creator's `user_balance`.

## 5. Edge cases & rules

- **One session per user per challenge** — enforced by the
  `(user_telegram_id, challenge_id)` unique key on `sessions`. Re-joining
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
- **Media storage** — S3 is mandatory (no local fallback). Telegram file IDs
  are fetched via `getFile` and uploaded to S3 immediately.
- **Privacy** — `/export` returns only the caller's data; no global
  data export.
- **Timezones** — `deadline` stored UTC, rendered in the user's local
  timezone. Recurrence is wall-clock UTC.
- **Insufficient stake** — if a user tries to create a challenge with a reward exceeding their balance, show "⚠️ Not enough <currency> in your balance. /help for balance management."
- **Custom token validation** — if a user specifies a custom token not in their `user_balances`, show "⚠️ This token isn't in your balance. Use /help to add it."

## 6. External dependencies (mirrors General)

- **Telegram Bot API** via grammY — long polling, inline keyboards,
  callback queries, group chat permissions, media handling, scheduled
  messages.
- **Database** — PostgreSQL (users, challenges, evidence, sessions,
  competitions, teams, team_members, reputation_log, user_balances, reminders).
- **Cloud storage** — S3-compatible (mandatory) for evidence media.
- **Blockchain** — off-chain `user_balance` tracks staked rewards per
  General; on-chain payouts are v2. ERC-20 compatibility is a future
  extension.

## 7. Non-goals (inherited from General)

No full project management (no delegation, no Gantt), no social media
beyond evidence sharing, no complex blockchain features, no cross-platform
sync, no AI evidence validation, no fitness/health API integration.

## 8. Feature → design traceability

| General feature | Design section |
| --- | --- |
| Custom time-bound challenges | 4.2 |
| Stake points/crypto/custom tokens as reward | 4.2 step 4, 4.4 step 3 |
| Invite specific users to verify | 3, 4.3 |
| Submit evidence (photo/doc/text) | 4.3 step 3 |
| Verify with approve/reject | 4.4 |
| Track streaks | 4.5, 2 (`sessions.current_streak`) |
| Global + group leaderboards | 4.8, 4.10 |
| Reputation scores | 2, 4.7, 4.8 |
| Recurring challenges | 4.6 |
| Seasonal group competitions | 4.10 |
| Auto-distribute rewards | 4.4 step 3 |
| Deadline reminders | 4.5 |
| Challenge statistics (completions, avg verification time) | 4.7 |
| Export history as CSV | 4.9 |
| Multiple reward currencies (points, crypto, custom tokens) | 4.2 step 3, 4.10 |
| i18n for all user-facing strings | All message copy sections |

## 9. i18n Strings

- "Pick your vibe" → `onboarding.pick_vibe`
- "Staking is required" → `challenge.staking_required`
- "Your balance will be deducted now" → `challenge.balance_deduction`
- "Avg verification time" → `stats.avg_verification_time`
- "Not enough <currency> in your balance" → `error.insufficient_balance`
- "This token isn't in your balance" → `error.token_not_in_balance`

## 10. Inline Keyboard Layouts

### Challenge Creation
```
[Challenge Title] → [Reward Type: Points | Crypto | Custom Token]
[Description] → [Duration: 3d | 7d | 14d | 30d | Custom]
[Verdict Count: 1 | 3] → [Recurrence: None | Weekly | Monthly] → [Create Challenge]
```

### Verification Queue
```
[Approve: Challenge #123] [Reject: Challenge #123]
[Approve: Challenge #456] [Reject: Challenge #456]
```

### Evidence Submission
```
[Photo] [Document] [Text]
```

### Admin Actions
```
[Credit User] [Cancel Challenge]
```