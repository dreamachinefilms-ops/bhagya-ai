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
}: {
  instructions: string;
  input: string;
}) {
  const response = await getOpenAIClient().responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
    instructions,
    input,
  });

  return response.output_text;
}
