# QuestChain Bot Design Document (GENERAL Phase)

## Summary
QuestChain is a Telegram bot that transforms personal goals into public micro-challenges with social accountability and gamification. It targets individuals seeking motivation through peer verification and groups wanting to run collaborative competitions. Users create time-bound challenges (e.g., "exercise 5 times this week"), stake points/crypto as rewards, and invite friends to verify completions via photo/screenshot/text evidence. The bot tracks streaks, leaderboards, and verifier reputation scores while enabling seasonal group competitions with pooled prizes.

## Core Entities
- **User**: Telegram account with profile (name, reputation score, staked balance)
- **Challenge**: Goal definition (title, description, reward type/amount, duration, status)
- **VerificationEvidence**: User-submitted proof (media/text, timestamp, challenge reference)
- **VerificationSession**: Temporary tracking of a user's challenge progress (start/end dates, current streak)
- **GroupCompetition**: Seasonal team-based event (name, start/end dates, prize pool, participant teams)
- **Leaderboard**: Aggregated rankings (individual/group, challenge completions, points earned)
- **ReputationRecord**: Verifier reliability metrics (accuracy score, verification history)

## Relationships
- Users create and participate in Challenges
- Challenges require VerificationEvidence submissions
- VerificationSessions link Users to Challenges
- Groups can host multiple GroupCompetitions
- Leaderboards aggregate data from Challenges and GroupCompetitions
- ReputationRecords track verification actions by Users

## External Dependencies
- **Telegram Bot API**: 
  - Inline keyboards for challenge creation/verification
  - Media handling (photos, documents)
  - Group chat management (invites, notifications)
  - Webhooks for real-time updates
- **Blockchain Integration**: 
  - Crypto reward staking/transfer (ERC-20 compatible tokens)
  - Smart contract for prize pool management (optional)
- **Cloud Storage**: 
  - S3-compatible service for storing verification media
- **Database**: 
  - Users table with `telegram_id`, `reputation_score`, `crypto_balance`
  - Challenges table with `challenge_id`, `creator_id`, `reward_type`, `deadline`
  - VerificationEvidence table with `evidence_id`, `challenge_id`, `user_id`, `media_url`, `timestamp`
  - GroupCompetitions table with `competition_id`, `prize_pool`, `start_date`, `end_date`
  - Sessions table tracking `user_id`, `challenge_id`, `current_streak`, `verified_status`

## Full Feature List
- Create custom time-bound challenges with title, description, and reward
- Stake points or crypto as challenge rewards
- Invite specific users to verify challenge completions
- Submit verification evidence (photo, text, or screenshot)
- Verify peer-submitted evidence with approval/rejection options
- Track individual challenge progress (streaks, deadlines)
- Maintain global and group-specific leaderboards
- Calculate and display user reputation scores based on verification accuracy
- Schedule recurring weekly/monthly challenges
- Create seasonal group competitions with prize pools
- Automatically distribute rewards upon successful verification
- Send deadline reminders and verification requests
- Display challenge statistics (completions, average verification time)
- Export challenge history as CSV
- Support multiple reward currencies (points, crypto, custom tokens)

## Non-Goals
- Not a full project management tool (no task delegation or Gantt charts)
- No built-in social media platform beyond verification evidence sharing
- No complex blockchain features beyond basic staking/transfer
- No cross-platform synchronization (limited to Telegram)
- No AI-based evidence validation (manual peer verification only)
- No integration with fitness/health APIs (evidence must be user-submitted)