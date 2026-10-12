const secret = String(process.env.APP_SESSION_SECRET || "");
if (!secret) throw new Error("APP_SESSION_SECRET is missing");

const response = await fetch(
  "http://127.0.0.1:3000/api/internal/reconcile-paid",
  {
    method: "POST",
    headers: { "x-reconcile-secret": secret },
    signal: AbortSignal.timeout(55_000),
  },
);
const text = await response.text();
if (!response.ok && response.status !== 207) {
  throw new Error(
    `Reconciliation HTTP ${response.status}: ${text.slice(0, 500)}`,
  );
}
const payload = JSON.parse(text);
process.stdout.write(
  `${JSON.stringify({
    checkedPlates: Number(payload.checkedPlates || 0),
    restoredCount: Array.isArray(payload.restoredPlates)
      ? payload.restoredPlates.length
      : 0,
    deferredCount: Array.isArray(payload.deferredFineIds)
      ? payload.deferredFineIds.length
      : 0,
    failedCount: Array.isArray(payload.failedPlates)
      ? payload.failedPlates.length
      : 0,
  })}\n`,
);
