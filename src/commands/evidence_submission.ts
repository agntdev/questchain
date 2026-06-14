import { Composer, Context, InlineKeyboard } from "grammy";
import type { EvidenceKind } from "../models/evidence";
import type { EvidenceSubmissionQuery } from "../services/evidence";
import {
  validateSubmitArgs,
  submitEvidence,
  formatSubmitResult,
} from "../services/evidence";

const CB_SUBMIT_TYPE = "sub:k:";
const CB_SUBMIT_CANCEL = "sub:cancel";

const KIND_LABELS: Record<EvidenceKind, string> = {
  photo: "Photo",
  document: "Document",
  text: "Text",
};

interface PendingSubmission {
  challengeId: number;
  kind: EvidenceKind;
  step: "media" | "caption";
  fileId?: string;
}

const pendingSubmissions = new Map<number, PendingSubmission>();

export function createEvidenceSubmissionComposer(
  query: EvidenceSubmissionQuery,
): Composer<Context> {
  const composer = new Composer<Context>();

  composer.command("submit", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) return;

    const text = ctx.message?.text ?? "";
    const parts = text.split(/\s+/).slice(1);

    const validation = validateSubmitArgs({ challengeId: parts[0] });
    if (!validation.ok) {
      await ctx.reply(`\u26a0\ufe0f ${validation.error}`);
      return;
    }

    const challenge = await query.findChallenge(validation.challengeId);
    if (!challenge) {
      await ctx.reply("\u26a0\ufe0f Challenge not found. Check the ID and try again.");
      return;
    }

    pendingSubmissions.set(userId, {
      challengeId: validation.challengeId,
      kind: "text",
      step: "caption",
    });

    const keyboard = new InlineKeyboard()
      .text("\ud83d\udcf7 Photo", `${CB_SUBMIT_TYPE}photo`).row()
      .text("\ud83d\udcc4 Document", `${CB_SUBMIT_TYPE}document`).row()
      .text("\ud83d\udcdd Text", `${CB_SUBMIT_TYPE}text`).row()
      .text("\u274c Cancel", CB_SUBMIT_CANCEL);

    await ctx.reply(
      `*Submit Evidence for Challenge #${validation.challengeId}*\n\n` +
        `_${escapeMarkdown(challenge.title)}_\n\n` +
        `Choose the type of evidence:`,
      { parse_mode: "MarkdownV2", reply_markup: keyboard },
    );
  });

  composer.callbackQuery(CB_SUBMIT_CANCEL, async (ctx) => {
    const userId = ctx.from.id;
    pendingSubmissions.delete(userId);
    await ctx.answerCallbackQuery({ text: "Submission cancelled." });
    await ctx.editMessageText(
      "\u274c Evidence submission cancelled.",
      { parse_mode: "MarkdownV2" },
    );
  });

  composer.callbackQuery(/^sub:k:/, async (ctx) => {
    const userId = ctx.from.id;
    const pending = pendingSubmissions.get(userId);
    if (!pending) {
      await ctx.answerCallbackQuery({
        text: "No active submission. Use /submit first.",
        show_alert: true,
      });
      return;
    }

    const kind = ctx.callbackQuery.data.slice(CB_SUBMIT_TYPE.length) as EvidenceKind;
    if (kind !== "photo" && kind !== "document" && kind !== "text") {
      await ctx.answerCallbackQuery({ text: "Invalid type.", show_alert: true });
      return;
    }

    pending.kind = kind;

    if (kind === "text") {
      pending.step = "caption";

      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `*Submit Evidence \u2014 Text*\n\n` +
          `Challenge #${pending.challengeId}\n\n` +
          `Send your evidence as a text message.\n\n` +
          `_Use /cancel to abort submission._`,
        { parse_mode: "MarkdownV2" },
      );
    } else {
      pending.step = "media";

      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `*Submit Evidence \u2014 ${KIND_LABELS[kind]}*\n\n` +
          `Challenge #${pending.challengeId}\n\n` +
          `Send your ${kind} now.\n\n` +
          `_Use /cancel to abort submission._`,
        { parse_mode: "MarkdownV2" },
      );
    }
  });

  composer.command("cancel", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) return;

    if (pendingSubmissions.has(userId)) {
      pendingSubmissions.delete(userId);
      await ctx.reply("\u274c Evidence submission cancelled.");
    } else {
      await ctx.reply("No active submission to cancel.");
    }
  });

  composer.on(":photo", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) return;

    const pending = pendingSubmissions.get(userId);
    if (!pending || pending.kind !== "photo" || pending.step !== "media") return;

    const photo = ctx.message?.photo;
    if (!photo || photo.length === 0) return;

    const fileId = photo[photo.length - 1].file_id;
    pending.fileId = fileId;
    pending.step = "caption";

    await ctx.reply(
      `*Add a Caption*\n\n` +
        `Send a caption for your photo evidence, or send "done" to submit without one.\n\n` +
        `_Use /cancel to abort submission._`,
      { parse_mode: "MarkdownV2" },
    );
  });

  composer.on(":document", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) return;

    const pending = pendingSubmissions.get(userId);
    if (!pending || pending.kind !== "document" || pending.step !== "media") return;

    const document = ctx.message?.document;
    if (!document) return;

    const fileId = document.file_id;
    pending.fileId = fileId;
    pending.step = "caption";

    await ctx.reply(
      `*Add a Caption*\n\n` +
        `Send a caption for your document evidence, or send "done" to submit without one.\n\n` +
        `_Use /cancel to abort submission._`,
      { parse_mode: "MarkdownV2" },
    );
  });

  composer.on("message:text", async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId == null) {
      await next();
      return;
    }

    const pending = pendingSubmissions.get(userId);
    if (!pending || pending.step !== "caption") {
      await next();
      return;
    }

    const textBody = ctx.message?.text ?? "";
    if (textBody.startsWith("/")) {
      await next();
      return;
    }

    if (pending.kind === "text") {
      const result = await submitEvidence(
        query,
        userId,
        pending.challengeId,
        "text",
        null,
        textBody,
      );
      pendingSubmissions.delete(userId);
      await ctx.reply(formatSubmitResult(result), { parse_mode: "MarkdownV2" });
      return;
    }

    const caption = textBody === "done" ? null : textBody;
    const result = await submitEvidence(
      query,
      userId,
      pending.challengeId,
      pending.kind,
      pending.fileId ?? null,
      caption,
    );
    pendingSubmissions.delete(userId);
    await ctx.reply(formatSubmitResult(result), { parse_mode: "MarkdownV2" });
  });

  return composer;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}