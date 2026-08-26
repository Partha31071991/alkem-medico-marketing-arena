const json = (data, status = 200) => ({ status, data });

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }
  const url = process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL || "";
  const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN || "";
  const admin = !!(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.JWT_SECRET);
  if (!url || !token) {
    const out = json({ ok: false, database: false, admin_configured: admin, error: "Database variables are missing: KV_REST_API_URL and KV_REST_API_TOKEN." }, 500);
    res.statusCode = out.status; res.setHeader("content-type", "application/json"); return res.end(JSON.stringify(out.data));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(["PING"]),
      signal: controller.signal
    });
    const text = await r.text();
    let d = {}; try { d = JSON.parse(text); } catch { d = { result: text }; }
    if (!r.ok || d.error) throw new Error(d.error || `Upstash returned HTTP ${r.status}`);
    const out = json({ ok: true, database: true, admin_configured: admin, upstash: "PONG" });
    res.statusCode = out.status; res.setHeader("content-type", "application/json"); res.setHeader("cache-control", "no-store"); return res.end(JSON.stringify(out.data));
  } catch (e) {
    const message = e?.name === "AbortError" ? "Upstash did not respond within 3.5 seconds." : String(e?.message || e);
    const out = json({ ok: false, database: false, admin_configured: admin, error: message }, 503);
    res.statusCode = out.status; res.setHeader("content-type", "application/json"); res.setHeader("cache-control", "no-store"); return res.end(JSON.stringify(out.data));
  } finally { clearTimeout(timer); }
}
