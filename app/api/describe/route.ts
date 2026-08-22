import { NextResponse } from "next/server";

export const runtime = "nodejs";

type VisionResponse = {
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type PlaceBrief = {
  title: string;
  landmarks: string[];
  worldPrompt: string;
};

const fallbackBrief: PlaceBrief = {
  title: "PHOTO-GROUNDED LOCATION",
  landmarks: [],
  worldPrompt:
    "A first-person video of the uploaded real place at eye level. Preserve the layout, materials, objects, lighting, and depth visible in the reference image. Documentary realism. The viewer stands still. The room is steady and sharp.",
};

function getOutputText(response: VisionResponse) {
  return response.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text")?.text;
}

function parseBrief(output: string | undefined): PlaceBrief {
  if (!output) return fallbackBrief;

  try {
    const parsed = JSON.parse(output) as Partial<PlaceBrief>;
    const landmarks = Array.isArray(parsed.landmarks)
      ? parsed.landmarks.filter((landmark): landmark is string => typeof landmark === "string").slice(0, 5)
      : [];

    if (typeof parsed.worldPrompt !== "string" || parsed.worldPrompt.trim().length < 24) {
      return { ...fallbackBrief, landmarks };
    }

    return {
      title:
        typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim().slice(0, 48).toUpperCase()
          : fallbackBrief.title,
      landmarks,
      worldPrompt: parsed.worldPrompt.trim(),
    };
  } catch {
    return fallbackBrief;
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "Photo analysis is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
  const image = body?.image;

  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    return NextResponse.json({ error: "Please choose a valid image." }, { status: 400 });
  }

  if (image.length > 10_000_000) {
    return NextResponse.json({ error: "Choose an image smaller than 7 MB." }, { status: 413 });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.WORLD_VISION_MODEL ?? "gpt-5-mini",
        store: false,
        instructions:
          "You are the spatial perception layer for Take Zero, a real-world rehearsal console. Analyze only what is visibly supported by the photo. Return strict JSON with keys title, landmarks, and worldPrompt. title: a concise uppercase neutral location label, maximum 48 characters. landmarks: up to five short visible anchors such as doors, stairs, desk, corridor, vehicle, shelf, or window. worldPrompt: one precise first-person world-generation prompt that preserves visible geometry, object positions, materials, lighting, depth, and orientation. Include documentary realism and a steady eye-level camera. Do not invent unseen rooms, people, hazards, labels, or measurements.",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "Create the location brief for this seed photo." },
              { type: "input_image", image_url: image, detail: "high" },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Photo analysis could not be completed." }, { status: 502 });
    }

    return NextResponse.json(parseBrief((getOutputText((await response.json()) as VisionResponse))));
  } catch {
    return NextResponse.json({ error: "Photo analysis could not be completed." }, { status: 502 });
  }
}
