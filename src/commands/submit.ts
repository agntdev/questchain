import { Composer, Context, InlineKeyboard } from "grammy";
import type { EvidenceSubmissionQuery, EvidenceSubmissionData } from "../services/evidence_submission";
import {
  emptySubmissionData,
  validateKind,
  validateCaption,
  buildEvidenceTextBody,
  formatConfirmationCard,
  formatSubmissionResult,
} from "../services/evidence_submission";

const CB_PREFIX = "submit:";
const CB_PHOTO = `${CB_PREFIX}kind:photo`;
const CB_DOCUMENT = `${CB_PREFIX}kind:document`;
const CB_TEXT = `${CB_PREFIX}kind:text`;
const CB_CONFIRM = `${CB_PREFIX}confirm`;
const CB_CANCEL = `${CB_PREFIX}cancel`;

export function createSubmitComposer(query: EvidenceSubmissionQuery): Composer<Context> {
  const composer = new Composer<Context>();

  const sessions = new Map<number, EvidenceSubmissionData>();

  composer.command("submit", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) return;

    const text = ctx.message?.text ?? "";
    const parts = text.split(/\s+/).slice(1);

    if (parts.length < 1) {
      await ctx.reply(
        "Usage: /submit <challenge_id>\n\n" +
          "Submit evidence (photo, document, or text) for an active challenge.",
      );
      return;
    }

    const challengeId = Number(parts[0]);
    if (!Number.isInteger(challengeId) || challengeId < 1) {
      await ctx.reply("⚠️ Invalid challenge ID. Please provide a positive number.");
      return;
    }

    const challenge = await query.findChallengeById(challengeId);
    if (!challenge) {
      await ctx.reply("⚠️ Challenge not found. Check the ID and try again.");
      return;
    }

    if (challenge.status !== "active") {
      await ctx.reply(
        `⚠️ Challenge #${challengeId} is ${challenge.status}. Only active challenges accept evidence.`,
      );
      return;
    }

    const count = await query.countEvidenceForSession(challengeId, userId);
    if (count >= 5) {
      await ctx.reply(
        "⚠️ You've reached the maximum of 5 evidence submissions for this challenge.",
      );
      return;
    }

    const data = emptySubmissionData(challengeId);
    sessions.set(userId, data);

    const keyboard = new InlineKeyboard()
      .text("📷 Photo", CB_PHOTO)
      .text("📄 Document", CB_DOCUMENT)
      .text("📝 Text", CB_TEXT);

    await ctx.reply(
      `📎 *Submit Evidence for Challenge \\#${challengeId}*\n\n` +
        `*${escapeMarkdown(challenge.title)}*\n\n` +
        "What kind of evidence would you like to submit?",
      {
        parse_mode: "MarkdownV2",
        reply_markup: keyboard,
      },
    );
  });

  composer.callbackQuery(new RegExp(`^${CB_PREFIX}`), async (ctx) => {
    const userId = ctx.from.id;
    const data = sessions.get(userId);
    if (!data) {
      await ctx.answerCallbackQuery({ text: "Session expired. Use /submit <challenge_id> to start." });
      return;
    }

    const cb = ctx.callbackQuery.data;

    if (cb === CB_CANCEL) {
      sessions.delete(userId);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("🚫 Evidence submission cancelled.");
      return;
    }

    if (data.step === "choose_type") {
      let kind: string | null = null;
      if (cb === CB_PHOTO) kind = "photo";
      else if (cb === CB_DOCUMENT) kind = "document";
      else if (cb === CB_TEXT) kind = "text";

      if (kind && validateKind(kind)) {
        data.kind = kind;
        data.step = "media";

        await ctx.answerCallbackQuery();

        if (kind === "text") {
          await ctx.editMessageText(
            "📝 *Text Evidence*\n\n" +
              "Please type your evidence text now.\n" +
              "_Up to 500 characters._",
            { parse_mode: "MarkdownV2" },
          );
        } else {
          const kindLabel = kind === "photo" ? "photo" : "document";
          await ctx.editMessageText(
            `📎 *${kindLabel === "photo" ? "Photo" : "Document"} Evidence*\n\n` +
              `Please send your ${kindLabel} now.`,
            { parse_mode: "MarkdownV2" },
          );
        }
      } else {
        await ctx.answerCallbackQuery();
      }
      return;
    }

    if (data.step === "confirm" && cb === CB_CONFIRM) {
      sessions.delete(userId);

      try {
        const mediaUrl = data.file_id
          ? await resolveMediaUrl(ctx, data.file_id)
          : null;

        const textBody = buildEvidenceTextBody(data);

        const evidence = await query.insertEvidence({
          challenge_id: data.challenge_id,
          user_telegram_id: userId,
          kind: data.kind!,
          media_url: mediaUrl,
          text_body: textBody,
        });

        const message = formatSubmissionResult(evidence);
        await ctx.editMessageText(message, { parse_mode: "MarkdownV2" });
      } catch {
        await ctx.editMessageText(
          "⚠️ Failed to submit evidence. Please try again with /submit <challenge_id>.",
          { parse_mode: "MarkdownV2" },
        );
      }
    }
  });

  composer.on(":photo", async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId == null) return next();

    const data = sessions.get(userId);
    if (!data || data.step !== "media" || data.kind !== "photo") return next();

    const photo = ctx.message?.photo;
    if (!photo || photo.length === 0) return next();

    const fileId = photo[photo.length - 1].file_id;
    data.file_id = fileId;
    data.step = "caption";

    await ctx.reply(
      "✅ Photo received\\!\n\n" +
        "*Caption (optional):* Type a caption for your evidence \\(up to 200 chars\\), or tap *Skip* to continue\\.",
      {
        parse_mode: "MarkdownV2",
        reply_markup: new InlineKeyboard().text("⏭ Skip", CB_CONFIRM),
      },
    );
  });

  composer.on(":document", async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId == null) return next();

    const data = sessions.get(userId);
    if (!data || data.step !== "media" || data.kind !== "document") return next();

    const fileId = ctx.message?.document?.file_id;
    if (!fileId) return next();

    data.file_id = fileId;
    data.step = "caption";

    await ctx.reply(
      "✅ Document received\\!\n\n" +
        "*Caption (optional):* Type a caption for your evidence \\(up to 200 chars\\), or tap *Skip* to continue\\.",
      {
        parse_mode: "MarkdownV2",
        reply_markup: new InlineKeyboard().text("⏭ Skip", CB_CONFIRM),
      },
    );
  });

  composer.on("msg:text", async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId == null) return next();

    const data = sessions.get(userId);
    if (!data) return next();

    if (!ctx.message || !("text" in ctx.message)) return next();
    const text = ctx.message.text;

    if (data.step === "media" && data.kind === "text") {
      const trimmed = text.trim();
      if (trimmed.length === 0) {
        await ctx.reply("⚠️ Please enter some text for your evidence.");
        return;
      }
      if (trimmed.length > 500) {
        await ctx.reply("⚠️ Evidence text must be 500 characters or fewer.");
        return;
      }
      data.text_body = trimmed;
      data.step = "confirm";

      const message = formatConfirmationCard(data);
      const keyboard = new InlineKeyboard()
        .text("✅ Submit", CB_CONFIRM)
        .text("🚫 Cancel", CB_CANCEL);

      await ctx.reply(message, {
        parse_mode: "MarkdownV2",
        reply_markup: keyboard,
      });
      return;
    }

    if (data.step === "caption") {
      const result = validateCaption(text);
      if (!result.ok) {
        await ctx.reply(`⚠️ ${result.error}`);
        return;
      }
      data.caption = result.caption;
      data.step = "confirm";

      const message = formatConfirmationCard(data);
      const keyboard = new InlineKeyboard()
        .text("✅ Submit", CB_CONFIRM)
        .text("🚫 Cancel", CB_CANCEL);

      await ctx.reply(message, {
        parse_mode: "MarkdownV2",
        reply_markup: keyboard,
      });
      return;
    }

    return next();
  });

  return composer;
}

async function resolveMediaUrl(ctx: Context, fileId: string): Promise<string> {
  try {
    const file = await ctx.api.getFile(fileId);
    if (file.file_path) {
      return `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
    }
  } catch {
    // fall through
  }
  return fileId;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}