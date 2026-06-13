# QuestChain Bot Design Document (DETAILS Phase)

## SCREENS

### 1. My Challenges Screen
- **Trigger**: `/mychallenges`
- **Message**: 
  ```
  🎯 Your Challenges
  [Active Challenges] [Past Challenges]
  ```
- **Transitions**:
  - `Active Challenges` → `mychallenges:active`
  - `Past Challenges` → `mychallenges:history`

### 2. Team Joining Screen
- **Trigger**: `/jointeam <team_name>` or inline button
- **Message**: 
  ```
  Join Team <team_name>
  [Confirm Join] [Back]
  ```
- **Transitions**:
  - `Confirm Join` → `team:joined` (create team_member record)

### 3. Team Standings Screen
- **Trigger**: `/standings`
- **Message**: 
  ```
  🏆 Season Standings
  1. <Team A> · 150 points · 3 members
  2. <Team B> · 120 points · 4 members
  ...
  ```
- **Keyboard**: `Back to Menu`

### 4. CSV Export Screen
- **Trigger**: `/export`
- **Message**: 
  ```
  📥 Exporting your challenge history...
  (generating CSV)
  ```
- **Transitions**:
  - On success → send CSV file via DM

### 5. Admin Credit Screen
- **Trigger**: `/admin_credit <user> <currency> <amount> <reason>`
- **Message**: 
  ```
  💰 Crediting <user> with <amount> <currency>
  Reason: <reason>
  [Confirm] [Cancel]
  ```

### 6. Admin Cancel Screen
- **Trigger**: `/admin_cancel <challenge_id>`
- **Message**: 
  ```
  ⚠️ Cancel Challenge #<id>?
  This will refund all stakes
  [Confirm Cancel] [Cancel]
  ```

## COMPONENTS

### 1. Team Joining Form
- **Structure**: Input field for team name with validation
- **Constraints**: 
  - Team must exist in current competition
  - User must not already be in a team
  - Team must have open slots

### 2. Team Standings Table
- **Structure**: Paginated list of teams with:
  - Team name
  - Member count
  - Total points
  - Rank position
- **Sorting**: Descending by total points

### 3. Challenge History Table
- **Structure**: Two tabs (Active/Past) with:
  - Challenge title
  - Status (Active/Completed/Failed)
  - Reward amount
  - Verification status

### 4. CSV Exporter
- **Structure**: Background task that:
  - Queries user's challenge history
  - Formats as CSV with headers:
    `challenge_id,title,reward,status,verdict,verifier,submitted_at`
  - Sends file via DM with "Here's your history" message

### 5. Admin Command Dialog
- **Structure**: Confirmation modal for:
  - Credit amount validation
  - Challenge cancellation confirmation
  - Role-based access control (only admins)

## TRANSITIONS

| Current State | Input | Next State | Side Effects |
|---------------|-------|------------|--------------|
| `mychallenges:active` | `Challenge #123` clicked | `challenge:details` | Show challenge details |
| `team:join` | `Confirm` clicked | `team:joined` | Insert team_member record |
| `standings:view` | `Team A` clicked | `team:details` | Show team members and stats |
| `export:start` | `Confirm` clicked | `export:complete` | Generate and send CSV |
| `admin:credit` | `Confirm` clicked | `admin:credited` | Update user_balance |
| `admin:cancel` | `Confirm` clicked | `admin:cancelled` | Mark challenge as cancelled, refund balances |

## DATA

### New Entities & Fields

1. **TeamMember**
   - `team_id` (FK→teams)
   - `user_id` (FK→users)
   - `joined_at` (timestamp)
   - Unique constraint on `(team_id, user_id)`

2. **Team**
   - `competition_id` (FK→competitions)
   - `name` (unique per competition)
   - `captain_id` (FK→users)
   - `max_members` (default 5)

### Constraints
- TeamMember: user can only join one team per competition
- Challenge: creator must have sufficient balance for reward
- Team: max members enforced by `max_members` field

## Acceptance Notes

1. **Team Management**
   - `/jointeam` must validate team existence and open slots
   - Team standings must update in real-time with member points
   - Team captains can only create teams in active competitions

2. **Challenge History**
   - `/mychallenges` must show active and past challenges with status
   - Past challenges include completion status and verification details
   - Filtering by reward type and verification status

3. **CSV Export**
   - Export includes all user's challenges with verification data
   - File sent via DM with 24h expiration
   - Only user's own data included (privacy compliance)

4. **Admin Commands**
   - `/admin_credit` requires admin role and valid currency
   - `/admin_cancel` refunds all staked rewards to creator
   - Admin actions logged in reputation_log with "admin" reason

5. **Group Competitions**
   - `/newseason` creates competition with prize pool
   - Team standings auto-updated when members complete challenges
   - Prize pool distributed equally to team members at season end

6. **Error Handling**
   - Invalid team name → "Team not found" error
   - Non-admin using admin commands → access denied
   - CSV export failure → retry mechanism with 3 attempts

7. **Security**
   - Team joining requires competition ID validation
   - Admin commands require role check in database
   - CSV export uses temporary signed URLs for S3 access

8. **Performance**
   - Team standings refresh every 5 minutes
   - Challenge history pagination (20 items per page)
   - Admin commands execute in <500ms with transaction rollback on error

9. **Localization**
   - Team names and competition titles stored in original language
   - Points displayed with localized number formatting
   - CSV export uses user's locale for date/time formatting

10. **Edge Cases**
    - Team with zero members → hidden from standings
    - Admin credit to non-existent user → error with suggestion
    - Challenge with all verifiers offline → auto-rollover to next day