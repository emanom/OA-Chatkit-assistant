import { performance } from "perf_hooks";
import crypto from "crypto";
import { openai, VECTOR_STORE_ID } from "./config.js";
import { SUPPORT_PROMPT } from "./prompt.js";
import { createZendeskTicket, isZendeskConfigured } from "../server/zendesk.js";

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
  heavyMaxOutputTokens: parseNumberEnv(process.env.HEAVY_MAX_OUTPUT_TOKENS) ?? 2400,
  promptCacheEnabled: parseBooleanEnv(process.env.PROMPT_CACHE_ENABLED, true),
  heavyStreamingEnabled: parseBooleanEnv(process.env.HEAVY_STREAM, true),
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
  // Only set routerModel to heavyModel if routerModel wasn't explicitly set via env var or override
  // BASE_CONFIG already sets routerModel from ROUTER_MODEL env var, so only override if null/undefined
  if (config.routerModel == null) {
    config.routerModel = config.heavyModel;
  }

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
    : "low";
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
    : "medium";
  let heavyReasoning = normalizeReasoning(
    config.heavyReasoning,
    defaultHeavyReasoning
  );
  if (!heavyReasoningConfigured && heavyReasoning !== "medium") {
    heavyReasoning = "medium";
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
- **CRITICAL:** If the user explicitly requests to "raise a support request", "create a ticket", "log a ticket", "escalate", "talk to a human", "contact support", or similar phrases, you MUST set "handoff" to true to escalate to the expert agent who can create tickets.
- Only hand off to the expert agent when: (1) the user explicitly requests a support ticket/escalation, (2) file search returns no relevant FYI material, (3) the request is clearly out of scope, or (4) human support is required for policy/compliance reasons.
- Stay within the FYI product scope; do not speculate about unrelated products.
- Operate with high reasoning effort; you may not use web search.

Response policy:
- ALWAYS respond with JSON that matches the schema exactly, providing every field.
- Format the "answer" in rich Markdown: use paragraphs, headings, numbered steps, and bullet lists as needed, and include actionable instructions.
- Weave the exact FYI guidance into the body copy and cite each article inline using '[Article title](https://support.fyi.app/...)'.
- Always end the answer with a '#### Sources' section that lists every referenced article as '- [Article title](https://support.fyi.app/...)'.
- Provide a detailed response (roughly 150–250 words) so the user gets the full resolution without escalation.
- **IMPORTANT:** If the user says "I need to raise a support request", "create a ticket", "escalate", "talk to a human", or similar, set "handoff" to true immediately - do not try to answer the question yourself.
- Set "handoff" to true when: (1) user explicitly requests support ticket/escalation, (2) file search produced no useful FYI articles, or (3) the question truly demands human escalation. Otherwise respond yourself with "handoff": false.
- If "handoff" is true, set "answer" to a brief acknowledgement in Markdown (e.g., "Let me check that for you while I confirm the details.") and explain why escalation is needed in "reason".
- **Suggestion Buttons (IMPORTANT):** The "buttons" field is required but can be an empty array [] when buttons are not needed. Use the "buttons" field in your JSON response (NOT in the answer text).
  - **ALWAYS include buttons** after asking questions (e.g., "Did that help?", "Is this what you need?")
  - **ALWAYS include buttons** after explaining features or providing solutions
  - Use 2-4 buttons maximum with relevant options, or use an empty array [] if buttons are not appropriate
  - Each button needs both "label" (what user sees) and "value" (what gets sent when clicked)
  - Example with buttons: \`"buttons": [{"label": "Yes, it did", "value": "Yes, it did"}, {"label": "No, it didn't", "value": "No, it didn't"}]\`
  - Example without buttons: \`"buttons": []\`
  - If you cannot use the buttons field, you can fallback to adding buttons at the END of your "answer" field using: \`[BUTTONS:{"buttons":[{"label":"Yes","value":"Yes"}]}]\`
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
- **Suggestion Buttons (REQUIRED):** You MUST include suggestion buttons when appropriate. Add them at the END of your response using this exact format: \`[BUTTONS:{"buttons":[{"label":"Button Text","value":"Button Text"},{"label":"Another Option","value":"Another Option"}]}]\`.
  - **ALWAYS include buttons** after asking questions (e.g., "Did that help?", "Is this what you need?", "Does this solve your issue?")
  - **ALWAYS include buttons** after explaining features, providing instructions, or offering solutions
  - **ALWAYS include buttons** when offering multiple options or paths forward
  - Use 2-4 buttons maximum with the most relevant options for the context
  - The button marker is automatically removed and converted to clickable buttons
  - Examples: 
    - After "Did that help?" → \`[BUTTONS:{"buttons":[{"label":"Yes, it did","value":"Yes, it did"},{"label":"No, it didn't","value":"No, it didn't"}]}]\`
    - After explaining a feature → \`[BUTTONS:{"buttons":[{"label":"Show me how","value":"Show me how to use this"},{"label":"More details","value":"Tell me more"}]}]\`
  - Buttons significantly improve user experience - include them whenever you ask a question or offer options!

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
      // Only process message items - skip artifacts, tool_calls, and other types
      if (item?.type !== "message" || !Array.isArray(item.content)) continue;
      for (const content of item.content) {
        // Only extract output_text content - explicitly exclude artifacts and other types
        if (content?.type === "output_text" && content.text) {
          segments.push(content.text);
        }
        // Explicitly skip: artifacts, tool_calls, tool_results, and any other non-text content
        // This ensures artifacts are never included in the response text
      }
    }
    if (segments.length) {
      return segments.join("");
    }
  }

  return "";
};

/**
 * Normalizes em dashes (—) to regular dashes (-) in text.
 * This ensures consistent dash usage across all model responses.
 */
const normalizeDashes = (text) => {
  if (typeof text !== "string") return text;
  return text.replace(/—/g, "-");
};

/**
 * Extracts button suggestions from AI response text.
 * Buttons are expected in JSON format: [BUTTONS:{"buttons":[...]}]
 * Returns { text: cleaned text, buttons: array of button objects }
 */
const extractButtonsFromText = (text) => {
  if (typeof text !== "string") {
    return { text: text || "", buttons: null };
  }

  // Look for button JSON in format [BUTTONS:{"buttons":[...]}]
  // Also handle cases where the pattern might be incomplete or malformed
  const buttonPattern = /\[BUTTONS:\s*(\{[\s\S]*?\})\s*\]/i;
  const match = text.match(buttonPattern);
  
  // Also check for trailing }] that might be leftover from malformed button JSON
  const trailingBracketPattern = /\}\s*\]\s*$/;
  const hasTrailingBrackets = trailingBracketPattern.test(text.trim());
  
  if (!match) {
    // If we see trailing }] but no match, try to clean it up
    if (hasTrailingBrackets) {
      const cleanedText = text.replace(trailingBracketPattern, "").trim();
      console.warn("[cascade] Removed trailing }] from text (malformed button JSON)");
      return { text: cleanedText, buttons: null };
    }
    
    // Always check for button keywords to help debug
    const hasButtonKeyword = text.includes("BUTTONS") || text.includes("buttons");
    if (hasButtonKeyword) {
      const last300 = text.slice(-300);
      console.log("[cascade] ⚠️ Text contains 'BUTTONS' but pattern didn't match. Last 300 chars:", last300);
      
      // Try a more lenient pattern that handles incomplete JSON
      const lenientPattern = /\[BUTTONS[:\s]*(\{[\s\S]*?)\s*\]?/i;
      const lenientMatch = text.match(lenientPattern);
      if (lenientMatch) {
        const matchedJson = lenientMatch[1];
        console.log("[cascade] Found potential button JSON (may be incomplete):", matchedJson.substring(0, 300));
        console.log("[cascade] Full matched JSON length:", matchedJson.length);
        
        // Try to extract buttons even from incomplete JSON using regex
        // Look for button patterns: "label":"...","value":"..."
        const buttonRegex = /"label"\s*:\s*"([^"]+)"\s*,\s*"value"\s*:\s*"([^"]+)"/g;
        const extractedButtons = [];
        let buttonMatch;
        let lastIndex = 0;
        while ((buttonMatch = buttonRegex.exec(matchedJson)) !== null) {
          const label = buttonMatch[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
          const value = buttonMatch[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
          if (label && value) {
            extractedButtons.push({ label, value });
            console.log(`[cascade] Found button via regex: "${label}" = "${value}"`);
          }
          lastIndex = buttonMatch.index + buttonMatch[0].length;
        }
        
        // If no buttons found with standard pattern, try a more lenient pattern
        // that handles cases where JSON might be malformed
        if (extractedButtons.length === 0) {
          console.log("[cascade] Standard regex didn't find buttons, trying lenient pattern");
          // Try to find any label/value pairs, even if format is slightly off
          const lenientButtonRegex = /(?:label|"label")\s*[:=]\s*"([^"]+)"\s*[,}]\s*(?:value|"value")\s*[:=]\s*"([^"]+)"/gi;
          let lenientMatch;
          while ((lenientMatch = lenientButtonRegex.exec(matchedJson)) !== null) {
            const label = lenientMatch[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
            const value = lenientMatch[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
            if (label && value) {
              extractedButtons.push({ label, value });
              console.log(`[cascade] Found button via lenient regex: "${label}" = "${value}"`);
            }
          }
        }
        
        if (extractedButtons.length > 0) {
          console.log(`[cascade] ✓ Extracted ${extractedButtons.length} buttons from incomplete JSON using regex`);
          const validButtons = extractedButtons
            .map(btn => ({
              label: normalizeDashes(btn.label.trim()),
              value: normalizeDashes(btn.value.trim()),
            }))
            .filter(btn => btn.label.length > 0 && btn.value.length > 0);
          
          if (validButtons.length > 0) {
            // Remove the button marker (try both complete and incomplete patterns)
            const cleanedText = text.replace(/\[BUTTONS[:\s]*\{[\s\S]*?\}\s*\]/i, "").replace(/\[BUTTONS[:\s]*\{[\s\S]*$/i, "").trim();
            return { text: cleanedText, buttons: validButtons };
          }
        }
        
        // If regex extraction failed, try parsing the JSON (might work if it's just missing closing brackets)
        try {
          // Try to complete the JSON if it's missing closing brackets
          let jsonStr = lenientMatch[1].trim();
          if (!jsonStr.endsWith("}")) {
            // Count open braces and add closing ones
            const openBraces = (jsonStr.match(/\{/g) || []).length;
            const closeBraces = (jsonStr.match(/\}/g) || []).length;
            const missingBraces = openBraces - closeBraces;
            if (missingBraces > 0) {
              jsonStr += "}".repeat(missingBraces);
            }
            // If it looks like an array, add closing bracket
            if (jsonStr.includes('"buttons"') && !jsonStr.includes(']')) {
              jsonStr = jsonStr.replace(/"buttons"\s*:\s*\[/, '"buttons":[');
              if (!jsonStr.endsWith("]")) {
                jsonStr += "]";
              }
            }
          }
          
          const buttonData = JSON.parse(jsonStr);
          const buttons = Array.isArray(buttonData?.buttons) ? buttonData.buttons : null;
          if (buttons && buttons.length > 0) {
            console.log(`[cascade] ✓ Parsed incomplete JSON successfully, found ${buttons.length} buttons`);
            const cleanedText = text.replace(/\[BUTTONS[:\s]*\{[\s\S]*?\}\s*\]/i, "").trim();
            const validButtons = buttons
              .filter(btn => btn && typeof btn === "object")
              .map(btn => ({
                label: normalizeDashes(typeof btn.label === "string" ? btn.label.trim() : ""),
                value: normalizeDashes(typeof btn.value === "string" ? btn.value.trim() : (typeof btn.label === "string" ? btn.label.trim() : "")),
              }))
              .filter(btn => btn.label.length > 0 && btn.value.length > 0);
            if (validButtons.length > 0) {
              return { text: cleanedText, buttons: validButtons };
            }
          }
        } catch (parseError) {
          console.log("[cascade] Could not parse incomplete JSON:", parseError.message);
        }
      }
    }
    return { text, buttons: null };
  }

  try {
    let buttonData;
    let matchedJson = match[1];
    
    // First, try parsing as-is
    try {
      buttonData = JSON.parse(matchedJson);
    } catch (parseError) {
      // If parsing fails, try to fix truncated JSON or extract buttons manually
      console.warn("[cascade] JSON parse failed, attempting recovery:", parseError.message);
      console.warn("[cascade] Matched JSON (first 200 chars):", matchedJson.substring(0, 200));
      
      // Try to extract buttons using regex as fallback
      const buttonRegex = /"label"\s*:\s*"([^"]+)"\s*,\s*"value"\s*:\s*"([^"]+)"/g;
      const extractedButtons = [];
      let buttonMatch;
      while ((buttonMatch = buttonRegex.exec(matchedJson)) !== null) {
        const label = buttonMatch[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
        const value = buttonMatch[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
        if (label && value) {
          extractedButtons.push({ label, value });
        }
      }
      
      if (extractedButtons.length > 0) {
        console.log("[cascade] ✓ Extracted buttons using regex fallback:", extractedButtons);
        const validButtons = extractedButtons
          .map(btn => ({
            label: normalizeDashes(btn.label.trim()),
            value: normalizeDashes(btn.value.trim()),
          }))
          .filter(btn => btn.label.length > 0 && btn.value.length > 0);
        
        if (validButtons.length > 0) {
          const cleanedText = text.replace(buttonPattern, "").trim();
          return { text: cleanedText, buttons: validButtons };
        }
      }
      
      // If regex extraction also failed, log and return null buttons
      console.error("[cascade] Failed to extract buttons after JSON parse failure");
      const cleanedText = text.replace(buttonPattern, "").trim();
      return { text: cleanedText, buttons: null };
    }
    
    const buttons = Array.isArray(buttonData?.buttons) ? buttonData.buttons : null;
    
    // Remove the button marker from the text
    const cleanedText = text.replace(buttonPattern, "").trim();
    
    // Validate buttons structure
    if (buttons) {
      const validButtons = buttons
        .filter(btn => btn && typeof btn === "object")
        .map(btn => ({
          label: normalizeDashes(typeof btn.label === "string" ? btn.label.trim() : ""),
          value: normalizeDashes(typeof btn.value === "string" ? btn.value.trim() : (typeof btn.label === "string" ? btn.label.trim() : "")),
        }))
        .filter(btn => btn.label.length > 0 && btn.value.length > 0);
      
      if (validButtons.length > 0) {
        console.log("[cascade] ✓ Extracted buttons:", validButtons);
        return {
          text: cleanedText,
          buttons: validButtons,
        };
      } else {
        console.warn("[cascade] Button pattern matched but no valid buttons found");
      }
    }
  } catch (error) {
    // Unexpected error - log and return text without buttons
    console.error("[cascade] Unexpected error parsing button JSON:", error.message);
    const cleanedText = text.replace(buttonPattern, "").trim();
    return { text: cleanedText, buttons: null };
  }

  // Remove the malformed button marker
  const cleanedText = text.replace(buttonPattern, "").trim();
  return { text: cleanedText, buttons: null };
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

  if (Array.isArray(context.attachments) && context.attachments.length > 0) {
    const limited = context.attachments.slice(0, 5);
    const rendered = limited
      .map((attachment, index) => {
        const lines = [];
        const label = attachment?.name
          ? `Attachment ${index + 1}: ${attachment.name}`
          : `Attachment ${index + 1}`;
        const mime = typeof attachment?.mimeType === "string" ? attachment.mimeType : null;
        lines.push(mime ? `${label} (${mime})` : label);
        if (typeof attachment?.url === "string" && attachment.url.trim().length > 0) {
          lines.push(`URL: ${attachment.url.trim()}`);
        }
        if (typeof attachment?.description === "string" && attachment.description.trim().length > 0) {
          lines.push(`Summary: ${attachment.description.trim()}`);
        }
        return lines.join("\n");
      })
      .join("\n\n");
    segments.push(`Attachments:\n${rendered}`);
  }

  return segments.join("\n");
}

const asInputText = (text) => [
  {
    type: "input_text",
    text,
  },
];

const buildContentArray = (text, imageUrls = []) => {
  const content = [];
  
  // Add text content
  if (text && text.trim().length > 0) {
    content.push({
      type: "input_text",
      text: text.trim(),
    });
  }
  
  // Add image content
  if (Array.isArray(imageUrls) && imageUrls.length > 0) {
    for (const imageUrl of imageUrls) {
      if (typeof imageUrl === "string" && imageUrl.trim().length > 0) {
        content.push({
          type: "input_image",
          image_url: imageUrl.trim(),
        });
      }
    }
  }
  
  return content.length > 0 ? content : asInputText(text || "");
};

const generateTicketSubject = (userMessage) => {
  if (!userMessage || typeof userMessage !== "string") {
    return "Support Request";
  }
  
  // Remove common ticket request phrases
  let cleaned = userMessage
    .toLowerCase()
    .replace(/\b(i need|i'd like|please|can you|could you)\s+(to\s+)?(raise|create|log|open|submit)\s+(a\s+)?(support\s+)?ticket\b/gi, "")
    .replace(/\bsupport\s+ticket\s+(urgently|urgent|please|now)?\b/gi, "")
    .replace(/\bescalate\s+(this|it|to|for)?\b/gi, "")
    .replace(/\btalk\s+to\s+(a\s+)?(human|person|someone|agent)\b/gi, "")
    .replace(/\bcontact\s+support\b/gi, "")
    .replace(/\bspeak\s+to\s+someone\b/gi, "")
    .trim();
  
  // If nothing left after cleaning, use original message
  if (!cleaned || cleaned.length < 10) {
    cleaned = userMessage.trim();
  }
  
  // Extract first sentence or first 100 characters
  const firstSentence = cleaned.split(/[.!?]\s+/)[0] || cleaned;
  let subject = firstSentence.substring(0, 100).trim();
  
  // Capitalize first letter
  if (subject.length > 0) {
    subject = subject.charAt(0).toUpperCase() + subject.slice(1);
  }
  
  // Remove trailing punctuation if it's incomplete
  subject = subject.replace(/[,;:]$/, "");
  
  // Ensure it's not empty
  if (!subject || subject.length < 5) {
    return "Support Request";
  }
  
  // Limit to 80 characters for Zendesk subject line best practices
  if (subject.length > 80) {
    subject = subject.substring(0, 77) + "...";
  }
  
  return subject;
};

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
  // Note: Zendesk tool is NOT added to router because router uses structured output parsing
  // which conflicts with tool usage. Router should only decide to hand off to heavy agent,
  // and heavy agent (which doesn't use structured output) can create tickets.
  if (!fileSearch) return undefined;
  return [fileSearch];
};

const buildZendeskTool = () => {
  const isConfigured = isZendeskConfigured();
  console.log("[cascade] buildZendeskTool - isZendeskConfigured:", isConfigured);
  if (!isConfigured) {
    console.log("[cascade] Zendesk tool not configured - missing environment variables");
    return undefined;
  }
  // Responses API function tool format: name, description, and parameters at top level
  // (not nested in a "function" object like Chat Completions API)
  const tool = {
    type: "function",
    name: "create_zendesk_ticket",
    description:
      "Creates a Zendesk support ticket when the user requests one or when a ticket is required to solve/help the user. Use this tool when the user explicitly asks for a support ticket, wants to talk to a human, or when the issue cannot be resolved through the knowledge base and requires human support.",
    parameters: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description:
            "A clear, concise subject line for the support ticket (e.g., 'Issue with email notifications' or 'Feature request: Add bulk export'). Should be specific and actionable.",
        },
        description: {
          type: "string",
          description:
            "A detailed description of the issue or request. Include relevant context from the conversation, what the user is trying to accomplish, any error messages, steps already taken, and why a support ticket is needed. Be thorough but concise.",
        },
        priority: {
          type: "integer",
          description:
            "Ticket priority: 1=low, 2=normal, 3=high, 4=urgent. Default to 2 (normal) unless the issue is critical or blocking.",
          enum: [1, 2, 3, 4],
        },
        type: {
          type: "string",
          description:
            "Ticket type: 'question' for general inquiries, 'incident' for problems/bugs, 'problem' for recurring issues, 'task' for requests. Default to 'question'.",
          enum: ["question", "incident", "problem", "task"],
        },
      },
      required: ["subject", "description", "priority", "type"],
      additionalProperties: false,
    },
    strict: true,
  };
  console.log("[cascade] Zendesk tool built successfully:", {
    name: tool.name,
    hasDescription: !!tool.description,
    hasParameters: !!tool.parameters,
    requiredFields: tool.parameters?.required,
  });
  return tool;
};

const buildHeavyTools = (config, context) => {
  const fileSearch = buildFileSearchTool(config);
  if (!fileSearch) return undefined;
  const tools = [fileSearch];
  tools.push({
    type: "web_search",
  });
  
  // Add Zendesk tool if configured
  const zendeskTool = buildZendeskTool();
  if (zendeskTool) {
    tools.push(zendeskTool);
  }
  
  return tools;
};

export async function runCascade({
  question,
  history = [],
  onRouterDecision,
  onStreamDelta,
  onProgress,
  config: configOverrides,
  context,
  imageUrls = [],
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
  console.log("[cascade] Starting cascade with models - Router:", config.routerModel, "Heavy:", config.heavyModel);
  const debugStream = Boolean(process.env.DEBUG);
  const originalQuestion =
    typeof question === "string" && question.length > 0
      ? question
      : trimmedQuestion;

  // Emit initial progress
  if (typeof onProgress === "function") {
    onProgress("cascade.stage initial");
  }

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
    input: [{ role: "user", content: buildContentArray(routerInputContent, imageUrls) }],
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
  
  // Emit router processing progress
  if (typeof onProgress === "function") {
    onProgress("cascade.stage router_processing");
  }
  
  console.log("[cascade] Router API call - model:", config.routerModel);
  console.log("[cascade] Router request (sanitized):", {
    model: routerRequest.model,
    hasTools: !!routerRequest.tools,
    toolsCount: routerRequest.tools?.length,
    hasInstructions: !!routerRequest.instructions,
    inputLength: routerRequest.input?.length,
  });
  
  let routerResponse;
  try {
    routerResponse = await openai.responses.parse(routerRequest);
    console.log("[cascade] ✓ Router response received successfully");
  } catch (error) {
    console.error("[cascade] ✗✗✗ FAILED TO CREATE ROUTER REQUEST ✗✗✗");
    console.error("[cascade] Router request error:", {
      message: error.message,
      status: error.status,
      code: error.code,
      type: error.type,
      response: error.response?.data,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
    });
    throw error;
  }

  const decision = routerResponse.output_parsed;
  const routerLatencyMs = performance.now() - routerStart;

  console.log("[cascade] Router response details:", {
    hasOutputParsed: !!decision,
    outputParsedType: typeof decision,
    outputParsedKeys: decision ? Object.keys(decision) : null,
    hasButtons: decision ? Array.isArray(decision.buttons) : false,
    buttonsCount: decision && Array.isArray(decision.buttons) ? decision.buttons.length : 0,
    buttonsPreview: decision && Array.isArray(decision.buttons) ? JSON.stringify(decision.buttons).substring(0, 200) : null,
    hasOutput: !!routerResponse.output,
    outputLength: Array.isArray(routerResponse.output) ? routerResponse.output.length : 0,
    outputTypes: Array.isArray(routerResponse.output) ? routerResponse.output.map(item => item?.type) : null,
    rawOutput: routerResponse.output ? JSON.stringify(routerResponse.output).substring(0, 1000) : null,
  });

  // Check if router made tool calls instead of returning structured output
  if (routerResponse.output && Array.isArray(routerResponse.output)) {
    const toolCalls = routerResponse.output.filter(item => item?.type === "tool_call");
    if (toolCalls.length > 0) {
      console.warn("[cascade] ⚠️ Router made tool calls instead of returning structured output:", {
        toolCallCount: toolCalls.length,
        toolCallNames: toolCalls.map(tc => tc.name),
      });
      // This shouldn't happen with structured output, but if it does, we need to handle it
      // For now, log and continue - the structured output should still be there
    }
  }

  if (!decision) {
    console.error("[cascade] ✗✗✗ ROUTER DID NOT RETURN PARSABLE DECISION ✗✗✗");
    console.error("[cascade] Router response structure:", {
      hasOutputParsed: !!routerResponse.output_parsed,
      hasOutput: !!routerResponse.output,
      outputType: Array.isArray(routerResponse.output) ? "array" : typeof routerResponse.output,
      outputLength: Array.isArray(routerResponse.output) ? routerResponse.output.length : "N/A",
      fullResponse: JSON.stringify(routerResponse, null, 2).substring(0, 2000),
    });
    throw new Error("Router agent did not return a parsable decision.");
  }

  const rawRouterAnswer = (decision.answer ?? "").trim();
  console.log("[cascade] Router answer length:", rawRouterAnswer.length);
  console.log("[cascade] Router answer preview:", rawRouterAnswer.substring(0, 200));
  
  // First, try to get buttons from structured output (preferred - won't be truncated)
  let routerButtons = null;
  console.log("[cascade] Checking for buttons in decision:", {
    hasDecision: !!decision,
    hasButtonsProperty: decision ? 'buttons' in decision : false,
    buttonsType: decision ? typeof decision.buttons : null,
    isArray: decision ? Array.isArray(decision.buttons) : false,
    buttonsValue: decision ? decision.buttons : null,
  });
  
  if (Array.isArray(decision.buttons) && decision.buttons.length > 0) {
    console.log(`[cascade] Processing ${decision.buttons.length} buttons from structured output`);
    routerButtons = decision.buttons
      .filter(btn => {
        const isValid = btn && typeof btn === "object" && btn.label && btn.value;
        if (!isValid) {
          console.log("[cascade] Filtered out invalid button:", btn);
        }
        return isValid;
      })
      .map(btn => ({
        label: normalizeDashes(String(btn.label).trim()),
        value: normalizeDashes(String(btn.value).trim()),
      }))
      .filter(btn => {
        const isValid = btn.label.length > 0 && btn.value.length > 0;
        if (!isValid) {
          console.log("[cascade] Filtered out empty button:", btn);
        }
        return isValid;
      });
    if (routerButtons.length > 0) {
      console.log(`[cascade] ✓ Found ${routerButtons.length} buttons in structured output:`, routerButtons);
    } else {
      console.log("[cascade] No valid buttons after filtering");
      routerButtons = null;
    }
  } else {
    console.log("[cascade] No buttons array found in decision or array is empty");
  }
  
  // Fallback: try extracting from answer text (in case buttons weren't in structured output)
  if (!routerButtons) {
    const { text: routerAnswerText, buttons: extractedButtons } = extractButtonsFromText(rawRouterAnswer);
    if (extractedButtons && extractedButtons.length > 0) {
      routerButtons = extractedButtons;
      console.log(`[cascade] ✓ Extracted ${routerButtons.length} buttons from answer text`);
    }
  }
  
  // Clean answer text (remove button markers if they were embedded)
  const { text: routerAnswerText } = extractButtonsFromText(rawRouterAnswer);
  
  console.log("[cascade] Router buttons extracted:", routerButtons);
  if (!routerButtons && process.env.DEBUG) {
    console.log("[cascade] Router answer text (last 500 chars):", rawRouterAnswer.slice(-500));
  }
  const normalizedRouterAnswer = normalizeDashes(routerAnswerText);
  const routerConfidence =
    typeof decision.confidence === "number" && Number.isFinite(decision.confidence)
      ? Math.min(1, Math.max(0, decision.confidence))
      : null;

  // Check if user explicitly requested a support ticket - force handoff if so
  const userMessage = typeof question === "string" ? question.toLowerCase() : "";
  const explicitTicketRequest = 
    userMessage.includes("raise a support request") ||
    userMessage.includes("create a ticket") ||
    userMessage.includes("log a ticket") ||
    userMessage.includes("support ticket") ||
    userMessage.includes("test ticket") ||
    userMessage.includes("escalate") ||
    userMessage.includes("talk to a human") ||
    userMessage.includes("contact support") ||
    userMessage.includes("speak to someone");
  
  let shouldHandoff = Boolean(decision.handoff);
  const reasonSegments = [];
  
  // Force handoff if user explicitly requested a ticket
  if (explicitTicketRequest && !shouldHandoff) {
    console.log("[cascade] ⚠️ User explicitly requested support ticket - forcing handoff to heavy agent");
    shouldHandoff = true;
    reasonSegments.push("User explicitly requested a support ticket/escalation");
  }
  
  if (decision.reason) {
    reasonSegments.push(decision.reason);
  }

  const routerQuickReply =
    !shouldHandoff && normalizedRouterAnswer.length > 0
      ? normalizedRouterAnswer
      : DEFAULT_HANDOFF_ACK;

  const routerDecision = {
    ...decision,
    handoff: shouldHandoff,
    answer: routerQuickReply,
    confidence: routerConfidence,
    reason: reasonSegments.join(" | ") || undefined,
  };

  // Emit router decision progress
  if (typeof onProgress === "function") {
    onProgress("cascade.stage router_decided");
  }

  console.log("[cascade] Router decision - handoff:", routerDecision.handoff, "confidence:", routerConfidence, "reason:", routerDecision.reason);

  if (!routerDecision.handoff) {
    console.log("[cascade] Router answering directly, skipping heavy agent");
    const totalMs = performance.now() - overallStart;
    return {
      source: "router",
      answer: routerDecision.answer,
      buttons: routerButtons,
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
      buttons: routerButtons, // Include buttons from router
    });
  }

  console.log("[cascade] Router handed off to heavy agent, proceeding with heavy agent call");

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
    content: buildContentArray(heavyPrompt, imageUrls),
  };

  const heavyStart = performance.now();
  
  // Emit heavy agent starting progress
  if (typeof onProgress === "function") {
    onProgress("cascade.stage heavy_searching");
  }
  
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
    heavyRequest.max_output_tokens = 2400;
  }

  const heavyTools = buildHeavyTools(config, context);
  if (heavyTools) {
    heavyRequest.tools = heavyTools;
    console.log("[cascade] Heavy tools configured:", heavyTools.map(t => ({
      type: t.type,
      name: t.name || 'N/A',
    })));
    console.log("[cascade] Heavy request includes tools:", {
      toolsCount: heavyTools.length,
      hasZendeskTool: heavyTools.some(t => t.name === "create_zendesk_ticket"),
      toolsArray: JSON.stringify(heavyTools.map(t => ({ type: t.type, name: t.name }))),
    });
  } else {
    console.log("[cascade] No heavy tools configured");
  }

  const heavyReasoning = resolveReasoning({
    model: config.heavyModel,
    desiredEffort: config.heavyReasoning,
    usingTools: Boolean(heavyTools?.length),
  });
  if (heavyReasoning) {
    heavyRequest.reasoning = heavyReasoning;
  }

  // Emit heavy agent generating progress
  if (typeof onProgress === "function") {
    onProgress("cascade.stage heavy_generating");
  }

  // Helper function to handle function calls
  const handleFunctionCall = async (toolCall) => {
    console.log("[cascade] ===== handleFunctionCall INVOKED =====");
    console.log("[cascade] handleFunctionCall called with:", {
      name: toolCall?.name,
      id: toolCall?.id,
      hasArguments: !!toolCall?.arguments,
      argumentsType: typeof toolCall?.arguments,
      fullToolCall: JSON.stringify(toolCall, null, 2),
    });
    
    if (!toolCall || toolCall.name !== "create_zendesk_ticket") {
      console.log("[cascade] Tool call skipped - not create_zendesk_ticket. Tool name:", toolCall?.name);
      return null;
    }
    
    console.log("[cascade] ✓ Tool call is for create_zendesk_ticket - proceeding with ticket creation");

    try {
      // Responses API: arguments may be a string or already parsed object
      const args = typeof toolCall.arguments === "string"
        ? JSON.parse(toolCall.arguments)
        : toolCall.arguments || {};
      
      console.log("[cascade] Parsed ticket arguments:", {
        subject: args.subject?.substring(0, 50),
        subjectLength: args.subject?.length,
        hasDescription: !!args.description,
        descriptionLength: args.description?.length,
        priority: args.priority,
        type: args.type,
        fullArgs: JSON.stringify(args, null, 2),
      });

      // Check if this is a test ticket request
      const isTestTicket = args.subject?.toLowerCase().includes("test ticket") || 
                          args.description?.toLowerCase().includes("test ticket") ||
                          args.subject?.toLowerCase().startsWith("test ticket");
      
      let finalSubject = args.subject;
      let finalDescription = args.description;
      let requesterEmail;
      let requesterName;
      
      if (isTestTicket) {
        // Use simple test data for test tickets
        const timestamp = new Date().toISOString();
        finalSubject = "Test Ticket";
        finalDescription = `This is a test ticket created for testing purposes.\n\nCreated at: ${timestamp}`;
        // Use fixed test credentials for test tickets
        requesterEmail = "manny.letellier@fyi.app";
        requesterName = "Manny Letellier";
        console.log("[cascade] Test ticket detected - using test data and fixed credentials:", {
          finalSubject,
          requesterEmail,
          requesterName,
        });
      } else {
        // Extract user context for requester info for real tickets
        requesterEmail = context?.userEmail || undefined;
        requesterName = context?.firstName && context?.lastName
          ? `${context.firstName} ${context.lastName}`.trim()
          : undefined;
      }

      const ticketResult = await createZendeskTicket({
        subject: finalSubject,
        description: finalDescription,
        priority: args.priority ?? 2,
        type: args.type ?? "question",
        requesterEmail,
        requesterName,
      });

      console.log("[cascade] ✓✓✓ TICKET CREATED SUCCESSFULLY ✓✓✓");
      console.log("[cascade] Ticket created successfully:", {
        ticketId: ticketResult.ticketId,
        ticketUrl: ticketResult.ticketUrl,
      });

      const result = JSON.stringify({
        success: true,
        ticketId: ticketResult.ticketId,
        ticketUrl: ticketResult.ticketUrl,
        message: `Support ticket #${ticketResult.ticketId} has been created successfully.`,
      });
      console.log("[cascade] Returning ticket result:", result);
      return result;
    } catch (error) {
      console.error("[cascade] ✗✗✗ FAILED TO CREATE TICKET ✗✗✗");
      console.error("[cascade] Failed to create ticket:", {
        error: error.message,
        stack: error.stack,
        name: error.name,
      });
      return JSON.stringify({
        success: false,
        error: error.message || "Failed to create ticket",
      });
    }
  };

  let heavyResponse = null;
  let heavyAnswer = "";
  let heavyEvents = debugStream ? [] : undefined;
  let functionCallResults = [];
  let responseIncomplete = false;

  if (config.heavyStreamingEnabled) {
    console.log("[cascade] Heavy agent API call (streaming) - model:", config.heavyModel);
    console.log("[cascade] Heavy request (sanitized):", {
      model: heavyRequest.model,
      hasTools: !!heavyRequest.tools,
      toolsCount: heavyRequest.tools?.length,
      hasInstructions: !!heavyRequest.instructions,
      inputLength: heavyRequest.input?.length,
    });
    
    const streamingRequest = {
      ...heavyRequest,
      stream: true,
    };

    // Log the actual request being sent (sanitized for debugging)
    console.log("[cascade] Heavy streaming request details:", {
      model: streamingRequest.model,
      hasTools: !!streamingRequest.tools,
      toolsCount: streamingRequest.tools?.length,
      toolsTypes: streamingRequest.tools?.map(t => t.type),
      hasInstructions: !!streamingRequest.instructions,
      instructionsLength: streamingRequest.instructions?.length,
      hasInput: !!streamingRequest.input,
      inputLength: Array.isArray(streamingRequest.input) ? streamingRequest.input.length : 0,
      stream: streamingRequest.stream,
      hasMetadata: !!streamingRequest.metadata,
    });

    let stream;
    try {
      stream = await openai.responses.stream(streamingRequest);
    } catch (error) {
      console.error("[cascade] ✗✗✗ FAILED TO CREATE STREAMING REQUEST ✗✗✗");
      console.error("[cascade] Streaming request error:", {
        message: error.message,
        status: error.status,
        code: error.code,
        type: error.type,
        requestId: error.request_id || error.requestId,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });
      throw error;
    }

    try {
      for await (const event of stream) {
        if (heavyEvents) {
          heavyEvents.push(event.type);
        }
        
        // Detect incomplete responses
        if (event.type === "response.incomplete") {
          responseIncomplete = true;
          console.warn("[cascade] ⚠️ Response marked as incomplete");
        }
        
        // Log all event types to debug tool call detection
        if (event.type && !event.type.includes("output_text.delta")) {
          console.log("[cascade] Stream event type:", event.type, {
            hasToolCall: !!event.tool_call,
            toolCallName: event.tool_call?.name,
            hasName: !!event.name,
            name: event.name,
            eventKeys: Object.keys(event),
          });
        }
        
        if (event.type === "response.output_text.delta") {
          heavyAnswer += event.delta;
          // Call streaming callback if provided
          if (typeof onStreamDelta === "function" && event.delta) {
            onStreamDelta(event.delta);
          }
        }
        // Check for function calls in streaming events
        // Responses API tool call structure: event.tool_call with name, arguments, etc.
        if (event.type === "response.tool_call" && event.tool_call) {
          console.log("[cascade] ===== TOOL CALL EVENT IN STREAM =====");
          console.log("[cascade] Tool call event received in stream:", {
            eventType: event.type,
            toolCallName: event.tool_call?.name,
            toolCallId: event.tool_call?.id,
            fullEvent: JSON.stringify(event, null, 2),
          });
          const toolCall = event.tool_call;
          if (toolCall.name === "create_zendesk_ticket") {
            console.log("[cascade] ✓ Found create_zendesk_ticket tool call in stream - calling handleFunctionCall");
            const result = await handleFunctionCall(toolCall);
            if (result) {
              functionCallResults.push({
                tool_call_id: toolCall.id,
                result: result,
              });
              console.log("[cascade] ✓ Tool call result added to functionCallResults. Count:", functionCallResults.length);
            } else {
              console.warn("[cascade] ✗ handleFunctionCall returned null/empty result");
            }
          } else {
            console.log("[cascade] Tool call is not create_zendesk_ticket, skipping. Name:", toolCall.name);
          }
        }
      }

      try {
        heavyResponse = await stream.finalResponse();
      } catch (finalResponseError) {
        // If finalResponse() fails but we have partial data, create a minimal response object
        console.warn("[cascade] ⚠️ stream.finalResponse() failed, but continuing with partial data:", finalResponseError.message);
        heavyResponse = heavyResponse || { output: [], output_text: heavyAnswer };
        // Re-throw only if we don't have any data
        if (!heavyAnswer && functionCallResults.length === 0) {
          throw finalResponseError;
        }
      }
    } catch (error) {
      console.error("[cascade] ✗✗✗ ERROR DURING STREAMING OR FINAL RESPONSE ✗✗✗");
      console.error("[cascade] Streaming/finalResponse error:", {
        message: error.message,
        status: error.status,
        code: error.code,
        type: error.type,
        requestId: error.request_id || error.requestId,
        response: error.response?.data,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });
      console.error("[cascade] Heavy answer accumulated so far:", {
        length: heavyAnswer.length,
        preview: heavyAnswer.substring(0, 200),
      });
      console.error("[cascade] Function call results so far:", {
        count: functionCallResults.length,
        results: functionCallResults,
      });
      
      // Check if this is a retryable server error
      const isRetryableError = 
        error.code === "server_error" || 
        error.type === "server_error" ||
        (error.status && error.status >= 500 && error.status < 600);
      
      // If we have partial response and it's a retryable error, try non-streaming fallback
      if (isRetryableError && heavyAnswer.length === 0 && functionCallResults.length === 0) {
        console.log("[cascade] Attempting fallback to non-streaming mode due to server error...");
        try {
          // Fallback to non-streaming request
          const nonStreamingRequest = {
            ...heavyRequest,
            stream: false,
          };
          heavyResponse = await openai.responses.create(nonStreamingRequest);
          console.log("[cascade] ✓ Fallback to non-streaming succeeded");
          
          // Extract answer from non-streaming response
          heavyAnswer = extractOutputText(heavyResponse) || "";
          
          // Process tool calls from non-streaming response
          if (heavyResponse.output && Array.isArray(heavyResponse.output)) {
            for (const item of heavyResponse.output) {
              if ((item?.type === "function_call" || item?.type === "tool_call") && item.name === "create_zendesk_ticket") {
                const result = await handleFunctionCall(item);
                if (result) {
                  functionCallResults.push({
                    tool_call_id: item.id,
                    result: result,
                  });
                }
              }
            }
          }
        } catch (fallbackError) {
          console.error("[cascade] ✗ Fallback to non-streaming also failed:", fallbackError.message);
          // Create a user-friendly error
          const userError = new Error(
            "We're experiencing temporary issues with our AI service. Please try again in a moment. " +
            `If the problem persists, contact support and mention request ID: ${error.request_id || error.requestId || "unknown"}`
          );
          userError.status = error.status || 500;
          userError.code = error.code || "server_error";
          throw userError;
        }
      } else {
        // For non-retryable errors or if we have partial data, create user-friendly error
        if (isRetryableError) {
          const userError = new Error(
            "We're experiencing temporary issues with our AI service. Please try again in a moment. " +
            `If the problem persists, contact support and mention request ID: ${error.request_id || error.requestId || "unknown"}`
          );
          userError.status = error.status || 500;
          userError.code = error.code || "server_error";
          throw userError;
        }
        throw error;
      }
    }
    
    // Log final response details for debugging
    console.log("[cascade] Heavy stream final response:", {
      hasOutputText: !!heavyResponse.output_text,
      outputTextLength: heavyResponse.output_text?.length,
      hasOutput: !!heavyResponse.output,
      outputLength: Array.isArray(heavyResponse.output) ? heavyResponse.output.length : 0,
      outputTypes: Array.isArray(heavyResponse.output) ? heavyResponse.output.map(item => item?.type) : null,
      functionCallResultsCount: functionCallResults.length,
    });
    
    // Check for tool calls in the final response (in case they weren't captured in stream events)
    // Responses API can have tool calls as "function_call" or "tool_call" types
    if (heavyResponse.output && Array.isArray(heavyResponse.output)) {
      console.log("[cascade] Checking final response output for tool calls...");
      console.log("[cascade] Full output array structure:", JSON.stringify(heavyResponse.output.map(item => ({
        type: item?.type,
        name: item?.name,
        id: item?.id,
        hasArguments: !!item?.arguments,
      })), null, 2));
      
      for (let i = 0; i < heavyResponse.output.length; i++) {
        const item = heavyResponse.output[i];
        console.log(`[cascade] Checking output item ${i + 1}/${heavyResponse.output.length}:`, {
          type: item?.type,
          name: item?.name,
          id: item?.id,
          hasArguments: !!item?.arguments,
          fullItem: JSON.stringify(item).substring(0, 500),
        });
        
        // Responses API uses "function_call" type for tool calls
        if (item?.type === "function_call") {
          console.log("[cascade] ✓ Found function_call in final response:", {
            type: item.type,
            name: item.name,
            id: item.id,
            hasArguments: !!item.arguments,
            argumentsPreview: typeof item.arguments === "string" ? item.arguments.substring(0, 200) : JSON.stringify(item.arguments).substring(0, 200),
          });
          if (item.name === "create_zendesk_ticket") {
            // Check if we already processed this tool call
            const alreadyProcessed = functionCallResults.some(r => r.tool_call_id === item.id);
            if (!alreadyProcessed) {
              console.log("[cascade] Processing function_call from final response (wasn't in stream events)");
              const result = await handleFunctionCall(item);
              if (result) {
                functionCallResults.push({
                  tool_call_id: item.id,
                  result: result,
                });
                console.log("[cascade] ✓ Tool call result added from final response. Count:", functionCallResults.length);
              }
            } else {
              console.log("[cascade] Tool call already processed from stream events");
            }
          } else {
            console.log("[cascade] Function call is not create_zendesk_ticket. Name:", item.name);
          }
        } else if (item?.type === "tool_call") {
          // Also check for "tool_call" type (legacy format)
          console.log("[cascade] ✓ Found tool_call in final response:", {
            type: item.type,
            name: item.name,
            id: item.id,
          });
          if (item.name === "create_zendesk_ticket") {
            const alreadyProcessed = functionCallResults.some(r => r.tool_call_id === item.id);
            if (!alreadyProcessed) {
              console.log("[cascade] Processing tool_call from final response");
              const result = await handleFunctionCall(item);
              if (result) {
                functionCallResults.push({
                  tool_call_id: item.id,
                  result: result,
                });
                console.log("[cascade] ✓ Tool call result added from final response. Count:", functionCallResults.length);
              }
            }
          }
        }
      }
    }
    
    if (!heavyAnswer) {
      heavyAnswer = extractOutputText(heavyResponse);
      console.log("[cascade] Extracted answer from final response, length:", heavyAnswer.length);
    } else {
      console.log("[cascade] Using accumulated answer from stream deltas, length:", heavyAnswer.length);
    }
    
    // Fallback: If response was incomplete and ticket was explicitly requested but not created, create it
    // Check even if there's partial text, as long as no ticket was created
    if (responseIncomplete && functionCallResults.length === 0) {
      const userMessage = typeof question === "string" ? question.toLowerCase() : "";
      const explicitTicketRequest = 
        userMessage.includes("raise a support request") ||
        userMessage.includes("create a ticket") ||
        userMessage.includes("log a ticket") ||
        userMessage.includes("support ticket") ||
        userMessage.includes("escalate") ||
        userMessage.includes("talk to a human") ||
        userMessage.includes("contact support") ||
        userMessage.includes("speak to someone") ||
        userMessage.includes("i need a support ticket") ||
        userMessage.includes("i need a ticket");
      
      if (explicitTicketRequest) {
        console.warn("[cascade] ⚠️ Response incomplete and ticket was requested but not created - creating ticket as fallback");
        try {
          const isTestTicket = userMessage.includes("test ticket");
          let ticketSubject = generateTicketSubject(question);
          let ticketDescription = `User requested support ticket.\n\nOriginal message: ${question}`;
          let requesterEmail = context?.userEmail || undefined;
          let requesterName = context?.firstName && context?.lastName
            ? `${context.firstName} ${context.lastName}`.trim()
            : undefined;
          
          if (isTestTicket) {
            const timestamp = new Date().toISOString();
            ticketSubject = "Test Ticket";
            ticketDescription = `This is a test ticket created for testing purposes.\n\nCreated at: ${timestamp}`;
            requesterEmail = "manny.letellier@fyi.app";
            requesterName = "Manny Letellier";
          }
          
          console.log("[cascade] Generated ticket subject:", ticketSubject);
          
          const ticketResult = await createZendeskTicket({
            subject: ticketSubject,
            description: ticketDescription,
            priority: 3, // High priority for urgent requests
            type: "incident",
            requesterEmail,
            requesterName,
          });
          
          const ticketResultJson = JSON.stringify({
            success: true,
            ticketId: ticketResult.ticketId,
            ticketUrl: ticketResult.ticketUrl,
            message: `Support ticket #${ticketResult.ticketId} has been created successfully.`,
          });
          
          functionCallResults.push({
            tool_call_id: `fallback_${Date.now()}`,
            result: ticketResultJson,
          });
          
          // Append ticket info to existing answer if any, otherwise create new message
          if (heavyAnswer && heavyAnswer.trim().length > 0) {
            heavyAnswer = `${heavyAnswer.trim()}\n\nI've created support ticket #${ticketResult.ticketId} for you. The support team will investigate your issue. You can view the ticket here: ${ticketResult.ticketUrl}`;
          } else {
            heavyAnswer = `I've created support ticket #${ticketResult.ticketId} for you. The support team will investigate your issue. You can view the ticket here: ${ticketResult.ticketUrl}`;
          }
          console.log("[cascade] ✓ Fallback ticket created successfully:", ticketResult.ticketId);
          
          // Emit completion event to stop UI status updates
          if (typeof onProgress === "function") {
            onProgress("cascade.stage complete");
          }
        } catch (fallbackError) {
          console.error("[cascade] ✗ Fallback ticket creation failed:", fallbackError.message);
          heavyAnswer = "I encountered an issue while creating your support ticket. Please try again or contact support directly.";
        }
      }
    }
  } else {
    console.log("[cascade] Heavy agent API call (non-streaming) - model:", config.heavyModel);
    console.log("[cascade] Heavy request (sanitized):", {
      model: heavyRequest.model,
      hasTools: !!heavyRequest.tools,
      toolsCount: heavyRequest.tools?.length,
      toolsDetails: heavyRequest.tools?.map(t => ({ type: t.type, name: t.name })),
      hasInstructions: !!heavyRequest.instructions,
      inputLength: heavyRequest.input?.length,
    });
    
    let heavyResponse;
    try {
      heavyResponse = await openai.responses.create(heavyRequest);
      console.log("[cascade] ✓ Heavy response received successfully");
    } catch (error) {
      console.error("[cascade] ✗✗✗ FAILED TO CREATE HEAVY REQUEST ✗✗✗");
      console.error("[cascade] Heavy request error:", {
        message: error.message,
        status: error.status,
        code: error.code,
        type: error.type,
        response: error.response?.data,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });
      // Log the actual request that failed (sanitized)
      console.error("[cascade] Request that failed:", JSON.stringify({
        model: heavyRequest.model,
        tools: heavyRequest.tools,
        hasInstructions: !!heavyRequest.instructions,
      }, null, 2));
      throw error;
    }
    
    heavyAnswer = extractOutputText(heavyResponse);
    
    // Check for function calls in the response
    // Responses API: tool calls are in response.output array with type "tool_call"
    console.log("[cascade] ===== CHECKING FOR TOOL CALLS IN RESPONSE =====");
    console.log("[cascade] Checking for tool calls in response.output:", {
      hasOutput: !!heavyResponse.output,
      isArray: Array.isArray(heavyResponse.output),
      outputLength: Array.isArray(heavyResponse.output) ? heavyResponse.output.length : 0,
      outputTypes: Array.isArray(heavyResponse.output) ? heavyResponse.output.map(i => i.type) : [],
    });
    
    if (heavyResponse.output && Array.isArray(heavyResponse.output)) {
      console.log("[cascade] Iterating through", heavyResponse.output.length, "output items");
      for (let i = 0; i < heavyResponse.output.length; i++) {
        const item = heavyResponse.output[i];
        console.log("[cascade] Checking output item", i + 1, "of", heavyResponse.output.length, ":", {
          type: item.type,
          name: item.name,
          id: item.id,
          hasArguments: !!item.arguments,
        });
        if (item.type === "tool_call" && item.name === "create_zendesk_ticket") {
          console.log("[cascade] ✓✓✓ FOUND create_zendesk_ticket TOOL CALL IN RESPONSE ✓✓✓");
          console.log("[cascade] Full tool call item:", JSON.stringify(item, null, 2));
          const result = await handleFunctionCall(item);
          if (result) {
            functionCallResults.push({
              tool_call_id: item.id,
              result: result,
            });
            console.log("[cascade] ✓ Tool call result added to functionCallResults. Count:", functionCallResults.length);
          } else {
            console.warn("[cascade] ✗ handleFunctionCall returned null/empty result");
          }
        } else if (item.type === "tool_call") {
          console.log("[cascade] Found tool_call but not create_zendesk_ticket. Name:", item.name);
        }
      }
    } else {
      console.log("[cascade] No output array found or output is not an array");
    }
    
    console.log("[cascade] ===== FINAL FUNCTION CALL RESULTS COUNT:", functionCallResults.length, "=====");
    if (functionCallResults.length === 0) {
      console.warn("[cascade] ⚠️  WARNING: No function call results found despite tool being configured!");
    }
  }

  // If function calls were made, ensure ticket information is ALWAYS included in the response
  // The Responses API should handle function calls automatically, but we'll ensure
  // ticket information is prominently displayed
  if (functionCallResults.length > 0) {
    const ticketResults = functionCallResults
      .map((r) => {
        try {
          const parsed = JSON.parse(r.result);
          if (parsed.success && parsed.ticketId && parsed.ticketUrl) {
            return {
              ticketId: parsed.ticketId,
              ticketUrl: parsed.ticketUrl,
              message: parsed.message || `Support ticket #${parsed.ticketId} has been created successfully.`,
            };
          }
        } catch {
          // Ignore parsing errors
        }
        return null;
      })
      .filter(Boolean);
    
    // Always ensure ticket information is prominently displayed
    if (ticketResults.length > 0) {
      // Check if ticket number is already mentioned in the response
      const ticketMentioned = ticketResults.some((t) => {
        const ticketIdStr = String(t.ticketId);
        return heavyAnswer.includes(`ticket #${ticketIdStr}`) || 
               heavyAnswer.includes(`ticket ${ticketIdStr}`) ||
               heavyAnswer.toLowerCase().includes(`ticket ${ticketIdStr}`) ||
               heavyAnswer.includes(`#${ticketIdStr}`);
      });
      
      // If not mentioned, append ticket information prominently
      if (!ticketMentioned) {
        const ticketInfo = ticketResults.map((t) => 
          `**Support ticket #${t.ticketId} has been created.** The support team will investigate and respond. You can view and track the ticket here: ${t.ticketUrl}`
        ).join("\n\n");
        heavyAnswer += `\n\n${ticketInfo}`;
      } else {
        // Even if mentioned, ensure the ticket URL is included if missing
        ticketResults.forEach((t) => {
          if (!heavyAnswer.includes(t.ticketUrl)) {
            heavyAnswer += `\n\nYou can view the ticket here: ${t.ticketUrl}`;
          }
        });
      }
    }
  }

  // Extract buttons from heavy agent response
  console.log("[cascade] Heavy answer length before extraction:", heavyAnswer.trim().length);
  console.log("[cascade] Heavy answer preview:", heavyAnswer.trim().substring(0, 200));
  const { text: heavyAnswerText, buttons: heavyButtons } = extractButtonsFromText(heavyAnswer.trim());
  console.log("[cascade] Heavy buttons extracted:", heavyButtons);
  if (!heavyButtons && process.env.DEBUG) {
    console.log("[cascade] Heavy answer text (last 500 chars):", heavyAnswer.trim().slice(-500));
  }
  heavyAnswer = normalizeDashes(heavyAnswerText);
  
  if (!heavyAnswer) {
    heavyAnswer =
      "<p>Sorry, I wasn't able to pull in the full answer right now. Please try again in a moment or let me know if you'd like a support ticket link.</p>";
  }


  const heavyLatencyMs = performance.now() - heavyStart;
  const totalMs = performance.now() - overallStart;

  return {
    source: "heavy",
    answer: heavyAnswer,
    buttons: heavyButtons,
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
      raw: heavyResponse || { output: [], incomplete: responseIncomplete },
      events: heavyEvents,
    },
    timings: {
      router_ms: routerLatencyMs,
      heavy_ms: heavyLatencyMs,
      total_ms: totalMs,
    },
  };
}


