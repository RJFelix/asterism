const seenSignatures = new Map();
const DEDUP_WINDOW_MS = 10_000;

export function reportClientError(payload = {}, bootId = null) {
  try {
    const message = String(payload.message || payload.reason || 'Unknown client runtime error').slice(0, 600);
    const source = String(payload.source || 'window').slice(0, 48);
    const nodeId = payload.nodeId ? String(payload.nodeId) : null;
    const lineno = Number.isFinite(Number(payload.lineno)) ? Number(payload.lineno) : null;
    const sig = `${source}::${nodeId || ''}::${message}::${lineno || ''}`;
    const now = Date.now();
    const lastAt = seenSignatures.get(sig) || 0;
    if (now - lastAt < DEDUP_WINDOW_MS) return;
    seenSignatures.set(sig, now);
    if (seenSignatures.size > 120) {
      const oldestKey = seenSignatures.keys().next().value;
      if (oldestKey) seenSignatures.delete(oldestKey);
    }

    fetch('/api/telemetry/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        source,
        kind: payload.kind || 'error',
        nodeId,
        message,
        filename: payload.filename || null,
        lineno,
        colno: Number.isFinite(Number(payload.colno)) ? Number(payload.colno) : null,
        stack: payload.stack ? String(payload.stack).slice(0, 2000) : null,
        bootId: payload.bootId || bootId || null
      })
    }).catch(() => {});
  } catch {
    // Never throw from error reporter
  }
}

export function installGlobalErrorTelemetry({ getBootId } = {}) {
  window.addEventListener('error', (ev) => {
    const bootId = typeof getBootId === 'function' ? getBootId() : null;
    reportClientError({
      source: 'window',
      kind: 'error',
      message: ev?.message || String(ev?.error || 'Uncaught window error'),
      filename: ev?.filename || null,
      lineno: ev?.lineno || null,
      colno: ev?.colno || null,
      stack: ev?.error?.stack || null
    }, bootId);
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const bootId = typeof getBootId === 'function' ? getBootId() : null;
    const reason = ev?.reason;
    reportClientError({
      source: 'window',
      kind: 'unhandledrejection',
      message: reason instanceof Error ? reason.message : String(reason || 'Unhandled promise rejection'),
      stack: reason instanceof Error ? reason.stack : null
    }, bootId);
  });
}
