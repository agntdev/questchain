export type PrizeCurrency = "points" | "crypto" | "custom_token";

export interface GroupCompetition {
  id: number;
  group_chat_id: number;
  name: string;
  start_date: Date;
  end_date: Date;
  prize_pool_currency: PrizeCurrency;
  prize_pool_token_address: string | null;
  prize_pool_amount: number;
}

export function createCompetition(params: {
  id: number;
  group_chat_id: number;
  name: string;
  start_date: Date;
  end_date: Date;
  prize_pool_currency: PrizeCurrency;
  prize_pool_token_address: string | null;
  prize_pool_amount: number;
}): GroupCompetition {
  return {
    id: params.id,
    group_chat_id: params.group_chat_id,
    name: params.name,
    start_date: params.start_date,
    end_date: params.end_date,
    prize_pool_currency: params.prize_pool_currency,
    prize_pool_token_address: params.prize_pool_token_address,
    prize_pool_amount: params.prize_pool_amount,
  };
}