import type { BhagyaConversationMessage } from "@/app/api/_lib/bhagyaPrompt";

function isMessageRecord(message: unknown): message is BhagyaConversationMessage & {
  isLoading?: boolean;
} {
  return Boolean(message && typeof message === "object");
}

export function sanitizeMessages(messages: unknown[]) {
  return messages
    .filter(isMessageRecord)
    .filter((message) => {
      const content = typeof message.content === "string" ? message.content : "";

      return (
        content.trim() &&
        !message.isLoading &&
        !/\bconsulting\b/i.test(content)
      );
    })
    .slice(-12)
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content:
        typeof message.content === "string"
          ? message.content.slice(0, 3000)
          : "",
      service: message.service,
      languageCode: message.languageCode,
    }));
}

export function buildConversationText(
  messages: unknown[],
  fallbackQuestion: string
) {
  const cleanMessages = sanitizeMessages(messages);

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
