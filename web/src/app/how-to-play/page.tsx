import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export const metadata: Metadata = {
  description: "Learn the Loophole game loop, factions, actions, elections, crises, court cases, and autonomous AI seats.",
  title: "How to play",
};

const phases = [
  { number: "01", title: "Choose a faction", text: "Pick the doctrine you want to steer. You can change which faction you inspect at any time." },
  { number: "02", title: "Commit a move", text: "Your action is sealed first, so neither humans nor consensus AI can react to a hidden move." },
  { number: "03", title: "Reveal or wait", text: "Reveal during the next phase. Empty seats are filled automatically when the deadline passes." },
  { number: "04", title: "Shape the republic", text: "Laws, crises, offices, legitimacy, wealth, influence, and court precedent carry into later rounds." },
];

const factions = [
  { id: "MERCHANTS", image: "/art/factions/merchants.webp", name: "Merchant Coalition", color: "cyan", style: "Capital and leverage", text: "Build wealth, protect commerce, and turn emergency bargains into lasting advantage." },
  { id: "REFORMERS", image: "/art/factions/reformers.webp", name: "Civic Reformers", color: "acid", style: "Legitimacy and restraint", text: "Protect citizens, constrain concentrated power, and make institutions answer in public." },
  { id: "TRADITIONALISTS", image: "/art/factions/traditionalists.webp", name: "Old Charter League", color: "amber", style: "Continuity and office", text: "Defend the constitutional order, preserve precedent, and command established institutions." },
  { id: "REVOLUTIONARIES", image: "/art/factions/revolutionaries.webp", name: "New Dawn Movement", color: "danger", style: "Disruption and change", text: "Expose elite capture, undermine entrenched rivals, and force rapid constitutional change." },
];

const actions = [
  ["Build influence", "Gain political reach for elections, votes, and long-term control."],
  ["Grow wealth", "Increase the resources available to your faction and its strategy."],
  ["Stabilize", "Repair the republic directly when instability threatens every faction."],
  ["Undermine", "Pressure a rival and weaken its ability to control the next outcome."],
  ["Legislate", "Propose, support, oppose, amend, or repeal statutes and charter rules."],
  ["Answer a crisis", "Submit a concrete response judged against the published crisis standard."],
];

export default function HowToPlayPage() {
  return (
    <main className="guide-shell">
      <div className="ambient-grid" aria-hidden="true" />
      <header className="topbar guide-topbar">
        <Link className="brand" href="/" aria-label="Loophole home">
          <span className="brand-seal"><BrandMark /></span>
          <span><b>LOOPHOLE</b><small>Autonomous republic</small></span>
        </Link>
        <nav aria-label="Guide navigation">
          <Link href="/">Chamber</Link>
          <Link className="active" href="/how-to-play" aria-current="page">How to play</Link>
        </nav>
        <Link className="guide-enter" href="/">Enter the republic <span aria-hidden="true">→</span></Link>
      </header>

      <section className="guide-hero" aria-labelledby="guide-title">
        <Image
          alt=""
          aria-hidden="true"
          className="guide-hero-art"
          fill
          preload
          sizes="100vw"
          src="/art/republic-chamber.webp"
        />
        <div className="guide-hero-copy">
          <span className="eyebrow">How to play · Five-minute guide</span>
          <h1 id="guide-title">Take a seat.<br />Leave a precedent.</h1>
          <p>Loophole is a persistent political strategy game. Players steer factions, consensus AI fills every empty seat, and GenLayer validators settle the result.</p>
          <div className="guide-hero-actions">
            <Link className="primary-button" href="/">Play now</Link>
            <a className="secondary-button" href="#game-loop">Learn the loop</a>
          </div>
        </div>
        <div className="guide-live-note">
          <i />
          <span><b>StudioNet</b>Gasless play · No tokens needed</span>
        </div>
      </section>

      <div className="guide-content">
        <section className="guide-section" id="game-loop" aria-labelledby="loop-title">
          <div className="guide-section-heading">
            <span className="eyebrow">The game in sixty seconds</span>
            <h2 id="loop-title">Every round is a sealed political contest.</h2>
            <p>You choose intent before seeing everyone else’s answer. Once the clocks expire, autonomous seats act and consensus produces one accepted history.</p>
          </div>
          <ol className="guide-loop">
            {phases.map((phase) => (
              <li key={phase.number}>
                <span>{phase.number}</span>
                <h3>{phase.title}</h3>
                <p>{phase.text}</p>
              </li>
            ))}
          </ol>
          <div className="phase-ribbon" aria-label="Round phases">
            <span>Commit</span><i>→</i><span>Reveal</span><i>→</i><span>Consensus</span><i>→</i><span>Accepted outcome</span>
          </div>
        </section>

        <section className="guide-section" aria-labelledby="factions-title">
          <div className="guide-section-heading split">
            <div>
              <span className="eyebrow">Power blocs</span>
              <h2 id="factions-title">Four doctrines. One republic.</h2>
            </div>
            <p>You are not locked to a character class. A faction is a political agenda with resources, offices, history, and an autonomous fallback personality.</p>
          </div>
          <div className="guide-faction-grid">
            {factions.map((faction) => (
              <article className={`guide-faction faction-tone-${faction.color}`} key={faction.id}>
                <div className="guide-faction-image">
                  <Image alt="" aria-hidden="true" fill sizes="(max-width: 760px) 42vw, 260px" src={faction.image} />
                </div>
                <div>
                  <span>{faction.style}</span>
                  <h3>{faction.name}</h3>
                  <p>{faction.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="guide-section action-reference" aria-labelledby="actions-title">
          <div className="guide-section-heading">
            <span className="eyebrow">Your move</span>
            <h2 id="actions-title">Use the narrowest action that advances your plan.</h2>
          </div>
          <div className="guide-action-grid">
            {actions.map(([title, text], index) => (
              <article key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <aside className="guide-tip">
            <strong>Write a useful rationale.</strong>
            <p>Consensus AI evaluates whether a move fits its stated action, available resources, faction doctrine, current laws, and crisis standard. Specific plans outperform vague slogans.</p>
          </aside>
        </section>

        <section className="guide-ai-section" aria-labelledby="ai-title">
          <div className="guide-ai-art">
            <Image alt="" aria-hidden="true" fill sizes="(max-width: 900px) 100vw, 50vw" src="/art/consensus-court.webp" />
          </div>
          <div className="guide-ai-copy">
            <span className="eyebrow">When nobody is around</span>
            <h2 id="ai-title">The world keeps playing.</h2>
            <p>After a deadline, the GenLayer Intelligent Contract asks validators to independently produce actions for every empty faction seat. They use public doctrine, resources, law, crisis conditions, and recent history.</p>
            <ul>
              <li><b>No keeper chooses moves.</b> The keeper only wakes an expired phase.</li>
              <li><b>No single model controls history.</b> Validators compare executions through consensus.</li>
              <li><b>Humans remain unpredictable.</b> Commit-and-reveal prevents AI from reacting to hidden player moves.</li>
            </ul>
          </div>
        </section>

        <section className="guide-section court-guide" aria-labelledby="court-guide-title">
          <div className="guide-section-heading split">
            <div>
              <span className="eyebrow">Law and precedent</span>
              <h2 id="court-guide-title">Lose the vote. Challenge the record.</h2>
            </div>
            <p>The court is another strategy layer, not a decorative menu. A case freezes the challenged action and the laws that applied when it happened.</p>
          </div>
          <div className="court-flow">
            <article><span>01</span><h3>File</h3><p>Name the defendant, action round, cited law, and exact violation.</p></article>
            <article><span>02</span><h3>Brief</h3><p>Both sides make arguments against the frozen evidence.</p></article>
            <article><span>03</span><h3>Rule</h3><p>Validators audit the proposed judgment and any sanction.</p></article>
            <article><span>04</span><h3>Appeal</h3><p>A final ruling can establish precedent for future disputes.</p></article>
          </div>
        </section>

        <section className="guide-section guide-faq" aria-labelledby="faq-title">
          <div className="guide-section-heading">
            <span className="eyebrow">Before your first move</span>
            <h2 id="faq-title">Good to know.</h2>
          </div>
          <div>
            <details open>
              <summary>Does playing cost gas?</summary>
              <p>No. This deployment runs on gasless GenLayer StudioNet. You still connect a wallet so your chosen seat and signed actions belong to you.</p>
            </details>
            <details>
              <summary>What happens if I miss reveal?</summary>
              <p>Your sealed move cannot influence the round until it is revealed. When deadlines pass, the republic advances and empty or inactive seats are handled autonomously.</p>
            </details>
            <details>
              <summary>How do I win a season?</summary>
              <p>Accumulate season points through objectives, offices, successful laws, crisis performance, and faction-specific play. The final round resolves objectives and records the winner.</p>
            </details>
            <details>
              <summary>Is StudioNet permanent?</summary>
              <p>No. StudioNet is a development network and can reset. Loophole’s release tooling can redeploy the world, but permanent history requires a longer-lived GenLayer network.</p>
            </details>
          </div>
        </section>

        <section className="guide-final-cta">
          <span className="eyebrow">The clocks are already moving</span>
          <h2>The republic does not wait.</h2>
          <p>Choose a faction, inspect the current crisis, and make one precise move.</p>
          <Link className="primary-button" href="/">Enter the chamber</Link>
        </section>
      </div>

      <footer className="app-footer guide-footer">
        <span>Loophole · A GenLayer-native autonomous strategy world</span>
        <Link href="/">Return to live accepted state</Link>
      </footer>
    </main>
  );
}
