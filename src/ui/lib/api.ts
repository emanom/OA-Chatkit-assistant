export type Role = "user" | "assistant";

export interface ConversationTurn {
  role: Role;
  content: string;
}

export interface RouterDecision {
  handoff: boolean;
  answer: string;
  reason?: string;
  confidence?: number | null;
  follow_up_needed?: boolean;
}

export interface CascadeConfigOverrides {
  routerModel?: string;
  heavyModel?: string;
  routerReasoning?: string;
  heavyReasoning?: string;
  routerConfidenceThreshold?: number;
}

export interface CascadeUserContextPayload {
  firstName?: string;
  lastName?: string;
  userEmail?: string;
  linkUrl?: string;
  userSubscriptionPlan?: string;
  userAdminStatus?: boolean;
  date?: string;
}

export interface CascadeRequestPayload {
  question: string;
  history?: ConversationTurn[];
  config?: CascadeConfigOverrides;
  stream?: boolean;
  context?: CascadeUserContextPayload;
}

export interface CascadeResultPayload {
  source: "router" | "heavy";
  answer: string;
  interim?: string | null;
}

export interface CascadeResponse {
  interim: InterimEventPayload | null;
  result: CascadeResultPayload;
}

export interface InterimEventPayload {
  quickReply: string;
  decision?: RouterDecision;
}

export async function callCascade({
  signal,
  payload,
}: {
  signal?: AbortSignal;
  payload: CascadeRequestPayload;
}): Promise<CascadeResponse> {
  const response = await fetch("/api/cascade", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error ?? "Failed to call cascade endpoint.");
  }

  return response.json();
}

export async function streamCascade({
  payload,
  onInterim,
  onFinal,
}: {
  payload: CascadeRequestPayload;
  onInterim: (data: InterimEventPayload) => void;
  onFinal: (data: CascadeResultPayload) => void;
}): Promise<void> {
  const response = await fetch("/api/cascade", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ ...payload, stream: true }),
  });

  if (!response.ok || !response.body) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error ?? "Failed to start streaming cascade.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const processBuffer = () => {
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const eventChunk of events) {
      const [eventLine, dataLine] = eventChunk.split("\n");
      if (!eventLine?.startsWith("event:") || !dataLine?.startsWith("data:")) {
        continue;
      }

      const eventType = eventLine.replace("event:", "").trim();
      const dataJson = dataLine.replace("data:", "").trim();

      try {
        const parsed = JSON.parse(dataJson);
        if (eventType === "interim") {
          onInterim(parsed as InterimEventPayload);
        } else if (eventType === "final") {
          onFinal(parsed as CascadeResultPayload);
        }
      } catch (error) {
        console.error("Failed parsing SSE event", error);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      processBuffer();
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    processBuffer();
  }
}

