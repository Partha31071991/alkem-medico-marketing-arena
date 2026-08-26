const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});

export async function GET(){
  const url=process.env.KV_REST_API_URL||process.env.STORAGE_KV_REST_API_URL||"";
  const token=process.env.KV_REST_API_TOKEN||process.env.STORAGE_KV_REST_API_TOKEN||"";
  const admin=!!(process.env.ADMIN_EMAIL&&process.env.ADMIN_PASSWORD&&process.env.JWT_SECRET);
  if(!url||!token){
    return json({ok:false,database:false,admin_configured:admin,error:"Database variables are missing: KV_REST_API_URL and KV_REST_API_TOKEN."},500);
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),3500);
  try{
    const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},body:JSON.stringify(["PING"]),signal:controller.signal});
    const text=await r.text();
    let d={};try{d=JSON.parse(text)}catch{d={result:text}};
    if(!r.ok||d.error) throw new Error(d.error||`Upstash returned HTTP ${r.status}`);
    return json({ok:true,database:true,admin_configured:admin,upstash:"PONG"});
  }catch(e){
    if(e?.name==="AbortError") return json({ok:false,database:false,admin_configured:admin,error:"Upstash did not respond within 3.5 seconds."},503);
    return json({ok:false,database:false,admin_configured:admin,error:String(e?.message||e)},503);
  }finally{clearTimeout(timer)}
}
