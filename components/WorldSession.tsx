"use client";

import {
  LingbotWorld2Provider,
  useLingbotWorld2,
  useLingbotWorld2Message,
} from "@reactor-models/lingbot-world-2";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";

type WalkAction = {
  longitudinal: "idle" | "forward" | "back";
  horizontal: "idle" | "left" | "right";
  vertical: "idle" | "up" | "down";
};

type WorldSession = {
  status: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  initializeWorld: (file: File, prompt: string) => Promise<void>;
  setWorldPrompt: (prompt: string) => Promise<void>;
  setWalkAction: (action: WalkAction) => Promise<void>;
};

const WorldSessionContext = createContext<WorldSession | null>(null);

async function getToken() {
  const response = await fetch("/api/reactor/token", { method: "POST" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Unable to create a Reactor session token.");
  }
  const { jwt } = (await response.json()) as { jwt: string };
  await new Promise((resolve) => window.setTimeout(resolve, 3_000));
  return jwt;
}

function WorldSessionBridge({ children }: { children: ReactNode }) {
  const world = useLingbotWorld2();
  const imageAccepted = useRef<(() => void) | null>(null);

  const connect = useCallback(async () => {
    await world.connect(await getToken());
  }, [world]);

  const disconnect = useCallback(async () => {
    await world.disconnect();
  }, [world]);

  const setWorldPrompt = useCallback(
    async (prompt: string) => {
      if (world.status !== "ready") {
        throw new Error("Connect to Reactor before updating the twin prompt.");
      }
      await world.setPrompt({ prompt });
    },
    [world],
  );

  useLingbotWorld2Message((message) => {
    if (message.type === "image_accepted") {
      imageAccepted.current?.();
      imageAccepted.current = null;
    }
  });

  const setWalkAction = useCallback(
    async ({ longitudinal, horizontal, vertical }: WalkAction) => {
      await Promise.all([
        world.setMoveLongitudinal({ move_longitudinal: longitudinal }),
        world.setMoveLateral({ move_lateral: "idle" }),
        world.setLookHorizontal({ look_horizontal: horizontal }),
        world.setLookVertical({ look_vertical: vertical }),
      ]);
    },
    [world],
  );

  const initializeWorld = useCallback(
    async (file: File, prompt: string) => {
      if (world.status !== "ready") {
        throw new Error("Connect to Reactor before initializing the twin.");
      }

      const accepted = new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          imageAccepted.current = null;
          reject(new Error("Reactor did not accept the seed image in time."));
        }, 15_000);
        imageAccepted.current = () => {
          window.clearTimeout(timeout);
          resolve();
        };
      });

      const image = await world.uploadFile(file);
      await world.setImage({ image });
      await accepted;
      await world.setPrompt({ prompt });
      await world.start();
    },
    [world],
  );

  const value = useMemo(
    () => ({
      status: world.status,
      connect,
      disconnect,
      initializeWorld,
      setWorldPrompt,
      setWalkAction,
    }),
    [world.status, connect, disconnect, initializeWorld, setWorldPrompt, setWalkAction],
  );

  return <WorldSessionContext.Provider value={value}>{children}</WorldSessionContext.Provider>;
}

export function WorldSessionProvider({ children }: { children: ReactNode }) {
  return (
    <LingbotWorld2Provider>
      <WorldSessionBridge>{children}</WorldSessionBridge>
    </LingbotWorld2Provider>
  );
}

export function useWorldSession() {
  const session = useContext(WorldSessionContext);
  if (!session) throw new Error("useWorldSession must be used inside WorldSessionProvider.");
  return session;
}