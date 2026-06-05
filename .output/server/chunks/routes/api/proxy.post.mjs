import { d as defineEventHandler, r as readBody, c as createError } from '../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import 'node:url';

const proxy_post = defineEventHandler(async (event) => {
  var _a, _b, _c;
  const req = await readBody(event);
  if (!(req == null ? void 0 : req.url)) {
    throw createError({ statusCode: 400, message: "URL manquante" });
  }
  try {
    const url = new URL(req.url);
    const hostname = url.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname.startsWith("192.168.") || hostname.startsWith("10.")) {
      throw createError({ statusCode: 403, message: "Acc\xE8s r\xE9seau priv\xE9 interdit" });
    }
  } catch (e) {
    if (e.statusCode) throw e;
    throw createError({ statusCode: 400, message: "URL invalide" });
  }
  const fetchOptions = {
    method: (_a = req.method) != null ? _a : "GET",
    headers: {
      "Accept": "application/json",
      "User-Agent": "StatusDashboard/1.0",
      ...(_b = req.headers) != null ? _b : {}
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
  const contentType = (_c = response.headers.get("content-type")) != null ? _c : "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }
  return { _raw: await response.text() };
});

export { proxy_post as default };
//# sourceMappingURL=proxy.post.mjs.map
