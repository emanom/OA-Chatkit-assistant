import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import { runCascade } from "../src/cascade.js";
import { handleChatKitRequest, chatKitStore } from "./chatkit.js";
import {
  attachmentsBucket,
  attachmentsMaxBytes,
  buildAttachmentKey,
  describeImageAttachment,
  signDownloadUrl,
  signUploadUrl,
  getPresignedUrlForKey,
  getPresignedUrlCache,
  generatePresignedUrlOnDemand,
} from "./attachments.js";

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

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: attachmentsMaxBytes,
  },
});
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
    const uploadData = await signUploadUrl(key, contentType);
    const assetUrl = await signDownloadUrl(key);

    // Handle both old format (string URL) and new format ({ url, fields })
    const uploadUrl = typeof uploadData === "string" ? uploadData : uploadData.url;
    const uploadFields = typeof uploadData === "object" && uploadData.fields ? uploadData.fields : null;

    sendJson(res, 200, {
      uploadUrl,
      ...(uploadFields ? { uploadFields } : {}),
      assetUrl,
      key,
      bucket: attachmentsBucket,
      maxBytes: attachmentsMaxBytes,
    });
  })
);

app.post(
  "/api/attachments/upload/:key",
  upload.single("file"),
  withErrorHandling(async (req, res) => {
    try {
      const { key } = req.params;
      console.log("[upload-proxy] Received upload request", { key, hasFile: !!req.file });
      
      if (!key || typeof key !== "string" || key.trim().length === 0) {
        sendJson(res, 400, { error: "key is required" });
        return;
      }

      const decodedKey = decodeURIComponent(key);
      console.log("[upload-proxy] Decoded key", { decodedKey });
      
      // Get the file from multer first (needed for contentType)
      const file = req.file;
      if (!file || !file.buffer) {
        console.error("[upload-proxy] No file data", { 
          hasFile: !!file, 
          hasBuffer: file?.buffer ? true : false,
          fileSize: file?.size 
        });
        sendJson(res, 400, { error: "No file data received" });
        return;
      }

      // Get the content type from the cached data or use the file's mimetype
      const presignedUrlCache = getPresignedUrlCache();
      const cached = presignedUrlCache?.get(decodedKey);
      const contentType = cached?.contentType || file.mimetype || "application/octet-stream";
      
      // Try to get presigned URL from cache, or generate on-demand
      let presignedUrl = getPresignedUrlForKey(decodedKey);
      console.log("[upload-proxy] Presigned URL lookup", { found: !!presignedUrl });
      
      if (!presignedUrl) {
        // Generate presigned URL on-demand if not in cache
        console.log("[upload-proxy] Generating presigned URL on-demand", { decodedKey, contentType });
        try {
          presignedUrl = await generatePresignedUrlOnDemand(decodedKey, contentType);
          console.log("[upload-proxy] Generated presigned URL", { found: !!presignedUrl });
        } catch (error) {
          console.error("[upload-proxy] Failed to generate presigned URL", { 
            error: error.message,
            decodedKey,
            contentType 
          });
          sendJson(res, 500, { error: "Failed to generate upload URL", message: error.message });
          return;
        }
      }
      
      console.log("[upload-proxy] Uploading to S3", { 
        key: decodedKey, 
        contentType, 
        fileSize: file.buffer.length 
      });

      // Upload to S3 using the presigned PUT URL
      const uploadResponse = await fetch(presignedUrl, {
        method: "PUT",
        body: file.buffer,
        headers: {
          "Content-Type": contentType,
        },
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("[upload-proxy] S3 upload failed", {
          status: uploadResponse.status,
          statusText: uploadResponse.statusText,
          error: errorText,
          key: decodedKey,
        });
        sendJson(res, uploadResponse.status, { 
          error: "Failed to upload to S3",
          details: errorText,
        });
        return;
      }

      // Clean up the cached presigned URL after successful upload
      const presignedUrlCacheForCleanup = getPresignedUrlCache();
      if (presignedUrlCacheForCleanup) {
        presignedUrlCacheForCleanup.delete(decodedKey);
      }

      console.log("[upload-proxy] Upload successful", { key: decodedKey });
      res.status(200).json({ success: true, key: decodedKey });
    } catch (error) {
      console.error("[upload-proxy] Unexpected error", { 
        error: error.message, 
        stack: error.stack,
        key: req.params?.key 
      });
      sendJson(res, 500, { error: "Failed to upload file", message: error.message });
    }
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

function withErrorHandling(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      const status = error?.status ?? 500;
      const message =
        error?.message ?? "Unexpected error while processing the cascade.";
      // eslint-disable-next-line no-console
      console.error("[cascade-server] error", {
        message,
        status,
        stack: error?.stack,
      });
      if (!res.headersSent) {
        sendJson(res, status, { error: message });
      } else {
        res.end();
      }
    }
  };
}

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

// Custom endpoint to fetch message buttons for a thread
app.get(
  "/api/chatkit/threads/:threadId/buttons",
  withErrorHandling(async (req, res) => {
    const { threadId } = req.params;
    if (!threadId) {
      return res.status(400).json({ error: "Thread ID is required" });
    }

    try {
      const context = {
        domainKey: req.get("x-openai-chatkit-domain-key") ?? req.get("x-chatkit-domain-key") ?? null,
      };
      
      // Load thread items (descending order to get most recent first)
      const page = await chatKitStore.loadThreadItems(threadId, null, 100, "desc", context);
      const items = page.data || [];
      
      console.log(`[server] Loaded ${items.length} items from thread ${threadId}`);
      
      // Extract buttons from assistant messages
      const buttonsByMessage = {};
      items.forEach((item) => {
        if (item.type === "assistant_message") {
          if (item.metadata?.buttons) {
            const buttons = Array.isArray(item.metadata.buttons) ? item.metadata.buttons : [];
            if (buttons.length > 0 && item.id) {
              buttonsByMessage[item.id] = buttons;
              console.log(`[server] Found ${buttons.length} buttons for message ${item.id}:`, buttons);
            }
          } else {
            // Log all assistant messages to see what metadata they have
            if (process.env.DEBUG) {
              console.log(`[server] Message ${item.id} metadata:`, JSON.stringify(item.metadata || {}));
            }
          }
        }
      });

      console.log(`[server] Returning buttons for ${Object.keys(buttonsByMessage).length} messages`);
      res.json({ buttons: buttonsByMessage });
    } catch (error) {
      console.error("[server] Error fetching message buttons", error);
      res.status(500).json({ error: "Failed to fetch message buttons" });
    }
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

