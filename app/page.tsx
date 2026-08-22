"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { LingbotWorld2MainVideoView } from "@reactor-models/lingbot-world-2";
import { WorldSessionProvider, useWorldSession } from "@/components/WorldSession";

type PlaceBrief = {
  title: string;
  landmarks: string[];
  worldPrompt: string;
};

const statusItems = [
  ["01", "CAPTURE", "Waiting for seed image"],
  ["02", "TWIN", "World model offline"],
  ["03", "REHEARSE", "Awaiting mission"],
];

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
  const [mission, setMission] = useState("Find the nearest door");
  const [rehearsalState, setRehearsalState] = useState<"idle" | "queued">("idle");
  const [missionLog, setMissionLog] = useState(["Waiting for a seeded world.", "Agent handoff is not active yet."]);

  const connectionLabel =
    status === "ready" ? "World ready" : status === "waiting" ? "Waiting for GPU" : status === "connecting" ? "Connecting" : "System standby";
  const isConnecting = status === "connecting" || status === "waiting";

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
      await initializeWorld(seedFile, brief.worldPrompt);
      setWorldPhase("streaming");
    } catch {
      setWorldPhase("error");
    }
  }

  function toggleRehearsal() {
    if (rehearsalState === "queued") {
      setRehearsalState("idle");
      setMissionLog(["Rehearsal stopped.", "The world remains ready for manual Walk mode."]);
      return;
    }

    setRehearsalState("queued");
    setMissionLog([`Mission queued: ${mission}`, "Ready for the agent-control step."]);
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
          <div>
            <p className="eyebrow">TAKE ZERO / WORLD REHEARSAL</p>
            <h1>Rehearse reality.</h1>
          </div>
        </div>
        <button
          className={`system-status ${status}`}
          type="button"
          onClick={status === "disconnected" ? connect : disconnect}
          aria-label={status === "disconnected" ? "Connect to Reactor" : "Disconnect from Reactor"}
        >
          <span className="status-light" aria-hidden="true" />
          <span>{connectionLabel}</span>
          <span className="status-divider" aria-hidden="true" />
          <span>{status === "disconnected" ? "Connect" : isConnecting ? "Cancel" : "Disconnect"}</span>
        </button>
      </header>

      <section className="intro-row" aria-label="Product framing">
        <p>Turn one photo into a living rehearsal before the real take.</p>
        <span>SIMULATION CONSOLE / 001</span>
      </section>

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
                <p>CAPTURE A REAL PLACE</p>
                <span>Start with a camera frame or image upload</span>
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
                <p>{worldPhase === "initializing" ? "Conditioning the world." : worldPhase === "error" ? "Twin initialization failed." : "Your rehearsal begins with a place."}</p>
                <span>{worldPhase === "initializing" ? "Uploading seed image and preparing the first frame." : worldPhase === "error" ? "Reconnect, then try the seed image again." : "Capture a seed image to initialize the world."}</span>
              </div>
            )}
            {worldPhase === "streaming" && <button type="button" className={`walk-toggle ${walkMode ? "active" : ""}`} onClick={() => setWalkMode((enabled) => !enabled)}>{walkMode ? "WALK MODE / ON" : "WALK MODE / OFF"}</button>}
            <div className="viewport-footer">
              <span>FRAME — / —</span>
              <span>16 FPS</span>
              <span>{walkMode ? "W/S + ARROWS" : placeLabel}</span>
            </div>
          </div>
        </section>

        <aside className="mission-panel panel">
          <div className="panel-heading">
            <span className="panel-index">03</span>
            <span>MISSION</span>
          </div>
          <label className="mission-label" htmlFor="mission">REHEARSAL OBJECTIVE</label>
          <input
            className="mission-input"
            id="mission"
            value={mission}
            onChange={(event) => setMission(event.target.value)}
            placeholder="e.g. Find the nearest door"
            disabled={worldPhase !== "streaming"}
          />
          <button
            className={`rehearse-button ${rehearsalState}`}
            type="button"
            onClick={toggleRehearsal}
            disabled={worldPhase !== "streaming" || !mission.trim()}
          >
            <span>{rehearsalState === "queued" ? "STOP" : "REHEARSE"}</span>
            <span aria-hidden="true">{rehearsalState === "queued" ? "×" : "↗"}</span>
          </button>
          <div className="mission-log" aria-label="Rehearsal log">
            <div className="log-heading"><span>REHEARSAL LOG</span><span>{rehearsalState === "queued" ? "QUEUED" : "STANDBY"}</span></div>
            {missionLog.map((line, index) => <p key={`${line}-${index}`}><span>0{index + 1}</span> {line}</p>)}
          </div>
        </aside>
      </section>

      <section className="lower-console">
        <div className="what-if panel">
          <div className="panel-heading"><span className="panel-index">04</span><span>WHAT IF</span></div>
          <div className="event-list">
            {["Night", "Obstacle", "Crowd", "Emergency"].map((event, index) => (
              <button key={event} type="button" className="event-chip" disabled>
                <span>0{index + 1}</span>{event}
              </button>
            ))}
          </div>
        </div>
        <div className="readiness-strip" aria-label="Rehearsal readiness">
          {statusItems.map(([index, title, detail]) => (
            <div className="readiness-item" key={index}>
              <span>{index}</span>
              <div><strong>{title}</strong><small>{detail}</small></div>
            </div>
          ))}
        </div>
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
