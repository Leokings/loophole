"use client";

import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { useRepublic } from "@/hooks/use-republic";
import { highlightQuote } from "@/lib/case-law";

export default function CaseLawPage() {
  const { error, isDemo, loading, refresh, snapshot } = useRepublic();
  if (!snapshot) return <main className="case-law-shell"><header className="topbar guide-topbar"><Link className="brand" href="/"><span className="brand-seal"><BrandMark /></span><span><b>LOOPHOLE</b><small>Autonomous republic</small></span></Link></header><section className="case-law-empty"><h1>Public case law</h1><p>{error || "Reading the accepted registry…"}</p><button className="secondary-button" onClick={() => void refresh(true)} type="button" disabled={loading}>{loading ? "Reading…" : "Refresh"}</button></section></main>;

  const lawsById = new Map(snapshot.lawHistory.map((law) => [law.law_id, law]));
  const groups = [...new Set(snapshot.holdings.map((holding) => holding.law_id))].sort((a, b) => a - b)
    .map((lawId) => ({ law: lawsById.get(lawId), lawId, holdings: snapshot.holdings.filter((holding) => holding.law_id === lawId) }));

  return <main className="case-law-shell">
    <div className="ambient-grid" aria-hidden="true" />
    <header className="topbar guide-topbar">
      <Link className="brand" href="/" aria-label="Loophole chamber"><span className="brand-seal"><BrandMark /></span><span><b>LOOPHOLE</b><small>Autonomous republic</small></span></Link>
      <nav aria-label="Case law navigation"><Link href="/">Chamber</Link><Link className="active" href="/case-law" aria-current="page">Case law</Link><Link href="/how-to-play">How to play</Link></nav>
      <span className={`network-mode ${isDemo ? "demo" : "live"}`}><i />{isDemo ? "Demonstration records" : "Read-only accepted state"}</span>
    </header>

    <section className="case-law-hero" aria-labelledby="case-law-title">
      <span className="eyebrow">Public registry · No wallet needed</span>
      <h1 id="case-law-title">Rules remembered.<br />Evidence preserved.</h1>
      <p>Every holding applies to one law version, one action type, and one computed target class. Quotes show the exact words validators relied on.</p>
      {error ? <p className="status-banner">Showing the latest accepted records. {error}</p> : null}
    </section>

    <section className="registry-metrics" aria-label="Case law totals">
      <article><span>Holdings</span><strong>{snapshot.registry?.holding_count ?? snapshot.holdings.length}</strong></article>
      <article><span>Safe harbors</span><strong>{snapshot.registry?.safe_harbor_count ?? snapshot.holdings.filter((holding) => holding.label === "NOT_COVERED").length}</strong></article>
      <article><span>Breaches</span><strong>{snapshot.registry?.breach_count ?? snapshot.holdings.filter((holding) => holding.label === "COVERED_BREACH").length}</strong></article>
      <article><span>Compliant</span><strong>{snapshot.registry?.compliant_count ?? snapshot.holdings.filter((holding) => holding.label === "COVERED_COMPLIANT").length}</strong></article>
    </section>

    <div className="case-law-groups">
      {groups.map(({ law, lawId, holdings }) => {
        const successor = snapshot.lawHistory.find((candidate) => candidate.parent_law_id === lawId && candidate.law_kind === "AMENDMENT");
        return <section className="case-law-group" key={lawId} aria-labelledby={`law-${lawId}`}>
          <header><div><span className="eyebrow">Law version #{lawId}</span><h2 id={`law-${lawId}`}>{law?.title ?? "Retained law version"}</h2></div><span>{law?.status ?? "Historical"}</span></header>
          {law ? <p className="case-law-source">{law.text}</p> : <p className="case-law-source">The original text is no longer retained by the Republic contract. Each holding still preserves its key and quote.</p>}
          {successor ? <p className="superseded-notice">Loophole closed by law #{successor.law_id} (round {successor.effective_from_round}).</p> : null}
          <div className="holdings-table" role="list" aria-label={`Holdings for law ${lawId}`}>
            {holdings.map((holding) => {
              const segments = highlightQuote(law?.text ?? "", holding.quote);
              const quoteFound = segments.some((segment) => segment.highlighted);
              const keyParts = holding.key.split("|");
              const origin = snapshot.cases.find((item) => item.case_id === holding.case_id);
              const summaryCases = snapshot.cases.filter((item) => item.status === "SUMMARY" && item.holding_case_id === holding.case_id);
              return <details className="holding-row" id={`holding-case-${holding.case_id}`} key={`${holding.key}-${holding.case_id}`}>
                <summary><span className="holding-key"><b>{keyParts[1] ?? holding.action_type}</b><i>{keyParts[2] ?? holding.target_class}</i></span>
                  <span className={`holding-label holding-${holding.label.toLowerCase()}`}>{holding.label === "NOT_COVERED" ? "SAFE HARBOR" : holding.label.replaceAll("_", " ")}</span>
                  <span>Case #{holding.case_id}</span><span className="holding-quote">“{holding.quote || "No quote"}”</span></summary>
                <div className="case-law-detail">
                  {law ? <p>{segments.map((segment, index) => segment.highlighted ? <mark key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>)}
                    {!quoteFound ? <strong className="quote-warning">Quoted text is not present in the retained law text; showing the plain text.</strong> : null}</p>
                    : <p>{holding.quote ? <mark>{holding.quote}</mark> : "No quote was recorded for this label."}</p>}
                  <div className="holding-meta"><span>Label <b>{holding.label}</b></span><span>Key <code>{holding.key}</code></span><span>Recorded {new Date(holding.recorded_at * 1000).toISOString()}</span>
                    <span>Ruling digest <code>{holding.ruling_digest}</code></span><span>Originating case #{holding.case_id}{origin ? ` · ${origin.case_reference} · ${origin.status}` : " · outside the retained docket window"}</span></div>
                  {summaryCases.length ? <div className="summary-case-links"><strong>Summary cases citing this holding</strong>{summaryCases.map((item) => <a href={`#holding-case-${holding.case_id}`} key={item.case_id}>Case #{item.case_id} · {item.case_reference}</a>)}</div> : null}
                  <Link href="/" className="secondary-button">Open the docket</Link>
                </div>
              </details>;
            })}
          </div>
        </section>;
      })}
      {!groups.length ? <p className="empty-state">No public holdings are recorded yet.</p> : null}
    </div>

    <footer className="app-footer guide-footer"><span>Case law registry · read-only accepted state</span><Link href="/how-to-play">How this works</Link><Link href="/">Back to the republic</Link></footer>
  </main>;
}
