import { performance } from "perf_hooks";
import crypto from "crypto";
import { openai, VECTOR_STORE_ID } from "./config.js";
import { SUPPORT_PROMPT } from "./prompt.js";

const parseNumberEnv = (value) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseFloatEnv = (value) => {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
};

const parseBooleanEnv = (value, defaultValue) => {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return defaultValue;
};

const DEFAULT_HEAVY_MODEL = process.env.HEAVY_MODEL ?? "gpt-5-mini";

const ROUTER_REASONING_ENV_SET = process.env.ROUTER_REASONING != null;
const HEAVY_REASONING_ENV_SET = process.env.HEAVY_REASONING != null;

const BASE_CONFIG = {
  heavyModel: DEFAULT_HEAVY_MODEL,
  routerModel: process.env.ROUTER_MODEL ?? DEFAULT_HEAVY_MODEL,
  routerVerbosity: process.env.ROUTER_VERBOSITY ?? "low",
  heavyVerbosity: process.env.HEAVY_VERBOSITY ?? "medium",
  routerReasoning: process.env.ROUTER_REASONING ?? "low",
  heavyReasoning: process.env.HEAVY_REASONING ?? "medium",
  routerTemperature: parseFloatEnv(process.env.ROUTER_TEMPERATURE),
  routerTopP: parseFloatEnv(process.env.ROUTER_TOP_P),
  routerMaxOutputTokens: parseNumberEnv(process.env.ROUTER_MAX_OUTPUT_TOKENS),
  heavyTemperature: parseFloatEnv(process.env.HEAVY_TEMPERATURE),
  heavyTopP: parseFloatEnv(process.env.HEAVY_TOP_P),
  heavyMaxOutputTokens: parseNumberEnv(process.env.HEAVY_MAX_OUTPUT_TOKENS) ?? 1200,
  promptCacheEnabled: parseBooleanEnv(process.env.PROMPT_CACHE_ENABLED, true),
  heavyStreamingEnabled: parseBooleanEnv(process.env.HEAVY_STREAM, false),
  historyMaxTurns: parseNumberEnv(process.env.HISTORY_MAX_TURNS) ?? 4,
  historyMaxChars: parseNumberEnv(process.env.HISTORY_MAX_CHAR_LENGTH) ?? 2800,
  vectorMaxResults: parseNumberEnv(process.env.VECTOR_MAX_RESULTS) ?? 5,
};

const resolveConfig = (overrides = {}) => {
  const config = { ...BASE_CONFIG };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      config[key] = value;
    }
  }

  config.heavyModel = config.heavyModel ?? DEFAULT_HEAVY_MODEL;
  config.routerModel = config.heavyModel;

  const reasoningLevels = ["minimal", "low", "medium", "high"];
  const normalizeReasoning = (value, fallback) => {
    const preferred = fallback ?? "low";
    const normalizedFallback = reasoningLevels.includes(
      String(preferred).trim().toLowerCase()
    )
      ? String(preferred).trim().toLowerCase()
      : "low";

    if (value == null) {
      return normalizedFallback;
    }

    const normalized = String(value).trim().toLowerCase();
    if (!reasoningLevels.includes(normalized)) {
      return normalizedFallback;
    }

    return normalized;
  };

  const routerReasoningOverride = Object.prototype.hasOwnProperty.call(
    overrides,
    "routerReasoning"
  );
  const heavyReasoningOverride = Object.prototype.hasOwnProperty.call(
    overrides,
    "heavyReasoning"
  );

  const routerReasoningConfigured =
    routerReasoningOverride || ROUTER_REASONING_ENV_SET;
  const heavyReasoningConfigured =
    heavyReasoningOverride || HEAVY_REASONING_ENV_SET;

  const defaultRouterReasoning = routerReasoningConfigured
    ? config.routerReasoning
    : "medium";
  let routerReasoning = normalizeReasoning(
    config.routerReasoning,
    defaultRouterReasoning
  );
  if (routerReasoning === "minimal") {
    routerReasoning = "low";
  }
  if (reasoningLevels.indexOf(routerReasoning) < reasoningLevels.indexOf("low")) {
    routerReasoning = "low";
  }

  const defaultHeavyReasoning = heavyReasoningConfigured
    ? config.heavyReasoning
    : "high";
  let heavyReasoning = normalizeReasoning(
    config.heavyReasoning,
    defaultHeavyReasoning
  );
  if (!heavyReasoningConfigured && heavyReasoning !== "high") {
    heavyReasoning = "high";
  }

  const routerIndex = reasoningLevels.indexOf(routerReasoning);
  let heavyIndex = reasoningLevels.indexOf(heavyReasoning);
  if (!heavyReasoningConfigured && heavyIndex <= routerIndex) {
    heavyIndex = Math.min(reasoningLevels.length - 1, routerIndex + 1);
    heavyReasoning = reasoningLevels[heavyIndex];
  }

  config.routerReasoning = routerReasoning;
  config.heavyReasoning = heavyReasoning;

  return config;
};

const isGpt5Family = (model) =>
  typeof model === "string" && model.toLowerCase().startsWith("gpt-5");

const normalizeReasoningEffort = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  const allowed = new Set(["minimal", "low", "medium", "high"]);
  return allowed.has(normalized) ? normalized : null;
};

const resolveReasoning = ({ model, desiredEffort, usingTools }) => {
  if (!isGpt5Family(model)) {
    return undefined;
  }
  const normalized = normalizeReasoningEffort(desiredEffort);
  if (normalized) {
    if (normalized === "minimal" && usingTools) {
      return { effort: "low" };
    }
    return { effort: normalized };
  }
  if (usingTools) {
    return { effort: "low" };
  }
  return undefined;
};

const normalizeVerbosity = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  const allowed = new Set(["low", "medium", "high"]);
  return allowed.has(normalized) ? normalized : null;
};

const resolveVerbosity = (model, desiredVerbosity) => {
  const normalized = normalizeVerbosity(desiredVerbosity);
  if (isGpt5Family(model)) {
    return normalized ?? "medium";
  }
  return normalized ?? "medium";
};

const ROUTER_FORMAT = {
  type: "json_schema",
  name: "RouterDecision",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      handoff: {
        type: "boolean",
        description:
          "true when the query needs a hand-off to the heavy agent, false when the lightweight agent should answer directly.",
      },
      answer: {
        type: "string",
        description:
          "Detailed Markdown-formatted answer (roughly 150–250 words) with inline FYI article citations and a final '#### Sources' list using '- [Title](https://support.fyi.app/...)'.",
      },
      reason: {
        type: "string",
        description:
          "Short justification for the decision, e.g. 'computation-heavy' or 'needs legal review'.",
      },
      confidence: {
        type: "number",
        description:
          "Confidence between 0 and 1 that the lightweight answer is sufficient.",
      },
      follow_up_needed: {
        type: "boolean",
        description:
          "true if the router believes the user may need to see the heavy agent's answer even after a quick reply.",
      },
    },
    required: ["handoff", "answer", "reason", "confidence", "follow_up_needed"],
  },
};

const ROUTER_INSTRUCTIONS = `
You are the first-line triage assistant for FYI (fyi.app) support chats.

Goals:
- Provide a comprehensive FYI-aligned response whenever file search returns relevant Help Centre content. Your job is to deliver the full solution yourself.
- Use FYI Help Centre articles via file search to ground every answer. When helpful, pull guidance from multiple articles and stitch them together into a thorough explanation.
- Only hand off to the expert agent when file search returns no relevant FYI material, the request is clearly out of scope, or human support is required for policy/compliance reasons.
- Stay within the FYI product scope; do not speculate about unrelated products.
- Operate with high reasoning effort; you may not use web search.

Response policy:
- ALWAYS respond with JSON that matches the schema exactly, providing every field.
- Format the "answer" in rich Markdown: use paragraphs, headings, numbered steps, and bullet lists as needed, and include actionable instructions.
- Weave the exact FYI guidance into the body copy and cite each article inline using '[Article title](https://support.fyi.app/...)'.
- Always end the answer with a '#### Sources' section that lists every referenced article as '- [Article title](https://support.fyi.app/...)'.
- Provide a detailed response (roughly 150–250 words) so the user gets the full resolution without escalation.
- Set "handoff" to true only when file search produced no useful FYI articles or the question truly demands human escalation. Otherwise respond yourself with "handoff": false.
- If "handoff" is true, set "answer" to a brief acknowledgement in Markdown (e.g., "Let me check that for you while I confirm the details.") and explain why escalation is needed in "reason".
- Never include any text outside the JSON object.
`.trim();

const HEAVY_INSTRUCTIONS = `
${SUPPORT_PROMPT}

You are the escalated expert agent who responds after the router hands off. Follow the FYI policy above in full.

Formatting rules:
- Produce the final answer in Markdown format — never HTML. Use plain text with line breaks for paragraphs, **bold** for emphasis, - for bullet lists, 1. for numbered lists, and code for literal snippets. Use ### or #### for headings.
- When citing FYI Help Centre material, build a "Sources" section using #### Sources followed by a markdown list: - [Article title](url).
- Include only FYI-approved links. When using the web search tool, restrict results to official FYI domains (support.fyi.app and fyi.app) and cite them in the Sources list.
- Convert any HTML content from sources to Markdown before including in your response.
- Maintain British English tone, be concise yet thorough, and clearly flag any remaining actions for the customer or support.
- You have access to richer reasoning effort and the web search tool (the router does not). Leverage these capabilities to validate, extend, or fact-check the router's quick reply before responding.

If the issue remains unresolved, offer the correctly formatted support ticket link and hand-off wording, also in Markdown format.
`.trim();

const computeCacheKey = (prefix, text) => {
  const hash = crypto.createHash("sha1").update(text).digest("hex");
  return `${prefix}-${hash}`;
};

const ROUTER_PROMPT_CACHE_KEY = computeCacheKey(
  "router",
  ROUTER_INSTRUCTIONS
);

const HEAVY_PROMPT_CACHE_KEY = computeCacheKey("heavy", HEAVY_INSTRUCTIONS);

const DEFAULT_HANDOFF_ACK = "<p>Just a moment, let me check that for you.</p>";

const extractOutputText = (response) => {
  if (!response) return "";
  if (typeof response.output_text === "string" && response.output_text.length > 0) {
    return response.output_text;
  }

  if (Array.isArray(response.output)) {
    const segments = [];
    for (const item of response.output) {
      if (item?.type !== "message" || !Array.isArray(item.content)) continue;
      for (const content of item.content) {
        if (content?.type === "output_text" && content.text) {
          segments.push(content.text);
        }
      }
    }
    if (segments.length) {
      return segments.join("");
    }
  }

  return "";
};

const stripHtmlTags = (value) => {
  if (typeof value !== "string") return "";
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
};

const formatHistoryTurn = (turn) => {
  const roleRaw = typeof turn.role === "string" ? turn.role : "user";
  const role = roleRaw.trim().length ? roleRaw.trim() : "user";
  return `[${role.toUpperCase()}] ${turn.content}`;
};

const normalizeConversationHistory = (history, { historyMaxTurns, historyMaxChars }) => {
  if (!Array.isArray(history) || history.length === 0) return [];

  const sanitized = history
    .filter(
      (turn) =>
        turn &&
        typeof turn.content === "string" &&
        turn.content.trim().length > 0
    )
    .map((turn) => ({
      role: typeof turn.role === "string" ? turn.role : "user",
      content: turn.content.trim(),
    }));

  if (!sanitized.length) return [];

  let working = sanitized;

  if (Number.isFinite(historyMaxTurns) && historyMaxTurns > 0) {
    working = working.slice(-historyMaxTurns);
  }

  if (Number.isFinite(historyMaxChars) && historyMaxChars > 0) {
    const limited = [];
    let cumulative = 0;

    for (let i = working.length - 1; i >= 0; i -= 1) {
      const turn = working[i];
      const renderedTurn = formatHistoryTurn(turn);
      const turnLength = renderedTurn.length + 1; // account for newline

      if (limited.length > 0 && cumulative + turnLength > historyMaxChars) {
        break;
      }

      limited.unshift(turn);
      cumulative += turnLength;
    }

    working = limited;
  }

  return working;
};

function renderHistory(history) {
  if (!history?.length) return "";
  return history.map(formatHistoryTurn).join("\n");
}

function buildUserContextSummary(context) {
  if (!context || typeof context !== "object") return "";

  const segments = [];

  const firstName =
    typeof context.firstName === "string" ? context.firstName.trim() : "";
  const lastName =
    typeof context.lastName === "string" ? context.lastName.trim() : "";
  const name =
    firstName.length > 0
      ? [firstName, lastName].filter(Boolean).join(" ")
      : "";
  if (name) {
    segments.push(`Name (first_name/last_name): ${name}`);
  } else if (lastName) {
    segments.push(`Last name (last_name): ${lastName}`);
  }

  const email =
    typeof context.userEmail === "string" ? context.userEmail.trim() : "";
  if (email) {
    segments.push(`Email (user_email): ${email}`);
  }

  const plan =
    typeof context.userSubscriptionPlan === "string"
      ? context.userSubscriptionPlan.trim()
      : "";
  if (plan) {
    segments.push(`Subscription plan (user_subscription_plan): ${plan}`);
  }

  if (typeof context.userAdminStatus === "boolean") {
    segments.push(
      `Admin status (user_admin_status): ${
        context.userAdminStatus ? "Yes" : "No"
      }`
    );
  }

  const linkUrl =
    typeof context.linkUrl === "string" ? context.linkUrl.trim() : "";
  if (linkUrl) {
    segments.push(`Current URL (link_url): ${linkUrl}`);
  }

  const date =
    typeof context.date === "string" ? context.date.trim() : "";
  if (date) {
    segments.push(`Timestamp (date): ${date}`);
  }

  return segments.join("\n");
}

const asInputText = (text) => [
  {
    type: "input_text",
    text,
  },
];

const clampVectorResults = (value) => {
  if (value == null) return undefined;
  if (!Number.isFinite(value)) return undefined;
  const clamped = Math.min(20, Math.max(1, Math.trunc(value)));
  return clamped;
};

const buildFileSearchTool = (config) => {
  if (!VECTOR_STORE_ID) return undefined;
  const maxResults = clampVectorResults(config.vectorMaxResults);
  if (maxResults === 0) return undefined;
  return {
    type: "file_search",
    vector_store_ids: [VECTOR_STORE_ID],
    max_num_results: maxResults ?? 6,
  };
};

const buildRouterTools = (config) => {
  const fileSearch = buildFileSearchTool(config);
  if (!fileSearch) return undefined;
  return [fileSearch];
};

const buildHeavyTools = (config) => {
  const fileSearch = buildFileSearchTool(config);
  if (!fileSearch) return undefined;
  const tools = [fileSearch];
  tools.push({
    type: "web_search",
  });
  return tools;
};

export async function runCascade({
  question,
  history = [],
  onRouterDecision,
  config: configOverrides,
  context,
} = {}) {
  const trimmedQuestion = typeof question === "string" ? question.trim() : "";
  if (!trimmedQuestion) {
    throw new Error("runCascade requires a user question.");
  }

  if (!VECTOR_STORE_ID) {
    throw new Error(
      "VECTOR_STORE_ID is required so both agents can access the FYI file search tool."
    );
  }

  const config = resolveConfig(configOverrides);
  const debugStream = Boolean(process.env.DEBUG);
  const originalQuestion =
    typeof question === "string" && question.length > 0
      ? question
      : trimmedQuestion;

  const normalizedHistory = normalizeConversationHistory(history, config);
  const renderedHistory =
    normalizedHistory.length > 0 ? renderHistory(normalizedHistory) : "";
  const userContextSummary = buildUserContextSummary(context);
  const userContextProvided = userContextSummary.length > 0;

  const routerInputSections = [];

  if (userContextProvided) {
    routerInputSections.push(`Customer context:\n${userContextSummary}`);
  }

  if (renderedHistory.length > 0) {
    routerInputSections.push(`Conversation so far:\n${renderedHistory}`);
    routerInputSections.push(`Latest user question:\n${trimmedQuestion}`);
  } else {
    routerInputSections.push(trimmedQuestion);
  }

  const routerInputContent = routerInputSections.join("\n\n");

  const routerVerbosity = resolveVerbosity(
    config.routerModel,
    config.routerVerbosity
  );

  const routerRequest = {
    model: config.routerModel,
    instructions: ROUTER_INSTRUCTIONS,
    input: [{ role: "user", content: asInputText(routerInputContent) }],
    text: {
      format: {
        ...ROUTER_FORMAT,
      },
      verbosity: routerVerbosity,
    },
    prompt_cache_key: config.promptCacheEnabled
      ? ROUTER_PROMPT_CACHE_KEY
      : undefined,
  };

  if (config.routerTemperature != null) {
    routerRequest.temperature = config.routerTemperature;
  }
  if (config.routerTopP != null) {
    routerRequest.top_p = config.routerTopP;
  }
  if (config.routerMaxOutputTokens != null) {
    routerRequest.max_output_tokens = config.routerMaxOutputTokens;
  }

  const routerTools = buildRouterTools(config);
  if (routerTools) {
    routerRequest.tools = routerTools;
  }

  const routerReasoning = resolveReasoning({
    model: config.routerModel,
    desiredEffort: config.routerReasoning,
    usingTools: Boolean(routerTools),
  });
  if (routerReasoning) {
    routerRequest.reasoning = routerReasoning;
  }

  const overallStart = performance.now();
  const routerStart = overallStart;
  const routerResponse = await openai.responses.parse(routerRequest);

  const decision = routerResponse.output_parsed;
  const routerLatencyMs = performance.now() - routerStart;

  if (!decision) {
    throw new Error("Router agent did not return a parsable decision.");
  }

  const rawRouterAnswer = (decision.answer ?? "").trim();
  const routerConfidence =
    typeof decision.confidence === "number" && Number.isFinite(decision.confidence)
      ? Math.min(1, Math.max(0, decision.confidence))
      : null;

  let shouldHandoff = Boolean(decision.handoff);
  const reasonSegments = [];
  if (decision.reason) {
    reasonSegments.push(decision.reason);
  }

  const routerQuickReply =
    !shouldHandoff && rawRouterAnswer.length > 0
      ? rawRouterAnswer
      : DEFAULT_HANDOFF_ACK;

  const routerDecision = {
    ...decision,
    handoff: shouldHandoff,
    answer: routerQuickReply,
    confidence: routerConfidence,
    reason: reasonSegments.join(" | ") || undefined,
  };

  if (!routerDecision.handoff) {
    const totalMs = performance.now() - overallStart;
    return {
      source: "router",
      answer: routerDecision.answer,
      config,
      context: {
        history_turns: normalizedHistory.length,
        history_char_length: renderedHistory.length,
        user_context_present: userContextProvided,
      },
      router: {
        decision: routerDecision,
        raw: routerResponse,
      },
      timings: {
        router_ms: routerLatencyMs,
        heavy_ms: null,
        total_ms: totalMs,
      },
    };
  }

  if (
    routerDecision.handoff &&
    typeof onRouterDecision === "function"
  ) {
    await onRouterDecision({
      quickReply: routerQuickReply,
      decision: routerDecision,
      raw: routerResponse,
    });
  }

  const routerQuickReplyForHeavy = routerQuickReply
    ? stripHtmlTags(routerQuickReply)
    : null;

  const routerReasonLine =
    routerDecision.reason && routerDecision.reason.length > 0
      ? `Router summary: ${routerDecision.reason}`
      : "Router summary: No additional rationale provided.";

  const heavyPrompt = [
    userContextProvided ? `Customer context:\n${userContextSummary}` : null,
    routerReasonLine,
    routerQuickReplyForHeavy
      ? `Router quick reply (share if still relevant): ${routerQuickReplyForHeavy}`
      : null,
    `Latest user question (verbatim):\n${originalQuestion}`,
    renderedHistory.length > 0
      ? `Conversation so far:\n${renderedHistory}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const heavyInput = {
    role: "user",
    content: asInputText(heavyPrompt),
  };

  const heavyStart = performance.now();
  const heavyVerbosity = resolveVerbosity(
    config.heavyModel,
    config.heavyVerbosity
  );

  const heavyRequest = {
    model: config.heavyModel,
    instructions: HEAVY_INSTRUCTIONS,
    input: [heavyInput],
    text: {
      verbosity: heavyVerbosity,
    },
    prompt_cache_key: config.promptCacheEnabled
      ? HEAVY_PROMPT_CACHE_KEY
      : undefined,
  };

  if (config.heavyTemperature != null) {
    heavyRequest.temperature = config.heavyTemperature;
  }
  if (config.heavyTopP != null) {
    heavyRequest.top_p = config.heavyTopP;
  }
  if (config.heavyMaxOutputTokens != null) {
    heavyRequest.max_output_tokens = config.heavyMaxOutputTokens;
  } else {
    heavyRequest.max_output_tokens = 1600;
  }

  const heavyTools = buildHeavyTools(config);
  if (heavyTools) {
    heavyRequest.tools = heavyTools;
  }

  const heavyReasoning = resolveReasoning({
    model: config.heavyModel,
    desiredEffort: config.heavyReasoning,
    usingTools: Boolean(heavyTools?.length),
  });
  if (heavyReasoning) {
    heavyRequest.reasoning = heavyReasoning;
  }

  let heavyResponse;
  let heavyAnswer = "";
  let heavyEvents = debugStream ? [] : undefined;

  if (config.heavyStreamingEnabled) {
    const streamingRequest = {
      ...heavyRequest,
      stream: true,
    };

    const stream = await openai.responses.stream(streamingRequest);

    for await (const event of stream) {
      if (heavyEvents) {
        heavyEvents.push(event.type);
      }
      if (event.type === "response.output_text.delta") {
        heavyAnswer += event.delta;
      }
    }

    heavyResponse = await stream.finalResponse();
    if (!heavyAnswer) {
      heavyAnswer = extractOutputText(heavyResponse);
    }
  } else {
    heavyResponse = await openai.responses.create(heavyRequest);
    heavyAnswer = extractOutputText(heavyResponse);
  }

  heavyAnswer = heavyAnswer.trim();
  if (!heavyAnswer) {
    heavyAnswer =
      "<p>Sorry, I wasn’t able to pull in the full answer right now. Please try again in a moment or let me know if you’d like a support ticket link.</p>";
  }

  const heavyLatencyMs = performance.now() - heavyStart;
  const totalMs = performance.now() - overallStart;

  return {
    source: "heavy",
    answer: heavyAnswer,
    config,
    context: {
      history_turns: normalizedHistory.length,
      history_char_length: renderedHistory.length,
      user_context_present: userContextProvided,
    },
    interim: routerQuickReply,
    router: {
      decision: routerDecision,
      raw: routerResponse,
    },
    heavy: {
      raw: heavyResponse,
      events: heavyEvents,
    },
    timings: {
      router_ms: routerLatencyMs,
      heavy_ms: heavyLatencyMs,
      total_ms: totalMs,
    },
  };
}


