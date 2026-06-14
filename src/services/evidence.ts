import type { Evidence, EvidenceKind } from "../models/evidence";
import type { Challenge } from "../models/challenge";

export interface EvidenceSubmissionQuery {
  findChallenge(challengeId: number): Promise<Challenge | null>;
  hasActiveSession(userTelegramId: number, challengeId: number): Promise<boolean>;
  insertEvidence(params: {
    challengeId: number;
    userTelegramId: number;
    kind: EvidenceKind;
    mediaUrl: string | null;
    textBody: string | null;
  }): Promise<Evidence>;
}

export interface EvidenceSubmitResult {
  kind: "submitted" | "challenge_not_found" | "no_session" | "invalid_kind";
  evidence?: Evidence;
}

export function validateEvidenceKind(kind: string): kind is EvidenceKind {
  return kind === "photo" || kind === "document" || kind === "text";
}

export function validateSubmitArgs(args: {
  challengeId: string | undefined;
}):
  | { ok: true; challengeId: number }
  | { ok: false; error: string }
{
  if (!args.challengeId) {
    return { ok: false, error: "Challenge ID is required. Usage: /submit <challenge_id>" };
  }
  const challengeId = Number(args.challengeId);
  if (!Number.isInteger(challengeId) || challengeId <= 0) {
    return { ok: false, error: "Challenge ID must be a positive integer." };
  }
  return { ok: true, challengeId };
}

export async function submitEvidence(
  query: EvidenceSubmissionQuery,
  userTelegramId: number,
  challengeId: number,
  kind: EvidenceKind,
  mediaUrl: string | null,
  textBody: string | null,
): Promise<EvidenceSubmitResult> {
  if (!validateEvidenceKind(kind)) {
    return { kind: "invalid_kind" };
  }

  const challenge = await query.findChallenge(challengeId);
  if (!challenge) {
    return { kind: "challenge_not_found" };
  }

  const hasSession = await query.hasActiveSession(userTelegramId, challengeId);
  if (!hasSession) {
    return { kind: "no_session" };
  }

  const evidence = await query.insertEvidence({
    challengeId,
    userTelegramId,
    kind,
    mediaUrl,
    textBody,
  });

  return { kind: "submitted", evidence };
}

const KIND_LABELS: Record<EvidenceKind, string> = {
  photo: "Photo",
  document: "Document",
  text: "Text",
};

export function formatSubmitResult(result: EvidenceSubmitResult): string {
  switch (result.kind) {
    case "challenge_not_found":
      return "Challenge not found. Check the ID and try again.";

    case "no_session":
      return "You don't have an active session for this challenge. Join the challenge first!";

    case "invalid_kind":
      return "Invalid evidence type. Choose Photo, Document, or Text.";

    case "submitted":
      return (
        `*Evidence Submitted*\n\n` +
        `Challenge: #${result.evidence!.challenge_id}\n` +
        `Type: ${KIND_LABELS[result.evidence!.kind]}\n` +
        (result.evidence!.text_body ? `Caption: ${escapeMarkdown(result.evidence!.text_body)}\n` : "") +
        `Status: Pending verification`
      );

    default:
      return "Something went wrong.";
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}