export type EvidenceKind = "photo" | "document" | "text";

export type Verdict = "pending" | "approved" | "rejected";

export interface Evidence {
  id: number;
  challenge_id: number;
  user_telegram_id: number;
  kind: EvidenceKind;
  media_url: string | null;
  text_body: string | null;
  timestamp: Date;
  verdict: Verdict;
  verifier_telegram_id: number | null;
  verification_time: Date | null;
}

export const DEFAULT_VERDICT: Verdict = "pending";

export function createEvidence(params: {
  id: number;
  challenge_id: number;
  user_telegram_id: number;
  kind: EvidenceKind;
  media_url?: string | null;
  text_body?: string | null;
}): Evidence {
  return {
    id: params.id,
    challenge_id: params.challenge_id,
    user_telegram_id: params.user_telegram_id,
    kind: params.kind,
    media_url: params.media_url ?? null,
    text_body: params.text_body ?? null,
    timestamp: new Date(),
    verdict: DEFAULT_VERDICT,
    verifier_telegram_id: null,
    verification_time: null,
  };
}