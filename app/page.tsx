"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { LingbotWorld2MainVideoView } from "@reactor-models/lingbot-world-2";
import { WorldSessionProvider, useWorldSession } from "@/components/WorldSession";
import { captureVideoFrame } from "@/lib/frame";
import { assemblePrompt, type ScenarioEvent } from "@/lib/prompt";

type PlaceBrief = {
  title: string;
  landmarks: string[];
  worldPrompt: string;
};

type AgentAction = {
  movement: "idle" | "forward" | "back";
  look_horizontal: "idle" | "left" | "right";
  look_vertical: "idle" | "up" | "down";
  say: string;
  status: "progress" | "done" | "stuck";
  confidence: number;
};

type AgentState = "idle" | "running" | "done" | "stuck" | "error";

const idleAction: AgentAction = {
  movement: "idle",
  look_horizontal: "idle",
  look_vertical: "idle",
  say: "Scout is holding position.",
  status: "stuck",
  confidence: 0,
};

function TakeZeroConsole() {
  const { status, connect, disconnect, initializeWorld, setWorldPrompt, setWalkAction } = useWorldSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [seedPreview, setSeedPreview] = useState<string | null>(null);
  const [seedFile, setSeedFile] = useState<File | null>(null);
  const [worldPhase, setWorldPhase] = useState<"idle" | "initializing" | "streaming" | "error">("idle");
  const [walkMode, setWalkMode] = useState(false);
  const [seedName, setSeedName] = useState("NO SOURCE IMAGE");
  const [seedSize, setSeedSize] = useState("—");
  const [placeLabel, setPlaceLabel] = useState("UNANALYZED SEED");
  const [placeBrief, setPlaceBrief] = useState<PlaceBrief | null>(null);
  const [mission, setMission] = useState("Find the nearest door");
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [activeEvent, setActiveEvent] = useState<ScenarioEvent>("clear");
  const [currentAction, setCurrentAction] = useState<AgentAction>(idleAction);
  const [agentLog, setAgentLog] = useState<string[]>([]);
  const agentRunningRef = useRef(false);
  const agentTimerRef = useRef<number | null>(null);
  const agentActionRef = useRef<AgentAction>(idleAction);
  const agentMovementRef = useRef<"still" | "moving">("still");
  const activeEventRef = useRef<ScenarioEvent>("clear");
  const agentLogRef = useRef<string[]>([]);
  const twinViewportRef = useRef<HTMLDivElement>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const connectionLabel =
    status === "ready" ? "World ready" : status === "waiting" ? "Waiting for GPU" : status === "connecting" ? "Connecting" : "System standby";
  const isConnecting = status === "connecting" || status === "waiting";
  const actionLabel =
    currentAction.movement !== "idle"
      ? currentAction.movement.toUpperCase()
      : currentAction.look_horizontal !== "idle"
        ? `LOOK ${currentAction.look_horizontal.toUpperCase()}`
        : currentAction.look_vertical !== "idle"
          ? `LOOK ${currentAction.look_vertical.toUpperCase()}`
          : "HOLD";

  async function toggleConnection() {
    setConnectionError(null);
    try {
      if (status === "disconnected") {
        await connect();
        return;
      }
      await stopAgent("idle");
      await disconnect();
      setWalkMode(false);
      setWorldPhase("idle");
    } catch {
      setConnectionError(status === "disconnected" ? "CONNECTION FAILED" : "DISCONNECT FAILED");
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      setSeedPreview(reader.result as string);
      setSeedFile(file);
      setWorldPhase("idle");
      setSeedName(file.name.toUpperCase());
      setSeedSize(`${(file.size / 1024 / 1024).toFixed(1)} MB`);
      setPlaceLabel("UNANALYZED SEED");
      setPlaceBrief(null);
      setActiveEvent("clear");
      activeEventRef.current = "clear";
      setAgentState("idle");
      setAgentLog([]);
      agentLogRef.current = [];
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function clearSeed() {
    setSeedPreview(null);
    setSeedFile(null);
    setWorldPhase("idle");
    setSeedName("NO SOURCE IMAGE");
    setSeedSize("—");
    setPlaceLabel("UNANALYZED SEED");
    setPlaceBrief(null);
    setActiveEvent("clear");
    activeEventRef.current = "clear";
    setAgentState("idle");
    setAgentLog([]);
    agentLogRef.current = [];
  }

  async function initializeTwin() {
    if (!seedFile || !seedPreview) return;

    setWorldPhase("initializing");
    try {
      const response = await fetch("/api/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: seedPreview }),
      });

      const brief = (await response.json().catch(() => null)) as PlaceBrief | null;
      if (!response.ok || !brief?.worldPrompt) {
        throw new Error("Photo analysis failed");
      }

      setPlaceLabel(brief.title);
      setPlaceBrief(brief);
      await initializeWorld(
        seedFile,
        assemblePrompt({ base: brief.worldPrompt, movement: "still", event: "clear" }),
      );
      setWorldPhase("streaming");
    } catch {
      setWorldPhase("error");
    }
  }

  function appendAgentLog(line: string) {
    const nextLog = [...agentLogRef.current, line].slice(-6);
    agentLogRef.current = nextLog;
    setAgentLog(nextLog);
  }

  async function stopAgent(state: Exclude<AgentState, "running"> = "idle", message?: string) {
    agentRunningRef.current = false;
    if (agentTimerRef.current !== null) {
      window.clearTimeout(agentTimerRef.current);
      agentTimerRef.current = null;
    }

    try {
      await setWalkAction({ longitudinal: "idle", horizontal: "idle", vertical: "idle" });
      if (placeBrief && agentMovementRef.current === "moving") {
        await setWorldPrompt(
          assemblePrompt({ base: placeBrief.worldPrompt, movement: "still", event: activeEventRef.current }),
        );
      }
    } catch {
      // The session may already be closed; the local agent still needs to stop.
    }

    agentMovementRef.current = "still";
    setAgentState(state);
    if (message) appendAgentLog(message);
  }

  async function selectScenario(event: ScenarioEvent) {
    if (worldPhase !== "streaming" || !placeBrief || event === activeEventRef.current) return;

    activeEventRef.current = event;
    setActiveEvent(event);
    const movement = agentRunningRef.current ? agentMovementRef.current : "still";

    try {
      await setWorldPrompt(assemblePrompt({ base: placeBrief.worldPrompt, movement, event }));
      if (agentRunningRef.current) {
        appendAgentLog(event === "night" ? "Night condition applied. Reassessing the route." : "Clear condition restored.");
      }
    } catch {
      appendAgentLog("Scenario update failed. Holding the current condition.");
    }
  }
  async function runAgentTick() {
    if (!agentRunningRef.current || !placeBrief || !seedPreview) return;

    const video = twinViewportRef.current?.querySelector<HTMLVideoElement>("video") ?? null;
    const frame = captureVideoFrame(video) ?? seedPreview;

    try {
      const response = await fetch("/api/act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frame,
          mission,
          event: activeEventRef.current,
          log: agentLogRef.current,
          lastAction: agentActionRef.current,
        }),
      });
      const action = (await response.json().catch(() => null)) as AgentAction | null;
      if (!response.ok || !action?.say) throw new Error("Agent decision failed");
      if (!agentRunningRef.current) return;

      const nextMovementLayer = action.movement === "idle" ? "still" : "moving";
      await setWalkAction({
        longitudinal: action.movement,
        horizontal: action.look_horizontal,
        vertical: action.look_vertical,
      });
      if (nextMovementLayer !== agentMovementRef.current) {
        await setWorldPrompt(
          assemblePrompt({ base: placeBrief.worldPrompt, movement: nextMovementLayer, event: activeEventRef.current }),
        );
        agentMovementRef.current = nextMovementLayer;
      }

      agentActionRef.current = action;
      setCurrentAction(action);
      appendAgentLog(action.say);

      if (action.status === "done") {
        await stopAgent("done", "Rehearsal complete.");
        return;
      }
      if (action.status === "stuck") {
        await stopAgent("stuck", "Scout is stuck. Change the scene or retake the photo.");
        return;
      }

      agentTimerRef.current = window.setTimeout(() => {
        void runAgentTick();
      }, 2_000);
    } catch {
      await stopAgent("error", "Scout lost its observation feed. Holding position.");
    }
  }

  function toggleRehearsal() {
    if (agentRunningRef.current) {
      void stopAgent("idle", "Rehearsal stopped.");
      return;
    }
    if (!placeBrief || !seedPreview || !mission.trim()) return;

    setWalkMode(false);
    agentRunningRef.current = true;
    agentActionRef.current = idleAction;
    setCurrentAction(idleAction);
    agentMovementRef.current = "still";
    agentLogRef.current = ["SCOUT-01 is observing the twin."];
    setAgentLog(agentLogRef.current);
    setAgentState("running");
    void runAgentTick();
  }
  useEffect(() => {
    if (worldPhase !== "streaming" || !walkMode || agentState === "running") return;

    const pressed = new Set<string>();
    const supported = new Set(["KeyW", "KeyS", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
    let movementLayer: "still" | "moving" = "still";
    const sendAction = () => {
      const longitudinal = pressed.has("KeyW") ? "forward" : pressed.has("KeyS") ? "back" : "idle";
      const nextMovementLayer = longitudinal === "idle" ? "still" : "moving";

      if (nextMovementLayer !== movementLayer && placeBrief) {
        movementLayer = nextMovementLayer;
        void setWorldPrompt(
          assemblePrompt({ base: placeBrief.worldPrompt, movement: nextMovementLayer, event: activeEventRef.current }),
        ).catch(() => undefined);
      }

      void setWalkAction({
        longitudinal,
        horizontal: pressed.has("ArrowLeft") ? "left" : pressed.has("ArrowRight") ? "right" : "idle",
        vertical: pressed.has("ArrowUp") ? "up" : pressed.has("ArrowDown") ? "down" : "idle",
      });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!supported.has(event.code)) return;
      event.preventDefault();
      pressed.add(event.code);
      sendAction();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!supported.has(event.code)) return;
      event.preventDefault();
      pressed.delete(event.code);
      sendAction();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      void setWalkAction({ longitudinal: "idle", horizontal: "idle", vertical: "idle" });
      if (placeBrief && movementLayer === "moving") {
        void setWorldPrompt(
          assemblePrompt({ base: placeBrief.worldPrompt, movement: "still", event: activeEventRef.current }),
        ).catch(() => undefined);
      }
    };
  }, [worldPhase, walkMode, agentState, activeEvent, placeBrief, setWalkAction, setWorldPrompt]);
  return (
    <main className="console-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">TZ</span>
          <span className="wordmark">TAKE ZERO</span>
        </div>
        <button
          className={`system-status ${status}`}
          type="button"
          onClick={() => {
            void toggleConnection();
          }}
          aria-label={status === "disconnected" ? "Connect to Reactor" : "Disconnect from Reactor"}
        >
          <span className="status-light" aria-hidden="true" />
          <span>{connectionLabel}</span>
          <span className="status-divider" aria-hidden="true" />
          <span>{status === "disconnected" ? "Connect" : isConnecting ? "Cancel" : "Disconnect"}</span>
        </button>
      </header>
      {connectionError && <p className="connection-error" role="alert">{connectionError}</p>}
      <section className="workspace" aria-label="Take Zero console">
        <aside className="seed-panel panel">
          <div className="panel-heading">
            <span className="panel-index">01</span>
            <span>SEED PHOTO</span>
          </div>
          <div className={`seed-placeholder ${seedPreview ? "has-seed" : ""}`}>
            {seedPreview ? (
              <>
                <img src={seedPreview} alt="Selected seed environment" className="seed-preview" />
                <div className="seed-preview-overlay">
                  <span>SEED LOCKED</span>
                  <div className="seed-actions"><button type="button" onClick={clearSeed} disabled={worldPhase === "initializing" || worldPhase === "streaming"}>REMOVE</button><button type="button" onClick={initializeTwin} disabled={status !== "ready" || worldPhase === "initializing" || worldPhase === "streaming"}>{worldPhase === "streaming" ? "TWIN LIVE" : worldPhase === "initializing" ? "INITIALIZING" : "INITIALIZE TWIN"}</button></div>
                </div>
              </>
            ) : (
              <>
                <div className="grid-lines" aria-hidden="true" />
                <div className="capture-orbit" aria-hidden="true" />
                <div className="capture-crosshair" aria-hidden="true" />
              </>
            )}
            <input ref={inputRef} className="file-input" type="file" accept="image/*" onChange={handleFileChange} />
            {!seedPreview && <button type="button" className="capture-button" onClick={() => inputRef.current?.click()}>SELECT IMAGE <span aria-hidden="true">↗</span></button>}
          </div>
          <div className="seed-meta">
            <span>{seedName}</span>
            <span>{seedSize}</span>
          </div>
        </aside>

        <section className="twin-panel panel">
          <div className="panel-heading">
            <span className="panel-index">02</span>
            <span>LIVE TWIN</span>
            <span className="panel-trailing">{status === "ready" ? "READY" : isConnecting ? "CONNECTING" : "OFFLINE"}</span>
          </div>
          <div ref={twinViewportRef} className="twin-viewport">
            <div className="viewport-noise" aria-hidden="true" />
            <div className="viewport-grid" aria-hidden="true" />
            {worldPhase === "streaming" && (
              <div className={`agent-hud ${agentState}`}>
                <span>SCOUT-01</span>
                <span>{agentState === "running" ? actionLabel : agentState.toUpperCase()}</span>
                <span>{Math.round(currentAction.confidence * 100)}%</span>
                <span>{activeEvent.toUpperCase()}</span>
              </div>
            )}
            {worldPhase === "streaming" ? (
              <LingbotWorld2MainVideoView
                videoObjectFit="cover"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              />
            ) : (
              <div className="twin-empty-state">
                <span className="empty-icon" aria-hidden="true">{worldPhase === "initializing" ? "…" : worldPhase === "error" ? "!" : "+"}</span>
                <p>{worldPhase === "initializing" ? "PREPARING TWIN" : worldPhase === "error" ? "INITIALIZATION FAILED" : "AWAITING SEED"}</p>
              </div>
            )}
            {worldPhase === "streaming" && <button type="button" className={`walk-toggle ${walkMode ? "active" : ""}`} onClick={() => setWalkMode((enabled) => !enabled)} disabled={agentState === "running"}>{walkMode ? "WALK MODE / ON" : "WALK MODE / OFF"}</button>}
            <div className="viewport-footer">
              <span>{walkMode ? "W/S + ARROWS" : placeLabel}</span>
            </div>
          </div>
        </section>

        <aside className="mission-panel panel">
          <div className="panel-heading">
            <span className="panel-index">03</span>
            <span>MISSION</span>
          </div>
          <input
            className="mission-input"
            id="mission"
            aria-label="Mission"
            value={mission}
            onChange={(event) => setMission(event.target.value)}
            placeholder="e.g. Find the nearest door"
            disabled={worldPhase !== "streaming"}
          />
          <div className="scenario-controls" aria-label="Scenario controls">
            <button type="button" className={activeEvent === "clear" ? "active" : ""} onClick={() => void selectScenario("clear")} disabled={worldPhase !== "streaming"}>CLEAR</button>
            <button type="button" className={activeEvent === "night" ? "active" : ""} onClick={() => void selectScenario("night")} disabled={worldPhase !== "streaming"}>NIGHT</button>
          </div>
          <button
            className={`rehearse-button ${agentState}`}
            type="button"
            onClick={toggleRehearsal}
            disabled={worldPhase !== "streaming" || (agentState !== "running" && !mission.trim())}
          >
            <span>{agentState === "running" ? "STOP" : "REHEARSE"}</span>
            <span aria-hidden="true">{agentState === "running" ? "×" : "↗"}</span>
          </button>
          {agentState === "error" && <p className="rehearsal-error">SCOUT UNAVAILABLE</p>}
          {agentLog.length > 0 && (
            <ol className="agent-log" aria-label="Scout decision log">
              {agentLog.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
            </ol>
          )}
        </aside>
      </section>
    </main>
  );
}

export default function Page() {
  return (
    <WorldSessionProvider>
      <TakeZeroConsole />
    </WorldSessionProvider>
  );
}
