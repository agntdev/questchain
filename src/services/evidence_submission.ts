import type { Challenge } from "../models/challenge";
import type { Evidence, EvidenceKind } from "../models/evidence";

export type SubmissionStep = "choose_type" | "media" | "caption" | "confirm";

export interface EvidenceSubmissionData {
  step: SubmissionStep;
  challenge_id: number;
  kind: EvidenceKind | null;
  file_id: string | null;
  text_body: string | null;
  caption: string | null;
}

export function emptySubmissionData(challengeId: number): EvidenceSubmissionData {
  return {
    step: "choose_type",
    challenge_id: challengeId,
    kind: null,
    file_id: null,
    text_body: null,
    caption: null,
  };
}

export interface EvidenceSubmissionQuery {
  findChallengeById(id: number): Promise<Challenge | null>;

  insertEvidence(params: {
    challenge_id: number;
    user_telegram_id: number;
    kind: EvidenceKind;
    media_url: string | null;
    text_body: string | null;
  }): Promise<Evidence>;

  countEvidenceForSession(
    challengeId: number,
    userId: number,
  ): Promise<number>;
}

export function validateKind(kind: string): kind is EvidenceKind {
  return kind === "photo" || kind === "document" || kind === "text";
}

export function validateCaption(
  caption: string,
): { ok: true; caption: string } | { ok: false; error: string } {
  const trimmed = caption.trim();
  if (trimmed.length > 200) {
    return { ok: false, error: "Caption must be 200 characters or fewer." };
  }
  return { ok: true, caption: trimmed };
}

export function buildEvidenceTextBody(
  data: EvidenceSubmissionData,
): string | null {
  if (data.kind === "text") {
    return data.text_body ?? null;
  }
  if (data.caption) {
    return data.caption;
  }
  return null;
}

export function formatConfirmationCard(data: EvidenceSubmissionData): string {
  const kindLabel =
    data.kind === "photo" ? "Photo" : data.kind === "document" ? "Document" : "Text";

  const lines = [
    "📎 *Evidence Submission — Confirmation*",
    "",
    `*Challenge ID:* ${data.challenge_id}`,
    `*Type:* ${kindLabel}`,
  ];

  if (data.kind === "text" && data.text_body) {
    lines.push(
      `*Text:* ${escapeMarkdown(data.text_body.substring(0, 100))}${data.text_body.length > 100 ? "…" : ""}`,
    );
  } else if (data.file_id) {
    lines.push("*Media:* attached");
  }

  if (data.caption) {
    lines.push(`*Caption:* ${escapeMarkdown(data.caption)}`);
  }

  return lines.join("\n");
}

export function formatSubmissionResult(evidence: Evidence): string {
  return [
    "✅ *Evidence Submitted\\!*",
    "",
    `*Submission \\#${evidence.id}*`,
    `*Challenge \\#${evidence.challenge_id}*`,
    `*Type:* ${evidence.kind}`,
    "",
    "Your evidence is now pending verification\\.",
  ].join("\n");
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}