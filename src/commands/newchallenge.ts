import { Composer, Context, InlineKeyboard } from "grammy";
import type { ChallengeCreationQuery, ChallengeCreationData, CreationStep } from "../services/challenge_creation";
import {
  emptyCreationData,
  validateTitle,
  validateDescription,
  validateDuration,
  validateRewardAmount,
  validateTokenAddress,
  formatConfirmationMessage,
} from "../services/challenge_creation";

const CB_PREFIX = "nc:";
const CB_REWARD_POINTS = `${CB_PREFIX}reward_points`;
const CB_REWARD_CRYPTO = `${CB_PREFIX}reward_crypto`;
const CB_REWARD_CUSTOM = `${CB_PREFIX}reward_custom`;
const CB_DURATION_3 = `${CB_PREFIX}dur_3`;
const CB_DURATION_7 = `${CB_PREFIX}dur_7`;
const CB_DURATION_14 = `${CB_PREFIX}dur_14`;
const CB_DURATION_30 = `${CB_PREFIX}dur_30`;
const CB_VERIFIER_1 = `${CB_PREFIX}vf_1`;
const CB_VERIFIER_3 = `${CB_PREFIX}vf_3`;
const CB_RECUR_NONE = `${CB_PREFIX}rec_none`;
const CB_RECUR_WEEKLY = `${CB_PREFIX}rec_weekly`;
const CB_RECUR_MONTHLY = `${CB_PREFIX}rec_monthly`;
const CB_CONFIRM = `${CB_PREFIX}confirm`;
const CB_CANCEL = `${CB_PREFIX}cancel`;

export function createNewChallengeComposer(query: ChallengeCreationQuery): Composer<Context> {
  const composer = new Composer<Context>();

  const sessions = new Map<number, ChallengeCreationData>();

  composer.command("newchallenge", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) return;

    const data = emptyCreationData();
    sessions.set(userId, data);

    await ctx.reply(
      "⚔️ *Create a New Challenge*\n\n" +
        "Let's set up your challenge step by step.\n\n" +
        "*Step 1 of 8:* What's the title of your challenge?\n" +
        "_1–80 characters_",
      { parse_mode: "MarkdownV2" },
    );
  });

  composer.on("msg:text", async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId == null) return next();

    const data = sessions.get(userId);
    if (!data) return next();

    if (!ctx.message || !("text" in ctx.message)) return next();
    const text = ctx.message.text;

    if (data.step === "title") {
      const result = validateTitle(text);
      if (!result.ok) {
        await ctx.reply(`⚠️ ${result.error}`, { parse_mode: "MarkdownV2" });
        return;
      }
      data.title = result.title;
      data.step = "description";

      await ctx.reply(
        `✅ *Title:* ${escapeMarkdown(data.title)}\n\n` +
          "*Step 2 of 8:* Describe your challenge.\n" +
          "_Optional, up to 500 characters_",
        { parse_mode: "MarkdownV2" },
      );
      return;
    }

    if (data.step === "description") {
      const result = validateDescription(text);
      if (!result.ok) {
        await ctx.reply(`⚠️ ${result.error}`, { parse_mode: "MarkdownV2" });
        return;
      }
      data.description = result.description;
      data.step = "reward_type";

      const keyboard = new InlineKeyboard()
        .text("🪙 Points", CB_REWARD_POINTS)
        .text("💎 Crypto", CB_REWARD_CRYPTO)
        .text("🪪 Custom Token", CB_REWARD_CUSTOM);

      await ctx.reply(
        "*Step 3 of 8:* Choose the reward type\\.",
        {
          parse_mode: "MarkdownV2",
          reply_markup: keyboard,
        },
      );
      return;
    }

    if (data.step === "reward_amount") {
      const amount = Number(text);
      const result = validateRewardAmount(amount);
      if (!result.ok) {
        await ctx.reply(`⚠️ ${result.error}`, { parse_mode: "MarkdownV2" });
        return;
      }
      data.reward_amount = result.amount;

      if (data.reward_type === "custom_token") {
        data.step = "token_address";
        await ctx.reply(
          "*Step 4 of 8:* Enter the token contract address\\.",
          { parse_mode: "MarkdownV2" },
        );
      } else {
        data.step = "duration";
        await showDurationPicker(ctx);
      }
      return;
    }

    if (data.step === "token_address") {
      const result = validateTokenAddress(data.reward_type, text);
      if (!result.ok) {
        await ctx.reply(`⚠️ ${result.error}`, { parse_mode: "MarkdownV2" });
        return;
      }
      data.token_address = result.address;
      data.step = "duration";

      await showDurationPicker(ctx);
      return;
    }

    if (data.step === "duration") {
      const days = Number(text);
      const result = validateDuration(days);
      if (!result.ok) {
        await ctx.reply(`⚠️ ${result.error}`, { parse_mode: "MarkdownV2" });
        return;
      }
      data.duration_days = result.days;
      data.step = "verifier_count";

      const keyboard = new InlineKeyboard()
        .text("1 verifier", CB_VERIFIER_1)
        .text("3 verifiers", CB_VERIFIER_3);

      await ctx.reply(
        "*Step 6 of 8:* How many verifiers?\n" +
          "_1 verifier is simpler; 3 verifiers use majority vote for higher\\-stakes challenges\\._",
        {
          parse_mode: "MarkdownV2",
          reply_markup: keyboard,
        },
      );
      return;
    }

    return next();
  });

  composer.callbackQuery(new RegExp(`^${CB_PREFIX}`), async (ctx) => {
    const userId = ctx.from.id;
    const data = sessions.get(userId);
    if (!data) {
      await ctx.answerCallbackQuery({ text: "Session expired. Use /newchallenge to start." });
      return;
    }

    const cb = ctx.callbackQuery.data;

    if (cb === CB_CANCEL) {
      sessions.delete(userId);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("🚫 Challenge creation cancelled\\.");
      return;
    }

    if (data.step === "reward_type") {
      if (cb === CB_REWARD_POINTS) data.reward_type = "points";
      else if (cb === CB_REWARD_CRYPTO) data.reward_type = "crypto";
      else if (cb === CB_REWARD_CUSTOM) data.reward_type = "custom_token";
      else {
        await ctx.answerCallbackQuery();
        return;
      }

      data.step = "reward_amount";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `*Reward type:* ${data.reward_type}\n\n` +
          "*Step 4 of 8:* Enter the reward amount.\n" +
          "_Must be a positive integer_",
        { parse_mode: "MarkdownV2" },
      );
      return;
    }

    if (data.step === "duration") {
      const durMap: Record<string, number> = {
        [CB_DURATION_3]: 3,
        [CB_DURATION_7]: 7,
        [CB_DURATION_14]: 14,
        [CB_DURATION_30]: 30,
      };
      const days = durMap[cb];
      if (days) {
        data.duration_days = days;
        data.step = "verifier_count";

        await ctx.answerCallbackQuery();
        const keyboard = new InlineKeyboard()
          .text("1 verifier", CB_VERIFIER_1)
          .text("3 verifiers", CB_VERIFIER_3);

        await ctx.editMessageText(
          `*Duration:* ${days} day(s)\n\n` +
            "*Step 6 of 8:* How many verifiers?\n" +
            "_1 verifier is simpler; 3 verifiers use majority vote\\._",
          {
            parse_mode: "MarkdownV2",
            reply_markup: keyboard,
          },
        );
      } else {
        await ctx.answerCallbackQuery();
      }
      return;
    }

    if (data.step === "verifier_count") {
      if (cb === CB_VERIFIER_1) data.verifier_count = 1;
      else if (cb === CB_VERIFIER_3) data.verifier_count = 3;
      else {
        await ctx.answerCallbackQuery();
        return;
      }

      data.step = "recurrence";

      await ctx.answerCallbackQuery();
      const keyboard = new InlineKeyboard()
        .text("🔄 None", CB_RECUR_NONE)
        .text("📅 Weekly", CB_RECUR_WEEKLY)
        .text("📆 Monthly", CB_RECUR_MONTHLY);

      await ctx.editMessageText(
        "*Step 7 of 8:* Should this challenge repeat?\n" +
          "_Recurring challenges auto\\-spawn when the current one ends\\._",
        {
          parse_mode: "MarkdownV2",
          reply_markup: keyboard,
        },
      );
      return;
    }

    if (data.step === "recurrence") {
      if (cb === CB_RECUR_NONE) data.recurrence = "none";
      else if (cb === CB_RECUR_WEEKLY) data.recurrence = "weekly";
      else if (cb === CB_RECUR_MONTHLY) data.recurrence = "monthly";
      else {
        await ctx.answerCallbackQuery();
        return;
      }

      data.step = "confirm";

      await ctx.answerCallbackQuery();
      const message = formatConfirmationMessage(data);
      const keyboard = new InlineKeyboard()
        .text("✅ Create", CB_CONFIRM)
        .text("🚫 Cancel", CB_CANCEL);

      await ctx.editMessageText(message, {
        parse_mode: "MarkdownV2",
        reply_markup: keyboard,
      });
      return;
    }

    if (data.step === "confirm" && cb === CB_CONFIRM) {
      sessions.delete(userId);

      const deadline = new Date(Date.now() + data.duration_days * 24 * 60 * 60 * 1000);

      try {
        const challenge = await query.createChallenge({
          creator_telegram_id: userId,
          title: data.title,
          description: data.description,
          reward_type: data.reward_type,
          reward_amount: data.reward_amount,
          token_address: data.token_address,
          duration_days: data.duration_days,
          verifier_count: data.verifier_count,
          recurrence: data.recurrence,
        });

        const currencyLabel =
          data.reward_type === "points"
            ? `${data.reward_amount} points`
            : data.reward_type === "crypto"
              ? `${data.reward_amount} crypto`
              : `${data.reward_amount} custom token`;

        const message = [
          `⚔️ *Challenge \\#${challenge.id} Created\\!*`,
          "",
          `*Title:* ${escapeMarkdown(challenge.title)}`,
          `*Reward:* ${currencyLabel}`,
          `*Duration:* ${data.duration_days} day(s)`,
          `*Verifiers:* ${data.verifier_count}`,
          `*Deadline:* ${deadline.toLocaleDateString()}`,
          "",
          `Share this challenge with /join ${challenge.id} to invite participants\\.`,
        ].join("\n");

        await ctx.editMessageText(message, { parse_mode: "MarkdownV2" });
      } catch {
        await ctx.editMessageText(
          "⚠️ Failed to create the challenge\\. Please try again with /newchallenge\\.",
          { parse_mode: "MarkdownV2" },
        );
      }
    }
  });

  return composer;
}

async function showDurationPicker(ctx: Context) {
  const keyboard = new InlineKeyboard()
    .text("3 days", CB_DURATION_3)
    .text("7 days", CB_DURATION_7)
    .text("14 days", CB_DURATION_14)
    .text("30 days", CB_DURATION_30).row()
    .text("Custom…", "nc:dur_custom");

  await ctx.reply(
    "*Step 5 of 8:* How many days should the challenge run?\n" +
      "_Or type a custom number \\(1–365\\)_",
    {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    },
  );
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
