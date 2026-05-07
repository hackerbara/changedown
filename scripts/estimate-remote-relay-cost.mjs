#!/usr/bin/env node

/**
 * Estimate Cloudflare Worker + Durable Object costs for the hosted ChangeDown
 * remote relay.
 *
 * This is intentionally a small, twiddleable model rather than a billing oracle.
 * Edit `SHARED_ASSUMPTIONS` and `SCENARIOS` below, then run:
 *
 *   node scripts/estimate-remote-relay-cost.mjs
 *   node scripts/estimate-remote-relay-cost.mjs --json
 *
 * Pricing sources checked 2026-05-07:
 * - Workers Paid / Standard: https://developers.cloudflare.com/workers/platform/pricing/
 * - Durable Objects: https://developers.cloudflare.com/durable-objects/platform/pricing/
 *
 * Important model boundaries:
 * - The relay does not persist 40-page document bodies in Durable Object storage;
 *   document payload size mostly affects Worker/DO CPU and response bytes.
 * - Current `/tools/*` calls are compact backend-wire calls:
 *     external HTTP request -> DO /rpc -> pane WebSocket request -> pane
 *     WebSocket response -> external HTTP response.
 *   So each tool call is modeled as one Worker request, one DO HTTP request,
 *   and one incoming pane WebSocket message. A future oldL2/newL2 source-
 *   transition write path would need a separate higher request-payload model.
 * - Hibernating WebSockets avoid billing the whole socket-open wall-clock time
 *   as DO duration. The model reports both hibernating and "no hibernation"
 *   duration so the cost cliff is visible.
 * - Cloudflare's account-level paid-plan minimum is modeled as $5/month. If the
 *   account is already paying that minimum for other products, the incremental
 *   bill is closer to the "over included allowance" line.
 */

const SHARED_ASSUMPTIONS = {
  rooms: 5,
  activeHoursPerRoomPerDay: 20,
  daysPerMonth: 30,
  gbPerDurableObjectInstance: 0.125, // Cloudflare bills DO duration at 128 MB.

  // Room lifecycle / front-room behavior. One claim + pane connection at start,
  // one release at end, with a small number of reconnects during the day.
  claimReleasePairsPerRoomPerDay: 1,
  paneReconnectsPerRoomPerDay: 2,

  // DO storage is lease + idempotency bookkeeping, not document storage.
  rowsReadPerReadTool: 1,
  rowsWrittenPerReadTool: 0,
  rowsReadPerWriteTool: 2,
  // Successful mutating calls write an idempotency marker when started and
  // again when completed/failed.
  rowsWrittenPerWriteTool: 2,
  rowsReadPerStatusOrLifecycleCall: 1,
  // Public claim + pane connect + explicit release; approximate because deletes
  // and metadata writes are implementation/backend dependent.
  rowsWrittenPerClaimReleasePair: 5,
  avgStoredBytesPerActiveRoom: 100 * 1024,
};

const PRICING = {
  workers: {
    paidPlanMinimumUsd: 5,
    includedRequestsPerMonth: 10_000_000,
    requestOverageUsdPerMillion: 0.30,
    includedCpuMsPerMonth: 30_000_000,
    cpuOverageUsdPerMillionMs: 0.02,
  },
  durableObjects: {
    includedRequestsPerMonth: 1_000_000,
    requestOverageUsdPerMillion: 0.15,
    includedGbSecondsPerMonth: 400_000,
    durationOverageUsdPerMillionGbSeconds: 12.50,
    includedSqlRowsReadPerMonth: 25_000_000_000,
    sqlRowsReadOverageUsdPerMillion: 0.001,
    includedSqlRowsWrittenPerMonth: 50_000_000,
    sqlRowsWrittenOverageUsdPerMillion: 1.00,
    includedSqlStoredGbMonth: 5,
    sqlStoredOverageUsdPerGbMonth: 0.20,
  },
};

const SCENARIOS = {
  baseline: {
    description: 'Steady normal alpha usage: a few agent reads/writes per room-hour.',
    readToolsPerRoomHour: 6,
    writeToolsPerRoomHour: 2,
    statusChecksPerRoomHour: 12,
    incomingPaneMessagesPerRead: 1,
    incomingPaneMessagesPerWrite: 1,
    // Current target shape sends the tracked text once in MCP `content`.
    // Local 86-90 KB stress fixtures therefore imply ~0.09 MB before envelope
    // overhead; this stays intentionally conservative for larger Word docs.
    readResponseMb: 0.25,
    writeResponseMb: 0.02,
    statusResponseMb: 0.01,
    workerCpuMsPerRequest: 4,
    doActiveMsPerReadTool: 35,
    doActiveMsPerWriteTool: 60,
    doActiveMsPerStatusOrLifecycleCall: 8,
  },
  conservative: {
    description: 'Busy real use: frequent reads, several writes, once-per-minute status.',
    readToolsPerRoomHour: 20,
    writeToolsPerRoomHour: 6,
    statusChecksPerRoomHour: 60,
    incomingPaneMessagesPerRead: 1,
    incomingPaneMessagesPerWrite: 1,
    readResponseMb: 0.75,
    writeResponseMb: 0.1,
    statusResponseMb: 0.01,
    workerCpuMsPerRequest: 8,
    doActiveMsPerReadTool: 80,
    doActiveMsPerWriteTool: 150,
    doActiveMsPerStatusOrLifecycleCall: 10,
  },
  aggressive: {
    description: 'Heavy hammering: giant-doc reads every 30s plus many writes.',
    readToolsPerRoomHour: 120,
    writeToolsPerRoomHour: 30,
    statusChecksPerRoomHour: 120,
    incomingPaneMessagesPerRead: 1,
    incomingPaneMessagesPerWrite: 1,
    readResponseMb: 1.5,
    writeResponseMb: 0.5,
    statusResponseMb: 0.02,
    workerCpuMsPerRequest: 15,
    doActiveMsPerReadTool: 250,
    doActiveMsPerWriteTool: 500,
    doActiveMsPerStatusOrLifecycleCall: 15,
  },
};

function overage(value, included) {
  return Math.max(0, value - included);
}

function usd(value) {
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`;
}

function million(value) {
  return value / 1_000_000;
}

function estimateScenario(name, scenario, shared = SHARED_ASSUMPTIONS) {
  const roomHoursPerMonth = shared.rooms * shared.activeHoursPerRoomPerDay * shared.daysPerMonth;
  const roomDaysPerMonth = shared.rooms * shared.daysPerMonth;

  const readTools = scenario.readToolsPerRoomHour * roomHoursPerMonth;
  const writeTools = scenario.writeToolsPerRoomHour * roomHoursPerMonth;
  const statusChecks = scenario.statusChecksPerRoomHour * roomHoursPerMonth;
  const claimReleasePairs = shared.claimReleasePairsPerRoomPerDay * roomDaysPerMonth;
  const paneReconnects = shared.paneReconnectsPerRoomPerDay * roomDaysPerMonth;

  const lifecycleHttpRequests = claimReleasePairs * 2;
  const paneWebSocketConnections = claimReleasePairs + paneReconnects;
  const toolHttpRequests = readTools + writeTools;
  const workerRequests = toolHttpRequests + statusChecks + lifecycleHttpRequests + paneWebSocketConnections;

  const incomingPaneMessages = (readTools * scenario.incomingPaneMessagesPerRead) + (writeTools * scenario.incomingPaneMessagesPerWrite);
  const durableObjectHttpRequests = toolHttpRequests + statusChecks + lifecycleHttpRequests + paneWebSocketConnections;
  const durableObjectBilledWebSocketMessageRequests = incomingPaneMessages / 20;
  const durableObjectRequests = durableObjectHttpRequests + durableObjectBilledWebSocketMessageRequests;

  const workerCpuMs = workerRequests * scenario.workerCpuMsPerRequest;

  const doActiveSeconds =
    (readTools * scenario.doActiveMsPerReadTool
      + writeTools * scenario.doActiveMsPerWriteTool
      + (statusChecks + lifecycleHttpRequests + paneWebSocketConnections) * scenario.doActiveMsPerStatusOrLifecycleCall
      + incomingPaneMessages * scenario.doActiveMsPerStatusOrLifecycleCall) / 1000;
  const doGbSecondsHibernating = doActiveSeconds * shared.gbPerDurableObjectInstance;

  const socketOpenSeconds = shared.rooms * shared.activeHoursPerRoomPerDay * 3600 * shared.daysPerMonth;
  const doGbSecondsIfSocketsPreventHibernation = socketOpenSeconds * shared.gbPerDurableObjectInstance;

  const sqlRowsRead =
    readTools * shared.rowsReadPerReadTool
      + writeTools * shared.rowsReadPerWriteTool
      + (statusChecks + lifecycleHttpRequests + paneWebSocketConnections) * shared.rowsReadPerStatusOrLifecycleCall;
  const sqlRowsWritten =
    readTools * shared.rowsWrittenPerReadTool
      + writeTools * shared.rowsWrittenPerWriteTool
      + claimReleasePairs * shared.rowsWrittenPerClaimReleasePair;
  const sqlStoredGbMonth = (shared.rooms * shared.avgStoredBytesPerActiveRoom) / (1024 ** 3);

  const responseGb =
    (readTools * scenario.readResponseMb
      + writeTools * scenario.writeResponseMb
      + statusChecks * scenario.statusResponseMb) / 1024;

  const usageRateCost = {
    workerRequests: million(workerRequests) * PRICING.workers.requestOverageUsdPerMillion,
    workerCpu: million(workerCpuMs) * PRICING.workers.cpuOverageUsdPerMillionMs,
    doRequests: million(durableObjectRequests) * PRICING.durableObjects.requestOverageUsdPerMillion,
    doDurationHibernating: million(doGbSecondsHibernating) * PRICING.durableObjects.durationOverageUsdPerMillionGbSeconds,
    doDurationNoHibernation: million(doGbSecondsIfSocketsPreventHibernation) * PRICING.durableObjects.durationOverageUsdPerMillionGbSeconds,
    sqlRowsRead: million(sqlRowsRead) * PRICING.durableObjects.sqlRowsReadOverageUsdPerMillion,
    sqlRowsWritten: million(sqlRowsWritten) * PRICING.durableObjects.sqlRowsWrittenOverageUsdPerMillion,
    sqlStorage: overage(sqlStoredGbMonth, 0) * PRICING.durableObjects.sqlStoredOverageUsdPerGbMonth,
  };

  const overIncludedCost = {
    workerRequests: million(overage(workerRequests, PRICING.workers.includedRequestsPerMonth)) * PRICING.workers.requestOverageUsdPerMillion,
    workerCpu: million(overage(workerCpuMs, PRICING.workers.includedCpuMsPerMonth)) * PRICING.workers.cpuOverageUsdPerMillionMs,
    doRequests: million(overage(durableObjectRequests, PRICING.durableObjects.includedRequestsPerMonth)) * PRICING.durableObjects.requestOverageUsdPerMillion,
    doDurationHibernating: million(overage(doGbSecondsHibernating, PRICING.durableObjects.includedGbSecondsPerMonth)) * PRICING.durableObjects.durationOverageUsdPerMillionGbSeconds,
    doDurationNoHibernation: million(overage(doGbSecondsIfSocketsPreventHibernation, PRICING.durableObjects.includedGbSecondsPerMonth)) * PRICING.durableObjects.durationOverageUsdPerMillionGbSeconds,
    sqlRowsRead: million(overage(sqlRowsRead, PRICING.durableObjects.includedSqlRowsReadPerMonth)) * PRICING.durableObjects.sqlRowsReadOverageUsdPerMillion,
    sqlRowsWritten: million(overage(sqlRowsWritten, PRICING.durableObjects.includedSqlRowsWrittenPerMonth)) * PRICING.durableObjects.sqlRowsWrittenOverageUsdPerMillion,
    sqlStorage: overage(sqlStoredGbMonth, PRICING.durableObjects.includedSqlStoredGbMonth) * PRICING.durableObjects.sqlStoredOverageUsdPerGbMonth,
  };

  const sum = (object) => Object.values(object).reduce((total, value) => total + value, 0);

  return {
    name,
    description: scenario.description,
    assumptions: {
      rooms: shared.rooms,
      activeHoursPerRoomPerDay: shared.activeHoursPerRoomPerDay,
      daysPerMonth: shared.daysPerMonth,
      roomHoursPerMonth,
      readToolsPerRoomHour: scenario.readToolsPerRoomHour,
      writeToolsPerRoomHour: scenario.writeToolsPerRoomHour,
      statusChecksPerRoomHour: scenario.statusChecksPerRoomHour,
      readResponseMb: scenario.readResponseMb,
      workerCpuMsPerRequest: scenario.workerCpuMsPerRequest,
    },
    usage: {
      readTools,
      writeTools,
      statusChecks,
      workerRequests,
      workerCpuMs,
      durableObjectRequests,
      durableObjectHttpRequests,
      incomingPaneMessages,
      doGbSecondsHibernating,
      doGbSecondsIfSocketsPreventHibernation,
      sqlRowsRead,
      sqlRowsWritten,
      sqlStoredGbMonth,
      responseGb,
    },
    usageRateCost,
    overIncludedCost,
    totals: {
      usageRateHibernating: sum({ ...usageRateCost, doDurationNoHibernation: 0 }),
      usageRateNoHibernation: sum({ ...usageRateCost, doDurationHibernating: 0 }),
      overIncludedHibernating: sum({ ...overIncludedCost, doDurationNoHibernation: 0 }),
      overIncludedNoHibernation: sum({ ...overIncludedCost, doDurationHibernating: 0 }),
      accountPaidPlanMinimum: PRICING.workers.paidPlanMinimumUsd,
    },
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value < 10 ? 2 : 0,
  }).format(value);
}

function printTable(estimates) {
  console.log('ChangeDown hosted remote relay cost model');
  console.log('===========================================');
  console.log(`Shared shape: ${SHARED_ASSUMPTIONS.rooms} rooms, ${SHARED_ASSUMPTIONS.activeHoursPerRoomPerDay} active h/day, ${SHARED_ASSUMPTIONS.daysPerMonth} days/month`);
  console.log('Rates: Workers Standard + SQLite-backed Durable Objects, checked 2026-05-07.');
  console.log('');

  for (const estimate of estimates) {
    const { assumptions, usage, totals } = estimate;
    console.log(`${estimate.name.toUpperCase()}: ${estimate.description}`);
    console.log(`  Inputs: ${assumptions.readToolsPerRoomHour} reads/h/room, ${assumptions.writeToolsPerRoomHour} writes/h/room, ${assumptions.statusChecksPerRoomHour} status/h/room, ${assumptions.readResponseMb} MB/read`);
    console.log(`  Monthly usage: ${formatNumber(usage.workerRequests)} Worker req, ${formatNumber(usage.durableObjectRequests)} DO billed req, ${formatNumber(usage.workerCpuMs)} Worker CPU-ms`);
    console.log(`  Heavy-doc bytes: ~${formatNumber(usage.responseGb)} GB responses/month (egress not separately charged by Workers pricing; CPU is modeled)`);
    console.log(`  DO duration: ${formatNumber(usage.doGbSecondsHibernating)} GB-s hibernating vs ${formatNumber(usage.doGbSecondsIfSocketsPreventHibernation)} GB-s if sockets kept rooms hot`);
    console.log(`  DO storage rows: ${formatNumber(usage.sqlRowsRead)} read, ${formatNumber(usage.sqlRowsWritten)} written; stored data ~${usage.sqlStoredGbMonth.toFixed(4)} GB-month`);
    console.log(`  Usage-rate cost before included allowances: ${usd(totals.usageRateHibernating)} hibernating / ${usd(totals.usageRateNoHibernation)} no-hibernation`);
    console.log(`  Incremental over included allowances: ${usd(totals.overIncludedHibernating)} hibernating / ${usd(totals.overIncludedNoHibernation)} no-hibernation`);
    console.log(`  Account-level paid-plan floor if not already paid elsewhere: ${usd(totals.accountPaidPlanMinimum)}/month`);
    console.log('');
  }
}

const estimates = Object.entries(SCENARIOS).map(([name, scenario]) => estimateScenario(name, scenario));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ pricing: PRICING, sharedAssumptions: SHARED_ASSUMPTIONS, scenarios: estimates }, null, 2));
} else {
  printTable(estimates);
}
