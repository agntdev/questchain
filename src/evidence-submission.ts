import { Bot, Context } from "grammy";
import { EvidenceKind, createEvidence, Evidence } from "./models/evidence";

interface EvidenceSubmissionState {
  step: "kind" | "media" | "caption" | "confirm";
  challenge_id: number;
  kind?: EvidenceKind;
  file_id?: string;
  caption?: string;
}

interface EvidenceSession {
  evidenceSubmission?: EvidenceSubmissionState;
}

declare module "grammy" {
  interface Context {
    session: EvidenceSession;
  }
}

const MAX_CAPTION_LENGTH = 200;

function getState(ctx: Context): EvidenceSubmissionState | undefined {
  return ctx.session?.evidenceSubmission;
}

function clearState(ctx: Context): void {
  if (ctx.session) {
    delete ctx.session.evidenceSubmission;
  }
}

async function handleSubmitCommand(ctx: Context): Promise<void> {
  const args = (ctx.match ?? "").toString().trim();
  if (!args) {
    await ctx.reply("Usage: /submit <challenge_id>");
    return;
  }
  const challengeId = parseInt(args, 10);
  if (isNaN(challengeId) || challengeId <= 0) {
    await ctx.reply("Invalid challenge ID. Provide a positive integer.");
    return;
  }

  if (!ctx.session) ctx.session = {} as EvidenceSession;
  ctx.session.evidenceSubmission = {
    step: "kind",
    challenge_id: challengeId,
  };

  await ctx.reply(
    `Submit evidence for challenge #${challengeId}\n\nWhat type of evidence would you like to submit?`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "\u{1F4F7} Photo", callback_data: "ev:kind:photo" }],
          [{ text: "\u{1F4C4} Document", callback_data: "ev:kind:document" }],
          [{ text: "\u{1F4DD} Text", callback_data: "ev:kind:text" }],
        ],
      },
    },
  );
}

async function handleKindSelection(ctx: Context): Promise<void> {
  const state = getState(ctx);
  if (!state) {
    await ctx.answerCallbackQuery({ text: "Submission flow expired. Use /submit to start again." });
    return;
  }

  const kind = (ctx.match as RegExpMatchArray)[1] as EvidenceKind;
  state.kind = kind;

  await ctx.answerCallbackQuery();

  if (kind === "text") {
    state.step = "caption";
    await ctx.reply(
      "Please enter your text evidence (up to 200 characters):",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "\u274C Cancel", callback_data: "submit:cancel" }],
          ],
        },
      },
    );
  } else {
    state.step = "media";
    const label = kind === "photo" ? "photo" : "document";
    await ctx.reply(
      `Please send your ${label} evidence.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "\u274C Cancel", callback_data: "submit:cancel" }],
          ],
        },
      },
    );
  }
}

async function handleMediaMessage(ctx: Context): Promise<void> {
  const state = getState(ctx);
  if (!state || state.step !== "media") return;

  const msg = ctx.message;
  if (!msg) return;

  if (state.kind === "photo" && msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    state.file_id = largest.file_id;
  } else if (state.kind === "document" && msg.document) {
    state.file_id = msg.document.file_id;
  } else {
    await ctx.reply(
      `Please send a ${state.kind}, not something else.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "\u274C Cancel", callback_data: "submit:cancel" }],
          ],
        },
      },
    );
    return;
  }

  state.step = "caption";
  await ctx.reply(
    `Evidence received! Add an optional caption (up to ${MAX_CAPTION_LENGTH} chars), or skip:`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "\u23ED Skip caption", callback_data: "submit:skip_caption" }],
          [{ text: "\u274C Cancel", callback_data: "submit:cancel" }],
        ],
      },
    },
  );
}

async function handleCaptionText(ctx: Context): Promise<void> {
  const state = getState(ctx);
  if (!state || state.step !== "caption") return;

  const text = ctx.message?.text;
  if (text === undefined) return;

  if (text.length > MAX_CAPTION_LENGTH) {
    await ctx.reply(
      `Caption is too long (${text.length} chars). Max is ${MAX_CAPTION_LENGTH}. Please try again:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "\u23ED Skip caption", callback_data: "submit:skip_caption" }],
            [{ text: "\u274C Cancel", callback_data: "submit:cancel" }],
          ],
        },
      },
    );
    return;
  }

  state.caption = text;
  await showConfirmation(ctx, state);
}

async function handleSkipCaption(ctx: Context): Promise<void> {
  const state = getState(ctx);
  if (!state) {
    await ctx.answerCallbackQuery({ text: "Submission flow expired." });
    return;
  }

  await ctx.answerCallbackQuery();
  await showConfirmation(ctx, state);
}

async function showConfirmation(ctx: Context, state: EvidenceSubmissionState): Promise<void> {
  state.step = "confirm";

  const kindLabel: Record<string, string> = {
    photo: "Photo",
    document: "Document",
    text: "Text",
  };
  const kindDisplay = kindLabel[state.kind ?? ""] ?? "Unknown";
  const captionText = state.caption || "None";

  const lines = [
    "\u{1F4CB} *Evidence Summary*",
    "",
    `Challenge: #${state.challenge_id}`,
    `Type: ${kindDisplay}`,
    `Caption: ${captionText}`,
  ];

  if (state.kind === "text") {
    lines.splice(3, 0, `Content: ${(state.caption ?? "").slice(0, 100)}${(state.caption ?? "").length > 100 ? "..." : ""}`);
  }

  await ctx.reply(lines.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "\u2705 Submit", callback_data: "submit:type" }],
        [{ text: "\u274C Cancel", callback_data: "submit:cancel" }],
      ],
    },
  });
}

async function handleSubmit(ctx: Context): Promise<void> {
  const state = getState(ctx);
  if (!state) {
    await ctx.answerCallbackQuery({ text: "Submission flow expired." });
    return;
  }

  const evidence = createEvidence({
    id: 0,
    challenge_id: state.challenge_id,
    user_telegram_id: ctx.from?.id ?? 0,
    kind: state.kind ?? "text",
    media_url: state.file_id ?? null,
    text_body: state.kind === "text" ? (state.caption ?? null) : null,
  });

  clearState(ctx);

  await ctx.answerCallbackQuery({ text: "Evidence submitted!" });
  await ctx.editMessageReplyMarkup(undefined);
  await ctx.reply(
    "\u2705 Evidence submitted successfully!\n\n" +
      `Challenge #${state.challenge_id}\n` +
      `File ID: ${state.file_id ?? "N/A"}\n` +
      `Caption: ${state.caption ?? "None"}\n` +
      `Status: pending verification`,
  );

  void evidence;
}

async function handleCancel(ctx: Context): Promise<void> {
  const state = getState(ctx);
  clearState(ctx);

  await ctx.answerCallbackQuery({ text: "Cancelled." });

  const challengeRef = state ? ` for challenge #${state.challenge_id}` : "";
  await ctx.reply(`\u274C Evidence submission${challengeRef} cancelled.`, {
    reply_markup: undefined,
  });
}

export function registerEvidenceSubmission(bot: Bot<Context>): void {
  bot.command("submit", handleSubmitCommand);
  bot.callbackQuery(/^ev:kind:(photo|document|text)$/, handleKindSelection);
  bot.callbackQuery("submit:type", handleSubmit);
  bot.callbackQuery("submit:cancel", handleCancel);
  bot.callbackQuery("submit:skip_caption", handleSkipCaption);

  bot.on("message", async (ctx, next) => {
    const state = getState(ctx);
    if (!state) return next();

    if (state.step === "media") {
      return handleMediaMessage(ctx);
    }

    if (state.step === "caption" && ctx.message?.text) {
      return handleCaptionText(ctx);
    }

    return next();
  });
}
