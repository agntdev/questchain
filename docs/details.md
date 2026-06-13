# QuestChain Bot Design Document (DETAILS Phase)

## SCREENS

### 1. Onboarding Screen
- **Trigger**: `/start` (first-time user)
- **Message**: 
  ```
  Pick your vibe 🎯
  [🏋 Athlete] [📚 Learner] [🎨 Creator]
  ```
- **Keyboard**: Inline buttons for vibe selection
- **Transitions**:
  - Button click → `onboarding:vibe_selected` → Show main menu

### 2. Challenge Creation Wizard
- **Trigger**: `/newchallenge`
- **Steps**:
  1. **Title Input** (state: `nc:title`)
    - Message: "What's your challenge title? (1-80 chars)"
    - Keyboard: `Skip` (optional)
  2. **Description Input** (state: `nc:description`)
    - Message: "Describe your challenge (≤500 chars)"
  3. **Reward Type Selection** (state: `nc:reward`)
    - Message: "Choose reward type"
    - Keyboard: 
      ```
      [Points] [Crypto] [Custom Token]
      ```
  4. **Reward Amount Input** (state: `nc:amount`)
    - Message: "Enter reward amount (≥1)"
  5. **Duration Selection** (state: `nc:duration`)
    - Message: "How long should this challenge last?"
    - Keyboard: 
      ```
      [3d] [7d] [14d] [30d] [Custom]
      ```
  6. **Verifier Count Selection** (state: `nc:verifiers`)
    - Message: "How many verifiers?"
    - Keyboard: 
      ```
      [1] [3]
      ```
  7. **Recurrence Selection** (state: `nc:recurrence`)
    - Message: "Should this challenge repeat?"
    - Keyboard: 
      ```
      [None] [Weekly] [Monthly]
      ```
  8. **Confirmation** (state: `nc:confirm`)
    - Message: "Confirm your challenge"
    - Keyboard: 
      ```
      [✅ Create]
      ```

### 3. Challenge Join Screen
- **Trigger**: `/join <challenge_id>` or inline "Join" button
- **Message**: 
  ```
  Challenge #<id> — <title>
  Reward: <reward_type> <amount>
  Duration: <duration_days> days
  [Join] [Back]
  ```
- **Transitions**:
  - `Join` → `join:started` → Evidence submission flow

### 4. Evidence Submission Flow
- **Trigger**: `/submit <challenge_id>` or inline "Submit" button
- **Steps**:
  1. **Media Type Selection** (state: `submit:type`)
    - Message: "What type of evidence?"
    - Keyboard: 
      ```
      [📷 Photo] [📄 Document] [📝 Text]
      ```
  2. **Media Upload** (state: `submit:media`)
    - Message: "Send your evidence (photo/document)"
  3. **Caption Input** (state: `submit:caption`)
    - Message: "Add an optional caption (≤200 chars)"
  4. **Submission Confirmation** (state: `submit:confirm`)
    - Message: "Submit evidence?"
    - Keyboard: 
      ```
      [✅ Submit] [Cancel]
      ```

### 5. Verification Queue
- **Trigger**: `/verify` or inline "Verify" button
- **Message**: 
  ```
  Verification Requests 📌
  [Approve: #123] [Reject: #123]
  [Approve: #456] [Reject: #456]
  ```
- **Keyboard**: Inline buttons for each pending verification

### 6. Stats Screen
- **Trigger**: `/stats`
- **Message**: 
  ```
  📊 Your Stats
  Reputation: <score> · Rank: #<rank>
  Accuracy: <accuracy>% · Streak: <streak>
  Points: <points> · Crypto: <amount>
  Avg verification time: <time> min
  ```
- **Keyboard**: `Back to Menu`

### 7. Leaderboard Screen
- **Trigger**: `/leaderboard`
- **Message**: 
  ```
  🏆 Top 20
  1. <Name> · <rep> rep · <acc>%
  ...
  You: #<your_rank> · <your_rep>
  ```
- **Keyboard**: `Back to Menu`

### 8. Group Season Creation
- **Trigger**: `/newseason` in group chat
- **Message**: 
  ```
  Create Season
  Name: [Input field]
  Duration: [Input field]
  Prize: [Currency] [Amount]
  [Create]
  ```

## COMPONENTS

### 1. Challenge Creation Wizard
- **Structure**: Multi-step form with inline keyboard navigation
- **Reusability**: Used in `/newchallenge` and recurring challenge creation
- **Validation**: 
  - Title: 1-80 chars
  - Description: ≤500 chars
  - Reward amount: ≥1
  - Duration: 1-365 days

### 2. Verification Queue
- **Structure**: Paginated list of pending verifications
- **Features**:
  - Approve/Reject buttons
  - Auto-refresh every 5 minutes
  - Filter by challenge type

### 3. Evidence Submission Flow
- **Structure**: Wizard with media handling
- **Constraints**:
  - Max 5 evidence submissions per session
  - Media stored in S3 (URL)
  - Text evidence limited to 200 chars

### 4. Leaderboard Component
- **Structure**: Ranked list with pagination
- **Data Source**: `v_leaderboard` SQL view
- **Sorting**: Descending by reputation score

### 5. Reputation Dialog
- **Structure**: Modal dialog showing verification history
- **Fields**:
  - Accuracy percentage
  - Total verifications
  - Recent verification timestamps

## TRANSITIONS

| Current State | Input | Next State | Side Effects |
|---------------|-------|------------|--------------|
| `onboarding:vibe` | Vibe button click | `main_menu` | Insert user record |
| `nc:title` | Text input | `nc:description` | Store title |
| `nc:reward` | `Crypto` selected | `nc:token` | Show token address prompt |
| `nc:confirm` | `Create` clicked | `challenge_created` | Deduct user balance, insert challenge |
| `join:started` | `Join` clicked | `submit:type` | Create session record |
| `submit:media` | Photo received | `submit:caption` | Store media URL |
| `submit:confirm` | `Submit` clicked | `evidence_submitted` | Insert evidence, notify verifiers |
| `verify:queue` | `Approve` clicked | `verification_complete` | Update evidence verdict, adjust reputation |
| `stats:view` | `Back` clicked | `main_menu` | None |
| `cron:tick` | 24h deadline reached | `session_failed` | Mark session failed, refund creator |

## DATA

### Entities & Fields

1. **User**
   - `telegram_id` (PK)
   - `name`
   - `reputation_score` (default 100)
   - `created_at`

2. **UserBalance**
   - `user_id` (FK)
   - `currency_type` (points/crypto/custom_token)
   - `token_address` (nullable)
   - `amount`

3. **Challenge**
   - `id` (PK)
   - `creator_id` (FK)
   - `title`
   - `description`
   - `reward_type`
   - `reward_amount`
   - `token_address`
   - `duration_days`
   - `verifier_count`
   - `status`
   - `deadline`
   - `recurrence`

4. **VerificationEvidence**
   - `id` (PK)
   - `challenge_id` (FK)
   - `user_id` (FK)
   - `kind` (photo/document/text)
   - `media_url`
   - `text_body`
   - `timestamp`
   - `verdict`
   - `verifier_id` (FK)
   - `verification_time`

5. **VerificationSession**
   - `id` (PK)
   - `user_id` (FK)
   - `challenge_id` (FK)
   - `start_date`
   - `end_date`
   - `current_streak`
   - `verified_status`

6. **GroupCompetition**
   - `id` (PK)
   - `group_chat_id`
   - `name`
   - `start_date`
   - `end_date`
   - `prize_pool_currency`
   - `prize_pool_token_address`
   - `prize_pool_amount`

### Constraints
- Unique constraint on `(user_id, challenge_id)` for sessions
- Foreign key constraints for all relationships
- `deadline` must be in future (validated on insert)
- `reward_amount` must not exceed user's balance

## Acceptance Notes

1. **Challenge Creation**
   - User must have sufficient balance for selected reward
   - Creator's balance is deducted immediately
   - Recurring challenges spawn new instances on completion

2. **Verification Flow**
   - Verifier cannot verify their own challenge
   - 3-verifier challenges use majority rule (tie → approve)
   - Verifier reputation updated atomically

3. **Deadline Management**
   - 24h reminders sent via DM
   - Failed sessions refund creator's reward
   - Recurring challenges auto-rollover if not cancelled

4. **Group Competitions**
   - Prize pool distributed equally to team members
   - Team creation must happen before season starts
   - Only group admins can create seasons

5. **Media Handling**
   - All media must be uploaded to S3
   - Telegram file IDs stored temporarily
   - Media URLs must be publicly accessible

6. **Reputation System**
   - +5 for correct verification
   - -1 for rejected evidence
   - Accuracy calculated as (approved / total) * 100

7. **Error Handling**
   - Insufficient balance → show error and refund
   - Invalid token address → reject submission
   - Duplicate evidence → overwrite with latest submission

8. **Security**
   - All commands require valid session
   - Admin commands require role check
   - Media URLs signed for S3 access

9. **Performance**
   - Leaderboard updates in real-time
   - Cron jobs run every 60s
   - Verification queue paginated (20 items per page)

10. **Localization**
    - All user-facing strings must be i18n-ready
    - Date/time formatting respects user locale
    - Currency symbols localized (e.g., $, €)