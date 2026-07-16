import { callBhagyaOpenAI } from "../backend/openai";

export async function callGroundedBhagyaOpenAI({
  instructions,
  input,
  imageUrl,
  maxOutputTokens,
  validate,
}: {
  instructions: string;
  input: string;
  imageUrl?: string;
  maxOutputTokens?: number;
  validate?: (answer: string) => string[];
}) {
  const generate = (activeInstructions: string) =>
    callBhagyaOpenAI({
      instructions: activeInstructions,
      input,
      imageUrl,
      maxOutputTokens,
    });
  let answer = await generate(instructions);
  let issues = validate?.(answer) || [];

  if (issues.length > 0) {
    answer = await generate(`${instructions}

Correction required before answering:
- The previous draft conflicted with verified service evidence: ${issues.join("; ")}.
- Rewrite the answer from the supplied evidence only.
- Do not mention this correction or the previous draft.`);
    issues = validate?.(answer) || [];
  }

  if (issues.length > 0) {
    throw new Error("GUIDANCE_GROUNDING_VALIDATION_FAILED");
  }

  return answer;
}
