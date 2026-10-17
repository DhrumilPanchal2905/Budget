import Link from "next/link";
import type { Metadata } from "next";
import { PublicShell, Prose } from "@/components/public-shell";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/about");

export default function AboutPage() {
  return (
    <PublicShell crumbs={[{ name: "Home", path: "/" }, { name: "About", path: "/about" }]}>
      <Prose>
        <h1>About Budget Pro</h1>
        <p>
          Budget Pro is built by <strong>Dhrumil Panchal</strong> with one idea: managing money should feel like talking to a smart friend — in the language you think in. Most finance apps
          are English-only and show numbers without meaning. Budget Pro shows the numbers <em>and</em> explains them.
        </p>
        <h2>What makes it different</h2>
        <ul>
          <li>Its own AI, Angel, that understands Hindi, Gujarati, English and Hinglish — no third-party AI.</li>
          <li>Accuracy first: every rupee is stored as integer paise and summed in the database, so totals always match.</li>
          <li>Honest goals and budgets: you see early when something is off track, with the exact fix.</li>
          <li>Privacy and security by default — no bank login, encrypted traffic, your data is never sold.</li>
        </ul>
        <p>
          <Link href="/register">Start for free</Link> or explore the <Link href="/tools">free calculators</Link>.
        </p>
      </Prose>
    </PublicShell>
  );
}
