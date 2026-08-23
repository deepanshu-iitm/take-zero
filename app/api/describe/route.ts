import { NextResponse } from "next/server";

import { getAIConfig, toAnthropicImage } from "@/lib/ai";

export const runtime = "nodejs";

type VisionResponse = {
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type AnthropicResponse = {
  content?: Array<{
    type?: string;
    text?: string;
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
    "A first-person video of the uploaded real place at eye level. Preserve the layout, materials, objects, lighting, and depth visible in the reference image. Documentary realism.",
};

const describeInstructions =
  "You are the spatial perception layer for Take Zero, a real-world rehearsal console. Analyze only what is visibly supported by the photo. Return strict JSON with keys title, landmarks, and worldPrompt. title: a concise uppercase neutral location label, maximum 48 characters. landmarks: up to five short visible anchors such as doors, stairs, desk, corridor, vehicle, shelf, or window. worldPrompt: a precise static scene prompt under 280 words that begins exactly with A first-person video of and preserves visible geometry, object positions, materials, lighting, depth, and orientation. Use documentary realism and eye-level perspective. Never use camera verbs (pan, tilt, dolly, zoom, orbit, fly) or motion verbs (walking, running, exploring). Do not invent unseen rooms, people, hazards, labels, or measurements.";

const placeBriefSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    landmarks: { type: "array", items: { type: "string" } },
    worldPrompt: { type: "string" },
  },
  required: ["title", "landmarks", "worldPrompt"],
};

function getOutputText(response: VisionResponse) {
  return response.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text")?.text;
}

function getAnthropicOutputText(response: AnthropicResponse) {
  return response.content?.find((content) => content.type === "text")?.text;
}

function isValidBasePrompt(prompt: string) {
  const words = prompt.trim().split(/\s+/);
  return (
    /^A first-person video of\b/i.test(prompt.trim()) &&
    words.length <= 280 &&
    !/\b(walking|running|exploring|panning|tilting|dolly|zooming|orbiting|flying)\b/i.test(prompt)
  );
}

function normalizeBasePrompt(prompt: string) {
  const compact = prompt.trim().replace(/\s+/g, " ");
  const normalized = compact.replace(/^a\s+first[-\s]?person\s+video\s+of\b/i, "A first-person video of");
  const withOpener = /^A first-person video of\b/i.test(normalized)
    ? normalized
    : `A first-person video of ${normalized}`;

  return isValidBasePrompt(withOpener) ? withOpener : null;
}

function parseBrief(output: string | undefined): PlaceBrief {
  if (!output) return fallbackBrief;

  try {
    const parsed = JSON.parse(output) as Partial<PlaceBrief>;
    const landmarks = Array.isArray(parsed.landmarks)
      ? parsed.landmarks.filter((landmark): landmark is string => typeof landmark === "string").slice(0, 5)
      : [];
    const worldPrompt =
      typeof parsed.worldPrompt === "string" && parsed.worldPrompt.trim().length >= 24
        ? normalizeBasePrompt(parsed.worldPrompt)
        : null;

    if (!worldPrompt) return { ...fallbackBrief, landmarks };

    return {
      title:
        typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim().slice(0, 48).toUpperCase()
          : fallbackBrief.title,
      landmarks,
      worldPrompt,
    };
  } catch {
    return fallbackBrief;
  }
}

export async function POST(request: Request) {
  const config = getAIConfig();
  if (!config) {
    return NextResponse.json({ error: "Configured AI provider is not supported." }, { status: 503 });
  }
  if (!config.apiKey) {
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
    if (config.provider === "anthropic") {
      const anthropicImage = toAnthropicImage(image);
      if (!anthropicImage) {
        return NextResponse.json({ error: "Choose a JPEG, PNG, GIF, or WebP image." }, { status: 400 });
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_VISION_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
          max_tokens: 1024,
          system: describeInstructions,
          output_config: { format: { type: "json_schema", schema: placeBriefSchema } },
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Create the location brief for this seed photo." },
                anthropicImage,
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        return NextResponse.json({ error: "Photo analysis could not be completed." }, { status: 502 });
      }

      return NextResponse.json(parseBrief(getAnthropicOutputText((await response.json()) as AnthropicResponse)));
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.WORLD_VISION_MODEL ?? "gpt-5-mini",
        store: false,
        text: { format: { type: "json_schema", name: "place_brief", strict: true, schema: placeBriefSchema } },
        instructions: describeInstructions,
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

    return NextResponse.json(parseBrief(getOutputText((await response.json()) as VisionResponse)));
  } catch {
    return NextResponse.json({ error: "Photo analysis could not be completed." }, { status: 502 });
  }
}