export type ScenarioEvent = "clear" | "night" | "obstacle";

export type PromptLayers = {
  base: string;
  movement: "still" | "moving";
  event: ScenarioEvent;
};

const MOVEMENT_LAYERS = {
  still: "The viewer stands still. No walking. Only looking around. The room is steady and sharp.",
  moving:
    "The viewer walks forward through the space at a calm walking pace. Floor and walls stay consistent with the starting room. No flying, no sliding sideways.",
} as const;

const EVENT_LAYERS: Record<ScenarioEvent, string> = {
  clear: "",
  night:
    "It is night. Overhead lights are dim or off. Deep blue-black beyond the windows, isolated warm lamps, long shadows on the floor, quiet empty interior.",
  obstacle:
    "A fallen object blocks the path ahead: a tipped cleaning cart and a yellow wet-floor sign, occupying the center of the route so the viewer must turn and go around.",
};

function rewriteBaseForEvent(base: string, event: ScenarioEvent) {
  if (event !== "night") return base;

  return base
    .replace(/\bbright daylight\b/gi, "muted ambient light")
    .replace(/\bdaylight\b/gi, "dark exterior")
    .replace(/\bsunny\b/gi, "dim")
    .replace(/\bfluorescent lighting\b/gi, "muted interior lighting")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function assemblePrompt({ base, movement, event }: PromptLayers) {
  const prompt = [rewriteBaseForEvent(base.trim(), event), MOVEMENT_LAYERS[movement], EVENT_LAYERS[event]]
    .filter(Boolean)
    .join(" ");

  return prompt.split(/\s+/).slice(0, 480).join(" ");
}

export const scenarioLabels: Record<ScenarioEvent, string> = {
  clear: "Clear",
  night: "Night",
  obstacle: "Obstacle",
};