/**
 * Wraps a LiveModelClient with a ReplayModelClient fallback: on 429/5xx/
 * timeout, replay this exact call from the committed recordings instead of
 * failing the request, and mark the trace so the UI can show "fell back to
 * replay (rate limited)" rather than a raw error. This is what makes the
 * hosted deployment's live mode safe to expose to any reviewer without a
 * spend cap incident — the free tier rate-limits per model, and this is the
 * graceful degradation path for that.
 *
 * If the fallback replay ALSO misses (no recording for this exact input —
 * e.g. a reviewer typed genuinely novel sandbox text), the original live
 * error is rethrown rather than swallowed twice; the caller surfaces "no
 * recording for this input, and the live call failed" rather than a
 * confusing double-fallback.
 */

import type { ModelClient, ModelRequest, ModelResponse, RunMode, TraceEntry } from "../core/types.ts";
import { LiveModelCallError } from "./live-client.ts";
import { ReplayMissError } from "../core/model/client.ts";

export class FallbackModelClient implements ModelClient {
  readonly mode: RunMode = "live";
  readonly config;
  private readonly live: ModelClient;
  private readonly replay: ModelClient;

  constructor(live: ModelClient, replay: ModelClient) {
    this.live = live;
    this.replay = replay;
    this.config = live.config;
  }

  async call(req: ModelRequest): Promise<{ response: ModelResponse; trace: TraceEntry }> {
    try {
      return await this.live.call(req);
    } catch (err) {
      const isRateLimited = err instanceof LiveModelCallError && (err.status === 429 || (err.status !== null && err.status >= 500));
      if (!isRateLimited) throw err;

      try {
        const result = await this.replay.call(req);
        return {
          response: result.response,
          trace: {
            ...result.trace,
            mode: "replay",
            detail: { ...result.trace.detail, fallbackFrom: "live", fallbackReason: err.message },
          },
        };
      } catch (replayErr) {
        if (replayErr instanceof ReplayMissError) {
          // Neither live nor a recording worked — surface the ORIGINAL live
          // error, since "the live call was rate-limited" is the actionable
          // fact; "and there's also no recording" is the reason the
          // fallback couldn't help, not a new failure in its own right.
          throw err;
        }
        throw replayErr;
      }
    }
  }
}
