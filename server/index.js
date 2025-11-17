import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { runCascade } from "../src/cascade.js";
import { openai } from "../src/config.js";
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
app.use(express.json({ limit: "2mb" }));
app.use(
  morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
    skip: () => process.env.MORGAN_DISABLED === "true",
  })
);

if (uiBundleExists) {
  app.use(express.static(distPath, { index: false }));
}

const attachmentsBucket = process.env.ATTACHMENTS_BUCKET ?? "pubsupchat-attach";
const attachmentsPrefix = process.env.ATTACHMENTS_PREFIX ?? "chat-uploads/";
const attachmentsMaxBytes = Number.parseInt(
  process.env.ATTACHMENTS_MAX_BYTES ?? String(50 * 1024 * 1024),
  10
);
const uploadUrlTtlSeconds = Number.parseInt(
  process.env.ATTACHMENTS_UPLOAD_URL_TTL ?? "300",
  10
);
const downloadUrlTtlSeconds = Number.parseInt(
  process.env.ATTACHMENTS_DOWNLOAD_URL_TTL ?? String(7 * 24 * 60 * 60),
  10
);
const imageDescriptionModel =
  process.env.IMAGE_DESCRIPTION_MODEL ?? "gpt-4o-mini";
const imageDescriptionMaxTokens = Number.parseInt(
  process.env.IMAGE_DESCRIPTION_MAX_OUTPUT_TOKENS ?? "400",
  10
);

const s3Region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "ap-southeast-2";
const s3 = new S3Client({ region: s3Region });

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.post(
  "/api/attachments/sign",
  withErrorHandling(async (req, res) => {
    const { filename, contentType, size, threadId } = req.body ?? {};

    if (typeof filename !== "string" || filename.trim().length === 0) {
      sendJson(res, 400, { error: "filename is required" });
      return;
    }
    if (typeof contentType !== "string" || contentType.trim().length === 0) {
      sendJson(res, 400, { error: "contentType is required" });
      return;
    }
    if (!Number.isFinite(size) || size <= 0) {
      sendJson(res, 400, { error: "size must be provided in bytes" });
      return;
    }
    if (size > attachmentsMaxBytes) {
      sendJson(res, 413, {
        error: `Attachments cannot exceed ${attachmentsMaxBytes} bytes`,
      });
      return;
    }

    const key = buildAttachmentKey(threadId, filename);
    const uploadUrl = await signUploadUrl(key, contentType);
    const assetUrl = await signDownloadUrl(key);

    sendJson(res, 200, {
      uploadUrl,
      assetUrl,
      key,
      bucket: attachmentsBucket,
      maxBytes: attachmentsMaxBytes,
    });
  })
);

app.post(
  "/api/attachments/describe",
  withErrorHandling(async (req, res) => {
    const { key, contentType } = req.body ?? {};
    if (typeof key !== "string" || key.trim().length === 0) {
      sendJson(res, 400, { error: "key is required" });
      return;
    }
    if (contentType && typeof contentType === "string" && !contentType.startsWith("image/")) {
      sendJson(res, 400, { error: "Only image attachments can be described automatically." });
      return;
    }

    const description = await describeImageAttachment(key);
    sendJson(res, 200, { description });
  })
);

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

const buildSafeFilename = (name) => {
  if (typeof name !== "string" || name.trim().length === 0) {
    return `file-${crypto.randomUUID()}`;
  }
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
};

const buildAttachmentKey = (threadId, filename) => {
  const folder = threadId
    ? `${attachmentsPrefix}${threadId}`
    : `${attachmentsPrefix}session-${crypto.randomUUID()}`;
  return `${folder}/${Date.now()}-${buildSafeFilename(filename)}`;
};

const signUploadUrl = async (key, contentType) => {
  const command = new PutObjectCommand({
    Bucket: attachmentsBucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: uploadUrlTtlSeconds });
};

const signDownloadUrl = async (key, expiresIn = downloadUrlTtlSeconds) => {
  const command = new GetObjectCommand({
    Bucket: attachmentsBucket,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn });
};

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

const describeImageAttachment = async (key) => {
  const signedUrl = await signDownloadUrl(key, 120);
  const response = await openai.responses.create({
    model: imageDescriptionModel,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Describe this image in detail so an FYI support agent understands its contents.",
          },
          {
            type: "input_image",
            image_url: signedUrl,
          },
        ],
      },
    ],
    text: {
      max_output_tokens: imageDescriptionMaxTokens,
    },
  });

  return extractOutputText(response).trim();
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

