import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export interface LabDiagnosticsConfig {
  runId?: string;
  token?: string;
  allowFullDom?: boolean;
  maxSnapshots?: number;
  maxRecords?: number;
  now?: () => number;
}

export interface LabTraceRecord {
  id: string;
  kind: string;
  phase: string;
  at: string;
  runId?: string;
  sessionUri?: string;
  rpcRequestId?: string;
  applyAttemptId?: string;
  code?: string;
  detail?: Record<string, unknown>;
}

export interface RunApplyDiagnosticEnvelope {
  applyDiagnosticId: string;
  runId: string;
  sessionUri?: string;
  startedAt: string;
  endedAt?: string;
  status: string;
  mcpPrep?: Record<string, unknown>;
  paneDispatch?: Record<string, unknown>;
  paneAttempt?: Record<string, unknown>;
  harnessConvergence?: Record<string, unknown>;
}

export interface PaneDevToolsDiagnosticsSnapshot {
  protocolVersion?: number;
  kind?: string;
  runId?: string;
  sessionUri?: string;
  capturedAt?: string;
  sequence?: number;
  fullDom?: unknown;
  [key: string]: unknown;
}

export interface LabDiagnosticsSnapshot {
  runId: string;
  traceRecords: LabTraceRecord[];
  applyDiagnostics: RunApplyDiagnosticEnvelope[];
}

export interface LabPaneSnapshotState {
  runId: string;
  stale: boolean;
  lastUpdatedAt?: string;
  lastSequence?: number;
  latest: PaneDevToolsDiagnosticsSnapshot | null;
}

export type LabCombinedDiagnosticsSnapshot = LabDiagnosticsSnapshot & LabPaneSnapshotState;

export interface LabDiagnosticsStore {
  readonly runId: string;
  readonly token: string;
  enabled(): boolean;
  allowFullDom(): boolean;
  tokenPrefixHash(): string | undefined;
  ingestPaneSnapshot(
    registrationId: string,
    snapshot: PaneDevToolsDiagnosticsSnapshot
  ): { ok: true } | { ok: false; status: number; error: string };
  latestPaneSnapshot(runId: string, options?: { includeFullDom?: boolean }): LabPaneSnapshotState;
  combinedSnapshot(runId: string, options?: { includeFullDom?: boolean }): LabCombinedDiagnosticsSnapshot;
  recordTrace(record: LabTraceRecord): void;
  createApplyEnvelope(input: { sessionUri?: string }): RunApplyDiagnosticEnvelope;
  updateApplyEnvelope(id: string, patch: Partial<RunApplyDiagnosticEnvelope>): void;
  snapshot(): LabDiagnosticsSnapshot;
  accepts(runId: string | undefined, token: string | undefined): boolean;
}

const MAX_DETAIL_JSON_BYTES = 4_000;
const MAX_DETAIL_DEPTH = 6;
const MAX_DETAIL_KEYS = 50;
const MAX_DETAIL_ARRAY_ITEMS = 50;
const MAX_DETAIL_STRING = 1_000;

const REDACTED = "[redacted]";
const TOKENISH = /\b(token|secret|password|authorization|cookie|api[-_]?key)\s*[:=]\s*([^\s&"'<>]+)/gi;
const JSON_SECRET = /(["']?(?:token|secret|password|authorization|cookie|api[-_]?key)["']?\s*:\s*)["'][^"']+["']/gi;
const BEARER_SECRET = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const COOKIE_SECRET = /\b((?:set-)?cookie)\s*:\s*[^\n;]+/gi;
const QUERY_SECRET = /([?&](?:token|secret|password|authorization|cookie|api[-_]?key)=)[^&#\s"'<>]+/gi;
const USER_PATH = /\/Users\/[^/\s"'<>]+/g;
const SENSITIVE_VALUE_KEYS = new Set([
  "bodyTextPreview",
  "textPreview",
  "snippet",
  "html",
  "value",
]);
const SENSITIVE_KEY_FRAGMENT = /(token|secret|password|authorization|cookie|api[-_]?key)/i;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function tokenEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function pickString(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length > 0
    ? value.slice(0, max)
    : undefined;
}

function makeJsonSafe(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, MAX_DETAIL_STRING);
  if (typeof value === "number" || typeof value === "boolean") {
    return Number.isFinite(value as number) || typeof value === "boolean" ? value : String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return undefined;
  if (depth >= MAX_DETAIL_DEPTH) return "[truncated]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_DETAIL_ARRAY_ITEMS)
      .map((item) => makeJsonSafe(item, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value).slice(0, MAX_DETAIL_KEYS)) {
    const safe = makeJsonSafe(child, depth + 1, seen);
    if (safe !== undefined) out[key.slice(0, 120)] = safe;
  }
  return out;
}

function sanitizeDetail(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const safe = makeJsonSafe(value);
  if (!safe || typeof safe !== "object" || Array.isArray(safe)) return undefined;
  try {
    const json = JSON.stringify(safe);
    const clipped = json.length > MAX_DETAIL_JSON_BYTES ? json.slice(0, MAX_DETAIL_JSON_BYTES) : json;
    return JSON.parse(clipped) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(JSON.stringify({ truncated: true })) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
}

function sanitizeRecord(record: LabTraceRecord): LabTraceRecord {
  return {
    id: String(record.id).slice(0, 120),
    kind: String(record.kind).slice(0, 60),
    phase: String(record.phase).slice(0, 120),
    at: String(record.at).slice(0, 100),
    runId: pickString(record.runId, 200),
    sessionUri: pickString(record.sessionUri, 300),
    rpcRequestId: pickString(record.rpcRequestId, 120),
    applyAttemptId: pickString(record.applyAttemptId, 120),
    code: pickString(record.code, 120),
    detail: sanitizeDetail(record.detail),
  };
}

function sanitizeEnvelope(envelope: RunApplyDiagnosticEnvelope): RunApplyDiagnosticEnvelope {
  return {
    applyDiagnosticId: String(envelope.applyDiagnosticId).slice(0, 120),
    runId: String(envelope.runId).slice(0, 200),
    sessionUri: pickString(envelope.sessionUri, 300),
    startedAt: String(envelope.startedAt).slice(0, 100),
    endedAt: pickString(envelope.endedAt, 100),
    status: String(envelope.status).slice(0, 120),
    mcpPrep: sanitizeDetail(envelope.mcpPrep),
    paneDispatch: sanitizeDetail(envelope.paneDispatch),
    paneAttempt: sanitizeDetail(envelope.paneAttempt),
    harnessConvergence: sanitizeDetail(envelope.harnessConvergence),
  };
}

function redactString(value: string): string {
  return value
    .replace(JSON_SECRET, `$1"${REDACTED}"`)
    .replace(BEARER_SECRET, `Bearer ${REDACTED}`)
    .replace(COOKIE_SECRET, `$1: ${REDACTED}`)
    .replace(QUERY_SECRET, `$1${REDACTED}`)
    .replace(TOKENISH, `$1=${REDACTED}`)
    .replace(USER_PATH, "/Users/[redacted]");
}

function sanitizeDiagnosticsValue(key: string, value: unknown, allowFullDom: boolean): unknown {
  if (key === "fullDom" && !allowFullDom) return undefined;
  if (SENSITIVE_KEY_FRAGMENT.test(key)) return REDACTED;
  if (typeof value === "string") {
    if (SENSITIVE_VALUE_KEYS.has(key)) return REDACTED;
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeDiagnosticsValue("", item, allowFullDom))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      const next = sanitizeDiagnosticsValue(childKey, childValue, allowFullDom);
      if (next !== undefined) sanitized[childKey] = next;
    }
    return sanitized;
  }
  return value;
}

function sanitizeDiagnosticsSnapshot(
  snapshot: PaneDevToolsDiagnosticsSnapshot,
  allowFullDom: boolean
): PaneDevToolsDiagnosticsSnapshot {
  return sanitizeDiagnosticsValue("", snapshot, allowFullDom) as PaneDevToolsDiagnosticsSnapshot;
}

export function createLabDiagnosticsStore({
  runId,
  token,
  allowFullDom = false,
  maxSnapshots = 50,
  maxRecords = 1000,
  now = Date.now,
}: LabDiagnosticsConfig): LabDiagnosticsStore {
  const activeRunId = runId ?? "";
  const explicitToken = token?.trim();
  const secret = explicitToken && explicitToken.length > 0 ? explicitToken : randomBytes(24).toString("hex");
  const snapshotLimit = Math.max(1, Math.floor(maxSnapshots));
  const recordLimit = Math.max(1, Math.floor(maxRecords));
  const paneSnapshots: Array<{
    registrationId: string;
    receivedAt: string;
    snapshot: PaneDevToolsDiagnosticsSnapshot;
  }> = [];
  const records: LabTraceRecord[] = [];
  const applyDiagnostics: RunApplyDiagnosticEnvelope[] = [];

  function enabled(): boolean {
    return Boolean(activeRunId && secret);
  }

  function accepts(candidateRunId: string | undefined, candidateToken: string | undefined): boolean {
    return activeRunId === candidateRunId && typeof candidateToken === "string" && tokenEquals(candidateToken, secret);
  }

  function latestPaneSnapshot(requestedRunId: string, options: { includeFullDom?: boolean } = {}): LabPaneSnapshotState {
    const newest = [...paneSnapshots]
      .reverse()
      .find((entry) => entry.snapshot.runId === requestedRunId);
    const latestSnapshot = newest?.snapshot
      ? sanitizeDiagnosticsSnapshot(newest.snapshot, Boolean(options.includeFullDom))
      : null;
    if (!options.includeFullDom && latestSnapshot) delete latestSnapshot.fullDom;
    return {
      runId: requestedRunId,
      stale: newest ? now() - Date.parse(newest.receivedAt) > 5_000 : true,
      lastUpdatedAt: newest?.receivedAt,
      lastSequence: newest?.snapshot.sequence,
      latest: latestSnapshot,
    };
  }

  function snapshot(): LabDiagnosticsSnapshot {
    return {
      runId: activeRunId,
      traceRecords: records.map((record) => ({
        ...record,
        detail: record.detail ? { ...record.detail } : undefined,
      })),
      applyDiagnostics: applyDiagnostics.map((envelope) => ({
        ...envelope,
        mcpPrep: envelope.mcpPrep ? { ...envelope.mcpPrep } : undefined,
        paneDispatch: envelope.paneDispatch ? { ...envelope.paneDispatch } : undefined,
        paneAttempt: envelope.paneAttempt ? { ...envelope.paneAttempt } : undefined,
        harnessConvergence: envelope.harnessConvergence ? { ...envelope.harnessConvergence } : undefined,
      })),
    };
  }

  function combinedSnapshot(requestedRunId: string, options: { includeFullDom?: boolean } = {}): LabCombinedDiagnosticsSnapshot {
    return {
      ...latestPaneSnapshot(requestedRunId, options),
      ...snapshot(),
    };
  }

  const store: LabDiagnosticsStore = {
    runId: activeRunId,
    token: secret,
    enabled,
    allowFullDom: () => Boolean(allowFullDom),
    tokenPrefixHash: () => (secret ? sha256(secret.slice(0, 8)) : undefined),
    ingestPaneSnapshot(registrationId, snapshot) {
      if (!enabled()) {
        return { ok: false, status: 404, error: "lab diagnostics disabled" };
      }
      if (snapshot.runId !== activeRunId) {
        return { ok: false, status: 403, error: "runId mismatch" };
      }
      paneSnapshots.push({
        registrationId,
        receivedAt: new Date(now()).toISOString(),
        snapshot: sanitizeDiagnosticsSnapshot(snapshot, Boolean(allowFullDom)),
      });
      if (paneSnapshots.length > snapshotLimit) {
        paneSnapshots.splice(0, paneSnapshots.length - snapshotLimit);
      }
      return { ok: true };
    },
    latestPaneSnapshot,
    combinedSnapshot,
    snapshot,
    recordTrace(record) {
      records.push(sanitizeRecord(record));
      while (records.length > recordLimit) records.shift();
    },
    createApplyEnvelope(input) {
      const envelope = sanitizeEnvelope({
        applyDiagnosticId: randomUUID(),
        runId: activeRunId,
        sessionUri: input.sessionUri,
        startedAt: new Date().toISOString(),
        status: "mcp-prep-pending",
      });
      applyDiagnostics.push(envelope);
      while (applyDiagnostics.length > recordLimit) applyDiagnostics.shift();
      return { ...envelope };
    },
    updateApplyEnvelope(id, patch) {
      const index = applyDiagnostics.findIndex((envelope) => envelope.applyDiagnosticId === id);
      if (index < 0) return;
      const current = applyDiagnostics[index]!;
      applyDiagnostics[index] = sanitizeEnvelope({
        ...current,
        ...patch,
        applyDiagnosticId: current.applyDiagnosticId,
        runId: current.runId,
        startedAt: current.startedAt,
      });
    },
    accepts,
  };

  return store;
}

export function createLabDiagnosticsStoreForTests(
  config: Required<Pick<LabDiagnosticsConfig, "runId" | "token" | "allowFullDom">>
): LabDiagnosticsStore {
  return createLabDiagnosticsStore({ ...config, now: () => Date.now() });
}

export function createLabDiagnosticsStoreForTest(options: {
  runId: string;
  token?: string;
  maxRecords?: number;
}): LabDiagnosticsStore {
  return createLabDiagnosticsStore(options);
}
