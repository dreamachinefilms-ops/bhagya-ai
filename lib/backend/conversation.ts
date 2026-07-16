import type { BhagyaConversationMessage } from "@/app/api/_lib/bhagyaPrompt";

function isMessageRecord(message: unknown): message is BhagyaConversationMessage & {
  isLoading?: boolean;
} {
  return Boolean(message && typeof message === "object");
}

function parseImageMessageContent(content: string) {
  if (!content.trim().startsWith("{")) {
    return { content };
  }

  try {
    const payload: unknown = JSON.parse(content);

    if (
      payload &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      "type" in payload &&
      payload.type === "bhagya.image" &&
      (("imageUrl" in payload && typeof payload.imageUrl === "string") ||
        ("storagePath" in payload && typeof payload.storagePath === "string"))
    ) {
      return {
        content:
          "text" in payload && typeof payload.text === "string"
            ? payload.text
            : "Palm photo uploaded for analysis.",
        imageUrl:
          "imageUrl" in payload && typeof payload.imageUrl === "string"
            ? payload.imageUrl
            : undefined,
      };
    }
  } catch {
    return { content };
  }

  return { content };
}

export function sanitizeMessages(
  messages: unknown[],
  options?: { service?: string; limit?: number },
) {
  const limit = options?.limit ?? 12;

  return messages
    .filter(isMessageRecord)
    .filter((message) => {
      const content = typeof message.content === "string" ? message.content : "";

      return (
        content.trim() &&
        !message.isLoading &&
        !/\bconsulting\b/i.test(content) &&
        (!options?.service || message.service === options.service)
      );
    })
    .slice(-limit)
    .map((message) => {
      const rawContent =
        typeof message.content === "string" ? message.content : "";
      const parsed = parseImageMessageContent(rawContent);

      return {
        role: message.role === "assistant" ? "assistant" : "user",
        content:
          typeof parsed.content === "string"
            ? parsed.content.slice(0, 3000)
            : "",
        service: message.service,
        languageCode: message.languageCode,
        imageUrl: message.imageUrl || parsed.imageUrl,
      };
    });
}

export function buildConversationText(
  messages: unknown[],
  fallbackQuestion: string,
  options?: { service?: string; limit?: number },
) {
  const cleanMessages = sanitizeMessages(messages, options);

  return cleanMessages.length > 0
    ? cleanMessages
        .map((message) => {
          const role = message.role === "assistant" ? "Bhagya" : "User";
          return `${role}: ${message.content || ""}`;
        })
        .join("\n")
    : `User: ${fallbackQuestion}`;
}

export function buildUserConversationText(
  messages: unknown[],
  fallbackQuestion: string
) {
  const cleanMessages = sanitizeMessages(messages);

  return cleanMessages.length > 0
    ? cleanMessages
        .filter((message) => message.role !== "assistant")
        .map((message) => message.content || "")
        .join("\n")
    : fallbackQuestion;
}

export function makeChatTitle(question: string) {
  return question.trim().replace(/\s+/g, " ").slice(0, 45) || "Reading";
}
