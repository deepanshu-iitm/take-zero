"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { LingbotWorld2MainVideoView } from "@reactor-models/lingbot-world-2";
import { WorldSessionProvider, useWorldSession } from "@/components/WorldSession";

type PlaceBrief = {
  title: string;
  landmarks: string[];
  worldPrompt: string;
};

type RehearsalPlan = {
  objective: string;
  steps: string[];
  watchout: string;
};

function TakeZeroConsole() {
  const { status, connect, disconnect, initializeWorld, setWalkAction } = useWorldSession();
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
  const [rehearsalState, setRehearsalState] = useState<"idle" | "planning" | "ready" | "error">("idle");
  const [rehearsalPlan, setRehearsalPlan] = useState<RehearsalPlan | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const connectionLabel =
    status === "ready" ? "World ready" : status === "waiting" ? "Waiting for GPU" : status === "connecting" ? "Connecting" : "System standby";
  const isConnecting = status === "connecting" || status === "waiting";

  async function toggleConnection() {
    setConnectionError(null);
    try {
      if (status === "disconnected") {
        await connect();
        return;
      }
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
      setRehearsalPlan(null);
      setRehearsalState("idle");
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
    setRehearsalPlan(null);
    setRehearsalState("idle");
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
      await initializeWorld(seedFile, brief.worldPrompt);
      setWorldPhase("streaming");
    } catch {
      setWorldPhase("error");
    }
  }

  async function toggleRehearsal() {
    if (rehearsalState === "planning") return;
    if (rehearsalState === "ready") {
      setRehearsalPlan(null);
      setRehearsalState("idle");
      return;
    }
    if (!placeBrief) return;

    setRehearsalState("planning");
    try {
      const response = await fetch("/api/rehearse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mission, ...placeBrief }),
      });
      const plan = (await response.json().catch(() => null)) as RehearsalPlan | null;
      if (!response.ok || !plan?.steps?.length) throw new Error("Mission planning failed");

      setRehearsalPlan(plan);
      setRehearsalState("ready");
    } catch {
      setRehearsalPlan(null);
      setRehearsalState("error");
    }
  }

  useEffect(() => {
    if (worldPhase !== "streaming" || !walkMode) return;

    const pressed = new Set<string>();
    const supported = new Set(["KeyW", "KeyS", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
    const sendAction = () => {
      void setWalkAction({
        longitudinal: pressed.has("KeyW") ? "forward" : pressed.has("KeyS") ? "back" : "idle",
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
    };
  }, [worldPhase, walkMode, setWalkAction]);
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
          <div className="twin-viewport">
            <div className="viewport-noise" aria-hidden="true" />
            <div className="viewport-grid" aria-hidden="true" />
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
            {worldPhase === "streaming" && <button type="button" className={`walk-toggle ${walkMode ? "active" : ""}`} onClick={() => setWalkMode((enabled) => !enabled)}>{walkMode ? "WALK MODE / ON" : "WALK MODE / OFF"}</button>}
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
          <button
            className={`rehearse-button ${rehearsalState}`}
            type="button"
            onClick={toggleRehearsal}
            disabled={worldPhase !== "streaming" || !mission.trim() || rehearsalState === "planning"}
          >
            <span>{rehearsalState === "planning" ? "PLANNING" : rehearsalState === "ready" ? "CLEAR" : "REHEARSE"}</span>
            <span aria-hidden="true">{rehearsalState === "ready" ? "×" : "↗"}</span>
          </button>
          {rehearsalState === "error" && <p className="rehearsal-error">PLAN UNAVAILABLE</p>}
          {rehearsalPlan && (
            <div className="rehearsal-plan">
              <span className="plan-label">SIMULATED PLAN</span>
              <p className="plan-objective">{rehearsalPlan.objective}</p>
              <ol>{rehearsalPlan.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              <p className="plan-watchout"><span>WATCHOUT</span>{rehearsalPlan.watchout}</p>
            </div>
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
