import type { ExportEntry } from "../models/export";

export interface ExportQuery {
  historyForUser(userId: number): Promise<ExportEntry[]>;
}

export async function getExportData(
  query: ExportQuery,
  userId: number,
): Promise<ExportEntry[]> {
  return query.historyForUser(userId);
}

export function formatExportCsv(entries: ExportEntry[]): string {
  const header = [
    "challenge_id",
    "challenge_title",
    "start_date",
    "end_date",
    "current_streak",
    "verified_status",
    "reward_type",
    "reward_amount",
    "challenge_status",
    "duration_days",
    "deadline",
  ];

  const rows = entries.map((e) =>
    [
      e.challenge_id,
      csvEscape(e.challenge_title),
      fmtDate(e.start_date),
      fmtDate(e.end_date),
      e.current_streak,
      e.verified_status,
      e.reward_type,
      e.reward_amount,
      e.challenge_status,
      e.duration_days,
      fmtDate(e.deadline),
    ].join(","),
  );

  return [header.join(","), ...rows].join("\n") + "\n";
}

function fmtDate(d: Date | null): string {
  if (d == null) return "";
  return d.toISOString();
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
