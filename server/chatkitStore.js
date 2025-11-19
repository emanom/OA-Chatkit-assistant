import { NotFoundError, Store } from "chatkit-node-backend-sdk";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const clone = (value) => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const compareByCreatedAt = (a, b) => {
  const aDate = new Date(a.created_at).getTime();
  const bDate = new Date(b.created_at).getTime();
  return aDate - bDate;
};

export class InMemoryChatKitStore extends Store {
  constructor() {
    super();
    this.threads = new Map();
    this.items = new Map();
    this.attachments = new Map();
  }

  async loadThread(threadId) {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new NotFoundError(`Thread ${threadId} not found.`);
    }
    return clone(thread);
  }

  async saveThread(thread) {
    this.threads.set(thread.id, clone(thread));
  }

  async deleteThread(threadId) {
    this.threads.delete(threadId);
    this.items.delete(threadId);
  }

  async loadThreads(limit, after, order) {
    const sorted = Array.from(this.threads.values())
      .map((thread) => clone(thread))
      .sort(compareByCreatedAt);

    if (order === "desc") {
      sorted.reverse();
    }

    let startIndex = 0;
    if (after) {
      const afterIndex = sorted.findIndex((thread) => thread.id === after);
      if (afterIndex >= 0) {
        startIndex = afterIndex + 1;
      }
    }

    const slice = sorted.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + slice.length < sorted.length;
    const nextAfter =
      hasMore && slice.length > 0 ? slice[slice.length - 1].id : null;

    return {
      data: slice,
      has_more: hasMore,
      after: nextAfter,
    };
  }

  async loadThreadItems(threadId, after, limit, order) {
    const existing = this.items.get(threadId) ?? [];
    const sorted = existing
      .map((item) => clone(item))
      .sort(compareByCreatedAt);

    if (order === "desc") {
      sorted.reverse();
    }

    let startIndex = 0;
    if (after) {
      const afterIndex = sorted.findIndex((item) => item.id === after);
      if (afterIndex >= 0) {
        startIndex = afterIndex + 1;
      }
    }

    const slice = sorted.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + slice.length < sorted.length;
    const nextAfter =
      hasMore && slice.length > 0 ? slice[slice.length - 1].id : null;

    return {
      data: slice,
      has_more: hasMore,
      after: nextAfter,
    };
  }

  async addThreadItem(threadId, item) {
    const items = this.items.get(threadId) ?? [];
    items.push(sanitizeThreadItem(item));
    items.sort(compareByCreatedAt);
    this.items.set(threadId, items);
  }

  async saveItem(threadId, item) {
    const items = this.items.get(threadId);
    if (!items) {
      throw new NotFoundError(`Thread ${threadId} not found.`);
    }
    const index = items.findIndex((existing) => existing.id === item.id);
    if (index === -1) {
      throw new NotFoundError(
        `Item ${item.id} not found in thread ${threadId}.`
      );
    }
    items[index] = sanitizeThreadItem(item);
  }

  async loadItem(threadId, itemId) {
    const items = this.items.get(threadId);
    if (!items) {
      throw new NotFoundError(`Thread ${threadId} not found.`);
    }
    const item = items.find((existing) => existing.id === itemId);
    if (!item) {
      throw new NotFoundError(
        `Item ${itemId} not found in thread ${threadId}.`
      );
    }
    return clone(item);
  }

  async deleteThreadItem(threadId, itemId) {
    const items = this.items.get(threadId);
    if (!items) {
      return;
    }
    const filtered = items.filter((existing) => existing.id !== itemId);
    this.items.set(threadId, filtered);
  }

  async saveAttachment(attachment) {
    this.attachments.set(attachment.id, clone(attachment));
  }

  async loadAttachment(attachmentId) {
    const attachment = this.attachments.get(attachmentId);
    if (!attachment) {
      throw new NotFoundError(`Attachment ${attachmentId} not found.`);
    }
    return clone(attachment);
  }

  async deleteAttachment(attachmentId) {
    this.attachments.delete(attachmentId);
  }
}

const DEFAULT_DOMAIN_KEY =
  process.env.CHATKIT_DEFAULT_DOMAIN_KEY ?? "default";
const DEFAULT_TABLE_NAME =
  process.env.CHATKIT_STORE_TABLE ??
  process.env.CHATKIT_DYNAMO_TABLE ??
  process.env.CHATKIT_STORE_DDB_TABLE ??
  null;
const DEFAULT_THREADS_INDEX =
  process.env.CHATKIT_STORE_THREADS_INDEX ?? "gsi1";
const DEFAULT_REGION =
  process.env.CHATKIT_STORE_REGION ??
  process.env.AWS_REGION ??
  process.env.AWS_DEFAULT_REGION ??
  "ap-southeast-2";

const THREAD_METADATA_SK = "METADATA";
const ITEM_SK_PREFIX = "ITEM#";
const ATTACHMENT_PK_PREFIX = "ATTACHMENT#";
const BATCH_WRITE_LIMIT = 25;
const DEFAULT_ASSISTANT_TEXT = "Response generated successfully.";

const sanitizeJson = (value) => {
  if (value == null) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const sanitizeAnnotations = (annotations) =>
  Array.isArray(annotations)
    ? annotations
        .filter(
          (annotation) =>
            annotation &&
            typeof annotation === "object" &&
            typeof annotation.type === "string"
        )
        .map((annotation) => ({ ...annotation }))
    : [];

const ensureContentArray = (item) => {
  if (!item || typeof item !== "object") {
    return item;
  }

  const validContent = Array.isArray(item.content)
    ? item.content
        .filter(
          (part) =>
            part && typeof part === "object" && typeof part.type === "string"
        )
        .map((part) => ({
          ...part,
          annotations: sanitizeAnnotations(part.annotations),
        }))
    : [];

  if (validContent.length === 0) {
    const fallbackType =
      item.type === "user_message" ? "input_text" : "output_text";
    const fallbackText =
      typeof item.text === "string" && item.text.trim().length > 0
        ? item.text
        : fallbackType === "input_text"
        ? ""
        : DEFAULT_ASSISTANT_TEXT;
    validContent.push({
      type: fallbackType,
      text: fallbackText,
      annotations: [],
    });
  }

  item.content = validContent;
  return item;
};

const sanitizeThreadItem = (item) => {
  const normalized =
    item && typeof item === "object" ? clone(item) : { content: [] };
  return ensureContentArray(normalized);
};

class DynamoDbChatKitStore extends Store {
  constructor(options = {}) {
    super();
    this.tableName = options.tableName ?? DEFAULT_TABLE_NAME;
    if (!this.tableName) {
      throw new Error(
        "CHATKIT_STORE_TABLE (or CHATKIT_DYNAMO_TABLE) must be set to enable DynamoDB persistence."
      );
    }

    this.threadsIndexName =
      options.threadsIndexName ?? DEFAULT_THREADS_INDEX;
    this.defaultDomainKey =
      options.defaultDomainKey ?? DEFAULT_DOMAIN_KEY;
    const region = options.region ?? DEFAULT_REGION;

    const lowLevel = new DynamoDBClient({ region });
    this.docClient = DynamoDBDocumentClient.from(lowLevel, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
      },
    });
  }

  resolveDomain(context) {
    if (
      context &&
      typeof context.domainKey === "string" &&
      context.domainKey.trim().length > 0
    ) {
      return context.domainKey.trim();
    }
    return this.defaultDomainKey;
  }

  threadPk(domainKey, threadId) {
    return `THREAD#${domainKey}#${threadId}`;
  }

  threadIndexPk(domainKey) {
    return `THREADS#${domainKey}`;
  }

  threadIndexSk(createdAt, threadId) {
    return `${createdAt}#${threadId}`;
  }

  itemSk(itemId) {
    return `${ITEM_SK_PREFIX}${itemId}`;
  }

  attachmentPk(attachmentId) {
    return `${ATTACHMENT_PK_PREFIX}${attachmentId}`;
  }

  async loadThread(threadId, context) {
    const record = await this.getThreadRecord(threadId, context);
    if (!record?.thread) {
      throw new NotFoundError(`Thread ${threadId} not found.`);
    }
    return clone(record.thread);
  }

  async saveThread(thread, context) {
    const domainKey = this.resolveDomain(context);
    const now = new Date().toISOString();
    const normalizedThread = clone(thread);
    if (!normalizedThread.created_at) {
      normalizedThread.created_at = now;
    }
    if (!normalizedThread.metadata || typeof normalizedThread.metadata !== "object") {
      normalizedThread.metadata = {};
    }

    const record = {
      pk: this.threadPk(domainKey, thread.id),
      sk: THREAD_METADATA_SK,
      type: "thread",
      domainKey,
      thread_id: thread.id,
      created_at: normalizedThread.created_at,
      updated_at: now,
      gsi1pk: this.threadIndexPk(domainKey),
      gsi1sk: this.threadIndexSk(normalizedThread.created_at, thread.id),
      thread: normalizedThread,
    };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: record,
      })
    );
  }

  async deleteThread(threadId, context) {
    const domainKey = this.resolveDomain(context);
    const pk = this.threadPk(domainKey, threadId);
    await this.deletePartition(pk);
  }

  async loadThreads(limit, after, order, context) {
    if (!Number.isFinite(limit) || limit <= 0) {
      return { data: [], has_more: false, after: null };
    }

    const domainKey = this.resolveDomain(context);
    const params = {
      TableName: this.tableName,
      IndexName: this.threadsIndexName,
      KeyConditionExpression: "gsi1pk = :pk",
      ExpressionAttributeValues: {
        ":pk": this.threadIndexPk(domainKey),
      },
      Limit: limit,
      ScanIndexForward: order !== "desc",
    };

    if (after) {
      try {
        const afterRecord = await this.getThreadRecord(after, context);
        if (afterRecord?.thread) {
          params.ExclusiveStartKey = {
            pk: this.threadPk(domainKey, after),
            sk: THREAD_METADATA_SK,
            gsi1pk: this.threadIndexPk(domainKey),
            gsi1sk: this.threadIndexSk(
              afterRecord.thread.created_at ?? afterRecord.created_at,
              after
            ),
          };
        }
      } catch {
        // Ignore pagination cursor errors; treat as no after.
      }
    }

    const response = await this.docClient.send(
      new QueryCommand(params)
    );
    const threads =
      response.Items?.map((item) =>
        item.thread ? clone(item.thread) : null
      ).filter(Boolean) ?? [];

    const hasMore = Boolean(response.LastEvaluatedKey);
    const nextAfter =
      hasMore && threads.length > 0 ? threads[threads.length - 1].id : null;

    return {
      data: threads,
      has_more: hasMore,
      after: nextAfter,
    };
  }

  async loadThreadItems(threadId, after, limit, order, context) {
    const domainKey = this.resolveDomain(context);
    const rawItems = await this.fetchThreadItems(domainKey, threadId);
    const items = rawItems
      .map((record) => (record.item ? sanitizeThreadItem(record.item) : null))
      .filter(Boolean)
      .sort(compareByCreatedAt);

    if (order === "desc") {
      items.reverse();
    }

    let startIndex = 0;
    if (after) {
      const afterIndex = items.findIndex((item) => item.id === after);
      if (afterIndex >= 0) {
        startIndex = afterIndex + 1;
      }
    }

    const slice = items.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + slice.length < items.length;
    const nextAfter =
      hasMore && slice.length > 0 ? slice[slice.length - 1].id : null;

    return {
      data: slice,
      has_more: hasMore,
      after: nextAfter,
    };
  }

  async addThreadItem(threadId, item, context) {
    const domainKey = this.resolveDomain(context);
    const pk = this.threadPk(domainKey, threadId);
    const normalized = sanitizeThreadItem(item);
    if (!normalized.created_at) {
      normalized.created_at = new Date().toISOString();
    }

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk,
          sk: this.itemSk(item.id),
          type: "thread_item",
          domainKey,
          thread_id: threadId,
          item_id: item.id,
          created_at: normalized.created_at,
          item: normalized,
        },
        ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      })
    );
  }

  async saveItem(threadId, item, context) {
    const domainKey = this.resolveDomain(context);
    const pk = this.threadPk(domainKey, threadId);
    const sk = this.itemSk(item.id);
    const existing = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk, sk },
      })
    );
    if (!existing.Item) {
      throw new NotFoundError(
        `Item ${item.id} not found in thread ${threadId}.`
      );
    }

    const createdAt =
      item.created_at ?? existing.Item.created_at ?? new Date().toISOString();
    const normalized = sanitizeThreadItem({
      ...item,
      created_at: createdAt,
    });

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          ...existing.Item,
          created_at: createdAt,
          item: normalized,
        },
      })
    );
  }

  async loadItem(threadId, itemId, context) {
    const domainKey = this.resolveDomain(context);
    const pk = this.threadPk(domainKey, threadId);
    const sk = this.itemSk(itemId);
    const response = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk, sk },
      })
    );
    if (!response.Item?.item) {
      throw new NotFoundError(
        `Item ${itemId} not found in thread ${threadId}.`
      );
    }
    return clone(response.Item.item);
  }

  async deleteThreadItem(threadId, itemId, context) {
    const domainKey = this.resolveDomain(context);
    const pk = this.threadPk(domainKey, threadId);
    const sk = this.itemSk(itemId);
    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { pk, sk },
      })
    );
  }

  async saveAttachment(attachment) {
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: this.attachmentPk(attachment.id),
          sk: THREAD_METADATA_SK,
          type: "attachment",
          attachment: sanitizeJson(attachment),
        },
      })
    );
  }

  async loadAttachment(attachmentId) {
    const response = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          pk: this.attachmentPk(attachmentId),
          sk: THREAD_METADATA_SK,
        },
        ConsistentRead: true,
      })
    );
    if (!response.Item?.attachment) {
      throw new NotFoundError(`Attachment ${attachmentId} not found.`);
    }
    return clone(response.Item.attachment);
  }

  async deleteAttachment(attachmentId) {
    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          pk: this.attachmentPk(attachmentId),
          sk: THREAD_METADATA_SK,
        },
      })
    );
  }

  async getThreadRecord(threadId, context) {
    const domainKey = this.resolveDomain(context);
    const response = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          pk: this.threadPk(domainKey, threadId),
          sk: THREAD_METADATA_SK,
        },
        ConsistentRead: true,
      })
    );
    return response.Item ?? null;
  }

  async fetchThreadItems(domainKey, threadId) {
    const pk = this.threadPk(domainKey, threadId);
    const items = [];
    let cursor;
    do {
      const response = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
          ExpressionAttributeValues: {
            ":pk": pk,
            ":prefix": ITEM_SK_PREFIX,
          },
          ExclusiveStartKey: cursor,
          ConsistentRead: true,
        })
      );
      if (response.Items?.length) {
        items.push(...response.Items);
      }
      cursor = response.LastEvaluatedKey;
    } while (cursor);
    return items;
  }

  async deletePartition(pk) {
    let cursor;
    do {
      const response = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: {
            ":pk": pk,
          },
          ExclusiveStartKey: cursor,
          ConsistentRead: true,
        })
      );
      const keys =
        response.Items?.map((item) => ({
          pk: item.pk,
          sk: item.sk,
        })) ?? [];
      if (keys.length) {
        await this.batchDelete(keys);
      }
      cursor = response.LastEvaluatedKey;
    } while (cursor);
  }

  async batchDelete(keys) {
    for (let i = 0; i < keys.length; i += BATCH_WRITE_LIMIT) {
      const chunk = keys.slice(i, i + BATCH_WRITE_LIMIT);
      await this.docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: chunk.map((key) => ({
              DeleteRequest: { Key: key },
            })),
          },
        })
      );
    }
  }
}

const createChatKitStore = () => {
  if (DEFAULT_TABLE_NAME) {
    console.log(
      `[chatkit] Using DynamoDbChatKitStore (table: ${DEFAULT_TABLE_NAME})`
    );
    return new DynamoDbChatKitStore();
  }

  console.warn(
    "[chatkit] CHATKIT_STORE_TABLE not set. Falling back to in-memory store; threads will be lost on restart."
  );
  return new InMemoryChatKitStore();
};

export { DynamoDbChatKitStore, createChatKitStore };

