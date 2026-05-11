// src/lab-diagnostics.ts
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
var MAX_DETAIL_JSON_BYTES = 4e3;
var MAX_DETAIL_DEPTH = 6;
var MAX_DETAIL_KEYS = 50;
var MAX_DETAIL_ARRAY_ITEMS = 50;
var MAX_DETAIL_STRING = 1e3;
var REDACTED = "[redacted]";
var TOKENISH = /\b(token|secret|password|authorization|cookie|api[-_]?key)\s*[:=]\s*([^\s&"'<>]+)/gi;
var JSON_SECRET = /(["']?(?:token|secret|password|authorization|cookie|api[-_]?key)["']?\s*:\s*)["'][^"']+["']/gi;
var BEARER_SECRET = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
var COOKIE_SECRET = /\b((?:set-)?cookie)\s*:\s*[^\n;]+/gi;
var QUERY_SECRET = /([?&](?:token|secret|password|authorization|cookie|api[-_]?key)=)[^&#\s"'<>]+/gi;
var USER_PATH = /\/Users\/[^/\s"'<>]+/g;
var SENSITIVE_VALUE_KEYS = /* @__PURE__ */ new Set([
  "bodyTextPreview",
  "textPreview",
  "snippet",
  "html",
  "value"
]);
var SENSITIVE_KEY_FRAGMENT = /(token|secret|password|authorization|cookie|api[-_]?key)/i;
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function tokenEquals(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function pickString(value, max) {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : void 0;
}
function makeJsonSafe(value, depth = 0, seen = /* @__PURE__ */ new WeakSet()) {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, MAX_DETAIL_STRING);
  if (typeof value === "number" || typeof value === "boolean") {
    return Number.isFinite(value) || typeof value === "boolean" ? value : String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return void 0;
  if (depth >= MAX_DETAIL_DEPTH) return "[truncated]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, MAX_DETAIL_ARRAY_ITEMS).map((item) => makeJsonSafe(item, depth + 1, seen));
  }
  const out = {};
  for (const [key, child] of Object.entries(value).slice(0, MAX_DETAIL_KEYS)) {
    const safe = makeJsonSafe(child, depth + 1, seen);
    if (safe !== void 0) out[key.slice(0, 120)] = safe;
  }
  return out;
}
function sanitizeDetail(value) {
  if (!value || typeof value !== "object") return void 0;
  const safe = makeJsonSafe(value);
  if (!safe || typeof safe !== "object" || Array.isArray(safe)) return void 0;
  try {
    const json = JSON.stringify(safe);
    const clipped = json.length > MAX_DETAIL_JSON_BYTES ? json.slice(0, MAX_DETAIL_JSON_BYTES) : json;
    return JSON.parse(clipped);
  } catch {
    try {
      return JSON.parse(JSON.stringify({ truncated: true }));
    } catch {
      return void 0;
    }
  }
}
function sanitizeRecord(record) {
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
    detail: sanitizeDetail(record.detail)
  };
}
function sanitizeEnvelope(envelope) {
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
    harnessConvergence: sanitizeDetail(envelope.harnessConvergence)
  };
}
function redactString(value) {
  return value.replace(JSON_SECRET, `$1"${REDACTED}"`).replace(BEARER_SECRET, `Bearer ${REDACTED}`).replace(COOKIE_SECRET, `$1: ${REDACTED}`).replace(QUERY_SECRET, `$1${REDACTED}`).replace(TOKENISH, `$1=${REDACTED}`).replace(USER_PATH, "/Users/[redacted]");
}
function sanitizeDiagnosticsValue(key, value, allowFullDom) {
  if (key === "fullDom" && !allowFullDom) return void 0;
  if (SENSITIVE_KEY_FRAGMENT.test(key)) return REDACTED;
  if (typeof value === "string") {
    if (SENSITIVE_VALUE_KEYS.has(key)) return REDACTED;
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDiagnosticsValue("", item, allowFullDom)).filter((item) => item !== void 0);
  }
  if (value && typeof value === "object") {
    const sanitized = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const next = sanitizeDiagnosticsValue(childKey, childValue, allowFullDom);
      if (next !== void 0) sanitized[childKey] = next;
    }
    return sanitized;
  }
  return value;
}
function sanitizeDiagnosticsSnapshot(snapshot, allowFullDom) {
  return sanitizeDiagnosticsValue("", snapshot, allowFullDom);
}
function createLabDiagnosticsStore({
  runId,
  token,
  allowFullDom = false,
  maxSnapshots = 50,
  maxRecords = 1e3,
  now = Date.now
}) {
  const activeRunId = runId ?? "";
  const explicitToken = token?.trim();
  const secret = explicitToken && explicitToken.length > 0 ? explicitToken : randomBytes(24).toString("hex");
  const snapshotLimit = Math.max(1, Math.floor(maxSnapshots));
  const recordLimit = Math.max(1, Math.floor(maxRecords));
  const paneSnapshots = [];
  const records = [];
  const applyDiagnostics = [];
  function enabled() {
    return Boolean(activeRunId && secret);
  }
  function accepts(candidateRunId, candidateToken) {
    return activeRunId === candidateRunId && typeof candidateToken === "string" && tokenEquals(candidateToken, secret);
  }
  function latestPaneSnapshot(requestedRunId, options = {}) {
    const newest = [...paneSnapshots].reverse().find((entry) => entry.snapshot.runId === requestedRunId);
    const latestSnapshot = newest?.snapshot ? sanitizeDiagnosticsSnapshot(newest.snapshot, Boolean(options.includeFullDom)) : null;
    if (!options.includeFullDom && latestSnapshot) delete latestSnapshot.fullDom;
    return {
      runId: requestedRunId,
      stale: newest ? now() - Date.parse(newest.receivedAt) > 5e3 : true,
      lastUpdatedAt: newest?.receivedAt,
      lastSequence: newest?.snapshot.sequence,
      latest: latestSnapshot
    };
  }
  function snapshot() {
    return {
      runId: activeRunId,
      traceRecords: records.map((record) => ({
        ...record,
        detail: record.detail ? { ...record.detail } : void 0
      })),
      applyDiagnostics: applyDiagnostics.map((envelope) => ({
        ...envelope,
        mcpPrep: envelope.mcpPrep ? { ...envelope.mcpPrep } : void 0,
        paneDispatch: envelope.paneDispatch ? { ...envelope.paneDispatch } : void 0,
        paneAttempt: envelope.paneAttempt ? { ...envelope.paneAttempt } : void 0,
        harnessConvergence: envelope.harnessConvergence ? { ...envelope.harnessConvergence } : void 0
      }))
    };
  }
  function combinedSnapshot(requestedRunId, options = {}) {
    return {
      ...latestPaneSnapshot(requestedRunId, options),
      ...snapshot()
    };
  }
  const store = {
    runId: activeRunId,
    token: secret,
    enabled,
    allowFullDom: () => Boolean(allowFullDom),
    tokenPrefixHash: () => secret ? sha256(secret.slice(0, 8)) : void 0,
    ingestPaneSnapshot(registrationId, snapshot2) {
      if (!enabled()) {
        return { ok: false, status: 404, error: "lab diagnostics disabled" };
      }
      if (snapshot2.runId !== activeRunId) {
        return { ok: false, status: 403, error: "runId mismatch" };
      }
      paneSnapshots.push({
        registrationId,
        receivedAt: new Date(now()).toISOString(),
        snapshot: sanitizeDiagnosticsSnapshot(snapshot2, Boolean(allowFullDom))
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
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        status: "mcp-prep-pending"
      });
      applyDiagnostics.push(envelope);
      while (applyDiagnostics.length > recordLimit) applyDiagnostics.shift();
      return { ...envelope };
    },
    updateApplyEnvelope(id, patch) {
      const index = applyDiagnostics.findIndex((envelope) => envelope.applyDiagnosticId === id);
      if (index < 0) return;
      const current = applyDiagnostics[index];
      applyDiagnostics[index] = sanitizeEnvelope({
        ...current,
        ...patch,
        applyDiagnosticId: current.applyDiagnosticId,
        runId: current.runId,
        startedAt: current.startedAt
      });
    },
    accepts
  };
  return store;
}
function createLabDiagnosticsStoreForTests(config) {
  return createLabDiagnosticsStore({ ...config, now: () => Date.now() });
}
function createLabDiagnosticsStoreForTest(options) {
  return createLabDiagnosticsStore(options);
}
export {
  createLabDiagnosticsStore,
  createLabDiagnosticsStoreForTest,
  createLabDiagnosticsStoreForTests
};
//# sourceMappingURL=lab-diagnostics.js.map
