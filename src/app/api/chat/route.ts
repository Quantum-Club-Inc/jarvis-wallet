import {
  streamText,
  UIMessage,
  convertToModelMessages,
  stepCountIs,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";

import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import { agentTools } from "@/lib/agent/tools";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as {
      messages: UIMessage[];
      walletAddress?: string;
    };

    const { messages, walletAddress } = body;

    const result = streamText({
      model: anthropic("claude-sonnet-4-5"),
      system: buildSystemPrompt(walletAddress ?? undefined),
      messages: await convertToModelMessages(messages),
      tools: agentTools,
      stopWhen: stepCountIs(5),
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
