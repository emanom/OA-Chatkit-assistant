import { FyiChatKitServer } from "./chatkitServer.js";
import { InMemoryChatKitStore } from "./chatkitStore.js";

const logger = {
  error: (message, data) => {
    console.error(`[chatkit-server] ${message}`, data);
  },
  warn: (message, data) => {
    console.warn(`[chatkit-server] ${message}`, data);
  },
  info: (message, data) => {
    console.log(`[chatkit-server] ${message}`, data);
  },
  debug: (message, data) => {
    if (process.env.DEBUG) {
      console.log(`[chatkit-server] ${message}`, data);
    }
  },
};

const chatKitStore = new InMemoryChatKitStore();
const chatKitServer = new FyiChatKitServer(chatKitStore, logger);

const setupSSEKeepAlive = (res, intervalMs = 15000) => {
  const interval = setInterval(() => {
    res.write("event: ping\ndata: {}\n\n");
  }, intervalMs);
  const clear = () => clearInterval(interval);
  res.on("close", clear);
  res.on("finish", clear);
  return interval;
};

const buildRequestContext = (req) => ({
  domainKey:
    req.get("x-openai-chatkit-domain-key") ??
    req.get("x-chatkit-domain-key") ??
    null,
  userAgent: req.get("user-agent") ?? null,
  ip: req.ip ?? null,
});

export async function handleChatKitRequest(req, res) {
  try {
    const payload = req.body ?? {};
    const context = buildRequestContext(req);
    
    logger.debug("Processing ChatKit request", { 
      payloadKeys: Object.keys(payload),
      hasBody: !!req.body,
    });
    
    const result = await chatKitServer.process(JSON.stringify(payload), context);

    if (result.isStreaming) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const keepAlive = setupSSEKeepAlive(res);
      try {
        for await (const chunk of result) {
          res.write(chunk);
        }
      } catch (streamError) {
        logger.error("Error streaming ChatKit response", { error: streamError });
        if (!res.headersSent) {
          res.write(`event: error\ndata: ${JSON.stringify({ message: "Stream error occurred" })}\n\n`);
        }
      } finally {
        clearInterval(keepAlive);
        res.end();
      }
      return;
    }

    res.json(result.toJSON());
  } catch (error) {
    logger.error("Error handling ChatKit request", { 
      error: error.message, 
      stack: error.stack,
      body: req.body,
    });
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Internal server error",
        message: error.message,
      });
    }
  }
}

