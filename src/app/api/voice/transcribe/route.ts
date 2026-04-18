import OpenAI from "openai";

export const runtime = "nodejs";

/**
 * Whisper STT fallback endpoint.
 * Receives an audio blob and returns transcription text.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return new Response(
        JSON.stringify({ error: "No audio file provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "en",
      response_format: "json",
    });

    return new Response(
      JSON.stringify({
        text: transcription.text,
        confidence: 1.0,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[Whisper] Transcription error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Transcription failed",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
