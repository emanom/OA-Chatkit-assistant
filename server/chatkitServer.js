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
  // Ensure text is a string (default to empty string if undefined/null)
  const safeText = typeof text === "string" ? text : (text ?? "");
  
  const content = [
    {
      type: "output_text",
      text: safeText,
      annotations: [],
    },
  ];
  
  // Add button widgets if provided
  // Try two approaches:
  // 1. Add widgets as separate content items (for native ChatKit rendering)
  // 2. Also store buttons in annotations as fallback (for API retrieval)
  if (Array.isArray(buttons) && buttons.length > 0) {
    // Approach 1: Add widgets as separate content items
    // Validate buttons before adding them to prevent undefined/null items
    buttons.forEach((button) => {
      // Skip invalid buttons
      if (!button || typeof button !== "object") {
        console.warn(`[chatkit] Skipping invalid button:`, button);
        return;
      }
      
      // Ensure label and value are strings
      const label = typeof button.label === "string" ? button.label : (button.label ?? "");
      const value = typeof button.value === "string" ? button.value : (button.value ?? "");
      
      // Skip buttons with empty label or value
      if (!label || !value) {
        console.warn(`[chatkit] Skipping button with empty label or value:`, { label, value });
        return;
      }
      
      // Create widget content item with all required properties
      const widgetItem = {
        type: "widget",
        widget: {
          type: "button",
          label: label,
          action: {
            type: "fyi.button_click",
            payload: {
              value: value,
            },
          },
        },
      };
      
      // Only push if widget item is valid
      if (widgetItem.type && widgetItem.widget?.type) {
        content.push(widgetItem);
      } else {
        console.warn(`[chatkit] Skipping invalid widget item:`, widgetItem);
      }
    });
    
    // Approach 2: Also store buttons in annotations as fallback
    // Store buttons as a custom annotation that can be retrieved via API
    // Filter out invalid buttons before storing
    const validButtons = buttons.filter(
      (btn) => btn && typeof btn === "object" && typeof btn.label === "string" && typeof btn.value === "string" && btn.label && btn.value
    );
    
    if (validButtons.length > 0 && content[0] && content[0].annotations) {
      const buttonAnnotation = {
        type: "custom",
        name: "buttons",
        data: validButtons,
      };
      content[0].annotations.push(buttonAnnotation);
      console.log(`[chatkit] Added buttons to annotations:`, {
        annotationCount: content[0].annotations.length,
        annotationType: buttonAnnotation.type,
        annotationName: buttonAnnotation.name,
        buttonCount: validButtons.length,
      });
    } else if (validButtons.length === 0) {
      console.warn(`[chatkit] ⚠️ No valid buttons to add to annotations`);
    } else {
      console.warn(`[chatkit] ⚠️ Cannot add buttons to annotations - annotations array is missing!`);
    }
    
    console.log(`[chatkit] Added ${validButtons.length} valid buttons as widgets and annotations`);
  }
  
  // Final safety check: filter out any content items that don't have a type property
  const filteredContent = content.filter((item) => {
    if (!item || typeof item !== "object" || !item.type) {
      console.warn(`[chatkit] Filtering out invalid content item:`, item);
      return false;
    }
    return true;
  });
  
  // Ensure we always return at least one valid content item
  if (filteredContent.length === 0) {
    console.warn(`[chatkit] No valid content items, returning default text content`);
    return [
      {
        type: "output_text",
        text: safeText,
        annotations: [],
      },
    ];
  }
  
  return filteredContent;
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

    let resolveRouterDecision;
    const routerDecisionPromise = new Promise((resolve) => {
      resolveRouterDecision = resolve;
    });
    let routerDecisionPayload = null;
    let interimAssistantItem = null;
    let streamingAssistantItem = null;
    let streamingText = "";

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
        this.logger?.debug?.("[cascade] progress update", { stage });
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

        yield {
          type: "thread.item.done",
          item: this.safeSerializeItem(interimAssistantItem),
        };

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
          item: this.safeSerializeItem(streamingAssistantItem),
        };

        let finalResult;
        try {
          finalResult = await cascadePromise;
        } catch (cascadeError) {
          console.error("[chatkit] ✗✗✗ CASCADE PROMISE FAILED ✗✗✗", {
            error: cascadeError.message,
            stack: cascadeError.stack,
            name: cascadeError.name,
            fullError: JSON.stringify(cascadeError, Object.getOwnPropertyNames(cascadeError)),
          });
          throw cascadeError;
        }
        
        console.log("[chatkit] Final result buttons:", finalResult?.buttons);
        console.log("[chatkit] Final result details:", {
          hasResult: !!finalResult,
          source: finalResult?.source,
          hasAnswer: !!finalResult?.answer,
          answerLength: finalResult?.answer?.length,
          hasButtons: !!finalResult?.buttons,
          buttonsCount: Array.isArray(finalResult?.buttons) ? finalResult.buttons.length : 0,
        });
        
        // If streaming was enabled and we have accumulated text, use it
        if (streamingText && streamingAssistantItem) {
          try {
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
            
            // Validate item before yielding
            if (!finalItem || !finalItem.type || !finalItem.id) {
              throw new Error("Invalid final item generated");
            }
            
            // Safely serialize before yielding
            const safeFinalItem = this.safeSerializeItem(finalItem);
            
            yield {
              type: "thread.item.replaced",
              item: safeFinalItem,
            };
          } catch (streamError) {
            this.logger?.error?.("[chatkit] Error yielding final streaming item", {
              error: streamError.message,
              stack: streamError.stack,
            });
            // Fall back to emitFinalAssistantMessage
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
          try {
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
          } catch (emitError) {
            this.logger?.error?.("[chatkit] Error emitting final assistant message", {
              error: emitError.message,
              stack: emitError.stack,
            });
            yield this.toErrorEvent(emitError);
          }
        }
      } else {
        const { result } = firstResult;
        try {
          yield* this.emitFinalAssistantMessage({
            thread,
            context,
            result,
            originalQuestion: question,
            originalHistory: history,
            originalContext: cascadeContext,
          });
        } catch (emitError) {
          this.logger?.error?.("[chatkit] Error emitting final assistant message (router path)", {
            error: emitError.message,
            stack: emitError.stack,
          });
          yield this.toErrorEvent(emitError);
        }
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
          item: this.safeSerializeItem(userMessage),
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
      .filter((part) => part && typeof part === "object" && part.type) // Filter out invalid parts
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
      .filter((part) => part && typeof part === "object" && part.type) // Filter out invalid parts
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
        console.log("[chatkit] Retrying cascade with feedback", {
          retryCount: retryCount + 1,
          maxRetries,
          invalidUrlCount: invalidUrls.length,
          hasOriginalQuestion: !!originalQuestion,
          hasOriginalHistory: !!originalHistory,
          historyLength: originalHistory?.length,
        });
        
        const retryResult = await runCascade({
          question: originalQuestion,
          history: retryHistory,
          context: originalContext,
          config: result?.config || undefined, // Safely pass config if available
        });
        
        console.log("[chatkit] Retry cascade completed successfully", {
          hasResult: !!retryResult,
          hasAnswer: !!retryResult?.answer,
          answerLength: retryResult?.answer?.length,
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
        console.error("[chatkit] ✗✗✗ FAILED TO RETRY CASCADE WITH FEEDBACK ✗✗✗", {
          error: retryError.message,
          stack: retryError.stack,
          name: retryError.name,
          retryCount: retryCount + 1,
          hasOriginalQuestion: !!originalQuestion,
          hasOriginalHistory: !!originalHistory,
          fullError: JSON.stringify(retryError, Object.getOwnPropertyNames(retryError)),
        });
        this.logger?.warn?.("[chatkit] Failed to retry cascade with feedback", {
          error: retryError.message,
          stack: retryError.stack,
        });
        // Fall through to use original response
      }
    }
    
    const assistantItem = this.buildAssistantMessageItem(thread, assistantText, context, {
      id: replaceId,
      created_at: originalCreatedAt,
      buttons: result.buttons || null,
    });

    // Validate assistantItem before yielding
    if (!assistantItem || !assistantItem.type || !assistantItem.id) {
      this.logger?.error?.("[chatkit] Invalid assistant item generated", {
        hasItem: !!assistantItem,
        itemType: assistantItem?.type,
        itemId: assistantItem?.id,
      });
      yield this.toErrorEvent(new Error("Failed to generate valid assistant message"));
      return;
    }

    // Validate content array
    if (!Array.isArray(assistantItem.content) || assistantItem.content.length === 0) {
      this.logger?.error?.("[chatkit] Assistant item has invalid content array", {
        itemId: assistantItem.id,
        contentType: typeof assistantItem.content,
        contentLength: Array.isArray(assistantItem.content) ? assistantItem.content.length : 0,
      });
      yield this.toErrorEvent(new Error("Failed to generate valid message content"));
      return;
    }

      try {
        for (const event of this.emitMetadataProgress(result)) {
          yield event;
        }

        // Safely serialize items before yielding
        const safeAssistantItem = this.safeSerializeItem(assistantItem);

        if (replaceId) {
          yield {
            type: "thread.item.replaced",
            item: safeAssistantItem,
          };
        } else {
          yield {
            type: "thread.item.done",
            item: safeAssistantItem,
          };
        }

        const endOfTurnItem = this.createEndOfTurnItem(thread, context);
        if (endOfTurnItem && endOfTurnItem.type && endOfTurnItem.id) {
          const safeEndOfTurnItem = this.safeSerializeItem(endOfTurnItem);
          yield {
            type: "thread.item.done",
            item: safeEndOfTurnItem,
          };
        } else {
          this.logger?.warn?.("[chatkit] Invalid end of turn item generated");
        }

        this.applyFinalMetadata(thread, result);
      } catch (yieldError) {
        this.logger?.error?.("[chatkit] Error yielding final assistant message", {
          error: yieldError.message,
          stack: yieldError.stack,
          itemId: assistantItem.id,
        });
        yield this.toErrorEvent(yieldError);
      }
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

  // Helper to safely serialize items before yielding
  // This helps catch serialization errors early and ensures content arrays are valid
  safeSerializeItem(item) {
    if (!item || typeof item !== "object") {
      this.logger?.error?.("[chatkit] Invalid item passed to safeSerializeItem", { item });
      return {
        type: "assistant_message",
        id: "error",
        thread_id: "",
        created_at: new Date().toISOString(),
        content: [
          {
            type: "output_text",
            text: "An error occurred while generating the response. Please try again.",
            annotations: [],
          },
        ],
      };
    }

    // Deep clone to avoid mutating the original
    // Use a safe cloning approach that handles circular references
    let cleanedItem;
    try {
      cleanedItem = JSON.parse(JSON.stringify(item));
    } catch (cloneError) {
      // If cloning fails (e.g., circular reference), create a shallow copy and manually clone content
      this.logger?.warn?.("[chatkit] Failed to deep clone item, using shallow copy", {
        error: cloneError.message,
        itemId: item.id,
      });
      cleanedItem = {
        type: item.type,
        id: item.id,
        thread_id: item.thread_id,
        created_at: item.created_at,
        content: Array.isArray(item.content) ? [...item.content] : undefined,
        metadata: item.metadata ? { ...item.metadata } : undefined,
      };
    }

    // Validate and clean content array
    if (Array.isArray(cleanedItem.content)) {
      cleanedItem.content = cleanedItem.content.filter((contentItem) => {
        // Filter out null, undefined, or invalid content items
        if (!contentItem || typeof contentItem !== "object") {
          this.logger?.warn?.("[chatkit] Filtering out invalid content item in safeSerializeItem", {
            itemId: cleanedItem.id,
            contentItem,
          });
          return false;
        }
        
        // Ensure content item has a type property
        if (!contentItem.type || typeof contentItem.type !== "string") {
          this.logger?.warn?.("[chatkit] Filtering out content item without type", {
            itemId: cleanedItem.id,
            contentItem,
          });
          return false;
        }

        // Validate annotations if present
        if (Array.isArray(contentItem.annotations)) {
          contentItem.annotations = contentItem.annotations.filter((ann) => {
            if (!ann || typeof ann !== "object" || !ann.type) {
              this.logger?.warn?.("[chatkit] Filtering out invalid annotation", {
                itemId: cleanedItem.id,
                annotation: ann,
              });
              return false;
            }
            return true;
          });
        }

        return true;
      });

      // Ensure at least one valid content item exists
      if (cleanedItem.content.length === 0) {
        this.logger?.warn?.("[chatkit] No valid content items after filtering, adding default", {
          itemId: cleanedItem.id,
        });
        // Try to preserve original text if available (before filtering)
        const originalText = Array.isArray(item.content) && item.content.length > 0 
          ? (item.content[0]?.text || "Response generated successfully.")
          : "Response generated successfully.";
        cleanedItem.content = [
          {
            type: "output_text",
            text: originalText,
            annotations: [],
          },
        ];
      }
    } else if (cleanedItem.content !== undefined) {
      // Content exists but is not an array - replace with valid array
      this.logger?.warn?.("[chatkit] Content is not an array, replacing with valid array", {
        itemId: cleanedItem.id,
        contentType: typeof cleanedItem.content,
      });
      cleanedItem.content = [
        {
          type: "output_text",
          text: typeof cleanedItem.content === "string" ? cleanedItem.content : "Response generated successfully.",
          annotations: [],
        },
      ];
    } else {
      // No content array at all - add default
      this.logger?.warn?.("[chatkit] No content array found, adding default", {
        itemId: cleanedItem.id,
      });
      cleanedItem.content = [
        {
          type: "output_text",
          text: "Response generated successfully.",
          annotations: [],
        },
      ];
    }

    // Validate required fields
    if (!cleanedItem.type || typeof cleanedItem.type !== "string") {
      this.logger?.error?.("[chatkit] Item missing type field", { itemId: cleanedItem.id });
      cleanedItem.type = cleanedItem.type || "assistant_message";
    }

    if (!cleanedItem.id || typeof cleanedItem.id !== "string") {
      this.logger?.error?.("[chatkit] Item missing id field", { item });
      cleanedItem.id = cleanedItem.id || "error";
    }

    try {
      // Try to serialize to catch any remaining circular references or invalid data
      JSON.stringify(cleanedItem);
      return cleanedItem;
    } catch (serializeError) {
      this.logger?.error?.("[chatkit] Failed to serialize cleaned item", {
        error: serializeError.message,
        itemType: cleanedItem.type,
        itemId: cleanedItem.id,
      });
      // Return a minimal valid item structure
      return {
        type: cleanedItem.type || "assistant_message",
        id: cleanedItem.id || "error",
        thread_id: cleanedItem.thread_id || "",
        created_at: cleanedItem.created_at || new Date().toISOString(),
        content: [
          {
            type: "output_text",
            text: "An error occurred while generating the response. Please try again.",
            annotations: [],
          },
        ],
      };
    }
  }
}

