"use client";

import { BrandMark } from "@/components/brand-mark";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="fatal-state">
      <span className="brand-seal"><BrandMark /></span>
      <p className="eyebrow">The record fractured</p>
      <h1>The chamber could not be rendered.</h1>
      <p>The republic remains onchain. Retry the interface without changing accepted state.</p>
      <button className="primary-button" type="button" onClick={reset}>Reopen the chamber</button>
    </main>
  );
}
