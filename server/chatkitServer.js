import {
  ChatKitServer,
  NotFoundError,
  StreamError,
} from "chatkit-node-backend-sdk";
import { runCascade } from "../src/cascade.js";

const DEFAULT_TITLE_LENGTH = 80;
const clone = (value) =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

const asPlainText = (value) =>
  typeof value === "string" ? value.trim() : String(value ?? "").trim();

const joinSegments = (segments) =>
  segments.map(asPlainText).filter(Boolean).join("\n\n");

const buildAssistantContent = (text) => [
  {
    type: "output_text",
    text,
    annotations: [],
  },
];

const buildProgressEvent = (text, icon = "sparkle") => {
  // Transform internal stage names to user-friendly messages
  let displayText = text;
  if (text === "cascade.stage analyzing") {
    displayText = "analysing...";
  } else if (text === "cascade.stage heavy_pending") {
    displayText = "searching...";
  } else if (text === "cascade.stage router_complete" || text === "cascade.stage complete") {
    // Don't show a progress update for completion - it's handled by the response
    return null;
  } else if (text.startsWith("cascade.stage ")) {
    displayText = text.slice("cascade.stage ".length);
  }
  
  // Return null for stages that shouldn't show progress updates
  if (!displayText || displayText === text) {
    return null;
  }
  
  return {
    type: "progress_update",
    text: displayText,
    icon,
  };
};

export class FyiChatKitServer extends ChatKitServer {
  constructor(store, logger) {
    super(store, undefined, logger);
  }

  async *respond(thread, inputUserMessage, context) {
    if (!inputUserMessage) {
      return;
    }

    const question = this.extractUserMessageText(inputUserMessage);
    if (!question) {
      yield {
        type: "error",
        code: "invalid.request",
        message: "Please provide a text question.",
        allow_retry: false,
      };
      return;
    }

    if (!thread.title || thread.title.length === 0) {
      thread.title = question.length > DEFAULT_TITLE_LENGTH
        ? `${question.slice(0, DEFAULT_TITLE_LENGTH)}…`
        : question;
    }

    const history = await this.buildCascadeHistory(
      thread.id,
      inputUserMessage.id,
      context
    );

    const cascadeContext =
      (thread.metadata?.cascadeUserContext &&
      typeof thread.metadata.cascadeUserContext === "object"
        ? clone(thread.metadata.cascadeUserContext)
        : undefined) ?? undefined;

    yield buildProgressEvent("cascade.stage analyzing");

    let resolveRouterDecision;
    const routerDecisionPromise = new Promise((resolve) => {
      resolveRouterDecision = resolve;
    });
    let routerDecisionPayload = null;
    let interimAssistantItem = null;

    const cascadePromise = runCascade({
      question,
      history,
      context: cascadeContext,
      onRouterDecision: async (payload) => {
        routerDecisionPayload = payload;
        resolveRouterDecision(payload);
      },
    });

    try {
      const firstResult = await Promise.race([
        cascadePromise.then((result) => ({ kind: "final", result })),
        routerDecisionPromise.then((payload) => ({
          kind: "router",
          payload,
        })),
      ]);

      if (firstResult.kind === "router") {
        const { quickReply, decision } = firstResult.payload;

        // Convert HTML to Markdown for quick reply if needed
        const quickReplyText = this.formatTextForChatKit(quickReply);

        interimAssistantItem = this.buildAssistantMessageItem(
          thread,
          quickReplyText,
          context
        );

        thread.metadata = {
          ...thread.metadata,
          lastRouterDecision: {
            handoff: decision.handoff,
            confidence: decision.confidence ?? null,
            reason: decision.reason ?? null,
            timestamp: new Date().toISOString(),
          },
        };

        const decisionLog = {
          handoff: decision.handoff,
          confidence: decision.confidence ?? null,
          reason: decision.reason ?? null,
          answer: decision.answer ?? null,
        };
        yield buildProgressEvent(
          `cascade.router.decision ${JSON.stringify(decisionLog)}`
        );

        yield {
          type: "thread.item.done",
          item: interimAssistantItem,
        };

                    const heavyPendingEvent = buildProgressEvent("cascade.stage heavy_pending");
                    if (heavyPendingEvent) {
                      yield heavyPendingEvent;
                    }

        const finalResult = await cascadePromise;
        yield* this.emitFinalAssistantMessage({
          thread,
          context,
          result: finalResult,
          replaceId: interimAssistantItem.id,
          originalCreatedAt: interimAssistantItem.created_at,
        });
      } else {
        const { result } = firstResult;
        yield* this.emitFinalAssistantMessage({
          thread,
          context,
          result,
        });
      }
    } catch (error) {
      yield this.toErrorEvent(error);
      thread.metadata = {
        ...thread.metadata,
        lastCascadeError: {
          message:
            error instanceof Error ? error.message : "Unexpected cascade error.",
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  async *action(thread, action) {
    if (action?.type === "fyi.cascade.context") {
      const payload = action?.payload;
      if (payload?.kind === "user-context") {
        const normalizedContext =
          typeof payload.context === "object" && payload.context
            ? clone(payload.context)
            : {};
        thread.metadata = {
          ...thread.metadata,
          cascadeUserContext: normalizedContext,
          cascadeContextUpdatedAt: new Date().toISOString(),
        };
      }
      return;
    }

    yield {
      type: "notice",
      level: "warning",
      message: "Received unsupported action. No changes applied.",
    };
  }

  extractUserMessageText(userMessage) {
    const segments = (userMessage.content ?? [])
      .map((part) => {
        if (part.type === "input_text") return part.text ?? "";
        if (part.type === "input_tag") return part.text ?? "";
        return "";
      })
      .filter(Boolean);
    return joinSegments(segments);
  }

  extractAssistantMessageText(assistantMessage) {
    const segments = (assistantMessage.content ?? [])
      .map((part) => {
        if (part.type === "output_text") return part.text ?? "";
        return "";
      })
      .filter(Boolean);
    return joinSegments(segments);
  }

  async buildCascadeHistory(threadId, latestUserMessageId, context) {
    try {
      const page = await this.store.loadThreadItems(
        threadId,
        null,
        500,
        "asc",
        context
      );
      const history = [];

      for (const item of page.data) {
        if (item.id === latestUserMessageId) {
          break;
        }
        if (item.type === "user_message") {
          const text = this.extractUserMessageText(item);
          if (text) {
            history.push({ role: "user", content: text });
          }
        } else if (item.type === "assistant_message") {
          const text = this.extractAssistantMessageText(item);
          if (text) {
            history.push({ role: "assistant", content: text });
          }
        }
      }

      return history;
    } catch (error) {
      if (error instanceof NotFoundError) {
        return [];
      }
      throw error;
    }
  }

  buildAssistantMessageItem(thread, text, context, options = {}) {
    const now = new Date().toISOString();
    return {
      type: "assistant_message",
      id:
        options.id ??
        this.store.generateItemId("message", thread, context ?? undefined),
      thread_id: thread.id,
      created_at: options.created_at ?? now,
      content: buildAssistantContent(text),
    };
  }

  *emitMetadataProgress(result) {
    // Don't emit progress updates for completion - the response itself indicates completion
    // This keeps the UI cleaner and avoids showing technical status messages
  }

  applyFinalMetadata(thread, result) {
    thread.metadata = {
      ...thread.metadata,
      lastCascade: {
        source: result.source,
        timings: result.timings ?? {},
        router: result.router?.decision ?? null,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  createEndOfTurnItem(thread, context) {
    return {
      type: "end_of_turn",
      id: this.store.generateItemId("message", thread, context ?? undefined),
      thread_id: thread.id,
      created_at: new Date().toISOString(),
    };
  }

  // Convert HTML to Markdown as a fallback (in case models still output HTML)
  convertHtmlToMarkdown(html) {
    if (typeof html !== "string") return html;
    
    let markdown = html
      // Convert paragraphs to plain text with line breaks
      .replace(/<p[^>]*>/gi, "\n\n")
      .replace(/<\/p>/gi, "")
      // Convert line breaks
      .replace(/<br\s*\/?>/gi, "\n")
      // Convert strong/bold
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
      .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
      // Convert emphasis/italic
      .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
      .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
      // Convert links
      .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, "[$2]($1)")
      // Convert lists
      .replace(/<ul[^>]*>/gi, "\n")
      .replace(/<\/ul>/gi, "\n")
      .replace(/<ol[^>]*>/gi, "\n")
      .replace(/<\/ol>/gi, "\n")
      .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
      // Convert headings
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n")
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n")
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n")
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n")
      // Remove remaining HTML tags
      .replace(/<[^>]+>/g, "")
      // Clean up whitespace
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    
    return markdown;
  }

  formatTextForChatKit(value) {
    if (typeof value !== "string") {
      return "";
    }
    let text = value.trim();
    if (!text) {
      return "";
    }

    if (text.includes("<") && text.includes(">")) {
      text = this.convertHtmlToMarkdown(text);
    }

    return text;
  }

  async *emitFinalAssistantMessage({
    thread,
    context,
    result,
    replaceId,
    originalCreatedAt,
  }) {
    const assistantText = this.formatTextForChatKit(result.answer ?? "");
    
    const assistantItem = this.buildAssistantMessageItem(thread, assistantText, context, {
      id: replaceId,
      created_at: originalCreatedAt,
    });

    for (const event of this.emitMetadataProgress(result)) {
      yield event;
    }

    if (replaceId) {
      yield {
        type: "thread.item.replaced",
        item: assistantItem,
      };
    } else {
      yield {
        type: "thread.item.done",
        item: assistantItem,
      };
    }

    yield {
      type: "thread.item.done",
      item: this.createEndOfTurnItem(thread, context),
    };

    this.applyFinalMetadata(thread, result);
  }

  toErrorEvent(error) {
    if (error instanceof StreamError) {
      return {
        type: "error",
        code: error.code,
        allow_retry: error.allowRetry,
      };
    }
    return {
      type: "error",
      code: "internal.error",
      message:
        error instanceof Error ? error.message : "Unexpected cascade failure.",
      allow_retry: true,
    };
  }
}

