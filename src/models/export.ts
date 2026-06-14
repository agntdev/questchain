export interface ExportEntry {
  challenge_id: number;
  challenge_title: string;
  start_date: Date;
  end_date: Date | null;
  current_streak: number;
  verified_status: string;
  reward_type: string;
  reward_amount: number;
  challenge_status: string;
  duration_days: number;
  deadline: Date;
}

export function createExportEntry(params: {
  challenge_id: number;
  challenge_title: string;
  start_date: Date;
  end_date: Date | null;
  current_streak: number;
  verified_status: string;
  reward_type: string;
  reward_amount: number;
  challenge_status: string;
  duration_days: number;
  deadline: Date;
}): ExportEntry {
  return {
    challenge_id: params.challenge_id,
    challenge_title: params.challenge_title,
    start_date: params.start_date,
    end_date: params.end_date,
    current_streak: params.current_streak,
    verified_status: params.verified_status,
    reward_type: params.reward_type,
    reward_amount: params.reward_amount,
    challenge_status: params.challenge_status,
    duration_days: params.duration_days,
    deadline: params.deadline,
  };
}
