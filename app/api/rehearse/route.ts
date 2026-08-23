import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ModelResponse = {
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type RehearsalPlan = {
  objective: string;
  steps: string[];
  watchout: string;
};

function getOutputText(response: ModelResponse) {
  return response.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text")?.text;
}

function parsePlan(output: string | undefined): RehearsalPlan | null {
  if (!output) return null;

  try {
    const parsed = JSON.parse(output) as Partial<RehearsalPlan>;
    const steps = Array.isArray(parsed.steps)
      ? parsed.steps.filter((step): step is string => typeof step === "string" && step.trim().length > 0).slice(0, 3)
      : [];

    if (typeof parsed.objective !== "string" || typeof parsed.watchout !== "string" || steps.length !== 3) {
      return null;
    }

    return {
      objective: parsed.objective.trim(),
      steps: steps.map((step) => step.trim()),
      watchout: parsed.watchout.trim(),
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Mission planning is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    mission?: unknown;
    title?: unknown;
    landmarks?: unknown;
    worldPrompt?: unknown;
  } | null;

  if (
    typeof body?.mission !== "string" ||
    typeof body?.title !== "string" ||
    typeof body?.worldPrompt !== "string" ||
    !Array.isArray(body?.landmarks)
  ) {
    return NextResponse.json({ error: "Mission context is incomplete." }, { status: 400 });
  }

  const mission = body.mission.trim();
  const landmarks = body.landmarks.filter((landmark): landmark is string => typeof landmark === "string").slice(0, 5);
  if (!mission || !body.worldPrompt.trim()) {
    return NextResponse.json({ error: "Mission context is incomplete." }, { status: 400 });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.WORLD_REHEARSAL_MODEL ?? process.env.WORLD_VISION_MODEL ?? "gpt-5-mini",
        store: false,
        instructions:
          "You are Take Zero's simulation planner. Produce a conservative simulated navigation plan from the supplied image-derived context. Return strict JSON only with objective, steps, and watchout. objective: restate the mission in one neutral sentence of at most 24 words. steps: exactly three complete imperative sentences, each no more than 22 words and grounded only in the supplied landmarks and scene description. watchout: one complete verification note of at most 24 words. Do not claim that any action was performed, invent geometry, people, hazards, distances, or objects, or provide real-world safety guarantees.",
        input: `LOCATION: ${body.title.slice(0, 48)}\nLANDMARKS: ${landmarks.join(", ") || "None confirmed"}\nSCENE: ${body.worldPrompt.slice(0, 1_500)}\nMISSION: ${mission.slice(0, 300)}`,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Mission plan could not be created." }, { status: 502 });
    }

    const plan = parsePlan(getOutputText((await response.json()) as ModelResponse));
    if (!plan) {
      return NextResponse.json({ error: "Mission plan could not be understood." }, { status: 502 });
    }

    return NextResponse.json(plan);
  } catch {
    return NextResponse.json({ error: "Mission plan could not be created." }, { status: 502 });
  }
}
