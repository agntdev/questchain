import { Composer, Context, InputFile } from "grammy";
import type { ExportQuery } from "../services/export";
import { getExportData, formatExportCsv } from "../services/export";

export function createExportComposer(query: ExportQuery): Composer<Context> {
  const composer = new Composer<Context>();

  composer.command("export", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) return;

    const entries = await getExportData(query, userId);

    if (entries.length === 0) {
      await ctx.reply("📭 No challenge history found for your account.");
      return;
    }

    const csv = formatExportCsv(entries);

    await ctx.replyWithDocument(
      new InputFile(csv, "challenge_history.csv"),
      {
        caption: `📊 Your challenge history (${entries.length} entries)`,
      },
    );
  });

  return composer;
}
