import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let text: unknown;
  try {
    ({ text } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(
      "en-US-JennyNeural",
      OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
    );

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const { audioStream } = tts.toStream(text as string);
      audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      audioStream.on("end", resolve);
      audioStream.on("error", reject);
    });

    const buffer = Buffer.concat(chunks);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("[TTS route] Edge TTS error:", err);
    return NextResponse.json({ error: "TTS generation failed" }, { status: 500 });
  }
}
