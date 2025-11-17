import { AttachmentStore } from "chatkit-node-backend-sdk";
import {
  attachmentsBucket,
  attachmentsPrefix,
  attachmentsMaxBytes,
  downloadUrlTtlSeconds,
  buildAttachmentKey,
  buildSafeFilename,
  signUploadUrl,
  signDownloadUrl,
  deleteAttachmentObject,
} from "./attachments.js";

const buildSizeString = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${
    units[unitIndex]
  }`;
};

export class S3AttachmentStore extends AttachmentStore {
  constructor(options = {}) {
    super();
    this.bucket = options.bucket ?? attachmentsBucket;
    this.prefix = options.prefix ?? attachmentsPrefix;
    this.maxBytes = options.maxBytes ?? attachmentsMaxBytes;
    this.downloadTtl = options.downloadUrlTtl ?? downloadUrlTtlSeconds;
    this.attachmentKeys = new Map();
  }

  normalizeAttachmentParams(params) {
    if (!params || typeof params !== "object") {
      throw new Error("Attachment parameters are required.");
    }

    const normalized = { ...params };

    if (typeof normalized.name !== "string" || normalized.name.trim().length === 0) {
      throw new Error("Attachment name is required.");
    }
    normalized.name = normalized.name.trim();

    if (
      typeof normalized.mime_type !== "string" ||
      normalized.mime_type.trim().length === 0
    ) {
      throw new Error("Attachment MIME type is required.");
    }
    normalized.mime_type = normalized.mime_type.trim();

    const size = Number(normalized.size);
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error("Attachment size must be a positive number.");
    }
    if (size > this.maxBytes) {
      throw new Error(
        `Attachments cannot exceed ${this.maxBytes} bytes (${buildSizeString(
          this.maxBytes
        )}).`
      );
    }
    normalized.size = size;
    return normalized;
  }

  resolveFolderHint(params, attachmentId) {
    if (typeof params.thread_id === "string" && params.thread_id.trim()) {
      return params.thread_id.trim();
    }
    return attachmentId;
  }

  async createAttachment(params, context) {
    const normalized = this.normalizeAttachmentParams(params);

    const mimeType = normalized.mime_type;
    const attachmentId = super.generateAttachmentId(mimeType, context);
    const safeName = buildSafeFilename(normalized.name);
    const folderHint = this.resolveFolderHint(normalized, attachmentId);
    const key = buildAttachmentKey(folderHint, safeName);
    await signUploadUrl(key, mimeType, this.bucket);
    
    // Return our server's proxy URL instead of S3 URL
    // The proxy will handle the upload to S3
    const baseUrl = process.env.SERVER_BASE_URL || "https://fyi-cascade-alb-2139030396.ap-southeast-2.elb.amazonaws.com";
    const uploadUrl = `${baseUrl}/api/attachments/upload/${encodeURIComponent(key)}`;
    
    const assetUrl = await signDownloadUrl(
      key,
      this.downloadTtl,
      this.bucket
    );

    this.attachmentKeys.set(attachmentId, {
      key,
      bucket: this.bucket,
    });

    const isImage = mimeType.startsWith("image/");
    const now = new Date().toISOString();

    return {
      id: attachmentId,
      type: isImage ? "image" : "file",
      name: safeName,
      mime_type: mimeType,
      size: normalized.size,
      upload_url: uploadUrl,
      url: assetUrl,
      ...(isImage ? { preview_url: assetUrl } : {}),
      storage: {
        bucket: this.bucket,
        key,
        created_at: now,
      },
      created_at: now,
      expires_at: new Date(
        Date.now() + this.downloadTtl * 1000
      ).toISOString(),
    };
  }

  async deleteAttachment(attachmentId) {
    const record = this.attachmentKeys.get(attachmentId);
    if (!record) {
      return;
    }
    await deleteAttachmentObject(record.key, record.bucket ?? this.bucket);
    this.attachmentKeys.delete(attachmentId);
  }
}

