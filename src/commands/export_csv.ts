import { Composer, Context, InputFile } from "grammy";
import type { ExportCsvQuery } from "../services/export_csv";
import { getExportData, formatExportCsv } from "../services/export_csv";

export function createExportCsvComposer(query: ExportCsvQuery): Composer<Context> {
  const composer = new Composer<Context>();

  composer.command("export", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) return;

    const rows = await getExportData(query, userId);

    if (rows.length === 0) {
      await ctx.reply(
        "📋 *Export*\n\nYou don't have any challenge history yet.",
        { parse_mode: "MarkdownV2" },
      );
      return;
    }

    const csv = formatExportCsv(rows);
    const document = new InputFile(
      Buffer.from(csv, "utf-8"),
      "challenge_history.csv",
    );

    await ctx.reply(
      `📋 *Export*\n\nYour challenge history \\(${rows.length} entr${rows.length === 1 ? "y" : "ies"}\\) has been sent to your private messages\\.`,
      { parse_mode: "MarkdownV2" },
    );

    await ctx.api.sendDocument(userId, document, {
      caption: `📋 Your challenge history — ${rows.length} entr${rows.length === 1 ? "y" : "ies"}`,
    });
  });

  return composer;
}