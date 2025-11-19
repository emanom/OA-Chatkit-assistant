import { FyiChatKitServer } from "./chatkitServer.js";
import { createChatKitStore } from "./chatkitStore.js";
import { S3AttachmentStore } from "./s3AttachmentStore.js";

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

const chatKitStore = createChatKitStore();
const attachmentStore = new S3AttachmentStore();
const chatKitServer = new FyiChatKitServer(chatKitStore, attachmentStore, logger);

export { chatKitStore };

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
      
      // Track if response has ended to prevent writing after close
      let responseEnded = false;
      const checkResponseState = () => {
        if (responseEnded) return false;
        if (res.destroyed || res.closed) {
          responseEnded = true;
          return false;
        }
        return true;
      };
      
      // Handle client disconnect
      req.on("close", () => {
        responseEnded = true;
        clearInterval(keepAlive);
      });
      
      try {
        for await (const chunk of result) {
          if (!checkResponseState()) {
            logger.debug("Client disconnected, stopping stream");
            break;
          }
          
          try {
            res.write(chunk);
          } catch (writeError) {
            // If write fails, client likely disconnected
            if (writeError.code === "ECONNRESET" || writeError.code === "EPIPE") {
              logger.debug("Client disconnected during write", { code: writeError.code });
              responseEnded = true;
              break;
            }
            throw writeError;
          }
        }
      } catch (streamError) {
        logger.error("Error streaming ChatKit response", { 
          error: streamError.message,
          stack: streamError.stack,
          code: streamError.code,
        });
        
        // Only try to send error if connection is still open
        if (checkResponseState() && !res.headersSent) {
          try {
            res.write(`event: error\ndata: ${JSON.stringify({ message: "Stream error occurred" })}\n\n`);
          } catch (writeError) {
            logger.debug("Failed to write error event", { error: writeError.message });
          }
        }
      } finally {
        clearInterval(keepAlive);
        if (!responseEnded && !res.destroyed && !res.closed) {
          try {
            res.end();
          } catch (endError) {
            logger.debug("Error ending response", { error: endError.message });
          }
        }
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
      // Handle NotFoundError more gracefully - this can happen with in-memory stores
      // when requests are routed to different container instances
      if (error.name === "NotFoundError" && error.message.includes("Thread")) {
        res.status(404).json({ 
          error: "Thread not found",
          message: "The thread may have been lost due to server restart or load balancing. Please start a new conversation.",
          code: "THREAD_NOT_FOUND",
        });
      } else {
        res.status(500).json({ 
          error: "Internal server error",
          message: error.message,
        });
      }
    }
  }
}

