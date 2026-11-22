export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(Object.assign(new Error("Payload too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Expected object");
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error("Invalid JSON object body"), { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

export function requestErrorStatus(err) {
  if (err?.statusCode) return err.statusCode;
  if (
    ["INVALID_CHOICE", "INFEASIBLE_SUBSET"].includes(err?.code) ||
    err?.message === "chosenOptionIds must be an array"
  ) {
    return 400;
  }
  return err?.code === "ALREADY_RESOLVED" ? 409 : 500;
}

export function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}
