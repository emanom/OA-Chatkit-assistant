'use strict';

var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/types/thread.ts
function isActiveStatus(status) {
  return status.type === "active";
}
function isLockedStatus(status) {
  return status.type === "locked";
}
function isClosedStatus(status) {
  return status.type === "closed";
}

// src/types/attachments.ts
function isFileAttachment(attachment) {
  return attachment.type === "file";
}
function isImageAttachment(attachment) {
  return attachment.type === "image";
}

// src/types/sources.ts
function isURLSource(source) {
  return source.type === "url";
}
function isFileSource(source) {
  return source.type === "file";
}
function isEntitySource(source) {
  return source.type === "entity";
}

// src/types/workflow.ts
function isCustomTask(task) {
  return task.type === "custom";
}
function isSearchTask(task) {
  return task.type === "web_search";
}
function isThoughtTask(task) {
  return task.type === "thought";
}
function isFileTask(task) {
  return task.type === "file";
}
function isImageTask(task) {
  return task.type === "image";
}

// src/types/items.ts
function isUserMessage(item) {
  return item.type === "user_message";
}
function isAssistantMessage(item) {
  return item.type === "assistant_message";
}
function isClientToolCall(item) {
  return item.type === "client_tool_call";
}
function isWidgetItem(item) {
  return item.type === "widget";
}
function isTaskItem(item) {
  return item.type === "task";
}
function isWorkflowItem(item) {
  return item.type === "workflow";
}
function isEndOfTurn(item) {
  return item.type === "end_of_turn";
}
function isHiddenContext(item) {
  return item.type === "hidden_context_item";
}

// src/types/requests.ts
function isStreamingReq(request) {
  return [
    "threads.create",
    "threads.add_user_message",
    "threads.add_client_tool_output",
    "threads.retry_after_item",
    "threads.custom_action"
  ].includes(request.type);
}
function isNonStreamingReq(request) {
  return !isStreamingReq(request);
}

// src/types/events.ts
function isThreadCreatedEvent(event) {
  return event.type === "thread.created";
}
function isThreadUpdatedEvent(event) {
  return event.type === "thread.updated";
}
function isThreadItemAddedEvent(event) {
  return event.type === "thread.item.added";
}
function isThreadItemDoneEvent(event) {
  return event.type === "thread.item.done";
}
function isThreadItemReplacedEvent(event) {
  return event.type === "thread.item.replaced";
}
function isThreadItemRemovedEvent(event) {
  return event.type === "thread.item.removed";
}
function isErrorEvent(event) {
  return event.type === "error";
}
function isProgressUpdateEvent(event) {
  return event.type === "progress_update";
}
function isNoticeEvent(event) {
  return event.type === "notice";
}

// src/types/store.ts
var NotFoundError = class _NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, _NotFoundError.prototype);
  }
};

// src/errors/index.ts
var ErrorCode = /* @__PURE__ */ ((ErrorCode2) => {
  ErrorCode2["STREAM_ERROR"] = "stream.error";
  ErrorCode2["INTERNAL_ERROR"] = "internal.error";
  ErrorCode2["INVALID_REQUEST"] = "invalid.request";
  ErrorCode2["THREAD_NOT_FOUND"] = "thread.not_found";
  ErrorCode2["ITEM_NOT_FOUND"] = "item.not_found";
  ErrorCode2["ATTACHMENT_NOT_FOUND"] = "attachment.not_found";
  ErrorCode2["THREAD_LOCKED"] = "thread.locked";
  ErrorCode2["THREAD_CLOSED"] = "thread.closed";
  return ErrorCode2;
})(ErrorCode || {});
var StreamError = class _StreamError extends Error {
  code;
  allowRetry;
  constructor(code, allowRetry = false) {
    super(`Stream error: ${code}`);
    this.name = "StreamError";
    this.code = code;
    this.allowRetry = allowRetry;
    Object.setPrototypeOf(this, _StreamError.prototype);
  }
};
var CustomStreamError = class _CustomStreamError extends Error {
  allowRetry;
  constructor(message, allowRetry = false) {
    super(message);
    this.name = "CustomStreamError";
    this.allowRetry = allowRetry;
    Object.setPrototypeOf(this, _CustomStreamError.prototype);
  }
};

// src/utils/logger.ts
var ConsoleLogger = class {
  info(message, extra) {
    if (extra) {
      console.log(`[INFO] ${message}`, extra);
    } else {
      console.log(`[INFO] ${message}`);
    }
  }
  warn(message, extra) {
    if (extra) {
      console.warn(`[WARN] ${message}`, extra);
    } else {
      console.warn(`[WARN] ${message}`);
    }
  }
  error(message, extra) {
    if (extra) {
      console.error(`[ERROR] ${message}`, extra);
    } else {
      console.error(`[ERROR] ${message}`);
    }
  }
  debug(message, extra) {
    if (extra) {
      console.debug(`[DEBUG] ${message}`, extra);
    } else {
      console.debug(`[DEBUG] ${message}`);
    }
  }
};
var defaultLogger = new ConsoleLogger();

// src/server/results.ts
var StreamingResult = class {
  isStreaming = true;
  generator;
  constructor(generator) {
    this.generator = generator;
  }
  /**
   * Async iterator that yields SSE-formatted strings.
   */
  async *[Symbol.asyncIterator]() {
    for await (const event of this.generator) {
      const json = JSON.stringify(event, (_, value) => value === null ? void 0 : value);
      yield `data: ${json}

`;
    }
  }
};
var NonStreamingResult = class {
  isStreaming = false;
  data;
  constructor(data) {
    this.data = data;
  }
  /**
   * Get the response data as a JSON-serializable object.
   */
  toJSON() {
    return this.data;
  }
  /**
   * Get the response data as a JSON string.
   */
  toString() {
    return JSON.stringify(this.data, (_, value) => value === null ? void 0 : value);
  }
};

// src/server/ChatKitServer.ts
var DEFAULT_PAGE_SIZE = 20;
var ChatKitServer = class {
  store;
  attachmentStore;
  logger;
  constructor(store, attachmentStore, logger) {
    this.store = store;
    this.attachmentStore = attachmentStore;
    this.logger = logger || defaultLogger;
  }
  /**
   * Get the configured attachment store or throw if not configured
   */
  getAttachmentStore() {
    if (!this.attachmentStore) {
      throw new Error(
        "AttachmentStore is not configured. Provide an AttachmentStore to ChatKitServer to handle file operations."
      );
    }
    return this.attachmentStore;
  }
  /**
   * Optional: Handle feedback on thread items
   *
   * Override this method to store or process user feedback (thumbs up/down).
   * Default implementation does nothing.
   *
   * @param threadId - Thread ID
   * @param itemIds - List of item IDs receiving feedback
   * @param feedback - 'positive' or 'negative'
   * @param context - Request context
   */
  async addFeedback(threadId, itemIds, feedback, _context) {
    this.logger.debug("Feedback received", { threadId, itemIds, feedback });
  }
  /**
   * Optional: Handle custom actions from widgets
   *
   * Override this method to react to button clicks and form submissions from widgets.
   * Default implementation throws NotImplementedError.
   *
   * @param thread - Thread metadata
   * @param action - Action payload from widget
   * @param sender - Widget item that sent the action, if any
   * @param context - Request context
   * @returns AsyncGenerator yielding ThreadStreamEvent instances
   */
  async *action(_thread, _action, _sender, _context) {
    throw new Error(
      "The action() method must be overridden to react to actions. See ChatKit documentation for widget actions."
    );
  }
  /**
   * Main entry point: Process a ChatKit request
   *
   * Parses the request JSON, routes to appropriate handler, and returns
   * either a StreamingResult or NonStreamingResult.
   *
   * @param request - JSON request string or buffer
   * @param context - Per-request context
   * @returns StreamingResult or NonStreamingResult
   */
  async process(request, context) {
    const requestStr = typeof request === "string" ? request : request.toString("utf-8");
    const parsedRequest = JSON.parse(requestStr);
    this.logger.info(`Received request op: ${parsedRequest.type}`);
    if (isStreamingReq(parsedRequest)) {
      return new StreamingResult(this.processStreaming(parsedRequest, context));
    } else {
      const result = await this.processNonStreaming(parsedRequest, context);
      return new NonStreamingResult(result);
    }
  }
  /**
   * Process non-streaming requests (returns JSON)
   */
  async processNonStreaming(request, context) {
    switch (request.type) {
      case "threads.get_by_id": {
        const req = request;
        const thread = await this.loadFullThread(req.params.thread_id, context);
        return this.toThreadResponse(thread);
      }
      case "threads.list": {
        const req = request;
        const params = req.params;
        const threads = await this.store.loadThreads(
          params.limit || DEFAULT_PAGE_SIZE,
          params.after || null,
          params.order || "desc",
          context
        );
        return {
          has_more: threads.has_more,
          after: threads.after,
          data: threads.data.map((thread) => this.toThreadResponse(thread))
        };
      }
      case "threads.update": {
        const req = request;
        const thread = await this.store.loadThread(req.params.thread_id, context);
        if (req.params.title !== void 0) {
          thread.title = req.params.title;
        }
        await this.store.saveThread(thread, context);
        return this.toThreadResponse(thread);
      }
      case "threads.delete": {
        const req = request;
        await this.store.deleteThread(req.params.thread_id, context);
        return {};
      }
      case "items.list": {
        const req = request;
        const params = req.params;
        const items = await this.store.loadThreadItems(
          params.thread_id,
          params.after || null,
          params.limit || DEFAULT_PAGE_SIZE,
          params.order || "asc",
          context
        );
        items.data = items.data.filter((item) => item.type !== "hidden_context_item");
        return items;
      }
      case "items.feedback": {
        const req = request;
        await this.addFeedback(
          req.params.thread_id,
          req.params.item_ids,
          req.params.kind,
          context
        );
        return {};
      }
      case "attachments.create": {
        const req = request;
        const attachmentStore = this.getAttachmentStore();
        const attachment = await attachmentStore.createAttachment(req.params, context);
        await this.store.saveAttachment(attachment, context);
        return attachment;
      }
      case "attachments.delete": {
        const req = request;
        const attachmentStore = this.getAttachmentStore();
        await attachmentStore.deleteAttachment(req.params.attachment_id, context);
        await this.store.deleteAttachment(req.params.attachment_id, context);
        return {};
      }
      default: {
        const exhaustiveCheck = request;
        throw new Error(`Unknown request type: ${exhaustiveCheck.type}`);
      }
    }
  }
  /**
   * Process streaming requests (returns SSE stream)
   */
  async *processStreaming(request, context) {
    try {
      yield* this.processStreamingImpl(request, context);
    } catch (error) {
      this.logger.error("Error while generating streamed response", { error });
      throw error;
    }
  }
  /**
   * Implementation of streaming request processing
   */
  async *processStreamingImpl(request, context) {
    switch (request.type) {
      case "threads.create": {
        const req = request;
        console.log("DEBUG threads.create params:", JSON.stringify(req.params, null, 2));
        const thread = {
          id: this.store.generateThreadId(context),
          title: null,
          created_at: (/* @__PURE__ */ new Date()).toISOString(),
          status: { type: "active" },
          metadata: {}
        };
        await this.store.saveThread(thread, context);
        yield {
          type: "thread.created",
          thread: this.toThreadResponse(thread)
        };
        const userMessage = await this.buildUserMessageItem(req.params.input, thread, context);
        yield* this.processNewThreadItemRespond(thread, userMessage, context);
        break;
      }
      case "threads.add_user_message": {
        const req = request;
        const thread = await this.store.loadThread(req.params.thread_id, context);
        const userMessage = await this.buildUserMessageItem(req.params.input, thread, context);
        yield* this.processNewThreadItemRespond(thread, userMessage, context);
        break;
      }
      case "threads.add_client_tool_output": {
        const req = request;
        const thread = await this.store.loadThread(req.params.thread_id, context);
        const items = await this.store.loadThreadItems(
          req.params.thread_id,
          null,
          1e3,
          // Load enough items to find the pending tool call
          "desc",
          // Most recent first
          context
        );
        const pendingToolCall = items.data.find(
          (item) => item.type === "client_tool_call" && item.status === "pending"
        );
        if (!pendingToolCall) {
          throw new Error("No pending client tool call found");
        }
        const updatedToolCall = {
          ...pendingToolCall,
          status: "completed",
          output: req.params.result
        };
        await this.store.saveItem(thread.id, updatedToolCall, context);
        yield {
          type: "thread.item.replaced",
          item: updatedToolCall
        };
        yield* this.processEvents(thread, context, () => this.respond(thread, null, context));
        break;
      }
      case "threads.retry_after_item": {
        const req = request;
        const thread = await this.store.loadThread(req.params.thread_id, context);
        const items = await this.store.loadThreadItems(
          req.params.thread_id,
          null,
          1e3,
          // Load enough items
          "asc",
          // Chronological order
          context
        );
        const itemIndex = items.data.findIndex((item) => item.id === req.params.item_id);
        if (itemIndex === -1) {
          throw new Error(`Item ${req.params.item_id} not found in thread`);
        }
        let lastUserMessage = null;
        for (let i = itemIndex; i >= 0; i--) {
          const item = items.data[i];
          if (item && item.type === "user_message") {
            lastUserMessage = item;
            break;
          }
        }
        if (!lastUserMessage) {
          throw new Error("No user message found before the specified item");
        }
        yield* this.processEvents(
          thread,
          context,
          () => this.respond(thread, lastUserMessage, context)
        );
        break;
      }
      case "threads.custom_action": {
        const req = request;
        const thread = await this.store.loadThread(req.params.thread_id, context);
        let senderWidget = null;
        if (req.params.item_id) {
          const item = await this.store.loadItem(
            thread.id,
            req.params.item_id,
            context
          );
          if (item.type === "widget") {
            senderWidget = item;
          }
        }
        yield* this.processEvents(
          thread,
          context,
          () => this.action(thread, req.params.action, senderWidget, context)
        );
        break;
      }
      default: {
        const exhaustiveCheck = request;
        throw new Error(`Unknown request type: ${exhaustiveCheck.type}`);
      }
    }
  }
  /**
   * Process a new user message and generate response
   */
  async *processNewThreadItemRespond(thread, item, context) {
    await this.store.addThreadItem(thread.id, item, context);
    yield {
      type: "thread.item.done",
      item
    };
    yield* this.processEvents(thread, context, () => this.respond(thread, item, context));
  }
  /**
   * Process events from user's respond() method
   *
   * Handles:
   * - Saving items to store
   * - Error handling
   * - Thread updates
   * - Filtering hidden context items
   */
  async *processEvents(thread, context, streamFn) {
    let lastThread = { ...thread };
    try {
      for await (const event of streamFn()) {
        switch (event.type) {
          case "thread.item.done": {
            const doneEvent = event;
            await this.store.addThreadItem(thread.id, doneEvent.item, context);
            break;
          }
          case "thread.item.removed": {
            const removedEvent = event;
            await this.store.deleteThreadItem(thread.id, removedEvent.item_id, context);
            break;
          }
          case "thread.item.replaced": {
            const replacedEvent = event;
            await this.store.saveItem(thread.id, replacedEvent.item, context);
            break;
          }
        }
        const shouldSwallowEvent = event.type === "thread.item.done" && event.item.type === "hidden_context_item";
        if (!shouldSwallowEvent) {
          yield event;
        }
        if (JSON.stringify(thread) !== JSON.stringify(lastThread)) {
          lastThread = { ...thread };
          await this.store.saveThread(thread, context);
          yield {
            type: "thread.updated",
            thread: this.toThreadResponse(thread)
          };
        }
      }
      if (JSON.stringify(thread) !== JSON.stringify(lastThread)) {
        lastThread = { ...thread };
        await this.store.saveThread(thread, context);
        yield {
          type: "thread.updated",
          thread: this.toThreadResponse(thread)
        };
      }
    } catch (error) {
      if (error instanceof CustomStreamError) {
        yield {
          type: "error",
          code: "custom",
          message: error.message,
          allow_retry: error.allowRetry
        };
      } else if (error instanceof StreamError) {
        yield {
          type: "error",
          code: error.code,
          allow_retry: error.allowRetry
        };
      } else {
        yield {
          type: "error",
          code: "stream.error" /* STREAM_ERROR */,
          allow_retry: true
        };
        this.logger.error("Unhandled error in stream", { error });
      }
    }
  }
  /**
   * Build a UserMessageItem from input
   */
  async buildUserMessageItem(input, thread, context) {
    const attachments = await Promise.all(
      (input.attachments || []).map((id) => this.store.loadAttachment(id, context))
    );
    return {
      type: "user_message",
      id: this.store.generateItemId("message", thread, context),
      thread_id: thread.id,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      content: input.content,
      attachments,
      quoted_text: input.quoted_text || null,
      inference_options: input.inference_options || {}
    };
  }
  /**
   * Load a full thread with items
   */
  async loadFullThread(threadId, context) {
    const threadMeta = await this.store.loadThread(threadId, context);
    const threadItems = await this.store.loadThreadItems(
      threadId,
      null,
      DEFAULT_PAGE_SIZE,
      "asc",
      context
    );
    return {
      ...threadMeta,
      items: threadItems
    };
  }
  /**
   * Convert ThreadMetadata or Thread to Thread response
   * (filters out hidden context items)
   */
  toThreadResponse(thread) {
    const isThread = (t) => "items" in t;
    const items = isThread(thread) ? thread.items : { data: [], has_more: false, after: null };
    items.data = items.data.filter((item) => item.type !== "hidden_context_item");
    return {
      id: thread.id,
      title: thread.title,
      created_at: thread.created_at,
      status: thread.status,
      metadata: thread.metadata,
      items
    };
  }
};

// src/agents/widget-helpers.ts
function diffWidget(before, after) {
  function needsFullReplace(before2, after2) {
    if (before2.type !== after2.type) {
      return true;
    }
    if (before2.id !== after2.id || before2.key !== after2.key) {
      return true;
    }
    const beforeKeys = new Set(Object.keys(before2));
    const afterKeys = new Set(Object.keys(after2));
    const allKeys = /* @__PURE__ */ new Set([...beforeKeys, ...afterKeys]);
    for (const key of allKeys) {
      if ((before2.type === "Text" || before2.type === "Markdown") && key === "value" && typeof after2.value === "string" && typeof before2.value === "string" && after2.value.startsWith(before2.value)) {
        continue;
      }
      const beforeVal = before2[key];
      const afterVal = after2[key];
      if (Array.isArray(beforeVal) && Array.isArray(afterVal)) {
        if (beforeVal.length !== afterVal.length) {
          return true;
        }
        for (let i = 0; i < beforeVal.length; i++) {
          if (typeof beforeVal[i] === "object" && typeof afterVal[i] === "object") {
            if (needsFullReplace(beforeVal[i], afterVal[i])) {
              return true;
            }
          } else if (beforeVal[i] !== afterVal[i]) {
            return true;
          }
        }
      } else if (typeof beforeVal === "object" && beforeVal !== null && typeof afterVal === "object" && afterVal !== null) {
        if (needsFullReplace(beforeVal, afterVal)) {
          return true;
        }
      } else if (beforeVal !== afterVal) {
        return true;
      }
    }
    return false;
  }
  if (needsFullReplace(before, after)) {
    return [
      {
        type: "widget.root.updated",
        widget: after
      }
    ];
  }
  const deltas = [];
  function findAllStreamingTextComponents(component) {
    const components = /* @__PURE__ */ new Map();
    function recurse(comp) {
      if (comp && typeof comp === "object" && (comp.type === "Text" || comp.type === "Markdown") && comp.id) {
        components.set(comp.id, comp);
      }
      if (comp && typeof comp === "object" && comp.children) {
        const children = Array.isArray(comp.children) ? comp.children : [];
        for (const child of children) {
          recurse(child);
        }
      }
    }
    recurse(component);
    return components;
  }
  const beforeNodes = findAllStreamingTextComponents(before);
  const afterNodes = findAllStreamingTextComponents(after);
  for (const [id, afterNode] of afterNodes) {
    const beforeNode = beforeNodes.get(id);
    if (!beforeNode) {
      throw new Error(
        `Node ${id} was not present when the widget was initially rendered. All nodes with ID must persist across all widget updates.`
      );
    }
    const beforeValue = beforeNode.value || "";
    const afterValue = afterNode.value || "";
    if (beforeValue !== afterValue) {
      if (!afterValue.startsWith(beforeValue)) {
        throw new Error(
          `Node ${id} was updated with a new value that is not a prefix of the initial value. All widget updates must be cumulative.`
        );
      }
      const delta = afterValue.slice(beforeValue.length);
      const done = !afterNode.streaming;
      deltas.push({
        type: "widget.streaming_text.value_delta",
        component_id: id,
        delta,
        done
      });
    }
  }
  return deltas;
}
async function* accumulateText(events, baseWidget) {
  let accumulatedText = "";
  yield baseWidget;
  for await (const event of events) {
    if (event.type === "raw_model_stream_event") {
      const { data } = event;
      if (data.type === "output_text_delta") {
        const delta = data.delta || "";
        accumulatedText += delta;
        yield {
          ...baseWidget,
          value: accumulatedText,
          streaming: true
        };
      }
    }
  }
  yield {
    ...baseWidget,
    value: accumulatedText,
    streaming: false
  };
}

// src/utils/id.ts
function generateId(prefix) {
  const randomHex = Math.random().toString(16).substring(2, 10).padStart(8, "0");
  return `${prefix}_${randomHex}`;
}
function defaultGenerateThreadId() {
  return generateId("thr");
}
function defaultGenerateItemId(type) {
  const prefixMap = {
    message: "msg",
    tool_call: "tc",
    task: "task",
    workflow: "wf",
    attachment: "atc"
  };
  const prefix = prefixMap[type];
  return generateId(prefix);
}
function defaultGenerateAttachmentId() {
  return generateId("atc");
}

// src/server/widget-stream.ts
async function* streamWidget(thread, widget, copyText, generateId2 = (itemType) => defaultGenerateItemId(itemType)) {
  const itemId = generateId2("message");
  if (typeof widget === "object" && widget !== null && !("next" in widget && typeof widget.next === "function")) {
    const widgetItem2 = {
      type: "widget",
      id: itemId,
      thread_id: thread.id,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      widget,
      copy_text: copyText || null
    };
    yield {
      type: "thread.item.done",
      item: widgetItem2
    };
    return;
  }
  const widgetGen = widget;
  const initialResult = await widgetGen.next();
  if (initialResult.done) {
    return;
  }
  const initialState = initialResult.value;
  const widgetItem = {
    type: "widget",
    id: itemId,
    thread_id: thread.id,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    widget: initialState,
    copy_text: copyText || null
  };
  yield {
    type: "thread.item.added",
    item: widgetItem
  };
  let lastState = initialState;
  for await (const newState of widgetGen) {
    const deltas = diffWidget(lastState, newState);
    for (const update of deltas) {
      yield {
        type: "thread.item.updated",
        item_id: itemId,
        update
      };
    }
    lastState = newState;
  }
  yield {
    type: "thread.item.done",
    item: {
      ...widgetItem,
      widget: lastState
    }
  };
}

// src/store/Store.ts
var NotFoundError2 = class extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
  }
};
var Store = class {
  /**
   * Generate a thread ID
   *
   * Override to customize ID format. Default: 'thr_' + 8 random hex chars
   */
  generateThreadId(_context) {
    return defaultGenerateThreadId();
  }
  /**
   * Generate an item ID
   *
   * Override to customize ID format. Default: type-specific prefix + 8 random hex chars
   */
  generateItemId(type, _thread, _context) {
    return defaultGenerateItemId(type);
  }
};

// src/store/AttachmentStore.ts
var AttachmentStore = class {
  /**
   * Generate an attachment ID
   *
   * Override to customize ID format. Default: 'atc_' + 8 random hex chars
   */
  generateAttachmentId(_mimeType, _context) {
    return defaultGenerateAttachmentId();
  }
};

// src/agents/index.ts
var agents_exports = {};
__export(agents_exports, {
  AsyncEventQueue: () => AsyncEventQueue,
  DefaultThreadItemConverter: () => DefaultThreadItemConverter,
  EventWrapper: () => EventWrapper,
  InputThreadItemConverter: () => InputThreadItemConverter,
  ThreadItemConverter: () => ThreadItemConverter,
  accumulateText: () => accumulateText,
  createAgentContext: () => createAgentContext,
  defaultInputConverter: () => defaultInputConverter,
  diffWidget: () => diffWidget,
  mergeAsyncGenerators: () => mergeAsyncGenerators,
  simpleToAgentInput: () => simpleToAgentInput,
  streamAgentResponse: () => streamAgentResponse
});

// src/agents/types.ts
var AsyncEventQueue = class _AsyncEventQueue {
  queue = [];
  resolvers = [];
  completed = false;
  static COMPLETE = Symbol("COMPLETE");
  /**
   * Add an event to the queue
   */
  push(event) {
    if (this.completed) {
      throw new Error("Cannot push to completed queue");
    }
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift();
      resolve(event);
    } else {
      this.queue.push(event);
    }
  }
  /**
   * Mark the queue as complete
   */
  complete() {
    this.completed = true;
    for (const resolve of this.resolvers) {
      resolve(_AsyncEventQueue.COMPLETE);
    }
    this.resolvers = [];
  }
  /**
   * Get next event from queue (async)
   */
  next() {
    if (this.queue.length > 0) {
      return Promise.resolve(this.queue.shift());
    }
    if (this.completed) {
      return Promise.resolve(_AsyncEventQueue.COMPLETE);
    }
    return new Promise((resolve) => {
      this.resolvers.push(resolve);
    });
  }
  /**
   * Implement AsyncIterable
   */
  async *[Symbol.asyncIterator]() {
    while (true) {
      const value = await this.next();
      if (value === _AsyncEventQueue.COMPLETE) {
        break;
      }
      yield value;
    }
  }
};

// src/agents/context-helpers.ts
function createAgentContext(thread, store, requestContext) {
  const _events = new AsyncEventQueue();
  const context = {
    thread,
    store,
    requestContext,
    _events,
    // NEW: Python SDK parity fields
    previousResponseId: null,
    workflowItem: null,
    // Convenience ID generation
    generateId(type, thread2) {
      const targetThread = thread2 || context.thread;
      return store.generateItemId(type, targetThread, requestContext);
    },
    // Workflow management methods
    async startWorkflow(workflow) {
      const workflowItem = {
        type: "workflow",
        id: context.generateId("workflow"),
        thread_id: context.thread.id,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        workflow
      };
      context.workflowItem = workflowItem;
      if (workflow.type !== "reasoning" && workflow.tasks.length === 0) {
        return;
      }
      await context.stream({
        type: "thread.item.added",
        item: workflowItem
      });
    },
    async endWorkflow(summary, expanded = false) {
      if (!context.workflowItem) {
        return;
      }
      if (summary !== void 0) {
        context.workflowItem.workflow.summary = summary;
      } else if (context.workflowItem.workflow.summary === null) {
        const start = new Date(context.workflowItem.created_at).getTime();
        const end = Date.now();
        const duration = Math.floor((end - start) / 1e3);
        context.workflowItem.workflow.summary = {
          duration
        };
      }
      context.workflowItem.workflow.expanded = expanded;
      await context.stream({
        type: "thread.item.done",
        item: context.workflowItem
      });
      context.workflowItem = null;
    },
    async addWorkflowTask(task) {
      if (!context.workflowItem) {
        await context.startWorkflow({
          type: "custom",
          tasks: [],
          expanded: true,
          summary: null
        });
      }
      const workflow = context.workflowItem.workflow;
      workflow.tasks.push(task);
      if (workflow.type !== "reasoning" && workflow.tasks.length === 1) {
        await context.stream({
          type: "thread.item.added",
          item: context.workflowItem
        });
      } else {
        await context.stream({
          type: "thread.item.updated",
          item_id: context.workflowItem.id,
          update: {
            type: "workflow.task.added",
            task_index: workflow.tasks.length - 1,
            task
          }
        });
      }
    },
    async updateWorkflowTask(task, taskIndex) {
      if (!context.workflowItem) {
        throw new Error("No active workflow to update");
      }
      const workflow = context.workflowItem.workflow;
      if (taskIndex < 0 || taskIndex >= workflow.tasks.length) {
        throw new Error(`Task index ${taskIndex} out of bounds (workflow has ${workflow.tasks.length} tasks)`);
      }
      workflow.tasks[taskIndex] = task;
      await context.stream({
        type: "thread.item.updated",
        item_id: context.workflowItem.id,
        update: {
          type: "workflow.task.updated",
          task_index: taskIndex,
          task
        }
      });
    },
    async stream(event) {
      _events.push(event);
    },
    async streamWidget(widget, copyText) {
      for await (const event of streamWidget(
        thread,
        widget,
        copyText,
        (itemType) => store.generateItemId(itemType, thread, requestContext)
      )) {
        _events.push(event);
      }
    }
  };
  return context;
}

// src/agents/input-item-converter.ts
var InputThreadItemConverter = class {
  /**
   * Convert an attachment to message content.
   *
   * REQUIRED when attachments are used in your application.
   * Override this method to handle your attachment storage system.
   *
   * @param attachment - The attachment to convert
   * @returns Message content representing the attachment
   * @throws Error if not implemented and attachments are present
   */
  async attachmentToMessageContent(_attachment) {
    throw new Error(
      "An Attachment was included in a UserMessageItem but InputThreadItemConverter.attachmentToMessageContent() was not implemented. Override this method to handle attachments."
    );
  }
  /**
   * Convert a tag (@-mention) to message content.
   *
   * REQUIRED when tags are used in your application.
   * Tags allow users to reference entities like "@customer-123" or "@ticket-456".
   *
   * @param tag - The tag content from user message
   * @returns Message content providing context about the tagged entity
   * @throws Error if not implemented and tags are present
   *
   * @example
   * ```typescript
   * async tagToMessageContent(tag: { type: 'input_tag'; text: string }): Promise<ResponseInputContentParam> {
   *   // Lookup entity by tag
   *   const customer = await db.customers.findByTag(tag.text);
   *   return {
   *     type: 'input_text',
   *     text: `Customer: ${customer.name} (ID: ${customer.id})`
   *   };
   * }
   * ```
   */
  tagToMessageContent(_tag) {
    throw new Error(
      "A Tag was included in a UserMessageItem but InputThreadItemConverter.tagToMessageContent() is not implemented. Override this method to handle tags."
    );
  }
  /**
   * Convert a HiddenContextItem to agent input.
   *
   * REQUIRED when HiddenContextItems are used.
   * These are system-level context items not visible to users.
   *
   * @param item - The hidden context item
   * @returns Input items for the agent, or null to skip
   * @throws Error if not implemented and hidden context items are present
   */
  hiddenContextToInput(_item) {
    throw new Error(
      "HiddenContextItem was present but InputThreadItemConverter.hiddenContextToInput() was not implemented. Override this method to handle hidden context items."
    );
  }
  /**
   * Convert a WidgetItem to agent input.
   *
   * By default, converts widget to JSON description so AI knows it was displayed.
   * Override to customize how widgets are described to the AI.
   *
   * @param item - The widget item from thread history
   * @returns Input message describing the widget, or null to skip
   *
   * @example Default behavior
   * ```typescript
   * // Widget item with id "wid_123" becomes:
   * {
   *   type: 'message',
   *   role: 'user',
   *   content: [{
   *     type: 'input_text',
   *     text: 'The following graphical UI widget (id: wid_123) was displayed to the user: {"type":"Card","children":[...]}'
   *   }]
   * }
   * ```
   */
  widgetToInput(item) {
    return {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: `The following graphical UI widget (id: ${item.id}) was displayed to the user: ${JSON.stringify(item.widget)}`
        }
      ]
    };
  }
  /**
   * Convert a WorkflowItem to agent input messages.
   *
   * By default, workflows are SKIPPED from AI context (returns empty array).
   * Workflows are visual progress indicators - the AI doesn't need to see them in history.
   * The actual tool result contains the important information.
   *
   * Note: Workflows remain visible in the UI when loading thread history.
   * They're only skipped from the AI's conversation context.
   *
   * @param item - The workflow item from thread history
   * @returns Empty array (workflows skipped by default)
   *
   * @example To include workflows in AI context, override this method:
   * ```typescript
   * workflowToInput(item: WorkflowItem): ResponseInputItem[] {
   *   if (item.workflow.type === 'reasoning') {
   *     return []; // Skip AI's own thinking
   *   }
   *
   *   const messages: ResponseInputItem[] = [];
   *   for (const task of item.workflow.tasks) {
   *     if (task.type === 'custom' && (task.title || task.content)) {
   *       const taskText = task.title && task.content
   *         ? `${task.title}: ${task.content}`
   *         : task.title || task.content;
   *       messages.push({
   *         type: 'message',
   *         role: 'user',
   *         content: [{
   *           type: 'input_text',
   *           text: `Task performed: ${taskText}`
   *         }]
   *       });
   *     }
   *   }
   *   return messages;
   * }
   * ```
   */
  workflowToInput(_item) {
    return [];
  }
  /**
   * Convert a TaskItem to agent input.
   *
   * By default, converts custom tasks to a message describing the work performed.
   *
   * @param item - The task item from thread history
   * @returns Input message describing the task, or null to skip
   */
  taskToInput(item) {
    if (item.task.type !== "custom" || !item.task.title && !item.task.content) {
      return null;
    }
    const title = item.task.title || "";
    const content = item.task.content || "";
    const taskText = title && content ? `${title}: ${content}` : title || content;
    return {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: `A message was displayed to the user that the following task was performed:
<Task>${taskText}</Task>`
        }
      ]
    };
  }
  /**
   * Convert a UserMessageItem to agent input.
   *
   * Handles:
   * - Text content
   * - Attachments (images, files)
   * - Tags (@-mentions)
   * - Quoted text (reply-to context)
   *
   * @param item - The user message item
   * @param isLastMessage - Whether this is the last message in the sequence (affects quoted text handling)
   * @returns Array of input messages (user text + optional context messages)
   *
   * @example
   * ```typescript
   * // User message with text and tag becomes:
   * [
   *   {
   *     type: 'message',
   *     role: 'user',
   *     content: [
   *       { type: 'input_text', text: 'Show me details for @customer-123' }
   *     ]
   *   },
   *   {
   *     type: 'message',
   *     role: 'user',
   *     content: [
   *       {
   *         type: 'input_text',
   *         text: '# User-provided context for @-mentions\n...\nCustomer: John Doe (ID: 123)'
   *       }
   *     ]
   *   }
   * ]
   * ```
   */
  async userMessageToInput(item, isLastMessage = true) {
    const messageTextParts = [];
    const rawTags = [];
    for (const part of item.content) {
      if (part.type === "input_text") {
        messageTextParts.push(part.text);
      } else if (part.type === "input_tag") {
        messageTextParts.push(`@${part.text}`);
        rawTags.push(part);
      }
    }
    const userTextItem = {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: messageTextParts.join("")
        },
        // Add attachment content
        ...await Promise.all(
          item.attachments.map((a) => this.attachmentToMessageContent(a))
        )
      ]
    };
    const contextItems = [];
    if (item.quoted_text && isLastMessage) {
      contextItems.push({
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: `The user is referring to this in particular:
${item.quoted_text}`
          }
        ]
      });
    }
    if (rawTags.length > 0) {
      const seen = /* @__PURE__ */ new Set();
      const uniqueTags = [];
      for (const tag of rawTags) {
        if (!seen.has(tag.text)) {
          seen.add(tag.text);
          uniqueTags.push(tag);
        }
      }
      const tagContent = uniqueTags.map(
        (tag) => this.tagToMessageContent(tag)
      );
      if (tagContent.length > 0) {
        contextItems.push({
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "# User-provided context for @-mentions\n- When referencing resolved entities, use their canonical names **without** '@'.\n- The '@' form appears only in user text and should not be echoed."
            },
            ...tagContent
          ]
        });
      }
    }
    return [userTextItem, ...contextItems];
  }
  /**
   * Convert an AssistantMessageItem to agent input.
   *
   * By default, SKIPS assistant messages (returns null) to avoid conflicts with previousResponseId.
   * The Agents SDK doesn't handle explicit assistant messages well in conversation history.
   *
   * Override this method if you need assistant messages in history (not recommended).
   *
   * @param item - The assistant message item
   * @returns null (assistant messages skipped by default)
   */
  async assistantMessageToInput(_item) {
    return null;
  }
  /**
   * Convert a ClientToolCallItem to agent input.
   *
   * Converts both the tool call and its result to agent input format.
   * Skips pending tool calls (not yet completed).
   *
   * @param item - The client tool call item
   * @returns Array of [function_call, function_call_output], or empty array if pending
   */
  async clientToolCallToInput(item) {
    if (item.status === "pending") {
      return [];
    }
    return [
      {
        type: "function_call",
        call_id: item.call_id,
        name: item.name,
        arguments: JSON.stringify(item.arguments)
      },
      {
        type: "function_call_output",
        call_id: item.call_id,
        output: JSON.stringify(item.output)
      }
    ];
  }
  /**
   * Convert an EndOfTurnItem to agent input.
   *
   * These are UI hints for turn boundaries - not sent to the model.
   *
   * @param item - The end of turn item
   * @returns null (always skipped)
   */
  async endOfTurnToInput(_item) {
    return null;
  }
  /**
   * Internal: Convert a single thread item to agent input items.
   * Routes to appropriate conversion method based on item type.
   */
  async threadItemToInputItems(item, isLastMessage = true) {
    let result;
    switch (item.type) {
      case "user_message":
        result = await this.userMessageToInput(item, isLastMessage);
        break;
      case "assistant_message":
        result = await this.assistantMessageToInput(item);
        break;
      case "client_tool_call":
        result = await this.clientToolCallToInput(item);
        break;
      case "end_of_turn":
        result = await this.endOfTurnToInput(item);
        break;
      case "widget":
        result = this.widgetToInput(item);
        break;
      case "workflow":
        result = this.workflowToInput(item);
        break;
      case "task":
        result = this.taskToInput(item);
        break;
      case "hidden_context_item":
        result = this.hiddenContextToInput(item);
        break;
      default:
        const _exhaustive = item;
        throw new Error(`Unknown thread item type: ${_exhaustive.type}`);
    }
    if (result === null) {
      return [];
    }
    return Array.isArray(result) ? result : [result];
  }
  /**
   * Convert full thread history to agent input.
   *
   * This is the main method you'll use. Pass in an array of ThreadItems
   * (typically loaded from your store) and get back agent input ready
   * to send to the Agent SDK.
   *
   * @param items - Array of thread items (usually from store.loadThreadItems())
   * @returns Array of input items for Agent SDK
   *
   * @example
   * ```typescript
   * // Load recent thread history
   * const historyResult = await store.loadThreadItems(
   *   threadId,
   *   null,  // after
   *   50,    // limit
   *   'asc', // chronological order
   *   context
   * );
   *
   * // Convert to agent input (includes widgets, workflows, tasks!)
   * const converter = new InputThreadItemConverter();
   * const agentInput = await converter.toAgentInput(historyResult.data);
   *
   * // Pass to agent
   * const result = await run(agent, agentInput, {
   *   stream: true,
   *   context: agentContext
   *   // Note: Don't use previousResponseId when using manual history
   * });
   * ```
   */
  async toAgentInput(items) {
    const itemsCopy = [...items];
    const output = [];
    for (let i = 0; i < itemsCopy.length; i++) {
      const item = itemsCopy[i];
      const isLast = i === itemsCopy.length - 1;
      const converted = await this.threadItemToInputItems(item, isLast);
      output.push(...converted);
    }
    return output;
  }
};
var defaultInputConverter = new InputThreadItemConverter();

// src/agents/input-converter.ts
async function simpleToAgentInput(input) {
  if (Array.isArray(input)) {
    return await defaultInputConverter.toAgentInput(input);
  }
  const userMessage = input;
  const text = userMessage.content.filter((c) => c.type === "input_text").map((c) => c.text).join(" ");
  return [
    {
      role: "user",
      content: text
    }
  ];
}

// src/agents/merge-streams.ts
var EventWrapper = class {
  constructor(event) {
    this.event = event;
  }
};
async function* mergeAsyncGenerators(a, b, onFirstComplete) {
  const iterators = /* @__PURE__ */ new Map();
  iterators.set("a", a);
  iterators.set("b", b);
  const pending = /* @__PURE__ */ new Map();
  const createPromise = (_iteratorKey, iterator) => {
    return iterator.next().catch(() => ({ done: true, value: void 0 }));
  };
  for (const [key, iterator] of iterators) {
    pending.set(key, createPromise(key, iterator));
  }
  while (pending.size > 0) {
    const raceResult = await Promise.race(
      Array.from(pending.entries()).map(async ([key2, promise]) => ({
        key: key2,
        result: await promise
      }))
    );
    const { key, result } = raceResult;
    pending.delete(key);
    if (result.done) {
      iterators.delete(key);
      if (key === "a" && onFirstComplete) {
        onFirstComplete();
      }
      if (iterators.size === 0) {
        break;
      }
    } else {
      if (key === "b") {
        yield new EventWrapper(result.value);
      } else {
        yield result.value;
      }
      const iterator = iterators.get(key);
      if (iterator) {
        pending.set(key, createPromise(key, iterator));
      }
    }
  }
}

// src/agents/stream-converter.ts
function convertAnnotations(sdkAnnotations) {
  const result = [];
  for (const annotation of sdkAnnotations) {
    if (annotation.type === "file_citation") {
      const filename = annotation.filename;
      if (filename) {
        result.push({
          type: "annotation",
          source: {
            type: "file",
            filename,
            title: filename
          },
          index: annotation.index ?? null
        });
      }
    } else if (annotation.type === "url_citation") {
      result.push({
        type: "annotation",
        source: {
          type: "url",
          url: annotation.url,
          title: annotation.title || annotation.url
        },
        index: annotation.end_index ?? null
      });
    }
  }
  return result;
}
async function* streamAgentResponse(context, agentRunner, options = {}) {
  const fallbackShowThinking = options.showThinking ?? true;
  let currentMessageId = null;
  let currentAgentName = context.currentAgent || "unknown";
  const getShowThinking = () => {
    const agentConfigs = context.agentConfigs;
    if (agentConfigs && Array.isArray(agentConfigs)) {
      const agentConfig = agentConfigs.find((a) => a.name === currentAgentName);
      if (agentConfig) {
        return agentConfig.showThinking || false;
      }
    }
    return fallbackShowThinking;
  };
  const contentPartTexts = /* @__PURE__ */ new Map();
  let currentWorkflowId = null;
  let currentWorkflowCreatedAt = null;
  let currentWorkflowTasks = [];
  let streamingThoughtIndex = null;
  let currentToolCall = null;
  let currentToolCallItemId = null;
  const toolCallTimestamps = /* @__PURE__ */ new Map();
  try {
    const agentIterator = agentRunner[Symbol.asyncIterator]();
    const eventsIterator = context._events[Symbol.asyncIterator]();
    const mergedStream = mergeAsyncGenerators(
      agentIterator,
      eventsIterator,
      () => {
        console.log("[StreamConverter] \u{1F3AF} Agent stream completed, closing event queue...");
        context._events.complete();
      }
    );
    for await (const event of mergedStream) {
      if (event instanceof EventWrapper) {
        const customEvent = event.event;
        if (customEvent.type === "thread.item.added" || customEvent.type === "thread.item.done") {
          const item = customEvent.item;
          if (currentWorkflowId && item.type !== "client_tool_call" && item.type !== "hidden_context_item" && getShowThinking()) {
            if (currentWorkflowTasks.length > 0) {
              const workflowItem = {
                type: "workflow",
                id: currentWorkflowId,
                thread_id: context.thread.id,
                created_at: currentWorkflowCreatedAt || (/* @__PURE__ */ new Date()).toISOString(),
                workflow: {
                  type: "reasoning",
                  tasks: currentWorkflowTasks,
                  expanded: false,
                  summary: null
                }
              };
              yield {
                type: "thread.item.done",
                item: workflowItem
              };
            }
            currentWorkflowId = null;
            currentWorkflowCreatedAt = null;
            currentWorkflowTasks = [];
            streamingThoughtIndex = null;
          }
        }
        yield customEvent;
        continue;
      }
      const agentEvent = event;
      if (agentEvent.type === "run_item_stream_event") {
        const item = agentEvent.item;
        if (item && item.type === "tool_call_item" && item.raw_item?.type === "function_call") {
          const rawItem = item.raw_item;
          currentToolCall = rawItem.call_id || null;
          currentToolCallItemId = rawItem.id || null;
        }
        const itemEvent = agentEvent;
        if (itemEvent.name === "tool_called" && itemEvent.item.type === "tool_call_item") {
          const toolItem = itemEvent.item;
          const rawItem = toolItem.rawItem;
          if (rawItem.type === "function_call") {
            const callId = rawItem.callId;
            toolCallTimestamps.set(callId, Date.now());
            const toolCallItem = {
              id: `tool_${callId}`,
              type: "server_tool_call",
              thread_id: context.thread.id,
              name: rawItem.name,
              status: "running",
              arguments: JSON.parse(rawItem.arguments || "{}"),
              created_at: (/* @__PURE__ */ new Date()).toISOString()
            };
            console.log(`[StreamConverter] \u{1F527} Tool called: ${rawItem.name} (${callId})`);
            await context.store.addThreadItem(
              context.thread.id,
              toolCallItem,
              context.requestContext
            );
          }
        } else if (itemEvent.name === "tool_output" && itemEvent.item.type === "tool_call_output_item") {
          const outputItem = itemEvent.item;
          const rawItem = outputItem.rawItem;
          if (rawItem.type === "function_call_result") {
            const callId = rawItem.callId;
            const startTime = toolCallTimestamps.get(callId);
            const duration = startTime ? Date.now() - startTime : null;
            const completionTime = startTime && duration ? new Date(startTime + duration).toISOString() : (/* @__PURE__ */ new Date()).toISOString();
            const toolResultItem = {
              id: `tool_${callId}_result`,
              type: "server_tool_call",
              thread_id: context.thread.id,
              name: rawItem.name,
              status: rawItem.status === "completed" ? "completed" : "failed",
              result: outputItem.output,
              duration_ms: duration,
              created_at: completionTime
            };
            console.log(`[StreamConverter] \u2705 Tool completed: ${rawItem.name} (${duration}ms)`);
            await context.store.addThreadItem(
              context.thread.id,
              toolResultItem,
              context.requestContext
            );
            toolCallTimestamps.delete(callId);
          }
        } else if (itemEvent.name === "handoff_requested" && itemEvent.item.type === "handoff_call_item") {
          const handoffItem = itemEvent.item;
          const rawItem = handoffItem.rawItem;
          if (rawItem.type === "function_call") {
            const callId = rawItem.callId;
            const targetAgent = rawItem.name;
            const args = JSON.parse(rawItem.arguments || "{}");
            const reason = args.reason || `Handoff to ${targetAgent}`;
            const handoffRequestItem = {
              id: `handoff_${callId}`,
              type: "handoff",
              thread_id: context.thread.id,
              from: handoffItem.agent.name,
              to: targetAgent,
              reason,
              status: "requested",
              created_at: (/* @__PURE__ */ new Date()).toISOString()
            };
            console.log(`[StreamConverter] \u{1F504} Handoff requested: ${handoffItem.agent.name} \u2192 ${targetAgent}`);
            await context.store.addThreadItem(
              context.thread.id,
              handoffRequestItem,
              context.requestContext
            );
          }
        } else if (itemEvent.name === "handoff_occurred" && itemEvent.item.type === "handoff_output_item") {
          const handoffOutputItem = itemEvent.item;
          const rawItem = handoffOutputItem.rawItem;
          if (rawItem.type === "function_call_result") {
            const callId = rawItem.callId;
            currentAgentName = handoffOutputItem.targetAgent.name;
            console.log(`[StreamConverter] \u{1F504} Agent switched to: ${currentAgentName} (showThinking: ${getShowThinking()})`);
            const handoffCompleteItem = {
              id: `handoff_${callId}_completed`,
              type: "handoff",
              thread_id: context.thread.id,
              from: handoffOutputItem.sourceAgent.name,
              to: handoffOutputItem.targetAgent.name,
              reason: "",
              // Reason was already in the request
              status: rawItem.status === "completed" ? "completed" : "failed",
              created_at: (/* @__PURE__ */ new Date()).toISOString()
            };
            console.log(`[StreamConverter] \u2705 Handoff completed: ${handoffOutputItem.sourceAgent.name} \u2192 ${handoffOutputItem.targetAgent.name}`);
            await context.store.addThreadItem(
              context.thread.id,
              handoffCompleteItem,
              context.requestContext
            );
          }
        }
      }
      if (agentEvent.type === "raw_model_stream_event") {
        const { data } = agentEvent;
        if (data.type === "model" && data.event?.type === "response.output_item.added") {
          const item = data.event.item;
          if (item && item.type === "reasoning") {
            console.log("[StreamConverter] Reasoning item ADDED - creating workflow for thinking");
            if (getShowThinking()) {
              if (currentWorkflowId && currentWorkflowTasks.length > 0) {
                const workflowItem2 = {
                  type: "workflow",
                  id: currentWorkflowId,
                  thread_id: context.thread.id,
                  created_at: currentWorkflowCreatedAt || (/* @__PURE__ */ new Date()).toISOString(),
                  workflow: {
                    type: "reasoning",
                    tasks: currentWorkflowTasks,
                    expanded: false,
                    summary: null
                  }
                };
                yield {
                  type: "thread.item.done",
                  item: workflowItem2
                };
              } else if (currentWorkflowId) {
                console.log("[StreamConverter] \u26A0\uFE0F Discarding empty workflow before creating new one");
              }
              currentWorkflowId = defaultGenerateItemId("workflow");
              currentWorkflowCreatedAt = (/* @__PURE__ */ new Date()).toISOString();
              currentWorkflowTasks = [];
              streamingThoughtIndex = null;
              const workflowItem = {
                type: "workflow",
                id: currentWorkflowId,
                thread_id: context.thread.id,
                created_at: currentWorkflowCreatedAt,
                workflow: {
                  type: "reasoning",
                  tasks: [],
                  expanded: true,
                  summary: null
                }
              };
              console.log("[StreamConverter] \u2705 Creating workflow item with ID:", currentWorkflowId);
              yield {
                type: "thread.item.added",
                item: workflowItem
              };
            }
          } else if (item && item.type === "message" && item.role === "assistant") {
            if (currentWorkflowId && currentWorkflowTasks.length > 0) {
              const workflowItem = {
                type: "workflow",
                id: currentWorkflowId,
                thread_id: context.thread.id,
                created_at: currentWorkflowCreatedAt || (/* @__PURE__ */ new Date()).toISOString(),
                workflow: {
                  type: "reasoning",
                  tasks: currentWorkflowTasks,
                  expanded: false,
                  summary: null
                }
              };
              yield {
                type: "thread.item.done",
                item: workflowItem
              };
            }
            if (currentWorkflowId) {
              currentWorkflowId = null;
              currentWorkflowCreatedAt = null;
              currentWorkflowTasks = [];
              streamingThoughtIndex = null;
            }
            currentMessageId = item.id || defaultGenerateItemId("message");
            contentPartTexts.clear();
            if (!currentMessageId) {
              continue;
            }
            const initialItem = {
              type: "assistant_message",
              id: currentMessageId,
              thread_id: context.thread.id,
              created_at: (/* @__PURE__ */ new Date()).toISOString(),
              content: []
            };
            yield {
              type: "thread.item.added",
              item: initialItem
            };
          }
        } else if (data.type === "model" && data.event?.type === "response.content_part.added") {
          const part = data.event.part;
          if (currentMessageId && part?.type === "output_text") {
            const annotations = part.annotations ? convertAnnotations(part.annotations) : [];
            yield {
              type: "thread.item.updated",
              item_id: currentMessageId,
              update: {
                type: "assistant_message.content_part.added",
                content_index: data.event.content_index,
                content: {
                  type: "output_text",
                  text: part.text || "",
                  annotations
                }
              }
            };
          }
        } else if (data.type === "output_text_delta") {
          if (currentMessageId) {
            const delta = data.delta || "";
            const contentIndex = data.content_index ?? 0;
            if (delta) {
              const currentText = contentPartTexts.get(contentIndex) || "";
              contentPartTexts.set(contentIndex, currentText + delta);
              yield {
                type: "thread.item.updated",
                item_id: currentMessageId,
                update: {
                  type: "assistant_message.content_part.text_delta",
                  content_index: contentIndex,
                  delta
                }
              };
            }
          }
        } else if (data.type === "model" && data.event?.type === "response.output_text.done") {
          if (currentMessageId) {
            const contentIndex = data.event.content_index ?? 0;
            const finalText = contentPartTexts.get(contentIndex) || "";
            yield {
              type: "thread.item.updated",
              item_id: currentMessageId,
              update: {
                type: "assistant_message.content_part.done",
                content_index: contentIndex,
                content: {
                  type: "output_text",
                  text: finalText,
                  annotations: []
                }
              }
            };
          }
        } else if (data.type === "model" && data.event?.type === "response.reasoning_summary_text.delta") {
          if (currentWorkflowId && getShowThinking()) {
            const delta = data.event.delta || "";
            const summaryIndex = data.event.summary_index ?? 0;
            if (currentWorkflowTasks.length === 0) {
              streamingThoughtIndex = summaryIndex;
              const thought = {
                type: "thought",
                content: delta,
                title: null
              };
              currentWorkflowTasks.push(thought);
              yield {
                type: "thread.item.updated",
                item_id: currentWorkflowId,
                update: {
                  type: "workflow.task.added",
                  task_index: 0,
                  task: thought
                }
              };
            } else if (streamingThoughtIndex === summaryIndex && currentWorkflowTasks[0]) {
              currentWorkflowTasks[0].content += delta;
              yield {
                type: "thread.item.updated",
                item_id: currentWorkflowId,
                update: {
                  type: "workflow.task.updated",
                  task_index: 0,
                  task: currentWorkflowTasks[0]
                }
              };
            }
          }
        } else if (data.type === "model" && data.event?.type === "response.reasoning_summary_text.done") {
          if (currentWorkflowId && getShowThinking()) {
            const text = data.event.text || "";
            const summaryIndex = data.event.summary_index ?? 0;
            if (streamingThoughtIndex === summaryIndex && currentWorkflowTasks[0]) {
              currentWorkflowTasks[0].content = text;
              yield {
                type: "thread.item.updated",
                item_id: currentWorkflowId,
                update: {
                  type: "workflow.task.updated",
                  task_index: 0,
                  task: currentWorkflowTasks[0]
                }
              };
              streamingThoughtIndex = null;
            } else {
              const thought = {
                type: "thought",
                content: text,
                title: null
              };
              const taskIndex = currentWorkflowTasks.length;
              currentWorkflowTasks.push(thought);
              yield {
                type: "thread.item.updated",
                item_id: currentWorkflowId,
                update: {
                  type: "workflow.task.added",
                  task_index: taskIndex,
                  task: thought
                }
              };
            }
          }
        } else if (data.type === "model" && data.event?.type === "response.output_item.done") {
          const item = data.event.item;
          if (item && item.type === "reasoning") {
            console.log("[StreamConverter] Reasoning item DONE - closing workflow if it has content");
            if (currentWorkflowId && currentWorkflowTasks.length > 0) {
              const workflowItem = {
                type: "workflow",
                id: currentWorkflowId,
                thread_id: context.thread.id,
                created_at: currentWorkflowCreatedAt || (/* @__PURE__ */ new Date()).toISOString(),
                workflow: {
                  type: "reasoning",
                  tasks: currentWorkflowTasks,
                  expanded: false,
                  summary: null
                }
              };
              yield {
                type: "thread.item.done",
                item: workflowItem
              };
              currentWorkflowId = null;
              currentWorkflowCreatedAt = null;
              currentWorkflowTasks = [];
              streamingThoughtIndex = null;
            } else if (currentWorkflowId) {
              console.log("[StreamConverter] \u26A0\uFE0F Discarding empty reasoning workflow");
              currentWorkflowId = null;
              currentWorkflowCreatedAt = null;
              currentWorkflowTasks = [];
              streamingThoughtIndex = null;
            }
          }
          if (item && item.type === "message" && item.role === "assistant" && currentMessageId) {
            const contentParts = item.content?.map((part) => {
              if (part.type === "output_text") {
                const annotations = part.annotations ? convertAnnotations(part.annotations) : [];
                return {
                  type: "output_text",
                  text: part.text || "",
                  annotations
                };
              }
              return {
                type: "output_text",
                text: part.text || "",
                annotations: []
              };
            }) || [];
            const finalItem = {
              type: "assistant_message",
              id: currentMessageId,
              thread_id: context.thread.id,
              created_at: (/* @__PURE__ */ new Date()).toISOString(),
              content: contentParts
            };
            await context.store.addThreadItem(
              context.thread.id,
              finalItem,
              context.requestContext
            );
            yield {
              type: "thread.item.done",
              item: finalItem
            };
            currentMessageId = null;
            contentPartTexts.clear();
          }
        }
      }
    }
  } catch (error) {
    context._events.complete();
    yield {
      type: "error",
      code: "agent_error",
      message: error instanceof Error ? error.message : "An error occurred while processing agent response",
      allow_retry: true
    };
    return;
  }
  if (context.clientToolCall) {
    console.log("[StreamConverter] \u{1F514} Client tool call detected! Emitting event...");
    const itemId = currentToolCallItemId || context.store.generateItemId(
      "tool_call",
      context.thread,
      context.requestContext
    );
    const callId = currentToolCall || context.store.generateItemId(
      "tool_call",
      context.thread,
      context.requestContext
    );
    const clientToolCallItem = {
      type: "client_tool_call",
      id: itemId,
      thread_id: context.thread.id,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      status: "pending",
      call_id: callId,
      name: context.clientToolCall.name,
      arguments: context.clientToolCall.arguments
    };
    console.log("[StreamConverter] \u{1F4E4} Emitting client_tool_call:", JSON.stringify(clientToolCallItem, null, 2));
    yield {
      type: "thread.item.done",
      item: clientToolCallItem
    };
    console.log("[StreamConverter] \u2705 Client tool call event emitted successfully");
  }
  console.log("[StreamConverter] \u{1F3C1} Stream complete - generator ending");
}

// src/agents/item-converter.ts
var ThreadItemConverter = class {
};
var DefaultThreadItemConverter = class extends ThreadItemConverter {
  async convert(agentOutput, thread, store, context) {
    const agentsSdk = await import('@openai/agents');
    const text = agentsSdk.extractAllTextOutput([agentOutput]);
    const itemId = store.generateItemId("message", thread, context);
    const item = {
      type: "assistant_message",
      id: itemId,
      thread_id: thread.id,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      content: [
        {
          type: "output_text",
          text: text || "",
          annotations: []
        }
      ]
    };
    return item;
  }
};

exports.AttachmentStore = AttachmentStore;
exports.ChatKitServer = ChatKitServer;
exports.CustomStreamError = CustomStreamError;
exports.ErrorCode = ErrorCode;
exports.NonStreamingResult = NonStreamingResult;
exports.NotFoundError = NotFoundError;
exports.Store = Store;
exports.StoreNotFoundError = NotFoundError2;
exports.StreamError = StreamError;
exports.StreamingResult = StreamingResult;
exports.agents = agents_exports;
exports.defaultGenerateAttachmentId = defaultGenerateAttachmentId;
exports.defaultGenerateItemId = defaultGenerateItemId;
exports.defaultGenerateThreadId = defaultGenerateThreadId;
exports.defaultLogger = defaultLogger;
exports.generateId = generateId;
exports.isActiveStatus = isActiveStatus;
exports.isAssistantMessage = isAssistantMessage;
exports.isClientToolCall = isClientToolCall;
exports.isClosedStatus = isClosedStatus;
exports.isCustomTask = isCustomTask;
exports.isEndOfTurn = isEndOfTurn;
exports.isEntitySource = isEntitySource;
exports.isErrorEvent = isErrorEvent;
exports.isFileAttachment = isFileAttachment;
exports.isFileSource = isFileSource;
exports.isFileTask = isFileTask;
exports.isHiddenContext = isHiddenContext;
exports.isImageAttachment = isImageAttachment;
exports.isImageTask = isImageTask;
exports.isLockedStatus = isLockedStatus;
exports.isNonStreamingReq = isNonStreamingReq;
exports.isNoticeEvent = isNoticeEvent;
exports.isProgressUpdateEvent = isProgressUpdateEvent;
exports.isSearchTask = isSearchTask;
exports.isStreamingReq = isStreamingReq;
exports.isTaskItem = isTaskItem;
exports.isThoughtTask = isThoughtTask;
exports.isThreadCreatedEvent = isThreadCreatedEvent;
exports.isThreadItemAddedEvent = isThreadItemAddedEvent;
exports.isThreadItemDoneEvent = isThreadItemDoneEvent;
exports.isThreadItemRemovedEvent = isThreadItemRemovedEvent;
exports.isThreadItemReplacedEvent = isThreadItemReplacedEvent;
exports.isThreadUpdatedEvent = isThreadUpdatedEvent;
exports.isURLSource = isURLSource;
exports.isUserMessage = isUserMessage;
exports.isWidgetItem = isWidgetItem;
exports.isWorkflowItem = isWorkflowItem;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map