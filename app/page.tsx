"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { WorldSessionProvider, useWorldSession } from "@/components/WorldSession";

const statusItems = [
  ["01", "CAPTURE", "Waiting for seed image"],
  ["02", "TWIN", "World model offline"],
  ["03", "REHEARSE", "Awaiting mission"],
];

function TakeZeroConsole() {
  const { status, connect, disconnect } = useWorldSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [seedPreview, setSeedPreview] = useState<string | null>(null);
  const [seedName, setSeedName] = useState("NO SOURCE IMAGE");
  const [seedSize, setSeedSize] = useState("—");

  const connectionLabel =
    status === "ready" ? "World ready" : status === "waiting" ? "Waiting for GPU" : status === "connecting" ? "Connecting" : "System standby";
  const isConnecting = status === "connecting" || status === "waiting";

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      setSeedPreview(reader.result as string);
      setSeedName(file.name.toUpperCase());
      setSeedSize(`${(file.size / 1024 / 1024).toFixed(1)} MB`);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function clearSeed() {
    setSeedPreview(null);
    setSeedName("NO SOURCE IMAGE");
    setSeedSize("—");
  }

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
                  <button type="button" onClick={clearSeed}>REMOVE</button>
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
            <div className="twin-empty-state">
              <span className="empty-icon" aria-hidden="true">+</span>
              <p>Your rehearsal begins with a place.</p>
              <span>Capture a seed image to initialize the world.</span>
            </div>
            <div className="viewport-footer">
              <span>FRAME — / —</span>
              <span>16 FPS</span>
              <span>CONTEXT / READY</span>
            </div>
          </div>
        </section>

        <aside className="mission-panel panel">
          <div className="panel-heading">
            <span className="panel-index">03</span>
            <span>MISSION</span>
          </div>
          <label className="mission-label" htmlFor="mission">REHEARSAL OBJECTIVE</label>
          <div className="mission-input" id="mission">Find the nearest door</div>
          <button className="rehearse-button" type="button" disabled>
            <span>REHEARSE</span>
            <span aria-hidden="true">↗</span>
          </button>
          <div className="mission-log" aria-label="Agent log preview">
            <div className="log-heading"><span>AGENT LOG</span><span>STANDBY</span></div>
            <p><span>—:—</span> Waiting for a seeded world.</p>
            <p><span>—:—</span> Agent will observe, navigate, replan.</p>
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

      <footer>
        <span>TAKE ZERO — THE REHEARSAL BEFORE THE REAL TAKE</span>
        <span>REACTOR × ANTHROPIC</span>
      </footer>
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
