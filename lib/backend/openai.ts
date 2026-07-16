import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "missing-openai-api-key",
});

let openaiClient: OpenAI | null = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_CONFIGURATION_MISSING");
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return openaiClient;
}

export async function callBhagyaOpenAI({
  instructions,
  input,
  imageUrl,
  maxOutputTokens,
}: {
  instructions: string;
  input: string;
  imageUrl?: string;
  maxOutputTokens?: number;
}) {
  const model = imageUrl
    ? process.env.OPENAI_VISION_MODEL ||
      process.env.OPENAI_MODEL ||
      "gpt-5.4-mini"
    : process.env.OPENAI_MODEL || "gpt-5.4-mini";

  const response = await getOpenAIClient().responses.create({
    model,
    max_output_tokens: maxOutputTokens,
    instructions,
    input: imageUrl
      ? [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: instructions,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: input,
              },
              {
                type: "input_image",
                image_url: imageUrl,
                detail: "high",
              },
            ],
          },
        ]
      : input,
  });

  return response.output_text;
}
