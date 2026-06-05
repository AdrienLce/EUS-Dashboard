import { d as defineEventHandler, r as readBody, c as createError } from '../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:crypto';
import 'stream';
import 'events';
import 'http';
import 'crypto';
import 'buffer';
import 'zlib';
import 'https';
import 'net';
import 'tls';
import 'url';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'anymatch';
import 'node:url';

const cache = /* @__PURE__ */ new Map();
function getCached(url) {
  const entry = cache.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(url);
    return null;
  }
  return entry.data;
}
function setCached(url, data, ttlSeconds) {
  if (ttlSeconds <= 0) return;
  cache.set(url, { data, expiresAt: Date.now() + ttlSeconds * 1e3 });
}
const proxy_post = defineEventHandler(async (event) => {
  var _a, _b, _c, _d, _e;
  const req = await readBody(event);
  if (!(req == null ? void 0 : req.url)) throw createError({ statusCode: 400, message: "URL manquante" });
  try {
    const url = new URL(req.url);
    const h = url.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h.startsWith("192.168.") || h.startsWith("10.")) {
      throw createError({ statusCode: 403, message: "Acc\xE8s r\xE9seau priv\xE9 interdit" });
    }
  } catch (e) {
    if (e.statusCode) throw e;
    throw createError({ statusCode: 400, message: "URL invalide" });
  }
  const isGet = ((_a = req.method) != null ? _a : "GET") === "GET";
  const ttl = (_b = req.cacheTtl) != null ? _b : 120;
  if (isGet && !req.forceRefresh) {
    const cached = getCached(req.url);
    if (cached !== null) return cached;
  }
  const fetchOptions = {
    method: (_c = req.method) != null ? _c : "GET",
    headers: {
      "Accept": "application/json",
      "User-Agent": "StatusDashboard/1.0",
      ...(_d = req.headers) != null ? _d : {}
    }
  };
  if (req.method === "POST" && req.body) {
    fetchOptions.body = req.body;
    fetchOptions.headers["Content-Type"] = "application/json";
  }
  const response = await fetch(req.url, fetchOptions);
  if (!response.ok) {
    throw createError({
      statusCode: response.status,
      message: `Erreur HTTP ${response.status} depuis ${req.url}`
    });
  }
  const contentType = (_e = response.headers.get("content-type")) != null ? _e : "";
  const data = contentType.includes("application/json") ? await response.json() : { _raw: await response.text() };
  if (isGet) setCached(req.url, data, ttl);
  return data;
});

export { proxy_post as default };
//# sourceMappingURL=proxy.post.mjs.map
