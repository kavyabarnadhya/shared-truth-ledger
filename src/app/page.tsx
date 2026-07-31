"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OverviewSummary } from "@/components/OverviewSummary";
import type { LedgerSnapshot, EvalReport, GoldClaim } from "@/core/types";

interface LedgerApiResponse {
  snapshot: LedgerSnapshot | null;
}

interface GoldClaimsFile {
  claims: GoldClaim[];
}

const CONTRADICTION_VERDICTS = new Set(["CONTRADICTION", "CONTESTED", "AMBIGUOUS_REFERENT"]);

/**
 * Overview / landing screen. First screen a reviewer sees — states what
 * Quorum is before they have to infer it from a bare table, then backs that
 * up with live numbers pulled from the same /api/ledger the Signals tab
 * uses, plus the same in-browser eval suite the Evals tab uses for the
 * headline false-positive/recall figures. No placeholder numbers.
 */
export default function OverviewPage() {
  const [bucketsTracked, setBucketsTracked] = useState<number | null>(null);
  const [openContradictions, setOpenContradictions] = useState<number | null>(null);
  const [falsePositiveRate, setFalsePositiveRate] = useState<string | null>(null);
  const [contradictionRecall, setContradictionRecall] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLedger() {
      try {
        const res = await fetch("/api/ledger", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ judgeScope: "binary" }),
        });
        if (!res.ok) throw new Error(`ledger request failed (${res.status})`);
        const json = (await res.json()) as LedgerApiResponse;
        if (cancelled || !json.snapshot) return;
        const suppressedKeys = new Set(json.snapshot.suppressions.map((s) => s.bucket_key));
        const open = json.snapshot.verdicts.filter(
          (v) => CONTRADICTION_VERDICTS.has(v.verdict) && !suppressedKeys.has(v.bucket_key),
        );
        setBucketsTracked(json.snapshot.buckets.length);
        setOpenContradictions(open.length);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }

    async function loadEvalHeadline() {
      try {
        const [{ runEval }, { RECORDINGS }, { MESSAGES, CAST }, { getConfig }, { InMemoryRecordingStore }, goldClaimsModule] =
          await Promise.all([
            import("@/core/eval/run-eval"),
            import("../../fixtures/recorded.generated"),
            import("@/corpus/bundled.generated"),
            import("@/core/model/config"),
            import("@/core/model/client"),
            import("../../evals/gold-claims.json") as Promise<{ default: GoldClaimsFile }>,
          ]);
        const recordings = new InMemoryRecordingStore(Object.values(RECORDINGS));
        const result: EvalReport = await runEval({
          corpus: MESSAGES,
          cast: CAST,
          gold: { claims: goldClaimsModule.default.claims },
          recordings,
          config: getConfig("free"),
          judgeScope: "binary",
        });
        if (cancelled) return;
        const fp = result.headline.falsePositiveRate;
        const recall = result.headline.contradictionRecall;
        setFalsePositiveRate(`${fp.flagged}/${fp.mustNotFlagTotal}`);
        setContradictionRecall(`${recall.found}/${recall.total}`);
      } catch (err) {
        if (!cancelled) setError((prev) => prev ?? (err instanceof Error ? err.message : String(err)));
      }
    }

    loadLedger();
    loadEvalHeadline();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page">
      <h1 className="page-title">Quorum</h1>
      <p className="page-subtitle">
        Quorum watches Tamarind Games&apos; Slack and Gmail, extracts claims — who asserted what, about which
        referent, when — into a persistent ledger, and surfaces when two live claims about the same thing
        contradict each other. Everything below runs in replay mode: no live model key needed to review it.
      </p>

      {error && <div className="banner banner--warn">{error}</div>}

      <OverviewSummary
        stats={{ bucketsTracked, openContradictions, falsePositiveRate, contradictionRecall }}
      />

      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-3)" }}>
        <Link href="/contradictions">View signals →</Link>
        <Link href="/evals">Run the evals →</Link>
        <Link href="/architecture">See the pipeline →</Link>
        <Link href="/deck">View deck →</Link>
      </div>
    </main>
  );
}
