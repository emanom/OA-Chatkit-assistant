import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { runCascade } from "../src/cascade.js";
import { handleChatKitRequest } from "./chatkit.js";

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, "../dist");
const indexHtmlPath = path.join(distPath, "index.html");
const uiBundleExists = fs.existsSync(indexHtmlPath);

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(
  morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
    skip: () => process.env.MORGAN_DISABLED === "true",
  })
);

if (uiBundleExists) {
  app.use(express.static(distPath, { index: false }));
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

const parseHistory = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((turn) => {
      if (!turn || typeof turn.content !== "string") return null;
      return {
        role: typeof turn.role === "string" ? turn.role : "user",
        content: turn.content,
      };
    })
    .filter(Boolean);
};

const sanitizeString = (value, limit = 200) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\s+/g, " ").slice(0, limit);
};

const sanitizeEmail = (value) => {
  const sanitized = sanitizeString(value, 254);
  if (!sanitized) return undefined;
  const lower = sanitized.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) return undefined;
  return lower;
};

const sanitizeUrl = (value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    return url.toString().slice(0, 512);
  } catch {
    return undefined;
  }
};

const parseBooleanFlag = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return undefined;
};

const parseDateValue = (value) => {
  if (typeof value === "number") {
    const ms = String(Math.trunc(value)).length <= 12 ? value * 1000 : value;
    const dateFromNumber = new Date(ms);
    if (!Number.isNaN(dateFromNumber.getTime())) {
      return dateFromNumber.toISOString();
    }
    return undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const ms = trimmed.length <= 12 ? numeric * 1000 : numeric;
      const dateFromNumber = new Date(ms);
      if (!Number.isNaN(dateFromNumber.getTime())) {
        return dateFromNumber.toISOString();
      }
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return sanitizeString(trimmed, 120);
  }
  return undefined;
};

const parseContext = (value) => {
  if (!value || typeof value !== "object") return {};
  const context = {};

  const firstName = sanitizeString(value.firstName, 80);
  const lastName = sanitizeString(value.lastName, 80);
  const userEmail = sanitizeEmail(value.userEmail);
  const linkUrl = sanitizeUrl(value.linkUrl);
  const userSubscriptionPlan = sanitizeString(value.userSubscriptionPlan, 80);
  const userAdminStatus = parseBooleanFlag(value.userAdminStatus);
  const date = parseDateValue(value.date);

  if (firstName) context.firstName = firstName;
  if (lastName) context.lastName = lastName;
  if (userEmail) context.userEmail = userEmail;
  if (linkUrl) context.linkUrl = linkUrl;
  if (userSubscriptionPlan) {
    context.userSubscriptionPlan = userSubscriptionPlan;
  }
  if (userAdminStatus !== undefined) {
    context.userAdminStatus = userAdminStatus;
  }
  if (date) context.date = date;

  return context;
};

const sendJson = (res, statusCode, payload) => {
  res.status(statusCode).json(payload);
};

const withErrorHandling = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    const status = error?.status ?? 500;
    const message =
      error?.message ?? "Unexpected error while processing the cascade.";
    // eslint-disable-next-line no-console
    console.error("[cascade-server] error", { message, status, stack: error?.stack });
    if (!res.headersSent) {
      sendJson(res, status, { error: message });
    } else {
      res.end();
    }
  }
};

const setupKeepAlive = (res) => {
  const interval = setInterval(() => {
    res.write("event: ping\ndata: {}\n\n");
  }, 15000);
  res.on("close", () => clearInterval(interval));
  res.on("finish", () => clearInterval(interval));
};

const startStreamingCascade = async ({ req, res, body }) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  setupKeepAlive(res);

  const history = parseHistory(body.history);
  const configOverrides = body.config ?? undefined;
  const context = parseContext(body.context);

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const result = await runCascade({
    question: body.question,
    history,
    config: configOverrides,
    context,
    onRouterDecision: ({ quickReply, decision }) => {
      sendEvent("interim", { quickReply, decision });
    },
  });

  sendEvent("final", result);
  res.end();
};

const runCascadeOnce = async ({ res, body }) => {
  const history = parseHistory(body.history);
  const configOverrides = body.config ?? undefined;
  const context = parseContext(body.context);

  let interimPayload = null;
  const result = await runCascade({
    question: body.question,
    history,
    config: configOverrides,
    context,
    onRouterDecision: (payload) => {
      interimPayload = {
        quickReply: payload.quickReply,
        decision: payload.decision,
      };
    },
  });

  sendJson(res, 200, { interim: interimPayload, result });
};

const cascadeHandler = withErrorHandling(async (req, res) => {
  const { question, stream = false } = req.body ?? {};

  if (typeof question !== "string" || question.trim().length === 0) {
    sendJson(res, 400, { error: "Missing 'question' in request body." });
    return;
  }

  const shouldStream =
    stream === true ||
    stream === "true" ||
    req.headers.accept === "text/event-stream";

  if (shouldStream) {
    await startStreamingCascade({ req, res, body: req.body });
    return;
  }

  await runCascadeOnce({ res, body: req.body });
});

app.post("/cascade", cascadeHandler);
app.post("/api/cascade", cascadeHandler);
app.post(
  "/api/chatkit",
  withErrorHandling(async (req, res) => {
    await handleChatKitRequest(req, res);
  })
);

if (uiBundleExists) {
  const serveIndex = (_req, res) => {
    res.sendFile(indexHtmlPath);
  };

  app.get("/", serveIndex);
  app.get("/chat", serveIndex);
  app.get("/chat/*", serveIndex);
} else {
  app.get("/", (_req, res) => {
    res.json({
      status: "ok",
      message:
        "FYI cascade server is running. Use POST /cascade or GET /health.",
    });
  });
}

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[cascade-server] listening on http://localhost:${PORT}`);

  if (uiBundleExists) {
    // eslint-disable-next-line no-console
    console.log(`[cascade-server] serving UI from ${distPath}`);
  }
});

process.on("SIGTERM", () => {
  server.close(() => {
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  server.close(() => {
    process.exit(0);
  });
});

