export interface User {
  telegram_id: number;
  name: string;
  reputation_score: number;
  created_at: Date;
}

export const DEFAULT_REPUTATION_SCORE = 100;

export function createUser(params: {
  telegram_id: number;
  name: string;
}): User {
  return {
    telegram_id: params.telegram_id,
    name: params.name,
    reputation_score: DEFAULT_REPUTATION_SCORE,
    created_at: new Date(),
  };
}
