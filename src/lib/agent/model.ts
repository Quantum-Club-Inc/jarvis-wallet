import "server-only";

import {
  createGoogleGenerativeAI,
  type GoogleLanguageModelOptions,
} from "@ai-sdk/google";

const geminiApiKey =
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;

const google = createGoogleGenerativeAI({
  apiKey: geminiApiKey,
});

export const agentModelId =
  process.env.JARVIS_AGENT_MODEL ?? "gemini-3-flash-preview";

function getGoogleOptionsForModel(
  modelId: string,
): GoogleLanguageModelOptions | undefined {
  if (modelId === "gemini-flash-latest" || modelId.startsWith("gemini-3")) {
    return {
      thinkingConfig: {
        thinkingLevel: "medium",
      },
    };
  }

  if (modelId.startsWith("gemini-2.5")) {
    return {
      thinkingConfig: {
        thinkingBudget: 4096,
      },
    };
  }

  return undefined;
}

const googleOptions = getGoogleOptionsForModel(agentModelId);

export const agentProviderOptions = googleOptions
  ? {
      google: googleOptions,
    }
  : undefined;

export function getAgentModel() {
  if (!geminiApiKey) {
    throw new Error(
      "Missing Gemini API key. Set GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY.",
    );
  }

  return google(agentModelId);
}
