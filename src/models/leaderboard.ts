export interface LeaderboardEntry {
  user_telegram_id: number;
  display_name: string;
  reputation_score: number;
  points_balance: number;
  crypto_balance: number;
  custom_token_balance: number;
  rank: number;
}

export const LEADERBOARD_PAGE_SIZE = 20;

export function createLeaderboardEntry(params: {
  user_telegram_id: number;
  display_name: string;
  reputation_score: number;
  points_balance: number;
  crypto_balance: number;
  custom_token_balance: number;
  rank: number;
}): LeaderboardEntry {
  return {
    user_telegram_id: params.user_telegram_id,
    display_name: params.display_name,
    reputation_score: params.reputation_score,
    points_balance: params.points_balance,
    crypto_balance: params.crypto_balance,
    custom_token_balance: params.custom_token_balance,
    rank: params.rank,
  };
}
