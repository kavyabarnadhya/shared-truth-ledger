/**
 * POST /api/ledger/resolve — record a manual resolution for a bucket (Part
 * D): "Mark as resolved" lets a user record which position won and by whom
 * for a bucket the deterministic pre-rules (R1-R8) didn't settle on their
 * own — mirrors api/ledger/suppress exactly, same LedgerStore, same
 * re-raise-on-change persistence pattern (see core/ledger.ts's
 * isResolved/resolveBucket). This does not touch verdict computation — a
 * resolution is a human annotation recorded alongside the system's own
 * verdict, not a replacement for it.
 *
 * DELETE /api/ledger/resolve — clear a resolution (un-resolve) by referent key.
 */

import { NextResponse } from "next/server";
import { getLedgerStore } from "@/server/ledger-factory";
import { resolveBucket } from "@/core/ledger";
import { EVAL_AS_OF_DEFAULT } from "@/core/time";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const bucketKey = typeof body.bucket_key === "string" ? body.bucket_key : null;
  const resolvedBy = typeof body.resolvedBy === "string" ? body.resolvedBy : "meera.iyer";
  const winningAsserter = typeof body.winningAsserter === "string" ? body.winningAsserter : null;
  const note = typeof body.note === "string" ? body.note : null;

  if (!bucketKey) {
    return NextResponse.json({ error: "bucket_key is required" }, { status: 400 });
  }

  const store = getLedgerStore();
  const snapshot = await store.read();
  if (!snapshot) {
    return NextResponse.json({ error: "no ledger snapshot yet — build one via POST /api/ledger first" }, { status: 404 });
  }

  const bucket = snapshot.buckets.find((b) => b.referent === bucketKey);
  if (!bucket) {
    return NextResponse.json({ error: `no bucket "${bucketKey}" in the current snapshot` }, { status: 404 });
  }

  const resolution = resolveBucket(bucket, resolvedBy, EVAL_AS_OF_DEFAULT, winningAsserter, note);
  const resolutions = [
    ...snapshot.resolutions.filter((r) => r.bucket_key !== bucketKey),
    resolution,
  ];
  const updated = { ...snapshot, resolutions };
  await store.write(updated);

  return NextResponse.json({ snapshot: updated });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  const bucketKey = typeof body.bucket_key === "string" ? body.bucket_key : null;
  if (!bucketKey) {
    return NextResponse.json({ error: "bucket_key is required" }, { status: 400 });
  }

  const store = getLedgerStore();
  const snapshot = await store.read();
  if (!snapshot) {
    return NextResponse.json({ error: "no ledger snapshot yet" }, { status: 404 });
  }

  const resolutions = snapshot.resolutions.filter((r) => r.bucket_key !== bucketKey);
  const updated = { ...snapshot, resolutions };
  await store.write(updated);

  return NextResponse.json({ snapshot: updated });
}
