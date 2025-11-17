import { NotFoundError, Store } from "chatkit-node-backend-sdk";

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
    items.push(clone(item));
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
    items[index] = clone(item);
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

