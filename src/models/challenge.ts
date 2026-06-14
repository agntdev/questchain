export type ChallengeStatus = "draft" | "active" | "completed" | "cancelled";

export type RewardType = "points" | "crypto" | "custom_token";

export interface Challenge {
  id: number;
  creator_id: number;
  title: string;
  description: string;
  reward_type: RewardType;
  reward_amount: number;
  token_address: string | null;
  duration_days: number;
  verifier_count: number;
  status: ChallengeStatus;
  deadline: Date;
  created_at: Date;
  recurrence: string;
}

export const DEFAULT_CHALLENGE_STATUS: ChallengeStatus = "draft";

export function createChallenge(params: {
  id: number;
  creator_id: number;
  title: string;
  description: string;
  reward_type: RewardType;
  reward_amount: number;
  token_address: string | null;
  duration_days: number;
  verifier_count: number;
  deadline: Date;
  recurrence: string;
}): Challenge {
  return {
    id: params.id,
    creator_id: params.creator_id,
    title: params.title,
    description: params.description,
    reward_type: params.reward_type,
    reward_amount: params.reward_amount,
    token_address: params.token_address,
    duration_days: params.duration_days,
    verifier_count: params.verifier_count,
    status: DEFAULT_CHALLENGE_STATUS,
    deadline: params.deadline,
    created_at: new Date(),
    recurrence: params.recurrence,
  };
}
