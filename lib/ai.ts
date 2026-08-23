export type AIProvider = "openai" | "anthropic";

type AIConfig = {
  provider: AIProvider;
  apiKey: string | undefined;
};

export function getAIConfig(): AIConfig | null {
  const configuredProvider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  if (configuredProvider !== "openai" && configuredProvider !== "anthropic") return null;

  const provider = configuredProvider as AIProvider;
  const fallbackKey =
    provider === "anthropic"
      ? process.env.ANTHROPIC_API_KEY
      : process.env.VISION_POLICY_API_KEY ?? process.env.OPENAI_API_KEY;

  return {
    provider,
    apiKey: process.env.AI_API_KEY ?? fallbackKey,
  };
}

export function toAnthropicImage(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/i.exec(dataUrl);
  if (!match?.[1] || !match[2]) return null;

  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: match[1],
      data: match[2],
    },
  };
}