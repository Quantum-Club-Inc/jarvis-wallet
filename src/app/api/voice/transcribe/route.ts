export const runtime = "nodejs";

interface JsonHeaders {
  "Content-Type": "application/json";
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" } satisfies JsonHeaders,
  });
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null) {
    const maybeError = (payload as { error?: unknown }).error;
    if (typeof maybeError === "string") {
      return maybeError;
    }

    if (typeof maybeError === "object" && maybeError !== null) {
      const nestedMessage = (maybeError as { message?: unknown }).message;
      if (typeof nestedMessage === "string") {
        return nestedMessage;
      }
    }
  }

  return fallback;
}

async function transcribeWithGemini(audioFile: File): Promise<string> {
  const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error("Google Gemini API key is not configured.");
  }

  const configuredModel = (process.env.GOOGLE_STT_MODEL?.trim() || "gemini-flash-latest")
    .replace(/^models\//, "");
  const model = configuredModel === "gemini-2.0-flash"
    ? "gemini-flash-latest"
    : configuredModel;
  const audioBytes = Buffer.from(await audioFile.arrayBuffer()).toString("base64");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Transcribe this spoken audio to plain text. Return only the transcript with no formatting or commentary.",
              },
              {
                inline_data: {
                  mime_type: audioFile.type || "audio/webm",
                  data: audioBytes,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
        },
      }),
      cache: "no-store",
    },
  );

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(readErrorMessage(payload, `Gemini transcription failed (${response.status}).`));
  }

  const textParts = (
    typeof payload === "object"
    && payload !== null
    && "candidates" in payload
    && Array.isArray((payload as { candidates?: unknown }).candidates)
  )
    ? (payload as {
        candidates: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      }).candidates
    : [];

  const transcript = textParts
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join(" ")
    .trim();

  if (!transcript) {
    throw new Error("Gemini returned an empty transcript.");
  }

  return transcript;
}

/**
 * Voice STT endpoint.
 * Receives an audio blob and returns transcription text.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return jsonResponse({ error: "No audio file provided" }, 400);
    }

    const hasGeminiKey = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY);
    if (!hasGeminiKey) {
      return jsonResponse(
        {
          error: "No STT provider configured. Set GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY).",
        },
        503,
      );
    }

    const geminiText = await transcribeWithGemini(audioFile);
    return jsonResponse({
      text: geminiText,
      confidence: 1.0,
      provider: "gemini",
    });
  } catch (error) {
    console.error("[VoiceTranscribe] Transcription error:", error);
    return jsonResponse({
      error:
        error instanceof Error
          ? error.message
          : "Transcription failed",
    }, 500);
  }
}
