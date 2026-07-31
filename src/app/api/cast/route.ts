/** GET /api/cast — the cast table, for rendering author names/roles in the UI. */

import { NextResponse } from "next/server";
import { loadCastForResolution } from "@/server/deps";

export async function GET() {
  return NextResponse.json({ cast: loadCastForResolution() });
}
