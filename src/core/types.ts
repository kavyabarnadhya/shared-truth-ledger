/**
 * Every shared interface in the pipeline. `src/core/**` compiles against this
 * file; server, UI, and scripts import from it too. See the build plan's
 * "Architectural spine" for why this file has zero non-type dependencies.
 */

import type { Instant } from "./time.ts";

export type { Instant, Clock } from "./time.ts";

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type SourceKind = "slack" | "gmail";

export interface Message {
  id: string; // "M-001"
  source: SourceKind;
  thread_id: string; // "T1"
  channel?: string; // slack only, "#liveops-ludojunction"
  subject?: string; // gmail only
  from?: string; // gmail only
  to?: string[]; // gmail only
  author: string; // handle, "meera.iyer"
  author_name: string;
  author_role: string;
  timestamp: Instant;
  text: string;
  participants: string[];
  is_load_bearing: boolean;
}

export interface Thread {
  thread_id: string;
  source: SourceKind;
  channel?: string;
  subject?: string;
  participants: string[];
  message_ids: string[]; // stable order: ascending timestamp then id
}

export interface CastEntry {
  handle: string;
  name: string;
  role: string;
  is_bot: boolean;
  authority_rank: number; // 0 = bot, 1 = default, 3 = studio head (see prerules R5)
}

export interface MessageQuery {
  query?: string; // substring, case-insensitive, over text
  source?: SourceKind;
  channel?: string;
  subject?: string;
  author?: string;
  since?: Instant;
  until?: Instant;
  limit?: number; // default 50
}

/**
 * The only way anything reads the corpus. Same interface used in-process by
 * the web app and by the MCP server, over the same underlying data.
 */
export interface MessageSource {
  listMessages(): Promise<Message[]>;
  searchMessages(q: MessageQuery): Promise<Message[]>;
  getThread(thread_id: string): Promise<{ thread: Thread; messages: Message[] } | null>;
  getMessage(id: string): Promise<Message | null>;
  listThreads(): Promise<Thread[]>;
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export type Modality = "assertion" | "hedge" | "proposal" | "question" | "reported";
export type Polarity = "positive" | "negative";

export interface Claim {
  claim_id: string; // deterministic: `${message_id}#${ordinal}` e.g. "M-001#0"
  message_id: string;
  referent: string; // canonical key after resolution, e.g. "indep_event.launch_date"
  raw_referent: string; // what the model emitted, pre-resolution
  predicate: "value"; // single predicate in v1; kept for forward-compat
  value: string; // normalised where possible ("2026-08-12"), else verbatim phrase
  raw_value: string; // model's original value string
  asserter: string; // handle
  modality: Modality;
  polarity: Polarity;
  attributed_to: string | null; // set only when modality === "reported"
  timestamp: Instant; // inherited from message, never model-supplied
  source_span: string; // MUST appear verbatim in message.text
  span_valid: boolean; // false => claim is dropped, recorded as rejected
  span_offset: number | null; // index in message.text, null if invalid
  confidence?: number; // optional, model-supplied, never used for scoring
}

export type RejectReason =
  | "span_not_found"
  | "schema_invalid"
  | "unknown_asserter"
  | "empty_referent"
  | "empty_value"
  | "non_claim_modality"; // hedge / proposal / question — dropped by R1b, not a failure

export interface RejectedClaim {
  message_id: string;
  reason: RejectReason;
  detail: string;
  raw: unknown; // the offending model output fragment
}

// ---------------------------------------------------------------------------
// Referent resolution
// ---------------------------------------------------------------------------

export type ReferentResolutionMethod =
  | "exact_key"
  | "alias"
  | "lexical_similarity"
  | "embedding_tiebreak"
  | "new_referent"
  | "ambiguous";

export interface ReferentResolution {
  raw: string; // input phrase
  resolved: string; // canonical key (may be a newly minted key)
  method: ReferentResolutionMethod;
  score: number; // similarity score of the winner, 0..1
  runnerUp: { key: string; score: number } | null;
  band: "confident" | "ambiguous" | "below_threshold";
  embeddingUsed: boolean;
  notes: string[]; // human-readable trace lines for drill-down
}

// ---------------------------------------------------------------------------
// Buckets, claim state, and verdicts
// ---------------------------------------------------------------------------

export type VerdictKind =
  | "CONTRADICTION"
  | "UPDATE"
  | "RESOLVED_BY_SUPERSESSION"
  | "RESOLVED_BY_CORRECTION"
  | "AMBIGUOUS_REFERENT"
  | "COMPATIBLE"
  | "CONTESTED";

export type ClaimState =
  | "live"
  | "superseded"
  | "withdrawn"
  | "excluded_reported"
  | "not_yet_asserted";

export interface BucketClaim {
  claim: Claim;
  state: ClaimState;
  stateReason: string; // "superseded by M-101 (same asserter, later)"
  supersededBy: string | null; // claim_id
}

export interface Bucket {
  referent: string; // canonical key (or "a|b" for cross-referent ambiguity buckets)
  claims: BucketClaim[]; // stable-sorted by (timestamp, claim_id)
  liveClaims: Claim[]; // convenience: state === "live"
  asOf: Instant;
  preRuleTrace: PreRuleFiring[]; // deterministic pre-rules that fired, in order
  preRuleVerdict: VerdictKind | null; // set when a pre-rule fully decided the verdict
  linkedReferents: string[]; // cross-referent linkage, used for AMBIGUOUS_REFERENT (N3)
  contested: boolean; // R8 marker
}

export interface PreRuleFiring {
  rule: string; // "R2_same_asserter_update"
  claimIds: string[];
  effect: string; // "CL-100 -> superseded by CL-101"
  decidesVerdict: VerdictKind | null;
}

export type JudgeScope = "binary" | "full7";

export interface Verdict {
  bucket_key: string; // referent (or "a|b" for cross-referent pairs)
  asOf: Instant;
  judgeScope: JudgeScope;
  verdict: VerdictKind;
  rationale: string; // model rationale, or pre-rule explanation
  decidedBy: "pre_rule" | "model" | "fallback";
  conflictingClaimIds: string[]; // stable-sorted
  preRuleTrace: PreRuleFiring[];
  modelCall: TraceEntry | null; // null when decidedBy === "pre_rule"
  confidence?: number;
}

// ---------------------------------------------------------------------------
// Suppression (C3) and watermark (C4)
// ---------------------------------------------------------------------------

export interface Suppression {
  bucket_key: string;
  asOf: Instant;
  dismissedAt: Instant;
  dismissedBy: string;
  reason: string | null;
  claimIdsAtDismissal: string[]; // re-raise only if the live claim set changes
}

export interface Watermark {
  lastMessageId: string | null; // stable-sorted corpus position
  lastTimestamp: Instant | null;
  processedMessageIds: string[]; // makes re-runs idempotent
  advancedAt: Instant;
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export interface LedgerSnapshot {
  asOf: Instant;
  configId: string; // which ModelConfig produced it
  judgeScope: JudgeScope;
  corpusHash: string;
  buckets: Bucket[]; // stable-sorted by referent
  verdicts: Verdict[]; // stable-sorted by bucket_key
  claims: Claim[];
  rejectedClaims: RejectedClaim[];
  gatedMessageIds: string[]; // noise gate
  trace: TraceEntry[];
  suppressions: Suppression[];
  watermark: Watermark;
  createdAt: Instant; // from Clock, never Date.now
}

export interface LedgerStore {
  read(): Promise<LedgerSnapshot | null>;
  write(s: LedgerSnapshot): Promise<void>;
  clear(): Promise<void>;
  /** For the UI banner: "file (survives restart)" | "memory (does not survive restart)" */
  describe(): { kind: "file" | "memory"; durable: boolean; location: string };
}

// ---------------------------------------------------------------------------
// Model client
// ---------------------------------------------------------------------------

export type ModelTier = "extraction" | "adjudication" | "embedding";
export type RunMode = "replay" | "record" | "live";

export interface ModelConfig {
  id: string; // "free" — used in cache key and eval config labels
  label: string; // "ling-3.0-flash-free (both tiers)"
  models: Record<ModelTier, string>;
  temperature: number;
  maxOutputTokens: number;
  /** Per 1M tokens, for the trace cost column. 0 for free tier -> UI shows "free". */
  pricing: Record<ModelTier, { inPerM: number; outPerM: number }>;
}

export interface ModelRequest {
  tier: ModelTier;
  model: string;
  system: string;
  user: string;
  temperature: number;
  maxOutputTokens: number;
  /** Stable, JSON-serialisable identity of the semantic input (not the rendered prompt). */
  inputKey: unknown;
  /** Label for the trace, e.g. "extract M-001" or "adjudicate indep_event.launch_date@2026-07-15" */
  step: string;
  /** Which vocabulary the adjudicator must use. Irrelevant for extraction/embedding. */
  judgeScope?: JudgeScope;
}

export interface ModelResponse {
  text: string; // raw provider text — this is ALL that is cached
  usage: { inputTokens: number; outputTokens: number };
  embedding?: number[]; // only present for embedding tier
  finishReason: string;
}

export interface ModelClient {
  readonly mode: RunMode;
  readonly config: ModelConfig;
  call(req: ModelRequest): Promise<{ response: ModelResponse; trace: TraceEntry }>;
}

// ---------------------------------------------------------------------------
// Recording cache
// ---------------------------------------------------------------------------

export interface RecordedCall {
  key: string; // the cache key
  tier: ModelTier;
  model: string;
  configId: string;
  judgeScope: JudgeScope | null;
  step: string; // human label, for browsing fixtures
  promptSha: string; // sha256 of system+user, for auditing drift
  request: { system: string; user: string; temperature: number; maxOutputTokens: number };
  response: ModelResponse;
  latencyMs: number; // recorded once; replayed verbatim so traces are deterministic
  recordedAt: Instant;
}

export interface RecordingStore {
  get(key: string): RecordedCall | undefined; // SYNC — browser has them all in memory
  has(key: string): boolean;
  keys(): string[];
  /** Only implemented by the fs-backed store used by scripts/record.ts. */
  put?(call: RecordedCall): Promise<void>;
}

// ---------------------------------------------------------------------------
// Trace
// ---------------------------------------------------------------------------

export interface TraceEntry {
  id: string; // deterministic: `${step}#${seq}`
  step: string; // "noise_gate" | "extract M-001" | "resolve_referents" | "adjudicate X"
  kind: "deterministic" | "model";
  tier: ModelTier | null;
  model: string | null;
  mode: RunMode | "n/a";
  cacheKey: string | null;
  cacheHit: boolean | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number;
  costUsd: number | null; // null when free tier -> UI shows "free"
  ok: boolean;
  error?: string;
  /** For "view prompt" drill-down. */
  promptRef?: { system: string; user: string; schemaText: string };
  detail?: Record<string, unknown>; // e.g. rules fired, claims rejected, repair steps
}

// ---------------------------------------------------------------------------
// Eval
// ---------------------------------------------------------------------------

export type ScenarioId =
  | "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8" | "C9"
  | "N1" | "N2" | "N3" | "N4" | "N5" | "N6" | "N7" | "N8" | "N9" | "N10" | "N11"
  | "N12" | "N13" | "N14" | "N15" | "N16" | "N17" | "N18";

export interface GoldClaim {
  claim_id: string;
  message_id: string;
  referent: string;
  value: string;
  asserter: string;
  modality: Modality;
  polarity: Polarity;
  attributed_to: string | null;
  notes?: string;
}

export interface GoldVerdictRow {
  bucket_key: string;
  claimIds: string[];
  asOf: Instant;
  verdict: VerdictKind;
  scenario: ScenarioId;
  scoredInHeadline: boolean;
}

export interface ExtractionScore {
  scenario: ScenarioId;
  goldClaimIds: string[];
  claimsExpected: number;
  claimsFound: number; // matched gold claims
  claimsSpurious: number; // predicted claims in scenario messages with no gold match
  claimRecall: number;
  claimPrecision: number;
  referentAccuracy: number; // over matched claims
  modalityAccuracy: number; // SEPARATE from recall
  polarityAccuracy: number; // SEPARATE from recall
  spanValidity: number; // fraction of predicted claims with span_valid === true
  spanViolations: string[]; // message ids where span check failed — must be 0
  gatedCorrectly: boolean | null; // N11 only
  perClaim: Array<{
    goldClaimId: string | null;
    predClaimId: string | null;
    matched: boolean;
    referentOk: boolean | null;
    modalityOk: boolean | null;
    polarityOk: boolean | null;
    spanOk: boolean | null;
    note: string;
  }>;
}

export interface AdjudicationScore {
  scenario: ScenarioId;
  buckets: Array<{
    bucket_key: string;
    asOf: Instant;
    expected: VerdictKind;
    actual: VerdictKind;
    correct: boolean;
    falsePositive: boolean; // must-not-flag scenario returned CONTRADICTION
    decidedBy: "pre_rule" | "model" | "fallback";
    rationale: string;
  }>;
  verdictAccuracy: number;
  isMustNotFlag: boolean;
  excludedFromHeadline: boolean; // true only for C9
}

export interface EvalReport {
  schemaVersion: 1;
  configId: string;
  judgeScope: JudgeScope;
  mode: RunMode;
  evalAsOf: Instant; // frozen, echoed on screen
  corpusHash: string;
  recordingsHash: string;
  extraction: ExtractionScore[]; // per scenario, never averaged
  adjudication: AdjudicationScore[]; // per scenario, never averaged
  headline: {
    falsePositiveRate: {
      flagged: number;
      mustNotFlagTotal: number;
      rate: number;
      flaggedScenarios: ScenarioId[];
    };
    contradictionRecall: { found: number; total: 8; scenarios: Record<string, boolean> };
    spanValidity: { valid: number; total: number; rate: number };
  };
  contested: AdjudicationScore[]; // C9, its own section
  counts: { messages: number; gated: number; claims: number; rejected: number; buckets: number };
  generatedAt: Instant;
  reportHash: string;
}

export type EvalResult = EvalReport;

export interface EvalDiffRow {
  scenario: ScenarioId;
  metric: string; // "verdictAccuracy" | "claimRecall" | ...
  baseline: number | string;
  current: number | string;
  delta: number | null;
  direction: "improved" | "regressed" | "unchanged";
}

export interface EvalDiff {
  baselineGeneratedAt: Instant;
  rows: EvalDiffRow[];
  anyRegression: boolean; // ANY single-scenario regression => failure, per the protocol
  summary: string;
}

// ---------------------------------------------------------------------------
// Pipeline dependency bundle
// ---------------------------------------------------------------------------

export interface PipelineDeps {
  source: MessageSource;
  model: ModelClient;
  clock: import("./time.ts").Clock;
  config: ModelConfig;
  judgeScope: JudgeScope;
  /** Optional: embedding recordings; absent => lexical-only tiebreak. */
  embeddings?: { get(text: string): number[] | undefined };
}
