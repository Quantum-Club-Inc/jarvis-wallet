import {
  streamText,
  UIMessage,
  convertToModelMessages,
  stepCountIs,
} from "ai";

import { getAgentModel, agentProviderOptions } from "@/lib/agent/model";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import { createAgentTools } from "@/lib/agent/tools";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as {
      messages: UIMessage[];
      walletAddress?: string;
      walletContext?: {
        totalUsd: string | null;
        totalTon: string | null;
        assets: Array<{
          symbol: string;
          amount: string;
          valueUsd: string | null;
        }>;
      } | null;
      n8nAutomationEnabled?: boolean;
      isFirstTime?: boolean;
      interactionMode?: "overview" | "voice" | "chat";
    };

    const {
      messages,
      walletAddress,
      walletContext,
      n8nAutomationEnabled,
      isFirstTime,
      interactionMode,
    } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "No messages provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    let systemPrompt = buildSystemPrompt(
      walletAddress ?? undefined,
      interactionMode,
      walletContext ?? null,
      Boolean(n8nAutomationEnabled),
    );
    
    if (isFirstTime) {
      systemPrompt += `\n\nCRITICAL DIRECTIVE: The user has just created a new wallet. Their 24-word recovery phrase has been displayed to them in the app UI. Ask them to confirm they have safely written it down before proceeding. Do NOT ask them to speak the words aloud.`;
    }

    const result = streamText({
      model: getAgentModel(),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      maxOutputTokens: 220,
      tools: createAgentTools({
        defaultWalletAddress: walletAddress,
        interactionMode,
        requestOrigin: new URL(req.url).origin,
      }),
      stopWhen: stepCountIs(5),
      providerOptions: agentProviderOptions,
      onStepFinish: ({ toolResults }) => {
        if (toolResults && toolResults.length > 0) {
          console.log(
            "[Jarvis Agent] Tool results:",
            JSON.stringify(toolResults, null, 2),
          );
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[Jarvis Agent] Error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Agent processing failed",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
