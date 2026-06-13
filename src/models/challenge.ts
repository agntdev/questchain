export type ChallengeStatus = "draft" | "active" | "completed" | "cancelled";

export type RewardType = "fixed" | "split";

export interface Challenge {
  id: number;
  creator_id: number;
  title: string;
  reward_type: RewardType;
  duration_days: number;
  verifier_count: number;
  status: ChallengeStatus;
  deadline: Date;
  created_at: Date;
}

export const DEFAULT_CHALLENGE_STATUS: ChallengeStatus = "draft";

export function createChallenge(params: {
  id: number;
  creator_id: number;
  title: string;
  reward_type: RewardType;
  duration_days: number;
  verifier_count: number;
  deadline: Date;
}): Challenge {
  return {
    id: params.id,
    creator_id: params.creator_id,
    title: params.title,
    reward_type: params.reward_type,
    duration_days: params.duration_days,
    verifier_count: params.verifier_count,
    status: DEFAULT_CHALLENGE_STATUS,
    deadline: params.deadline,
    created_at: new Date(),
  };
}
