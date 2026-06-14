import { Composer, Context, InlineKeyboard } from "grammy";
import type { ChallengeCreationQuery, ChallengeDraft, WizardStep } from "../services/challenge_creation";
import {
  validateTitle,
  validateDescription,
  validateRewardAmount,
  validateTokenAddress,
  validateCustomDuration,
  isDraftReady,
  formatConfirmation,
  createDeadline,
} from "../services/challenge_creation";
import type { RewardType, Recurrence } from "../models/challenge";

interface WizardState {
  step: WizardStep;
  title: string;
  description: string;
  reward_type: RewardType | null;
  reward_amount: number;
  token_address: string | null;
  duration_days: number;
  verifier_count: number;
  recurrence: Recurrence | null;
}

const REWARD_TYPE_CB = /^nc:reward:(points|crypto|custom_token)$/;
const DURATION_CB = /^nc:duration:(3|7|14|30)$/;
const DURATION_CUSTOM_CB = "nc:duration:custom";
const VERIFIERS_CB = /^nc:verifiers:(1|3)$/;
const RECURRENCE_CB = /^nc:recurrence:(none|weekly|monthly)$/;
const CONFIRM_CREATE_CB = "nc:create";
const CONFIRM_CANCEL_CB = "nc:cancel";

export function createNewChallengeComposer(query: ChallengeCreationQuery): Composer<Context> {
  const wizards = new Map<number, WizardState>();
  const composer = new Composer<Context>();

  function getUserWizard(ctx: Context): WizardState | undefined {
    const id = ctx.from?.id;
    if (id == null) return undefined;
    return wizards.get(id);
  }

  function createEmptyDraft(): WizardState {
    return {
      step: "nc:title",
      title: "",
      description: "",
      reward_type: null,
      reward_amount: 0,
      token_address: null,
      duration_days: 0,
      verifier_count: 0,
      recurrence: null,
    };
  }

  function makeDraft(state: WizardState): ChallengeDraft {
    return {
      title: state.title,
      description: state.description,
      reward_type: state.reward_type!,
      reward_amount: state.reward_amount,
      token_address: state.token_address,
      duration_days: state.duration_days,
      verifier_count: state.verifier_count,
      recurrence: state.recurrence!,
    };
  }

  async function promptTitle(ctx: Context, state: WizardState) {
    state.step = "nc:title";
    await ctx.reply("What's the title of your challenge?\n\n(1–80 characters)", {
      reply_markup: { force_reply: true },
    });
  }

  async function promptDescription(ctx: Context, state: WizardState) {
    state.step = "nc:description";
    await ctx.reply("Describe your challenge:\n\n(up to 500 characters)", {
      reply_markup: { force_reply: true },
    });
  }

  async function promptRewardType(ctx: Context, state: WizardState) {
    state.step = "nc:reward_type";
    const keyboard = new InlineKeyboard()
      .text("🏆 Points", "nc:reward:points")
      .text("💰 Crypto", "nc:reward:crypto")
      .text("🪙 Custom Token", "nc:reward:custom_token");
    await ctx.reply("Pick a reward type:", { reply_markup: keyboard });
  }

  async function promptRewardAmount(ctx: Context, state: WizardState) {
    state.step = "nc:reward_amount";
    await ctx.reply(
      `Enter the reward amount for ${state.reward_type}:\n\n(must be a positive whole number)`,
      { reply_markup: { force_reply: true } },
    );
  }

  async function promptTokenAddress(ctx: Context, state: WizardState) {
    state.step = "nc:token_address";
    await ctx.reply("Enter the token contract address:", {
      reply_markup: { force_reply: true },
    });
  }

  async function promptDuration(ctx: Context, state: WizardState) {
    state.step = "nc:duration";
    const keyboard = new InlineKeyboard()
      .text("3 days", "nc:duration:3")
      .text("7 days", "nc:duration:7")
      .row()
      .text("14 days", "nc:duration:14")
      .text("30 days", "nc:duration:30");
    await ctx.reply("How long should the challenge last?", { reply_markup: keyboard });
  }

  async function promptVerifierCount(ctx: Context, state: WizardState) {
    state.step = "nc:verifier_count";
    const keyboard = new InlineKeyboard()
      .text("1 verifier", "nc:verifiers:1")
      .text("3 verifiers", "nc:verifiers:3");
    await ctx.reply("How many verifiers?", { reply_markup: keyboard });
  }

  async function promptRecurrence(ctx: Context, state: WizardState) {
    state.step = "nc:recurrence";
    const keyboard = new InlineKeyboard()
      .text("None", "nc:recurrence:none")
      .text("Weekly", "nc:recurrence:weekly")
      .text("Monthly", "nc:recurrence:monthly");
    await ctx.reply("Should this challenge repeat?", { reply_markup: keyboard });
  }

  async function showConfirmation(ctx: Context, state: WizardState) {
    state.step = "nc:confirm";
    const draft = makeDraft(state);
    const message = formatConfirmation(draft);
    const keyboard = new InlineKeyboard()
      .text("✅ Create", CONFIRM_CREATE_CB)
      .text("❌ Cancel", CONFIRM_CANCEL_CB);
    await ctx.reply(message, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });
  }

  composer.command("newchallenge", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId == null) return;

    const existing = wizards.get(userId);
    if (existing) {
      await ctx.reply(
        "You already have a challenge creation in progress. " +
          "Complete or cancel it before starting a new one.",
      );
      return;
    }

    const state = createEmptyDraft();
    wizards.set(userId, state);
    await promptTitle(ctx, state);
  });

  composer.on("message:text", async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId == null) return next();

    const state = wizards.get(userId);
    if (!state) return next();

    const text = ctx.message?.text;
    if (!text) return next();

    if (text.startsWith("/")) {
      await ctx.reply(
        "⚠️ You're in the middle of creating a challenge. " +
          "Complete or cancel it before running other commands.",
      );
      return;
    }

    switch (state.step) {
      case "nc:title": {
        const error = validateTitle(text);
        if (error) {
          await ctx.reply(`⚠️ ${error}`);
          return;
        }
        state.title = text.trim();
        await promptDescription(ctx, state);
        return;
      }

      case "nc:description": {
        const error = validateDescription(text);
        if (error) {
          await ctx.reply(`⚠️ ${error}`);
          return;
        }
        state.description = text.trim();
        await promptRewardType(ctx, state);
        return;
      }

      case "nc:reward_amount": {
        const result = validateRewardAmount(text);
        if (typeof result === "string") {
          await ctx.reply(`⚠️ ${result}`);
          return;
        }
        state.reward_amount = result;
        if (state.reward_type === "custom_token") {
          await promptTokenAddress(ctx, state);
        } else {
          await promptDuration(ctx, state);
        }
        return;
      }

      case "nc:token_address": {
        const error = validateTokenAddress(text);
        if (error) {
          await ctx.reply(`⚠️ ${error}`);
          return;
        }
        state.token_address = text.trim();
        await promptDuration(ctx, state);
        return;
      }

      default:
        return next();
    }
  });

  composer.callbackQuery(REWARD_TYPE_CB, async (ctx) => {
    const userId = ctx.from.id;
    const state = wizards.get(userId);
    if (!state || state.step !== "nc:reward_type") return ctx.answerCallbackQuery();

    const rewardType = ctx.match![1] as RewardType;
    state.reward_type = rewardType;

    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup(undefined);
    await promptRewardAmount(ctx, state);
  });

  composer.callbackQuery(DURATION_CB, async (ctx) => {
    const userId = ctx.from.id;
    const state = wizards.get(userId);
    if (!state || state.step !== "nc:duration") return ctx.answerCallbackQuery();

    state.duration_days = Number(ctx.match![1]);

    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup(undefined);
    await promptVerifierCount(ctx, state);
  });

  composer.callbackQuery(DURATION_CUSTOM_CB, async (ctx) => {
    const userId = ctx.from.id;
    const state = wizards.get(userId);
    if (!state || state.step !== "nc:duration") return ctx.answerCallbackQuery();

    await ctx.answerCallbackQuery({
      text: "Reply with a number between 1 and 365.",
      show_alert: true,
    });
  });

  composer.callbackQuery(VERIFIERS_CB, async (ctx) => {
    const userId = ctx.from.id;
    const state = wizards.get(userId);
    if (!state || state.step !== "nc:verifier_count") return ctx.answerCallbackQuery();

    state.verifier_count = Number(ctx.match![1]);

    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup(undefined);
    await promptRecurrence(ctx, state);
  });

  composer.callbackQuery(RECURRENCE_CB, async (ctx) => {
    const userId = ctx.from.id;
    const state = wizards.get(userId);
    if (!state || state.step !== "nc:recurrence") return ctx.answerCallbackQuery();

    state.recurrence = ctx.match![1] as Recurrence;

    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup(undefined);
    await showConfirmation(ctx, state);
  });

  composer.callbackQuery(CONFIRM_CREATE_CB, async (ctx) => {
    const userId = ctx.from.id;
    const state = wizards.get(userId);
    if (!state || state.step !== "nc:confirm") return ctx.answerCallbackQuery();

    const draft = makeDraft(state);
    if (!isDraftReady(draft)) {
      await ctx.answerCallbackQuery({ text: "⚠️ Incomplete challenge data.", show_alert: true });
      return;
    }

    const deadline = createDeadline(draft.duration_days);

    try {
      const challenge = await query.createChallenge({
        creator_id: userId,
        title: draft.title,
        description: draft.description,
        reward_type: draft.reward_type,
        reward_amount: draft.reward_amount,
        token_address: draft.token_address,
        duration_days: draft.duration_days,
        verifier_count: draft.verifier_count,
        recurrence: draft.recurrence,
        deadline,
      });

      wizards.delete(userId);

      const currencyLabel =
        draft.reward_type === "points"
          ? `${draft.reward_amount} points`
          : draft.reward_type === "crypto"
            ? `${draft.reward_amount} crypto`
            : `${draft.reward_amount} custom token`;

      const message = [
        `⚔️ *Challenge \\#${challenge.id} — ${escapeMarkdown(draft.title)}*`,
        "",
        `Reward: ${currencyLabel}`,
        `Duration: ${draft.duration_days} day(s)`,
        `Verifiers: ${draft.verifier_count}`,
        `Recurrence: ${draft.recurrence}`,
        `Deadline: ${deadline.toLocaleDateString()}`,
        "",
        `Use \\/join ${challenge.id} to participate\\!`,
      ].join("\n");

      await ctx.answerCallbackQuery({ text: "✅ Challenge created!" });
      await ctx.editMessageText(message, { parse_mode: "MarkdownV2" });
    } catch (err) {
      await ctx.answerCallbackQuery({
        text: "❌ Failed to create challenge. Please try again.",
        show_alert: true,
      });
    }
  });

  composer.callbackQuery(CONFIRM_CANCEL_CB, async (ctx) => {
    const userId = ctx.from.id;
    const state = wizards.get(userId);
    if (!state || state.step !== "nc:confirm") return ctx.answerCallbackQuery();

    wizards.delete(userId);

    await ctx.answerCallbackQuery({ text: "Challenge creation cancelled." });
    await ctx.editMessageText("❌ Challenge creation cancelled\\. Use /newchallenge to start again\\.", {
      parse_mode: "MarkdownV2",
    });
  });

  return composer;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
