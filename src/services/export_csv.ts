export interface ExportCsvRow {
  challenge_id: number;
  title: string;
  reward: string;
  status: string;
  verdict: string;
  verifier: string;
  submitted_at: string;
  verified_at: string;
  verification_time: string;
}

export interface ExportCsvQuery {
  findUserExportData(userId: number): Promise<ExportCsvRow[]>;
}

export const CSV_HEADER =
  "challenge_id,title,reward,status,verdict,verifier,submitted_at,verified_at,verification_time";

export async function getExportData(
  query: ExportCsvQuery,
  userId: number,
): Promise<ExportCsvRow[]> {
  return query.findUserExportData(userId);
}

export function formatExportCsv(rows: ExportCsvRow[]): string {
  const lines = [CSV_HEADER];
  for (const row of rows) {
    lines.push(escapeCsvRow(row));
  }
  return lines.join("\n");
}

function escapeCsvRow(row: ExportCsvRow): string {
  return [
    row.challenge_id,
    row.title,
    row.reward,
    row.status,
    row.verdict,
    row.verifier,
    row.submitted_at,
    row.verified_at,
    row.verification_time,
  ]
    .map((field) => csvEscape(String(field ?? "")))
    .join(",");
}

function csvEscape(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}