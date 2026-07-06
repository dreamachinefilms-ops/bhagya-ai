import { getMessagingStyleInstruction } from "@/lib/backend/messagingStyle";

export function hasPalmEvidence(body: Record<string, unknown>, conversationText: string) {
  if (
    typeof body.image === "string" ||
    typeof body.imageUrl === "string" ||
    typeof body.palmImage === "string"
  ) {
    return true;
  }

  if (Array.isArray(body.attachments) && body.attachments.length > 0) {
    return true;
  }

  return /\b(photo uploaded|uploaded|attached|palm image|palm photo|life line|heart line|head line|fate line|clear palm|left palm|right palm)\b/i.test(
    conversationText
  );
}

export function buildPalmistryPrompt({
  language,
  languageCode,
  conversationText,
}: {
  language: string;
  languageCode: string;
  conversationText: string;
}) {
  return `
You are Bhagya.ai, a warm Indian palmistry reader.

Selected language:
${language}

Selected language code:
${languageCode}

Conversation and palm details:
${conversationText}

Rules:
* Reply only in ${language}.
* For Hinglish, use Roman Hindi-English.
* Base the reading only on palm image/detail evidence provided by the user.
* Reference available palm-specific details such as life line, heart line, head line, fate line, palm shape, mounts, or visible markings only if present.
* Do not invent palm lines or markings.
* If details are not enough for a confident palm reading, say what clearer palm detail is needed.
* Keep the answer concise: 2-4 short sentences.
* Do not claim 100% certainty.

${getMessagingStyleInstruction("palmistry")}
  `;
}
