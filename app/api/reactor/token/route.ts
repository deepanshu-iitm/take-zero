import { NextResponse } from "next/server";

const MODEL_NAME = "reactor/lingbot-world-2";
const TOKEN_LIFETIME_SECONDS = 60 * 60;

export async function POST() {
  const apiKey = process.env.REACTOR_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Reactor is not configured on the server." },
      { status: 500 },
    );
  }

  try {
    const response = await fetch("https://api.reactor.inc/tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Reactor-API-Key": apiKey,
      },
      body: JSON.stringify({
        expires_after: TOKEN_LIFETIME_SECONDS,
        authorization_details: [
          {
            type: "session",
            resources: { models: { match: [MODEL_NAME] } },
            constraints: { max_sessions: 1 },
          },
        ],
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Reactor could not create a session token." },
        { status: 502 },
      );
    }

    const { jwt, expires_at } = (await response.json()) as {
      jwt: string;
      expires_at: number;
    };

    return NextResponse.json(
      { jwt, expiresAt: expires_at },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to reach Reactor." },
      { status: 502 },
    );
  }
}