import DOMPurify from "dompurify";
import { useMemo } from "react";
import type { Role } from "../lib/api";

const roleClassName: Record<Role, string> = {
  user: "bg-white text-slate-900 border border-slate-200 self-end shadow-sm",
  assistant:
    "bg-slate-50 text-slate-900 border border-slate-200 self-start shadow-sm",
};

const roleLabel: Record<Role, string> = {
  user: "You",
  assistant: "FYI Support",
};

export interface ChatMessageProps {
  role: Role;
  content: string;
  isInterim?: boolean;
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

const convertMarkdownLinks = (text: string) => {
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markdownLinkRegex.exec(text)) !== null) {
    const [fullMatch, label, url] = match;
    result += escapeHtml(text.slice(lastIndex, match.index));
    const safeLabel = escapeHtml(label);
    const safeUrl = escapeHtml(url);
    result += `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
    lastIndex = match.index + fullMatch.length;
  }

  result += escapeHtml(text.slice(lastIndex));
  return result;
};

const ensureHtml = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) {
    return "<p></p>";
  }

  const containsHtml = /<\/?[a-z][\s\S]*>/i.test(trimmed);
  if (containsHtml) {
    return trimmed;
  }

  const withLinks = convertMarkdownLinks(trimmed);
  const paragraphs = withLinks
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br />")}</p>`)
    .join("");

  return paragraphs || `<p>${withLinks}</p>`;
};

const removeEmptyElements = (html: string) => {
  if (typeof window === "undefined" || typeof window.DOMParser !== "function") {
    return html
      .replace(/<p>\s*<\/p>/gi, "")
      .replace(/<li>\s*<\/li>/gi, "")
      .replace(/(<br\s*\/?>\s*){2,}/gi, "<br />");
  }

  const parser = new window.DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  doc.body.querySelectorAll<HTMLElement>("*").forEach((node) => {
    node.removeAttribute("style");
  });

  const removeEmpty = (selector: string) => {
    doc.body.querySelectorAll(selector).forEach((node) => {
      const text = node.textContent?.trim() ?? "";
      if (!text && node.querySelectorAll("img,iframe,video").length === 0) {
        node.remove();
      }
    });
  };

  removeEmpty("p, li, ul, ol");

  doc.body
    .querySelectorAll("br + br")
    .forEach((br) => br.parentElement?.removeChild(br));

  return doc.body.innerHTML;
};

const ALLOWED_TAGS = [
  "a",
  "br",
  "p",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "code",
  "pre",
  "blockquote",
  "span",
  "h3",
  "h4",
];

const ALLOWED_ATTR = ["href", "target", "rel"];

const formatContent = (text: string) => {
  const html = ensureHtml(text);
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ["target", "rel"],
  });
  return removeEmptyElements(sanitized);
};

export function ChatMessage({ role, content, isInterim = false }: ChatMessageProps) {
  const formatted = useMemo(() => formatContent(content), [content]);

  return (
    <div
      className={`rounded-xl px-4 py-3 max-w-2xl shadow-sm ${roleClassName[role]}`}
    >
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1 flex items-center gap-2">
        <span>{roleLabel[role]}</span>
      </div>
      <div
        className="cascade-content text-sm break-words [&_a]:text-emerald-600 [&_a]:underline [&_a]:font-medium hover:[&_a]:text-emerald-500"
        dangerouslySetInnerHTML={{ __html: formatted }}
      />
    </div>
  );
}

