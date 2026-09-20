"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { ActionPanel } from "@/components/action-panel";
import { BrandMark } from "@/components/brand-mark";
import { Chamber } from "@/components/chamber";
import { Chronicle } from "@/components/chronicle";
import { CourtPanel } from "@/components/court-panel";
import { FactionRail } from "@/components/faction-rail";
import { PowerPanel } from "@/components/power-panel";
import { connectWallet, courtAddress, networkLabel, republicAddress } from "@/lib/genlayer";
import { useRepublic } from "@/hooks/use-republic";

type View = "chamber" | "court" | "chronicle";

function shortAddress(value: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "Connect wallet";
}

export function GameShell() {
  const { error, isDemo, loading, refresh, snapshot, updatedAt } = useRepublic();
  const [view, setView] = useState<View>("chamber");
  const [selectedFactionId, setSelectedFactionId] = useState("REFORMERS");
  const [wallet, setWallet] = useState("");
  const [toast, setToast] = useState<{ message: string; tone: "good" | "bad" } | null>(null);
  const toastTimer = useRef<number | null>(null);

  function showToast(message: string, tone: "good" | "bad" = "good") {
    setToast({ message, tone });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5200);
  }

  async function handleConnect() {
    if (isDemo) {
      const demoWallet = "0x4ce1f8e2de87c8df231e7c9f80000000000000a1";
      setWallet(demoWallet);
      showToast("Demo identity connected. Add contract addresses to switch this interface live.");
      return demoWallet;
    }
    try {
      const address = await connectWallet();
      setWallet(address);
      showToast(`Wallet connected · ${shortAddress(address)}`);
      return address;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Wallet connection failed.";
      showToast(message, "bad");
      throw cause;
    }
  }

  if (!snapshot) {
    return (
      <main className="app-shell live-loading-shell">
        <div className="ambient-grid" aria-hidden="true" />
        <section className="live-loading-state" aria-live="polite">
          <Link className="brand loading-brand" href="/" aria-label="Loophole home">
            <span className="brand-seal"><BrandMark /></span>
            <span><b>LOOPHOLE</b><small>Autonomous republic</small></span>
          </Link>
          <span className="eyebrow">GenLayer StudioNet · Accepted state</span>
          <h1>Reading the republic.</h1>
          <p>{error || "Loading the latest consensus state without spending gas."}</p>
          <div className="loading-actions">
            <button className="primary-button" type="button" onClick={() => void refresh()} disabled={loading}>
              {loading ? "Reading accepted state…" : "Retry now"}
            </button>
            <Link className="secondary-button" href="/how-to-play">How to play</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="ambient-grid" aria-hidden="true" />
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setView("chamber")} aria-label="Loophole home">
          <span className="brand-seal"><BrandMark /></span>
          <span><b>LOOPHOLE</b><small>Autonomous republic</small></span>
        </button>
        <nav aria-label="Game sections">
          {(["chamber", "court", "chronicle"] as View[]).map((item) => (
            <button className={view === item ? "active" : ""} key={item} onClick={() => setView(item)} type="button">
              {item}
              {item === "court" && (snapshot.court?.open_case_count ?? 0) > 0 ? <i>{snapshot.court?.open_case_count}</i> : null}
            </button>
          ))}
          <Link href="/how-to-play">How to play</Link>
        </nav>
        <div className="network-cluster">
          <span className={`network-mode ${isDemo ? "demo" : "live"}`}><i />{isDemo ? "Demonstration" : networkLabel}</span>
          <button className="wallet-button" type="button" onClick={() => void handleConnect()}>
            <span className="wallet-orb" aria-hidden="true" />
            {shortAddress(wallet)}
          </button>
        </div>
      </header>

      <div className="system-strip">
        <span><i className="consensus-light" /> Consensus world online</span>
        <span>{snapshot.game.republic_id}</span>
        <span>{isDemo ? "No contract configured" : shortAddress(republicAddress)}</span>
        <span>{snapshot.game.court_configured ? `Court ${isDemo ? "linked" : shortAddress(courtAddress)}` : "Court not linked"}</span>
        <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Reading…" : "Refresh accepted state"}</button>
      </div>

      {error ? <div className="status-banner" role="status"><strong>Live refresh delayed.</strong> {error}</div> : null}

      <div className="game-layout">
        <FactionRail
          factions={snapshot.factions}
          offices={snapshot.offices}
          onSelect={setSelectedFactionId}
          selectedId={selectedFactionId}
        />

        <div className="main-stage">
          {view === "chamber" ? (
            <>
              <Chamber snapshot={snapshot} />
              <ActionPanel
                isDemo={isDemo}
                key={`${selectedFactionId}-${snapshot.game.round_number}`}
                onConnect={handleConnect}
                onRefresh={refresh}
                onToast={showToast}
                selectedFactionId={selectedFactionId}
                snapshot={snapshot}
                wallet={wallet}
              />
            </>
          ) : view === "court" ? (
            <CourtPanel
              isDemo={isDemo}
              onConnect={handleConnect}
              onRefresh={refresh}
              onToast={showToast}
              selectedFactionId={selectedFactionId}
              snapshot={snapshot}
              wallet={wallet}
            />
          ) : (
            <Chronicle snapshot={snapshot} />
          )}
        </div>

        <PowerPanel
          factions={snapshot.factions}
          objectives={snapshot.objectives}
          offices={snapshot.offices}
          selectedFactionId={selectedFactionId}
        />
      </div>

      <footer className="app-footer">
        <span>Built as a GenLayer-native game: AI actions, crises, and court rulings settle through validator consensus.</span>
        <span>{updatedAt ? `Accepted state read ${new Date(updatedAt).toLocaleTimeString()}` : isDemo ? "Showing an interactive sample republic" : "Connecting to GenLayer…"}</span>
      </footer>

      {toast ? <div className={`toast toast-${toast.tone}`} role="status"><i />{toast.message}</div> : null}
    </main>
  );
}
