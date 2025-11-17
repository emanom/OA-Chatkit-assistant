import crypto from "crypto";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { openai } from "../src/config.js";

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
const s3Region =
  process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "ap-southeast-2";

const s3 = new S3Client({ region: s3Region });

// Temporary storage for presigned URLs (keyed by S3 key)
// These are cleaned up after use or expiration
const presignedUrlCache = new Map();

const buildSafeFilename = (name) => {
  if (typeof name !== "string" || name.trim().length === 0) {
    return `file-${crypto.randomUUID()}`;
  }
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
};

const buildAttachmentKey = (threadId, filename) => {
  const target =
    typeof threadId === "string" && threadId.trim().length > 0
      ? threadId.trim()
      : `session-${crypto.randomUUID()}`;
  const folder = `${attachmentsPrefix}${target}`;
  return `${folder}/${Date.now()}-${buildSafeFilename(filename)}`;
};

const signUploadUrl = async (
  key,
  contentType,
  bucket = attachmentsBucket
) => {
  // Use PUT presigned URLs - we'll proxy through our server since ChatKit SDK
  // POSTs directly to S3 without the required POST fields
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(contentType ? { ContentType: contentType } : {}),
  });
  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: uploadUrlTtlSeconds });
  
  // Store the presigned URL temporarily for the proxy endpoint
  presignedUrlCache.set(key, { presignedUrl, contentType, expiresAt: Date.now() + uploadUrlTtlSeconds * 1000 });
  
  // Clean up expired entries periodically
  setTimeout(() => {
    const now = Date.now();
    for (const [k, v] of presignedUrlCache.entries()) {
      if (v.expiresAt < now) {
        presignedUrlCache.delete(k);
      }
    }
  }, uploadUrlTtlSeconds * 1000);
  
  // Return metadata for the proxy endpoint
  return { key, bucket, contentType };
};

const getPresignedUrlForKey = (key) => {
  const cached = presignedUrlCache.get(key);
  if (!cached || cached.expiresAt < Date.now()) {
    presignedUrlCache.delete(key);
    return null;
  }
  return cached.presignedUrl;
};

const getPresignedUrlCache = () => presignedUrlCache;

const generatePresignedUrlOnDemand = async (key, contentType, bucket = attachmentsBucket) => {
  // Generate a presigned URL on-demand (useful when cache is empty)
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(contentType ? { ContentType: contentType } : {}),
  });
  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: uploadUrlTtlSeconds });
  
  // Store it in cache for potential reuse
  presignedUrlCache.set(key, { 
    presignedUrl, 
    contentType, 
    expiresAt: Date.now() + uploadUrlTtlSeconds * 1000 
  });
  
  return presignedUrl;
};

const signDownloadUrl = async (
  key,
  expiresIn = downloadUrlTtlSeconds,
  bucket = attachmentsBucket
) => {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn });
};

const deleteAttachmentObject = async (
  key,
  bucket = attachmentsBucket
) => {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  await s3.send(command);
};

const extractOutputText = (response) => {
  if (!response) return "";
  if (
    typeof response.output_text === "string" &&
    response.output_text.length > 0
  ) {
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

export {
  attachmentsBucket,
  attachmentsPrefix,
  attachmentsMaxBytes,
  uploadUrlTtlSeconds,
  downloadUrlTtlSeconds,
  imageDescriptionModel,
  imageDescriptionMaxTokens,
  buildSafeFilename,
  buildAttachmentKey,
  signUploadUrl,
  signDownloadUrl,
  describeImageAttachment,
  deleteAttachmentObject,
  getPresignedUrlForKey,
  getPresignedUrlCache,
  generatePresignedUrlOnDemand,
};

