"use client";

import {
  LingbotWorld2Provider,
  useLingbotWorld2,
} from "@reactor-models/lingbot-world-2";
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
} from "react";

type WorldSession = {
  status: string;
  connect: () => void;
  disconnect: () => void;
};

const WorldSessionContext = createContext<WorldSession | null>(null);

async function getToken() {
  const response = await fetch("/api/reactor/token", { method: "POST" });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Unable to create a Reactor session token.");
  }

  const { jwt } = (await response.json()) as { jwt: string };
  return jwt;
}

function WorldSessionBridge({ children }: { children: ReactNode }) {
  const { status, connect, disconnect } = useLingbotWorld2();
  const value = useMemo(() => ({ status, connect, disconnect }), [status, connect, disconnect]);

  return <WorldSessionContext.Provider value={value}>{children}</WorldSessionContext.Provider>;
}

export function WorldSessionProvider({ children }: { children: ReactNode }) {
  return (
    <LingbotWorld2Provider getJwt={getToken}>
      <WorldSessionBridge>{children}</WorldSessionBridge>
    </LingbotWorld2Provider>
  );
}

export function useWorldSession() {
  const session = useContext(WorldSessionContext);

  if (!session) {
    throw new Error("useWorldSession must be used inside WorldSessionProvider.");
  }

  return session;
}