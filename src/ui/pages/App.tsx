import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";

const THREAD_STORAGE_KEY = "fyi-chatkit:last-thread";
const MAX_CONTEXT_SYNC_ATTEMPTS = 5;
const CONTEXT_SYNC_BASE_DELAY_MS = 250;
const isThreadMissingError = (value: unknown) => {
  const message =
    typeof value === "string"
      ? value
      : value instanceof Error
      ? value.message
      : typeof value === "object" &&
        value !== null &&
        "message" in value &&
        typeof (value as { message?: unknown }).message === "string"
      ? ((value as { message?: string }).message as string)
      : "";
  if (!message) {
    return false;
  }
  const normalized = message.toLowerCase();
  return normalized.includes("thread") && normalized.includes("not found");
};
const ATTACHMENTS_MAX_BYTES = Number.parseInt(
  import.meta.env.VITE_ATTACHMENTS_MAX_BYTES ?? String(50 * 1024 * 1024),
  10
);
const ATTACHMENTS_MAX_COUNT = Number.parseInt(
  import.meta.env.VITE_ATTACHMENTS_MAX_COUNT ?? "4",
  10
);
const ATTACHMENTS_ACCEPTED_TYPES: Record<string, string[]> = {
  "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"],
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".doc",
    ".docx",
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xls",
    ".xlsx",
  ],
};

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

export default function App() {
  const [parsedContext] = useState(parseUserContextFromQuery);
  const [initialThread] = useState<string | null>(parseInitialThreadId);
  const userContext = parsedContext.context;
  const hasUserContext = useMemo(
    () => Object.keys(userContext).length > 0,
    [userContext]
  );

  const [assistantPhase, setAssistantPhase] = useState<AssistantPhase>("idle");
  const [progressText, setProgressText] = useState<string | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  const [routerLog, setRouterLog] = useState<CascadeRouterLog | null>(null);
  const [contextSynced, setContextSynced] = useState(false);
  const progressTimeoutsRef = useRef<number[]>([]);
  const isRespondingRef = useRef(false);
  const responseEndedRef = useRef(false);
  const responseStartedRef = useRef(false);
  const [contextSyncAttempt, setContextSyncAttempt] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const threadBootstrapRef = useRef(false);
  const contextSyncRetryTimeoutRef = useRef<number | null>(null);
  const chatKitRef = useRef<ReturnType<typeof useChatKit> | null>(null);
  const [messageButtons, setMessageButtons] = useState<Map<string, Array<{ label: string; value: string }>>>(new Map());

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
      attachments: {
        enabled: true,
        maxSize: ATTACHMENTS_MAX_BYTES,
        maxCount: ATTACHMENTS_MAX_COUNT,
        accept: ATTACHMENTS_ACCEPTED_TYPES,
      },
    }),
    []
  );

  const disclaimer = useMemo(
    () => ({
      text: "FYI Support Assistant is powered by the [FYI Help Centre](https://support.fyi.app/hc/en-us) articles and OpenAI GPT-5 models.",
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
      { 
        label: "Help with feature...", 
        prefill: "Help me with the following feature: ",
        icon: (
          <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
          </svg>
        )
      },
      { 
        label: "How do I...", 
        prefill: "How do I: ",
        icon: (
          <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/>
          </svg>
        )
      },
      { 
        label: "Something's not working", 
        prefill: "Something's not working, here are the details: ",
        icon: (
          <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
          </svg>
        )
      },
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
    // Prevent multiple calls from resetting state
    if (responseStartedRef.current && isRespondingRef.current) {
      if (import.meta.env.DEV) {
        console.log("[App] handleResponseStart called multiple times, skipping");
      }
      return;
    }
    responseStartedRef.current = true;
    
    // Clear any existing timeouts first
    progressTimeoutsRef.current.forEach((id) => clearTimeout(id));
    progressTimeoutsRef.current = [];
    
    // Reset response ended flag
    responseEndedRef.current = false;
    
    setErrorMessage(null);
    setRouterLog(null);
    setProgressText(null);
    setAssistantPhase("thinking");
    setIsResponding(true);
    isRespondingRef.current = true;
    
    // Start progress sequence since we can't receive progress_update events via onLog
    // ChatKit SDK doesn't convert ProgressUpdateEvent to log events
    // Use shorter delays to ensure updates are visible before response ends
    const progressSequence = [
      { delay: 0, text: "Understanding your question...", phase: "thinking" as AssistantPhase },
      { delay: 300, text: "Analysing...", phase: "thinking" as AssistantPhase },
      { delay: 700, text: "Reviewing information...", phase: "thinking" as AssistantPhase },
    ];
    
    if (import.meta.env.DEV) {
      console.log("[App] Starting progress sequence with", progressSequence.length, "updates");
    }
    
    progressSequence.forEach(({ delay, text, phase }, index) => {
      const timeoutId = window.setTimeout(() => {
        // Check if we're still responding and haven't ended before updating
        if (!isRespondingRef.current || responseEndedRef.current) {
          if (import.meta.env.DEV) {
            console.log(`[App] Skipping progress update ${index + 1} - response ended or not responding`);
          }
          return;
        }
        
        if (import.meta.env.DEV) {
          console.log(`[App] Progress update ${index + 1}/${progressSequence.length}:`, text);
        }
        setProgressText(text);
        setAssistantPhase(phase);
      }, delay);
      progressTimeoutsRef.current.push(timeoutId);
    });
  }, []);

  const handleResponseEnd = useCallback(() => {
    // Prevent multiple calls from clearing state multiple times
    if (responseEndedRef.current) {
      if (import.meta.env.DEV) {
        console.log("[App] handleResponseEnd called multiple times, skipping");
      }
      return;
    }
    responseEndedRef.current = true;
    responseStartedRef.current = false;
    
    // Mark as not responding first (so pending timeouts know to skip)
    isRespondingRef.current = false;
    
    // Clear any pending progress timeouts immediately
    progressTimeoutsRef.current.forEach((id) => clearTimeout(id));
    progressTimeoutsRef.current = [];
    
    // Clear progress state with a small delay to ensure all updates are visible
    // This prevents clearing progress before the last update can be displayed
    setTimeout(() => {
      setProgressText(null);
      setAssistantPhase("idle");
      setIsResponding(false);
      
      // Trigger button fetch after response ends
      // This will be handled by the useEffect that watches isResponding
    }, 100);
    
    if (import.meta.env.DEV) {
      console.log("[App] Response ended, will clear progress state in 100ms");
    }
  }, []);

  const recoverMissingThread = useCallback(() => {
    const instance = chatKitRef.current;
    if (!instance) {
      return;
    }

    threadBootstrapRef.current = true;
    setIsThreadLoading(true);
    setContextSynced(false);
    setContextSyncAttempt(0);
    setActiveThreadId(null);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(THREAD_STORAGE_KEY);
      }
    } catch {
      // ignore storage failures
    }

    instance
      .setThreadId(null)
      .catch((error) => {
        console.warn("[chatkit] failed to recover missing thread", error);
      })
      .finally(() => {
        threadBootstrapRef.current = false;
      });
  }, []);

  const handleLog = useCallback(
    (detail?: ChatKitLogDetail) => {
      // Debug: log ALL log events to see what we're receiving
      if (import.meta.env.DEV) {
        console.log("[ChatKit] Log event received:", detail);
      }
      
      if (!detail?.name) return;

      if (detail.name === "progress_update") {
        const text =
          typeof detail.data?.text === "string" ? detail.data.text : "";
        if (!text) return;

        // Debug: log progress updates
        if (import.meta.env.DEV) {
          console.log("[ChatKit] Progress update:", text);
        }

        // Store the progress text to display it
        setProgressText(text);

        // Handle all status messages - update phase based on status text
        const lowerText = text.toLowerCase();
        
        if (lowerText.includes("understanding") || lowerText.includes("analysing") || 
            lowerText.includes("reviewing information") || lowerText.includes("preparing answer")) {
          setAssistantPhase("thinking");
          return;
        }

        if (lowerText.includes("searching") || lowerText.includes("knowledge base") || 
            lowerText.includes("reviewing articles") || lowerText.includes("preparing detailed")) {
          setAssistantPhase("handoff");
          return;
        }

        // Fallback to original logic for legacy messages
        if (text === "analysing..." || text === "Analysing...") {
          setAssistantPhase("thinking");
          return;
        }

        if (text === "searching...") {
          setAssistantPhase("handoff");
          return;
        }

        if (text.startsWith("cascade.stage ")) {
          const stage = text.slice("cascade.stage ".length);
          if (stage === "analyzing" || stage === "router_analyzing" || stage === "router_processing" || stage === "router_decided") {
            setAssistantPhase("thinking");
          } else if (stage === "heavy_pending" || stage === "heavy_searching" || stage === "heavy_generating") {
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
            
            // Update progress based on router decision
            // Clear existing progress timeouts first
            progressTimeoutsRef.current.forEach((id) => clearTimeout(id));
            progressTimeoutsRef.current = [];
            
            if (handoff) {
              // Heavy agent will be used - show searching status
              setAssistantPhase("handoff");
              const heavyProgressSequence = [
                { delay: 100, text: "Searching knowledge base..." },
                { delay: 600, text: "Reviewing articles..." },
                { delay: 1200, text: "Preparing detailed response..." },
              ];
              
              heavyProgressSequence.forEach(({ delay, text }) => {
                const timeoutId = window.setTimeout(() => {
                  // Check if we're still responding before updating
                  if (!isRespondingRef.current || responseEndedRef.current) {
                    if (import.meta.env.DEV) {
                      console.log("[App] Skipping heavy agent progress - response ended");
                    }
                    return;
                  }
                  
                  if (import.meta.env.DEV) {
                    console.log("[App] Heavy agent progress:", text);
                  }
                  setProgressText(text);
                }, delay);
                progressTimeoutsRef.current.push(timeoutId);
              });
            } else {
              // Router answered directly
              setProgressText("Preparing answer...");
              setAssistantPhase("router");
            }
          } catch {
            // Ignore malformed payloads.
          }
          return;
        }
      }

      if (detail.name === "error") {
        const fallback = "Unexpected issue while running the cascade.";
        const message =
          typeof detail.data?.message === "string"
            ? detail.data.message
            : fallback;

        if (isThreadMissingError(message)) {
          setErrorMessage("Your previous conversation expired; starting a new one now.");
          recoverMissingThread();
        } else {
          setErrorMessage(message);
        }

        setAssistantPhase("error");
      }
    },
    [recoverMissingThread]
  );

  const handleError = useCallback(
    (detail?: { error?: Error }) => {
      const fallback = "Unexpected error communicating with ChatKit.";
      const message = detail?.error?.message ?? fallback;

      if (isThreadMissingError(detail?.error ?? message)) {
        setErrorMessage("Your previous conversation expired; starting a new one now.");
        recoverMissingThread();
      } else {
        setErrorMessage(message);
      }

      setAssistantPhase("error");
      setIsResponding(false);
    },
    [recoverMissingThread]
  );

  const handleThreadChange = useCallback(
    ({ threadId }: { threadId: string | null }) => {
      setActiveThreadId(threadId);
      setContextSynced(false);
      setContextSyncAttempt(0);
      setIsThreadLoading(false);
      // Clear buttons when thread changes
      setMessageButtons(new Map());
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

  const handleThreadLoadStart = useCallback(() => {
    setIsThreadLoading(true);
  }, []);

  const handleThreadLoadEnd = useCallback(() => {
    setIsThreadLoading(false);
  }, []);

  const chatKit = useChatKit({
    api: {
      url: chatkitApiUrl,
      domainKey: chatkitDomainKey,
      uploadStrategy: { type: "two_phase" as const },
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
    onThreadLoadStart: handleThreadLoadStart,
    onThreadLoadEnd: handleThreadLoadEnd,
  });
  chatKitRef.current = chatKit;

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

  const handleButtonClick = useCallback(
    async (buttonValue: string) => {
      if (!chatKit) {
        return;
      }

      try {
        await chatKit.setComposerValue({ text: buttonValue });
        await chatKit.focusComposer();
        // Optionally auto-send: await chatKit.sendMessage();
      } catch (error) {
        console.warn("[App] Failed to handle button click", error);
      }
    },
    [chatKit]
  );

  // Effect to fetch buttons from thread messages when response ends
  useEffect(() => {
    if (!chatKit?.control || !activeThreadId || !isReady || isResponding) {
      return;
    }

    const fetchMessageButtons = async () => {
      try {
        if (import.meta.env.DEV) {
          console.log("[App] Fetching message buttons for thread:", activeThreadId);
        }

        const response = await fetch(`${chatkitApiUrl}/threads/${activeThreadId}/buttons`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          if (import.meta.env.DEV) {
            console.warn("[App] Failed to fetch buttons, status:", response.status);
          }
          return;
        }

        const data = await response.json();
        const buttonsByMessage = data.buttons || {};
        
        if (import.meta.env.DEV) {
          console.log("[App] Received buttons data:", buttonsByMessage);
        }
        
        const newButtons = new Map<string, Array<{ label: string; value: string }>>();
        
        // Sort by message ID (which typically includes timestamp) to get most recent first
        const sortedEntries = Object.entries(buttonsByMessage).sort(([a], [b]) => {
          // Compare message IDs - newer messages typically have higher IDs
          return b.localeCompare(a);
        });
        
        sortedEntries.forEach(([messageId, buttons]) => {
          if (Array.isArray(buttons) && buttons.length > 0) {
            newButtons.set(messageId, buttons);
            if (import.meta.env.DEV) {
              console.log(`[App] Found ${buttons.length} buttons for message ${messageId}:`, buttons);
            }
          }
        });

        // Update buttons state
        if (newButtons.size > 0) {
          setMessageButtons(newButtons);
          if (import.meta.env.DEV) {
            console.log("[App] Updated message buttons:", Array.from(newButtons.entries()));
          }
        } else {
          if (import.meta.env.DEV) {
            console.log("[App] No buttons found in response");
          }
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn("[App] Failed to fetch message buttons", error);
        }
      }
    };

    // Fetch buttons after a short delay to ensure message is saved
    const timeoutId = setTimeout(fetchMessageButtons, 1500);
    return () => clearTimeout(timeoutId);
  }, [chatKit?.control, activeThreadId, isReady, isResponding, chatkitApiUrl]);

  useEffect(() => {
    if (initialThread) {
      return;
    }
    if (!chatKit || !isReady) {
      return;
    }
    if (activeThreadId) {
      return;
    }
    if (threadBootstrapRef.current) {
      return;
    }
    threadBootstrapRef.current = true;
    setIsThreadLoading(true);
    chatKit
      .setThreadId(null)
      .catch((error) => {
        console.warn("[chatkit] failed to bootstrap thread", error);
      })
      .finally(() => {
        threadBootstrapRef.current = false;
      });
  }, [chatKit, isReady, activeThreadId, initialThread]);


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
    // 6. The thread is fully loaded
    if (
      !chatKit ||
      !isReady ||
      !hasUserContext ||
      contextSynced ||
      !activeThreadId ||
      isResponding ||
      isThreadLoading
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
        const message = error instanceof Error ? error.message : "";

        if (message.includes("no active thread")) {
          // This can happen during initialization; allow a future retry without noise.
          return;
        }

        if (
          message.includes("already responding") ||
          message.includes("thread is loading")
        ) {
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
    isThreadLoading,
    contextSyncAttempt,
  ]);

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

  // Render buttons component
  const renderMessageButtons = () => {
    if (messageButtons.size === 0) {
      if (import.meta.env.DEV) {
        console.log("[App] No buttons to render, messageButtons.size:", messageButtons.size);
      }
      return null;
    }

    // Get the last message with buttons (most recent)
    const buttonEntries = Array.from(messageButtons.entries());
    if (buttonEntries.length === 0) {
      if (import.meta.env.DEV) {
        console.log("[App] No button entries found");
      }
      return null;
    }

    // Show buttons for the most recent message
    const [lastMessageId, buttons] = buttonEntries[buttonEntries.length - 1];

    if (!buttons || buttons.length === 0) {
      if (import.meta.env.DEV) {
        console.log("[App] No buttons found for message:", lastMessageId);
      }
      return null;
    }

    if (import.meta.env.DEV) {
      console.log("[App] Rendering buttons for message:", lastMessageId, "buttons:", buttons);
    }

    return (
      <div
        key={lastMessageId}
        className="flex flex-wrap items-center justify-start gap-2 px-4 py-3 mt-2"
        style={{
          backgroundColor: chatSurfaceColor ?? "var(--chatkit-surface, #f8fafc)",
          borderTop: "1px solid var(--chatkit-border, #e2e8f0)",
        }}
      >
        {buttons.map((button, index) => (
          <button
            key={`${lastMessageId}-${index}`}
            type="button"
            onClick={() => {
              void handleButtonClick(button.value);
            }}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 active:bg-slate-100"
            style={{
              fontFamily: 'var(--font-sans, Inter, ui-sans-serif, system-ui)',
            }}
          >
            {button.label}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" style={{ minHeight: "520px" }}>
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-hidden">
              <ChatKit
                control={chatKit.control}
                className="block h-[72vh] min-h-[520px] w-full"
              />
            </div>
            {renderMessageButtons()}
          </div>
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
                className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-5 py-2 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
                style={{
                  fontFamily: 'var(--font-sans, Inter, ui-sans-serif, system-ui)',
                  fontSize: 'var(--font-text-md-size, 15px)',
                  lineHeight: 'var(--font-text-md-line-height, 23px)',
                  fontWeight: 'var(--font-weight-medium, 500)',
                  color: 'var(--color-text-secondary, hsl(222 22.61% 38.14%))',
                }}
              >
                <span className="flex-shrink-0" style={{ width: "1em", height: "1em", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  {action.icon}
                </span>
                <span>{action.label}</span>
              </button>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}


