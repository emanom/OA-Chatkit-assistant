import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";

const THREAD_STORAGE_KEY = "fyi-chatkit:last-thread";
const ROUTER_TOOL_ID = "fyi-router";
const MAX_CONTEXT_SYNC_ATTEMPTS = 5;
const CONTEXT_SYNC_BASE_DELAY_MS = 250;

type AssistantPhase =
  | "idle"
  | "ready"
  | "thinking"
  | "router"
  | "handoff"
  | "heavy"
  | "error";

type CascadeRouterLog = {
  handoff?: boolean;
  confidence?: number | null;
  reason?: string;
  answer?: string;
};

type ChatKitLogDetail = {
  name?: string;
  data?: Record<string, unknown>;
};

const defaultWelcomeContent =
  "Hi! Ask me anything about FYI features.";

const trimAndCollapseWhitespace = (value: string, limit = 200) => {
  const collapsed = value.trim().replace(/\s+/g, " ");
  return collapsed.slice(0, limit);
};

const parseNameParam = (value: string | null) => {
  if (!value) return undefined;
  const sanitized = trimAndCollapseWhitespace(value, 80);
  return sanitized.length > 0 ? sanitized : undefined;
};

const parseEmailParam = (value: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return undefined;
  return trimmed;
};

const parseLinkUrlParam = (value: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    return url.toString().slice(0, 512);
  } catch {
    return undefined;
  }
};

const parsePlanParam = (value: string | null) => {
  if (!value) return undefined;
  const sanitized = trimAndCollapseWhitespace(value, 80);
  return sanitized.length > 0 ? sanitized : undefined;
};

const parseBooleanParam = (value: string | null) => {
  if (value == null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return undefined;
};

const parseDateParam = (value: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    const epochMs = trimmed.length <= 12 ? numeric * 1000 : numeric;
    const dateFromNumber = new Date(epochMs);
    if (!Number.isNaN(dateFromNumber.getTime())) {
      return dateFromNumber.toISOString();
    }
  }

  const dateFromString = new Date(trimmed);
  if (!Number.isNaN(dateFromString.getTime())) {
    return dateFromString.toISOString();
  }

  const sanitized = trimAndCollapseWhitespace(trimmed, 120);
  return sanitized.length > 0 ? sanitized : undefined;
};

type UserContext = {
  firstName?: string;
  lastName?: string;
  userEmail?: string;
  linkUrl?: string;
  userSubscriptionPlan?: string;
  userAdminStatus?: boolean;
  date?: string;
};

const parseUserContextFromQuery = (): {
  context: UserContext;
  welcomeContent: string;
} => {
  const fallback = {
    context: {} as UserContext,
    welcomeContent: defaultWelcomeContent,
  };

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const params = new URLSearchParams(window.location.search);

    const firstName = parseNameParam(params.get("first_name"));
    const lastName = parseNameParam(params.get("last_name"));
    const userEmail = parseEmailParam(params.get("user_email"));
    const linkUrl = parseLinkUrlParam(params.get("link_url"));
    const userSubscriptionPlan = parsePlanParam(
      params.get("user_subscription_plan")
    );
    const userAdminStatus = parseBooleanParam(params.get("user_admin_status"));
    const date = parseDateParam(params.get("date"));

    const context: UserContext = {};

    if (firstName) {
      context.firstName = firstName;
    }
    if (lastName) {
      context.lastName = lastName;
    }
    if (userEmail) {
      context.userEmail = userEmail;
    }
    if (linkUrl) {
      context.linkUrl = linkUrl;
    }
    if (userSubscriptionPlan) {
      context.userSubscriptionPlan = userSubscriptionPlan;
    }
    if (userAdminStatus !== undefined) {
      context.userAdminStatus = userAdminStatus;
    }
    if (date) {
      context.date = date;
    }

    const displayName =
      firstName != null
        ? [firstName, lastName].filter(Boolean).join(" ")
        : null;

    const welcomeContent =
      context.firstName && context.firstName.length > 0
        ? `Hi ${context.firstName} ! Ask me anything about FYI features.`
        : defaultWelcomeContent;

    return {
      context,
      welcomeContent,
    };
  } catch {
    return fallback;
  }
};

const parseInitialThreadId = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery =
      params.get("thread_id") ?? params.get("thread") ?? params.get("t");
    if (fromQuery && fromQuery.trim().length > 0) {
      return trimAndCollapseWhitespace(fromQuery, 120);
    }
    const stored = window.localStorage.getItem(THREAD_STORAGE_KEY);
    return stored && stored.trim().length > 0 ? stored : null;
  } catch {
    return null;
  }
};

const formatConfidence = (confidence?: number | null) => {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) {
    return undefined;
  }
  return `${Math.round(confidence * 100)}%`;
};

const assistantPhaseCopy: Record<
  AssistantPhase,
  { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }
> = {
  idle: { label: "Ready for a new question", tone: "neutral" },
  ready: { label: "ChatKit ready", tone: "info" },
  thinking: { label: "Reviewing your request…", tone: "info" },
  router: { label: "Answered immediately", tone: "success" },
  handoff: { label: "Searching for detailed information…", tone: "info" },
  heavy: { label: "Preparing detailed answer…", tone: "info" },
  error: { label: "Issue reaching the cascade", tone: "danger" },
};

const statusToneClass: Record<AssistantPhase, string> = {
  idle: "bg-slate-100 text-slate-700 border-slate-200",
  ready: "bg-emerald-50 text-emerald-700 border-emerald-200",
  thinking: "bg-sky-50 text-sky-700 border-sky-200",
  router: "bg-emerald-50 text-emerald-700 border-emerald-200",
  handoff: "bg-amber-50 text-amber-800 border-amber-200",
  heavy: "bg-sky-50 text-sky-700 border-sky-200",
  error: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function App() {
  const [parsedContext] = useState(parseUserContextFromQuery);
  const [initialThread] = useState<string | null>(parseInitialThreadId);
  const userContext = parsedContext.context;
  const hasUserContext = useMemo(
    () => Object.keys(userContext).length > 0,
    [userContext]
  );

  const [assistantPhase, setAssistantPhase] = useState<AssistantPhase>("idle");
  const [isResponding, setIsResponding] = useState(false);
  const [routerLog, setRouterLog] = useState<CascadeRouterLog | null>(null);
  const [contextSynced, setContextSynced] = useState(false);
  const [contextSyncAttempt, setContextSyncAttempt] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const contextSyncRetryTimeoutRef = useRef<number | null>(null);

  const chatkitApiUrl =
    import.meta.env.VITE_CHATKIT_API_URL ?? "/api/chatkit";
  const chatkitDomainKey =
    import.meta.env.VITE_CHATKIT_DOMAIN_KEY ?? "local-development";

  const theme = useMemo(
    () => ({
      colorScheme: "light" as const,
      density: "normal" as const,
      radius: "soft" as const,
      color: {
        accent: { primary: "#003769", level: 3 as const },
        grayscale: { hue: 222, tint: 5 as const },
      },
      typography: {
        baseSize: 15 as const,
        fontFamily: "Inter, ui-sans-serif, system-ui",
      },
    }),
    []
  );

  const header = useMemo(
    () => ({
      enabled: true,
      title: {
        enabled: true,
        text: "FYI Support Assistant",
      },
    }),
    []
  );

  const startScreen = useMemo(
    () => ({
      greeting: parsedContext.welcomeContent,
      prompts: [
        {
          label: "Configure notifications",
          prompt:
            "How to configure notifications?",
          icon: "sparkle" as const,
        },
        {
          label: "What's new in FYI?",
          prompt:
            "What's new in FYI?",
          icon: "book-open" as const,
        },
        {
          label: "Raise a support request",
          prompt:
            "Raise a support request",
          icon: "lifesaver" as const,
        },
      ],
    }),
    [parsedContext.welcomeContent]
  );

  const composer = useMemo(
    () => ({
      placeholder: "Ask about FYI…",
      tools: [],
    }),
    []
  );

  const disclaimer = useMemo(
    () => ({
      text: "I can help with quick questions instantly and provide detailed answers when needed.",
      highContrast: false,
    }),
    []
  );

  const history = useMemo(
    () => ({
      enabled: true,
      showDelete: false,
      showRename: true,
    }),
    []
  );

  const quickActions = useMemo(
    () => [
      { label: "Help with feature...", prefill: "Help me with the following feature: " },
      { label: "How do I...", prefill: "How do I: " },
      { label: "Something's not working", prefill: "Something's not working, here are the details: " },
    ],
    []
  );

  const handleReady = useCallback(() => {
    setIsReady(true);
    setAssistantPhase((previous) =>
      previous === "error" ? previous : "ready"
    );
  }, []);

  const handleResponseStart = useCallback(() => {
    setErrorMessage(null);
    setRouterLog(null);
    setAssistantPhase("thinking");
    setIsResponding(true);
  }, []);

  const handleResponseEnd = useCallback(() => {
    setAssistantPhase("idle");
    setIsResponding(false);
  }, []);

  const handleLog = useCallback((detail?: ChatKitLogDetail) => {
    if (!detail?.name) return;

    if (detail.name === "progress_update") {
      const text =
        typeof detail.data?.text === "string" ? detail.data.text : "";
      if (!text) return;

                  // Handle user-friendly progress messages
                  if (text === "analysing...") {
                    setAssistantPhase("thinking");
                    return;
                  }
                  
                  if (text === "searching...") {
                    setAssistantPhase("handoff");
                    return;
                  }
                  
                  // Handle legacy stage names (shouldn't appear with new code, but keep for compatibility)
                  if (text.startsWith("cascade.stage ")) {
                    const stage = text.slice("cascade.stage ".length);
                    if (stage === "analyzing" || stage === "router_analyzing") {
                      setAssistantPhase("thinking");
                    } else if (stage === "heavy_pending") {
                      setAssistantPhase("handoff");
                    }
                    return;
                  }

      if (text.startsWith("cascade.router.decision ")) {
        const payloadText = text.slice("cascade.router.decision ".length);
        try {
          const parsed = JSON.parse(payloadText);
          const handoff = parsed?.handoff === true;
          const confidence =
            typeof parsed?.confidence === "number"
              ? parsed.confidence
              : undefined;
          const reason =
            typeof parsed?.reason === "string" ? parsed.reason : undefined;
          const answer =
            typeof parsed?.answer === "string" ? parsed.answer : undefined;

          setRouterLog({
            handoff,
            confidence: confidence ?? null,
            reason,
            answer,
          });
          setAssistantPhase(handoff ? "handoff" : "router");
        } catch {
          // Ignore malformed payloads.
        }
        return;
      }
    }

    if (detail.name === "error") {
      const message =
        typeof detail.data?.message === "string"
          ? detail.data.message
          : "Unexpected issue while running the cascade.";
      setErrorMessage(message);
      setAssistantPhase("error");
    }
  }, []);

  const handleError = useCallback((detail?: { error?: Error }) => {
    setErrorMessage(
      detail?.error?.message ?? "Unexpected error communicating with ChatKit."
    );
    setAssistantPhase("error");
    setIsResponding(false);
  }, []);

  const handleThreadChange = useCallback(
    ({ threadId }: { threadId: string | null }) => {
      setActiveThreadId(threadId);
      // Reset context synced flag when thread changes so we sync context for new threads
      if (threadId) {
        setContextSynced(false);
      }
      setContextSyncAttempt(0);
      if (typeof window !== "undefined" && contextSyncRetryTimeoutRef.current != null) {
        window.clearTimeout(contextSyncRetryTimeoutRef.current);
        contextSyncRetryTimeoutRef.current = null;
      }
      if (typeof window === "undefined") return;
      try {
        if (threadId) {
          window.localStorage.setItem(THREAD_STORAGE_KEY, threadId);
        } else {
          window.localStorage.removeItem(THREAD_STORAGE_KEY);
        }
      } catch {
        // Persistence is best-effort; ignore storage failures (e.g. Safari private mode).
      }
    },
    []
  );

  const chatKit = useChatKit({
    api: {
      url: chatkitApiUrl,
      domainKey: chatkitDomainKey,
    },
    initialThread,
    theme,
    header,
    startScreen,
    composer,
    disclaimer,
    history,
    onReady: handleReady,
    onResponseStart: handleResponseStart,
    onResponseEnd: handleResponseEnd,
    onLog: handleLog,
    onError: handleError,
    onThreadChange: handleThreadChange,
  });

  const prefillComposer = useCallback(
    async (text: string) => {
      if (!chatKit) {
        return;
      }

      try {
        if (activeThreadId != null) {
          await chatKit.setThreadId(null);
        }
        await chatKit.setComposerValue({ text });
        await chatKit.focusComposer();
      } catch (error) {
        console.warn("[App] Failed to prefill composer shortcut", error);
      }
    },
    [chatKit, activeThreadId]
  );

  useEffect(() => {
    if (typeof window !== "undefined" && contextSyncRetryTimeoutRef.current != null) {
      window.clearTimeout(contextSyncRetryTimeoutRef.current);
      contextSyncRetryTimeoutRef.current = null;
    }

    // Only sync context when:
    // 1. ChatKit is ready
    // 2. We have user context to sync
    // 3. We haven't already synced for this thread
    // 4. There's an active thread (required for sendCustomAction)
    // 5. The assistant is idle (sendCustomAction cannot run while responding)
    if (
      !chatKit ||
      !isReady ||
      !hasUserContext ||
      contextSynced ||
      !activeThreadId ||
      isResponding
    ) {
      return;
    }

    let cancelled = false;

    const attemptSync = async () => {
      try {
        await chatKit.sendCustomAction({
          type: "fyi.cascade.context",
          payload: { kind: "user-context", context: userContext },
        });
        if (!cancelled) {
          setContextSynced(true);
          setContextSyncAttempt(0);
        }
      } catch (error) {
        const message = typeof error?.message === "string" ? error.message : "";

        if (message.includes("no active thread")) {
          // This can happen during initialization; allow a future retry without noise.
          return;
        }

        if (message.includes("already responding")) {
          if (contextSyncAttempt + 1 > MAX_CONTEXT_SYNC_ATTEMPTS) {
            console.error(
              `[chatkit] failed to sync user context after ${MAX_CONTEXT_SYNC_ATTEMPTS} attempts`,
              error
            );
            return;
          }

          if (typeof window !== "undefined") {
            const delay =
              CONTEXT_SYNC_BASE_DELAY_MS * Math.min(5, contextSyncAttempt + 1);
            contextSyncRetryTimeoutRef.current = window.setTimeout(() => {
              if (!cancelled) {
                setContextSyncAttempt((attempt) => attempt + 1);
              }
            }, delay);
          }
          return;
        }

        console.error("[chatkit] failed to sync user context", error);
      }
    };

    void attemptSync();

    return () => {
      cancelled = true;
    };
  }, [
    chatKit,
    contextSynced,
    hasUserContext,
    isReady,
    userContext,
    activeThreadId,
    isResponding,
    contextSyncAttempt,
  ]);

  const statusCopy = assistantPhaseCopy[assistantPhase];
  const statusClass = statusToneClass[assistantPhase];
  const confidenceLabel = formatConfidence(routerLog?.confidence);

  const [chatKitElementDefined, setChatKitElementDefined] = useState(false);
  const [chatSurfaceColor, setChatSurfaceColor] = useState<string | null>(null);

  useEffect(() => {
    if (!chatKitElementDefined || typeof window === "undefined") {
      return;
    }

    const element = document.querySelector("openai-chatkit") as HTMLElement | null;
    if (!element) {
      return;
    }

    const readSurfaceColor = () => {
      const computed = window.getComputedStyle(element);
      const candidate = computed?.backgroundColor;
      if (
        candidate &&
        candidate !== "rgba(0, 0, 0, 0)" &&
        candidate !== "transparent" &&
        candidate !== chatSurfaceColor
      ) {
        setChatSurfaceColor(candidate);
      }
    };

    readSurfaceColor();

    const observer = new MutationObserver(readSurfaceColor);
    observer.observe(element, { attributes: true, attributeFilter: ["style", "class"] });

    window.addEventListener("resize", readSurfaceColor);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", readSurfaceColor);
    };
  }, [chatKitElementDefined, chatSurfaceColor]);

  // Check if the openai-chatkit custom element is defined
  useEffect(() => {
    const checkElement = () => {
      if (typeof customElements === "undefined") {
        return false;
      }
      const isDefined = customElements.get("openai-chatkit") !== undefined;
      if (isDefined) {
        console.log("[App] ChatKit element is defined");
        setChatKitElementDefined(true);
      }
      return isDefined;
    };

    // Check immediately
    if (checkElement()) {
      return;
    }

    // If not defined, wait for it
    const interval = setInterval(() => {
      if (checkElement()) {
        clearInterval(interval);
      }
    }, 100);

    // Also listen for custom element definition
    if (typeof customElements !== "undefined") {
      customElements.whenDefined("openai-chatkit")
        .then(() => {
          console.log("[App] ChatKit element defined via whenDefined");
          setChatKitElementDefined(true);
          clearInterval(interval);
        })
        .catch((err) => {
          console.error("[App] Error waiting for ChatKit element:", err);
          clearInterval(interval);
        });
    }

    return () => clearInterval(interval);
  }, []);

  // Debug logging
  useEffect(() => {
    console.log("[App] ChatKit state:", {
      isReady,
      hasControl: !!chatKit?.control,
      activeThreadId,
      contextSynced,
      elementDefined: chatKitElementDefined,
    });
  }, [isReady, chatKit, activeThreadId, contextSynced, chatKitElementDefined]);

  // Debug: Check if ChatKit element is actually in DOM after render
  useEffect(() => {
    if (chatKitElementDefined && chatKit?.control) {
      setTimeout(() => {
        const chatKitElement = document.querySelector("openai-chatkit") as HTMLElement | null;
        const computedStyle = chatKitElement ? window.getComputedStyle(chatKitElement) : null;
        console.log("[App] ChatKit element in DOM:", {
          found: !!chatKitElement,
          tagName: chatKitElement?.tagName,
          className: chatKitElement?.className,
          style: chatKitElement?.style?.display,
          computedStyle: computedStyle?.display,
          width: computedStyle?.width,
          height: computedStyle?.height,
          visibility: computedStyle?.visibility,
          opacity: computedStyle?.opacity,
          parentElement: chatKitElement?.parentElement?.tagName,
          parentDisplay: chatKitElement?.parentElement ? window.getComputedStyle(chatKitElement.parentElement).display : null,
          offsetWidth: chatKitElement?.offsetWidth,
          offsetHeight: chatKitElement?.offsetHeight,
        });
      }, 1000);
    }
  }, [chatKitElementDefined, chatKit]);

              // Fix className -> class attribute for custom element (workaround for ChatKit React component bug)
              // This MUST be before the early return to follow Rules of Hooks
              useEffect(() => {
                if (chatKitElementDefined && chatKit?.control) {
                  const timer = setTimeout(() => {
                    const element = document.querySelector("openai-chatkit") as HTMLElement | null;
                    if (element) {
                      // Set class attribute (not classname)
                      element.setAttribute("class", "block h-[72vh] min-h-[520px] w-full");
                      // Also ensure it has display block and dimensions via inline styles
                      element.style.display = "block";
                      element.style.width = "100%";
                      element.style.minHeight = "520px";
                      element.style.height = "72vh";
                      console.log("[App] Fixed ChatKit element class attribute and styles");
                    }
                  }, 100);
                  return () => clearTimeout(timer);
                }
              }, [chatKitElementDefined, chatKit?.control]);

  if (!chatKit?.control || !chatKitElementDefined) {
  return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600">Loading ChatKit...</p>
          <p className="text-xs text-slate-400 mt-2">
            {!chatKit?.control ? "Waiting for ChatKit control..." : "Waiting for ChatKit element..."}
            </p>
          </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" style={{ minHeight: '520px' }}>
          <ChatKit
            control={chatKit.control}
            className="block h-[72vh] min-h-[520px] w-full"
          />
        </section>
        {chatKitElementDefined && chatKit?.control && (
          <section
            className="flex flex-wrap items-center justify-center gap-3 rounded-3xl border border-slate-200 px-6 py-4 shadow-sm"
            style={{ backgroundColor: chatSurfaceColor ?? "var(--chatkit-surface, #f8fafc)" }}
          >
            {quickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  void prefillComposer(action.prefill);
                }}
                className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
              >
                {action.label}
              </button>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}


