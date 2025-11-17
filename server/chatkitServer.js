import {
  ChatKitServer,
  NotFoundError,
  StreamError,
} from "chatkit-node-backend-sdk";
import { runCascade } from "../src/cascade.js";
import { describeImageAttachment, signDownloadUrl } from "./attachments.js";
import { validateArticleUrlsInMarkdown } from "./articleValidator.js";

const DEFAULT_TITLE_LENGTH = 80;
const clone = (value) =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

const asPlainText = (value) =>
  typeof value === "string" ? value.trim() : String(value ?? "").trim();

const joinSegments = (segments) =>
  segments.map(asPlainText).filter(Boolean).join("\n\n");

const buildAssistantContent = (text, buttons = null) => {
  const content = [
    {
      type: "output_text",
      text,
      annotations: [],
    },
  ];
  
  // Add button widgets if provided
  // ChatKit format: send each button as a separate widget content item
  // Based on ChatKit documentation, widgets use type "widget" with widget structure
  if (Array.isArray(buttons) && buttons.length > 0) {
    buttons.forEach((button) => {
      content.push({
        type: "widget",
        widget: {
          type: "button",
          label: button.label,
          action: {
            type: "fyi.button_click",
            payload: {
              value: button.value,
            },
          },
        },
      });
    });
    
    console.log(`[chatkit] Added ${buttons.length} buttons as widget content items`);
  }
  
  return content;
};

const buildProgressEvent = (text, icon = "sparkle", logger = null) => {
  // Transform internal stage names to user-friendly messages
  let displayText = text;
  if (text === "cascade.stage initial") {
    displayText = "Understanding your question...";
  } else if (text === "cascade.stage analyzing") {
    displayText = "Analysing...";
  } else if (text === "cascade.stage router_processing") {
    displayText = "Reviewing information...";
  } else if (text === "cascade.stage router_decided") {
    displayText = "Preparing answer...";
  } else if (text === "cascade.stage heavy_pending") {
    displayText = "Searching knowledge base...";
  } else if (text === "cascade.stage heavy_searching") {
    displayText = "Reviewing articles...";
  } else if (text === "cascade.stage heavy_generating") {
    displayText = "Preparing detailed response...";
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
  
  // ChatKit SDK doesn't automatically convert ProgressUpdateEvent to log events
  // The progress_update events are valid ThreadStreamEvents but won't trigger onLog callback
  // We need to find another way to communicate progress to the UI
  return {
    type: "progress_update",
    text: displayText,
    icon,
  };
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
};

const resolveAttachmentKey = (attachment) => {
  if (
    attachment?.storage &&
    typeof attachment.storage.key === "string" &&
    attachment.storage.key.trim().length > 0
  ) {
    return attachment.storage.key.trim();
  }
  if (typeof attachment?.key === "string" && attachment.key.trim().length > 0) {
    return attachment.key.trim();
  }
  return null;
};

export class FyiChatKitServer extends ChatKitServer {
  constructor(store, attachmentStore, logger) {
    super(store, attachmentStore, logger);
  }

  async buildAttachmentDownloadUrl(attachment) {
    if (attachment?.url && typeof attachment.url === "string") {
      return attachment.url;
    }
    const key = resolveAttachmentKey(attachment);
    if (!key) {
      return null;
    }
    try {
      return await signDownloadUrl(key, 600);
    } catch (error) {
      this.logger?.warn?.("[chatkit] failed to sign attachment URL", {
        attachmentId: attachment?.id,
        error,
      });
      return null;
    }
  }

  async attachmentToMessageContent(attachment) {
    const downloadUrl = await this.buildAttachmentDownloadUrl(attachment);
    const isImage =
      typeof attachment?.mime_type === "string" &&
      attachment.mime_type.startsWith("image/");

    let description =
      typeof attachment?.description === "string" &&
      attachment.description.trim().length > 0
        ? attachment.description.trim()
        : null;

    if (!description && isImage) {
      const key = resolveAttachmentKey(attachment);
      console.log("[chatkit] Attempting to describe image", {
        attachmentId: attachment?.id,
        mimeType: attachment?.mime_type,
        hasStorage: !!attachment?.storage,
        storageKey: attachment?.storage?.key,
        attachmentKey: attachment?.key,
        resolvedKey: key,
      });
      
      if (key) {
        try {
          console.log("[chatkit] Calling describeImageAttachment", { key });
          description = await describeImageAttachment(key);
          console.log("[chatkit] Image description result", { 
            key, 
            descriptionLength: description?.length,
            description: description?.substring(0, 100) // First 100 chars
          });
          if (description) {
            attachment.description = description;
          }
        } catch (error) {
          console.error("[chatkit] failed to auto-describe image attachment", {
            attachmentId: attachment?.id,
            key,
            error: error.message,
            stack: error.stack,
          });
          this.logger?.warn?.(
            "[chatkit] failed to auto-describe image attachment",
            {
              attachmentId: attachment?.id,
              error,
            }
          );
        }
      } else {
        console.warn("[chatkit] Cannot describe image - no key found", {
          attachmentId: attachment?.id,
          attachment: JSON.stringify(attachment, null, 2),
        });
      }
    }

    const parts = [
      `Attachment: ${attachment?.name ?? "file"}`,
      attachment?.mime_type ? `Type: ${attachment.mime_type}` : null,
      Number.isFinite(attachment?.size)
        ? `Size: ${formatBytes(attachment.size)}`
        : null,
      downloadUrl ? `Download: ${downloadUrl}` : null,
      description ? `Summary: ${description}` : null,
    ].filter(Boolean);

    return {
      type: "input_text",
      text: parts.join("\n"),
    };
  }

  async *respond(thread, inputUserMessage, context) {
    if (!inputUserMessage) {
      return;
    }

    const attachments = Array.isArray(inputUserMessage.attachments)
      ? inputUserMessage.attachments
      : [];
    let question = this.extractUserMessageText(inputUserMessage);

    if (!question && attachments.length > 0) {
      const attachmentSummaries = await Promise.all(
        attachments.map(async (attachment) => {
          try {
            const content = await this.attachmentToMessageContent(attachment);
            if (content && typeof content.text === "string") {
              return content.text;
            }
          } catch (error) {
            this.logger?.warn?.(
              "[chatkit] failed to convert attachment into question fallback",
              {
                attachmentId: attachment?.id,
                error,
              }
            );
          }
          return null;
        })
      );
      question = attachmentSummaries.filter(Boolean).join("\n\n").trim();
    }

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

    const baseCascadeContext =
      (thread.metadata?.cascadeUserContext &&
      typeof thread.metadata.cascadeUserContext === "object"
        ? clone(thread.metadata.cascadeUserContext)
        : undefined) ?? undefined;

    const cascadeAttachments =
      Array.isArray(thread.metadata?.cascadeAttachments) &&
      thread.metadata.cascadeAttachments.length > 0
        ? clone(thread.metadata.cascadeAttachments)
        : [];

    const cascadeContext =
      cascadeAttachments.length > 0
        ? {
            ...(baseCascadeContext ?? {}),
            attachments: cascadeAttachments,
          }
        : baseCascadeContext;

    // Emit initial progress
    const initialEvent = buildProgressEvent("cascade.stage initial", "sparkle", this.logger);
    if (initialEvent) {
      yield initialEvent;
    }
    
    // Delay to ensure first update is visible
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Emit analyzing progress
    const analyzingEvent = buildProgressEvent("cascade.stage analyzing", "sparkle", this.logger);
    if (analyzingEvent) {
      yield analyzingEvent;
    }
    
    // Delay to ensure second update is visible
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Emit reviewing progress
    const reviewingEvent = buildProgressEvent("cascade.stage router_processing", "sparkle", this.logger);
    if (reviewingEvent) {
      yield reviewingEvent;
    }

    let resolveRouterDecision;
    const routerDecisionPromise = new Promise((resolve) => {
      resolveRouterDecision = resolve;
    });
    let routerDecisionPayload = null;
    let interimAssistantItem = null;
    let streamingAssistantItem = null;
    let streamingText = "";
    
    // Queue for progress updates that need to be emitted
    const progressQueue = [];
    let progressResolver = null;
    const progressPromise = new Promise((resolve) => {
      progressResolver = resolve;
    });

    // Extract image URLs from attachments for visual analysis
    const imageUrls = [];
    for (const attachment of attachments) {
      const isImage =
        typeof attachment?.mime_type === "string" &&
        attachment.mime_type.startsWith("image/");
      if (isImage) {
        const downloadUrl = await this.buildAttachmentDownloadUrl(attachment);
        if (downloadUrl) {
          imageUrls.push(downloadUrl);
        }
      }
    }
    
    console.log("[chatkit] Running cascade with images", {
      questionLength: question?.length,
      imageCount: imageUrls.length,
      imageUrls: imageUrls.slice(0, 2), // Log first 2 URLs
    });

    const cascadePromise = runCascade({
      question,
      history,
      context: cascadeContext,
      imageUrls,
      onRouterDecision: async (payload) => {
        routerDecisionPayload = payload;
        resolveRouterDecision(payload);
      },
      onProgress: (stage) => {
        // Queue progress updates to be emitted
        const progressEvent = buildProgressEvent(stage);
        if (progressEvent) {
          progressQueue.push(progressEvent);
          if (progressResolver) {
            progressResolver();
            progressResolver = null;
          }
        }
      },
      onStreamDelta: (delta) => {
        // Stream deltas to ChatKit as they arrive
        if (streamingAssistantItem && delta) {
          streamingText += delta;
          // Update the streaming item with accumulated text
          const updatedItem = this.buildAssistantMessageItem(
            thread,
            streamingText,
            context,
            {
              id: streamingAssistantItem.id,
              created_at: streamingAssistantItem.created_at,
            }
          );
          streamingAssistantItem = updatedItem;
        }
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
        let quickReplyText = this.formatTextForChatKit(quickReply);

        // Note: Quick reply validation is skipped - we'll validate the final response instead
        // This avoids double validation and ensures we retry with the full context

        // Check if router result has buttons
        const routerButtons = firstResult.payload.buttons || null;
        console.log("[chatkit] Router result buttons:", routerButtons);

        interimAssistantItem = this.buildAssistantMessageItem(
          thread,
          quickReplyText,
          context,
          {
            buttons: routerButtons, // Use buttons from router if available
          }
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
        const decisionEvent = buildProgressEvent(
          `cascade.router.decision ${JSON.stringify(decisionLog)}`
        );
        if (decisionEvent) {
          yield decisionEvent;
        }

        yield {
          type: "thread.item.done",
          item: interimAssistantItem,
        };

        // Emit progress updates for heavy agent stages
        const heavyPendingEvent =
          buildProgressEvent("cascade.stage heavy_pending", "sparkle", this.logger);
        if (heavyPendingEvent) {
          yield heavyPendingEvent;
        }
        
        // Add a small delay and show searching status
        await new Promise(resolve => setTimeout(resolve, 200));
        const searchingEvent = buildProgressEvent("cascade.stage heavy_searching", "sparkle", this.logger);
        if (searchingEvent) {
          yield searchingEvent;
        }
        
        // Add another delay and show generating status
        await new Promise(resolve => setTimeout(resolve, 300));
        const generatingEvent = buildProgressEvent("cascade.stage heavy_generating", "sparkle", this.logger);
        if (generatingEvent) {
          yield generatingEvent;
        }

        // Create streaming assistant item for heavy agent response
        // Preserve buttons from interim item if they exist
        const preservedButtons = interimAssistantItem?.metadata?.buttons || null;
        streamingAssistantItem = this.buildAssistantMessageItem(
          thread,
          "",
          context,
          {
            id: interimAssistantItem.id,
            created_at: interimAssistantItem.created_at,
            buttons: preservedButtons,
          }
        );

        // Yield the initial streaming item (will replace interim item)
        yield {
          type: "thread.item.replaced",
          item: streamingAssistantItem,
        };

        const finalResult = await cascadePromise;
        
        console.log("[chatkit] Final result buttons:", finalResult.buttons);
        
        // If streaming was enabled and we have accumulated text, use it
        if (streamingText && streamingAssistantItem) {
          const finalText = this.formatTextForChatKit(finalResult.answer ?? streamingText);
          const buttonsToUse = finalResult.buttons || streamingAssistantItem?.metadata?.buttons || null;
          console.log("[chatkit] Using buttons for final streaming item:", buttonsToUse);
          const finalItem = this.buildAssistantMessageItem(
            thread,
            finalText,
            context,
            {
              id: streamingAssistantItem.id,
              created_at: streamingAssistantItem.created_at,
              buttons: buttonsToUse,
            }
          );
          
          yield {
            type: "thread.item.replaced",
            item: finalItem,
          };
        } else {
          yield* this.emitFinalAssistantMessage({
            thread,
            context,
            result: finalResult,
            replaceId: interimAssistantItem?.id,
            originalCreatedAt: interimAssistantItem?.created_at,
            originalQuestion: question,
            originalHistory: history,
            originalContext: cascadeContext,
          });
        }
      } else {
        const { result } = firstResult;
        yield* this.emitFinalAssistantMessage({
          thread,
          context,
          result,
          originalQuestion: question,
          originalHistory: history,
          originalContext: cascadeContext,
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

    // Handle button clicks - create a user message with the button value
    if (action?.type === "fyi.button_click") {
      const buttonValue = action?.payload?.value;
      if (typeof buttonValue === "string" && buttonValue.trim().length > 0) {
        console.log(`[chatkit] Button clicked: ${buttonValue}`);
        // Create a user message with the button value
        const userMessage = {
          type: "user_message",
          id: this.store.generateItemId("message", thread, undefined),
          thread_id: thread.id,
          created_at: new Date().toISOString(),
          content: [
            {
              type: "input_text",
              text: buttonValue.trim(),
            },
          ],
        };
        
        yield {
          type: "thread.item.done",
          item: userMessage,
        };
        
        // Trigger a response by calling respond() with the new user message
        yield* this.respond(thread, userMessage, undefined);
        return;
      }
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
    const buttons = Array.isArray(options.buttons) && options.buttons.length > 0 ? options.buttons : null;
    
    const item = {
      type: "assistant_message",
      id:
        options.id ??
        this.store.generateItemId("message", thread, context ?? undefined),
      thread_id: thread.id,
      created_at: options.created_at ?? now,
      content: buildAssistantContent(text, buttons),
    };
    
    // Also store buttons in metadata for API access
    if (buttons) {
      item.metadata = {
        ...(item.metadata || {}),
        buttons: buttons,
      };
      console.log(`[chatkit] Storing ${buttons.length} buttons for message ${item.id}:`, buttons);
    } else if (options.buttons === null && process.env.DEBUG) {
      // Log when buttons are explicitly null (for debugging)
      console.log(`[chatkit] No buttons provided for message ${item.id}`);
    }
    
    return item;
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
    originalQuestion,
    originalHistory,
    originalContext,
    retryCount = 0,
  }) {
    const maxRetries = Number.parseInt(process.env.ARTICLE_VALIDATION_MAX_RETRIES ?? "1", 10);
    let assistantText = this.formatTextForChatKit(result.answer ?? "");
    
    // Validate article URLs
    let shouldRetry = false;
    let invalidUrls = [];
    
    try {
      const zendeskEmail = process.env.ZENDESK_EMAIL;
      const zendeskToken = process.env.ZENDESK_TOKEN;
      
      if (zendeskEmail || zendeskToken || process.env.ARTICLE_VALIDATION_ENABLED !== "false") {
        const validationResult = await validateArticleUrlsInMarkdown(assistantText, {
          zendeskEmail,
          zendeskToken,
        });
        
        if (validationResult.hasInvalid && retryCount < maxRetries) {
          shouldRetry = true;
          invalidUrls = validationResult.invalidUrls;
        }
      }
    } catch (error) {
      // Log but don't fail the response if validation errors occur
      this.logger?.warn?.("[chatkit] Failed to validate article URLs", {
        error: error.message,
      });
    }
    
    // Retry with feedback if invalid URLs found
    if (shouldRetry && originalQuestion && originalHistory) {
      this.logger?.info?.("[chatkit] Invalid article URLs detected, retrying with feedback", {
        invalidUrls: invalidUrls.map(u => u.url),
        retryCount: retryCount + 1,
      });
      
      // Build feedback message
      const invalidUrlList = invalidUrls
        .map(({ url, text }) => {
          if (text) {
            return `- "${text}" (${url})`;
          }
          return `- ${url}`;
        })
        .join('\n');
      
      const feedbackMessage = `The following article URLs in your previous response are invalid or do not exist. Please regenerate your response without these invalid links, and only include links to articles that actually exist in the FYI Help Centre:\n\n${invalidUrlList}\n\nPlease provide your corrected response with only valid article links.`;
      
      // Add feedback to history
      const retryHistory = [
        ...originalHistory,
        { role: "assistant", content: assistantText },
        { role: "user", content: feedbackMessage },
      ];
      
      // Retry cascade with feedback
      try {
        const retryResult = await runCascade({
          question: originalQuestion,
          history: retryHistory,
          context: originalContext,
          config: result.config,
        });
        
        // Recursively call emitFinalAssistantMessage with retry count
        yield* this.emitFinalAssistantMessage({
          thread,
          context,
          result: retryResult,
          replaceId,
          originalCreatedAt,
          originalQuestion,
          originalHistory,
          originalContext,
          retryCount: retryCount + 1,
        });
        return;
      } catch (retryError) {
        this.logger?.warn?.("[chatkit] Failed to retry cascade with feedback", {
          error: retryError.message,
        });
        // Fall through to use original response
      }
    }
    
    const assistantItem = this.buildAssistantMessageItem(thread, assistantText, context, {
      id: replaceId,
      created_at: originalCreatedAt,
      buttons: result.buttons || null,
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

