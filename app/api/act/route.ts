import { NextResponse } from "next/server";

export const runtime = "nodejs";

type AgentAction = {
  movement: "idle" | "forward" | "back";
  look_horizontal: "idle" | "left" | "right";
  look_vertical: "idle";
  say: string;
  status: "progress" | "done" | "stuck";
  confidence: number;
};

type ModelResponse = {
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

const idleAction: AgentAction = {
  movement: "idle",
  look_horizontal: "idle",
  look_vertical: "idle",
  say: "I cannot confirm a route. Holding position.",
  status: "progress",
  confidence: 0,
};

const movements = new Set<AgentAction["movement"]>(["idle", "forward", "back"]);
const horizontalLooks = new Set<AgentAction["look_horizontal"]>(["idle", "left", "right"]);
const verticalLooks = new Set<AgentAction["look_vertical"]>(["idle"]);
const statuses = new Set<AgentAction["status"]>(["progress", "done", "stuck"]);
const events = new Set(["clear", "night", "obstacle", "rain", "crowd", "emergency"]);

function getOutputText(response: ModelResponse) {
  return response.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text")?.text;
}

function extractJson(output: string) {
  const trimmed = output.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1];

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}
function parseAction(output: string | undefined): AgentAction | null {
  if (!output) return null;

  try {
    const parsed = JSON.parse(extractJson(output)) as Partial<AgentAction>;
    if (
      !movements.has(parsed.movement as AgentAction["movement"]) ||
      !horizontalLooks.has(parsed.look_horizontal as AgentAction["look_horizontal"]) ||
      !verticalLooks.has(parsed.look_vertical as AgentAction["look_vertical"]) ||
      !statuses.has(parsed.status as AgentAction["status"]) ||
      typeof parsed.say !== "string" ||
      !parsed.say.trim()
    ) {
      return null;
    }

    return {
      movement: parsed.movement as AgentAction["movement"],
      look_horizontal: parsed.look_horizontal as AgentAction["look_horizontal"],
      look_vertical: parsed.look_vertical as AgentAction["look_vertical"],
      say: parsed.say.trim().slice(0, 180),
      status: parsed.status as AgentAction["status"],
      confidence:
        typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0,
    };
  } catch {
    return null;
  }
}
export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Agent control is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    frame?: unknown;
    mission?: unknown;
    event?: unknown;
    log?: unknown;
    lastAction?: unknown;
  } | null;

  if (
    typeof body?.frame !== "string" ||
    !body.frame.startsWith("data:image/") ||
    body.frame.length > 10_000_000 ||
    typeof body.mission !== "string" ||
    !body.mission.trim() ||
    typeof body.event !== "string" ||
    !events.has(body.event)
  ) {
    return NextResponse.json({ error: "Agent context is incomplete." }, { status: 400 });
  }

  const log = Array.isArray(body.log)
    ? body.log.filter((line): line is string => typeof line === "string" && line.trim().length > 0).slice(-6)
    : [];
  const lastAction = typeof body.lastAction === "object" && body.lastAction ? body.lastAction : idleAction;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.WORLD_ACT_MODEL ?? process.env.WORLD_VISION_MODEL ?? "gpt-5-mini",
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "scout_action",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                movement: { type: "string", enum: ["idle", "forward", "back"] },
                look_horizontal: { type: "string", enum: ["idle", "left", "right"] },
                look_vertical: { type: "string", enum: ["idle"] },
                say: { type: "string" },
                status: { type: "string", enum: ["progress", "done", "stuck"] },
                confidence: { type: "number" },
              },
              required: ["movement", "look_horizontal", "look_vertical", "say", "status", "confidence"],
            },
          },
        },
        instructions:
          "You are SCOUT-01, a conservative navigation agent inside a first-person world-model video of a real place. You receive the current frame, mission, active scenario, recent log, and last action. Controls persist until changed. Keep look_vertical idle. Use only one motion at a time: move forward or back with look_horizontal idle, or turn left or right while movement is idle. Prefer steady forward motion and turn only when the path requires it; never strafe. Use back only for a confirmed obstruction. Hold decisions rather than flickering. A target merely visible at a distance is discovery, not completion: return progress and approach it. Return done only when the current frame confirms the requested target is close and the endpoint is visually identifiable; for a doorway, it must be close enough to identify the opening or handle. If no route can be confirmed after several tries, return stuck with movement idle. Your say field is one short present-tense observation only; never claim or name a movement, turn, or completed action. Do not claim an action was performed unless the frame supports it. Do not invent geometry, people, hazards, distances, labels, or safety guarantees. Return strict JSON only with movement, look_horizontal, look_vertical, say, status, confidence.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `MISSION: ${body.mission.trim().slice(0, 300)}\nEVENT: ${body.event}\nRECENT LOG: ${log.join(" | ") || "None"}\nLAST ACTION: ${JSON.stringify(lastAction)}`,
              },
              { type: "input_image", image_url: body.frame, detail: "low" },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Scout decision is temporarily unavailable." }, { status: 502 });
    }

    const action = parseAction(getOutputText((await response.json()) as ModelResponse));
    if (!action) {
      return NextResponse.json({ error: "Scout decision could not be understood." }, { status: 502 });
    }

    return NextResponse.json(action);
  } catch {
    return NextResponse.json({ error: "Scout decision is temporarily unavailable." }, { status: 502 });
  }
}
