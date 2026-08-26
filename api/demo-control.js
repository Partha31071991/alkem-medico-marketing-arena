const crypto = require('crypto');

function b64decode(v){return Buffer.from(v,'base64url').toString('utf8')}
function verify(token,secret){
  const [body,sig]=String(token||'').split('.');
  if(!body||!sig)return null;
  const expected=crypto.createHmac('sha256',secret).update(body).digest('base64url');
  const a=Buffer.from(sig), b=Buffer.from(expected);
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b))return null;
  const p=JSON.parse(b64decode(body));
  if(p.role!=='ADMIN' || p.exp<Date.now()/1000) return null;
  return p;
}
function redis(){
  const url=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL||process.env.KV_URL||'';
  const token=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN||'';
  if(!url||!token)throw new Error('Upstash REST variables are missing');
  return {url,token};
}
async function command(args){
  const {url,token}=redis();
  const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
  const text=await r.text();
  if(!r.ok)throw new Error(`Database request failed (${r.status})`);
  let d;try{d=JSON.parse(text)}catch{d={result:text}};
  return d.result;
}
module.exports=async(req,res)=>{
  try{
    if(req.method==='GET'){
      const result=await command(['GET','alkem:demo_mode']);
      return res.status(200).json({enabled:String(result||'0')==='1'});
    }
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
    const auth=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
    const secret=process.env.JWT_SECRET||'';
    if(!secret)return res.status(503).json({error:'JWT_SECRET is not configured'});
    if(!verify(auth||req.body?.token,secret))return res.status(401).json({error:'Admin authentication required'});
    const enabled=!!req.body?.enabled;
    await command(['SET','alkem:demo_mode',enabled?'1':'0']);
    return res.status(200).json({ok:true,enabled});
  }catch(e){return res.status(500).json({error:e.message||'Demo control unavailable'});}
};
