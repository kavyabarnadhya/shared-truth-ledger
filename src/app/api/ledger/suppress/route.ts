/**
 * POST /api/ledger/suppress — dismiss a contradiction bucket (C3). Persists
 * a Suppression capturing the live claim set at dismissal time, so the
 * bucket re-raises automatically the moment that set changes (see
 * core/ledger.ts's isSuppressed/dismissBucket).
 *
 * DELETE /api/ledger/suppress — restore (un-dismiss) a bucket by referent key.
 */

import { NextResponse } from "next/server";
import { getLedgerStore } from "@/server/ledger-factory";
import { dismissBucket } from "@/core/ledger";
import { EVAL_AS_OF_DEFAULT } from "@/core/time";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const bucketKey = typeof body.bucket_key === "string" ? body.bucket_key : null;
  const dismissedBy = typeof body.dismissedBy === "string" ? body.dismissedBy : "meera.iyer";
  const reason = typeof body.reason === "string" ? body.reason : null;

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

  const suppression = dismissBucket(bucket, dismissedBy, EVAL_AS_OF_DEFAULT, reason);
  const suppressions = [
    ...snapshot.suppressions.filter((s) => s.bucket_key !== bucketKey),
    suppression,
  ];
  const updated = { ...snapshot, suppressions };
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

  const suppressions = snapshot.suppressions.filter((s) => s.bucket_key !== bucketKey);
  const updated = { ...snapshot, suppressions };
  await store.write(updated);

  return NextResponse.json({ snapshot: updated });
}
