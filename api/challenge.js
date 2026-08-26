// V23 Boxing Challenge API for Vercel + Upstash Redis.
// This file is additive: it does not replace your working login API.
const crypto = require("crypto");

function env(name) {
  return process.env[name] || "";
}

async function redis(command) {
  const url = env("KV_REST_API_URL") || env("UPSTASH_REDIS_REST_URL");
  const token = env("KV_REST_API_TOKEN") || env("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) throw new Error("Upstash Redis environment variables are not configured");
  const r = await fetch(url, {
    method: "POST",
    headers: {"Authorization": `Bearer ${token}`, "Content-Type": "application/json"},
    body: JSON.stringify(command)
  });
  if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
  return r.json();
}

function json(res, status, body) {
  res.status(status).setHeader("Content-Type","application/json").send(JSON.stringify(body));
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const action = req.query?.action || "get";
      if (action === "get") {
        const id = String(req.query?.id || "");
        if (!id) return json(res,400,{error:"Missing challenge id"});
        const out = await redis(["GET",`arena:challenge:${id}`]);
        if (!out.result) return json(res,404,{error:"Challenge not found"});
        return json(res,200,JSON.parse(out.result));
      }
      if (action === "inbox") {
        const email = String(req.query?.email || "").toLowerCase();
        if (!email) return json(res,400,{error:"Missing email"});
        const ids = await redis(["LRANGE",`arena:inbox:${email}`,0,19]);
        const list = Array.isArray(ids.result) ? ids.result : [];
        const items=[];
        for (const id of list) {
          const row=await redis(["GET",`arena:challenge:${id}`]);
          if (row.result) {
            const c=JSON.parse(row.result);
            if (c.status==="pending") items.push(c);
          }
        }
        return json(res,200,{items});
      }
      return json(res,400,{error:"Unknown action"});
    }

    if (req.method !== "POST") return json(res,405,{error:"Method not allowed"});
    const body = typeof req.body === "string" ? JSON.parse(req.body||"{}") : (req.body||{});
    const action = body.action;

    if (action === "create") {
      const toEmail = String(body.toEmail||"").trim().toLowerCase();
      const fromEmail = String(body.fromEmail||"").trim().toLowerCase();
      if (!toEmail || !fromEmail) return json(res,400,{error:"fromEmail and toEmail are required"});
      const id = crypto.randomBytes(9).toString("base64url");
      const now = new Date().toISOString();
      const challenge={
        id,game:"boxing",type:body.type==="team"?"team":"online",
        fromEmail,fromName:String(body.fromName||"Player"),
        toEmail,toName:String(body.toName||"Teammate"),
        questions:10,status:"pending",createdAt:now,expiresAt:new Date(Date.now()+86400000).toISOString()
      };
      await redis(["SET",`arena:challenge:${id}`,JSON.stringify(challenge),"EX",86400]);
      await redis(["LPUSH",`arena:inbox:${toEmail}`,id]);
      return json(res,201,{ok:true,id,challenge});
    }

    if (action === "accept") {
      const id=String(body.id||"");
      const row=await redis(["GET",`arena:challenge:${id}`]);
      if (!row.result) return json(res,404,{error:"Challenge not found"});
      const c=JSON.parse(row.result);
      if (c.toEmail !== String(body.email||"").toLowerCase()) return json(res,403,{error:"This invitation is for another player"});
      c.status="accepted"; c.acceptedAt=new Date().toISOString();
      await redis(["SET",`arena:challenge:${id}`,JSON.stringify(c),"EX",86400]);
      return json(res,200,{ok:true,challenge:c});
    }

    if (action === "submit") {
      const id=String(body.id||"");
      const row=await redis(["GET",`arena:challenge:${id}`]);
      if (!row.result) return json(res,404,{error:"Challenge not found"});
      const c=JSON.parse(row.result);
      const email=String(body.email||"").toLowerCase();
      if (![c.fromEmail,c.toEmail].includes(email)) return json(res,403,{error:"Not a participant"});
      c.scores=c.scores||{};
      c.scores[email]={punches:Math.max(0,Math.min(10,Number(body.punches||0))),submittedAt:new Date().toISOString()};
      if (Object.keys(c.scores).length>=2) c.status="completed";
      await redis(["SET",`arena:challenge:${id}`,JSON.stringify(c),"EX",86400]);
      return json(res,200,{ok:true,challenge:c});
    }

    return json(res,400,{error:"Unknown action"});
  } catch (e) {
    return json(res,500,{error:e.message||"Challenge service error"});
  }
};
