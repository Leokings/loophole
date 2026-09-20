import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export default function NotFound() {
  return (
    <main className="fatal-state">
      <span className="brand-seal"><BrandMark /></span>
      <p className="eyebrow">Outside the charter</p>
      <h1>This chamber does not exist.</h1>
      <Link className="primary-button" href="/">Return to the republic</Link>
    </main>
  );
}
