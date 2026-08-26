import crypto from 'node:crypto';

function b64(v){return Buffer.from(v).toString('base64url')}
function sign(payload, secret){
  const body=b64(JSON.stringify(payload));
  const sig=crypto.createHmac('sha256',secret).update(body).digest('base64url');
  return body+'.'+sig;
}
function safeEqual(a,b){
  const aa=Buffer.from(String(a)); const bb=Buffer.from(String(b));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}

export default async function handler(req, res) {
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','content-type,authorization');return res.status(204).end()}
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const {email,password}=req.body||{};
  const adminEmail=(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
  const adminPassword=process.env.ADMIN_PASSWORD||'';
  const secret=process.env.JWT_SECRET||'';
  if(!adminEmail || !adminPassword) return res.status(503).json({error:'Admin login is not configured. Add ADMIN_EMAIL and ADMIN_PASSWORD in Vercel Environment Variables.'});
  if(!secret) return res.status(503).json({error:'JWT_SECRET is not configured in Vercel Environment Variables.'});
  if(String(email||'').trim().toLowerCase()!==adminEmail || !safeEqual(String(password||''),adminPassword)) return res.status(401).json({error:'Invalid Admin Login ID or password'});
  const now=Math.floor(Date.now()/1000);
  const token=sign({sub:adminEmail,role:'ADMIN',iat:now,exp:now+12*60*60},secret);
  return res.status(200).json({ok:true,token,user:{email:adminEmail,name:process.env.ADMIN_NAME||'Administrator',designation:'ADMIN',role:'ADMIN',hq:process.env.ADMIN_HQ||'Nagpur',team:process.env.ADMIN_TEAM||'Nagpur Region'}});
}
