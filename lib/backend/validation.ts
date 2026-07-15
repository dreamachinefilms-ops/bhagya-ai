import type { BhagyaConversationMessage } from "@/app/api/_lib/bhagyaPrompt";

export type ServiceType = "astrology" | "numerology" | "tarot" | "palmistry";

export type LanguageCode =
  | "english"
  | "hindi"
  | "hinglish"
  | "bengali"
  | "marathi"
  | "tamil"
  | "telugu"
  | "gujarati"
  | "punjabi";

export type ValidatedAiRequest = {
  chatId?: string;
  service: ServiceType;
  question: string;
  messages: BhagyaConversationMessage[];
  language: string;
  languageCode: LanguageCode;
};

type ValidationResult =
  | {
      ok: true;
      value: ValidatedAiRequest;
    }
  | {
      ok: false;
      error: string;
    };

const allowedServices: ServiceType[] = [
  "astrology",
  "numerology",
  "tarot",
  "palmistry",
];

const allowedLanguageCodes: LanguageCode[] = [
  "english",
  "hindi",
  "hinglish",
  "bengali",
  "marathi",
  "tamil",
  "telugu",
  "gujarati",
  "punjabi",
];

const languageLabels: Record<LanguageCode, string> = {
  english: "English",
  hindi: "Hindi",
  hinglish: "Hinglish",
  bengali: "Bengali",
  marathi: "Marathi",
  tamil: "Tamil",
  telugu: "Telugu",
  gujarati: "Gujarati",
  punjabi: "Punjabi",
};

export class ValidationError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseImageMessageContent(content: string) {
  if (!content.trim().startsWith("{")) {
    return { content };
  }

  try {
    const payload: unknown = JSON.parse(content);

    if (
      isRecord(payload) &&
      payload.type === "bhagya.image" &&
      (typeof payload.imageUrl === "string" ||
        typeof payload.storagePath === "string")
    ) {
      return {
        content:
          typeof payload.text === "string"
            ? payload.text.slice(0, 3000)
            : "Palm photo uploaded for analysis.",
        imageUrl:
          typeof payload.imageUrl === "string" ? payload.imageUrl : undefined,
      };
    }
  } catch {
    return { content };
  }

  return { content };
}

function isServiceType(value: unknown): value is ServiceType {
  return (
    typeof value === "string" &&
    allowedServices.includes(value as ServiceType)
  );
}

function isLanguageCode(value: unknown): value is LanguageCode {
  return (
    typeof value === "string" &&
    allowedLanguageCodes.includes(value as LanguageCode)
  );
}

function validateMessages(messages: unknown): BhagyaConversationMessage[] {
  if (messages === undefined) return [];
  if (!Array.isArray(messages)) {
    throw new ValidationError("Messages must be an array.");
  }

  return messages
    .filter(isRecord)
    .map((message) => {
      const rawContent =
        typeof message.content === "string" ? message.content : "";
      const parsed = parseImageMessageContent(rawContent);

      return {
        role: message.role === "assistant" ? "assistant" : "user",
        content: parsed.content.slice(0, 3000),
        service:
          typeof message.service === "string" ? message.service : undefined,
        languageCode:
          typeof message.languageCode === "string"
            ? message.languageCode
            : undefined,
        imageUrl:
          typeof message.imageUrl === "string"
            ? message.imageUrl
            : parsed.imageUrl,
      };
    })
    .filter((message) => Boolean(message.content?.trim()));
}

export function validateAiRequestBody(body: unknown): ValidationResult {
  try {
    if (!isRecord(body)) {
      return { ok: false, error: "Invalid request body." };
    }

    const question =
      typeof body.question === "string" ? body.question.trim() : "";

    if (!question) {
      return { ok: false, error: "Please type your question first." };
    }

    if (question.length > 3000) {
      return {
        ok: false,
        error: "Please keep your question under 3000 characters.",
      };
    }

    if (!isServiceType(body.service)) {
      return { ok: false, error: "Invalid service selected." };
    }

    if (!isLanguageCode(body.languageCode)) {
      return { ok: false, error: "Invalid language selected." };
    }

    const messages = validateMessages(body.messages);
    const language =
      typeof body.language === "string" && body.language.trim().length > 0
        ? body.language.trim().slice(0, 40)
        : languageLabels[body.languageCode];

    return {
      ok: true,
      value: {
        chatId: typeof body.chatId === "string" ? body.chatId : undefined,
        service: body.service,
        question,
        messages,
        language,
        languageCode: body.languageCode,
      },
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { ok: false, error: error.message };
    }

    return { ok: false, error: "Invalid request body." };
  }
}

export function isUuid(value: string | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}
