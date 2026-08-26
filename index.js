import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const url = process.env.KV_REST_API_URL || process.env.STORAGE_KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_KV_REST_API_TOKEN;
const SECRET = process.env.JWT_SECRET || "";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";


const K = {
  users:"arena:users", products:"arena:products", lbl:"arena:lbl",
  challenges:"arena:challenges", knowledge:"arena:knowledge", profileMaster:"arena:profileMaster", priorities:"arena:priorities", skills:"arena:skills", cricket:"arena:cricket",
  cricketPlayers:"arena:cricketPlayers", store:"arena:store"
};

const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const fail=(m,s=400)=>json({error:m},s);
const redisTimeoutMs=5000;
async function redisCommand(command){
  if(!url||!token) throw Error("Database environment variables are missing. Check KV_REST_API_URL / STORAGE_KV_REST_API_URL and token.");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),redisTimeoutMs);
  try{
    const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},body:JSON.stringify(command),signal:controller.signal});
    const text=await r.text();
    let d={};try{d=JSON.parse(text)}catch{d={result:text}};
    if(!r.ok || d.error) throw Error(d.error||`Upstash REST returned HTTP ${r.status}`);
    return d.result;
  }catch(e){
    if(e?.name==="AbortError") throw Error(`Upstash request timed out after ${redisTimeoutMs/1000}s`);
    throw e;
  }finally{clearTimeout(timer)}
}
function decodeRedis(v){if(v===null||v===undefined)return null;if(typeof v!=="string")return v;try{return JSON.parse(v)}catch{return v}}
async function redisGet(k){return decodeRedis(await redisCommand(["GET",k]))}
async function redisSet(k,v,opts={}){const value=typeof v==="string"?v:JSON.stringify(v);const cmd=["SET",k,value];if(opts?.ex)cmd.push("EX",String(opts.ex));await redisCommand(cmd);return "OK"}
async function body(req){try{return await req.json()}catch{return {}}}
async function arr(k){const v=await redisGet(k);return Array.isArray(v)?v:[]}
async function put(k,v){await redisSet(k,v)}
function pub(u){return {id:u.id,name:u.name,email:u.email,role:u.role,team:u.team||"",xp:u.xp||0,coins:u.coins||0,wins:u.wins||0,battles:u.battles||0,streak:u.streak||0,photo:u.photo||"",badges:u.badges||[],profile:u.profile||{},activity:u.activity||{},last_active_at:u.last_active_at||0,manager_id:u.manager_id||null}}
function sign(u){return jwt.sign({id:u.id,role:u.role},SECRET,{expiresIn:"7d"})}

async function ensureAdmin(){
  if(!ADMIN_EMAIL||!ADMIN_PASSWORD)throw Error("ADMIN_EMAIL and ADMIN_PASSWORD must be configured in Vercel.");
  let users=await arr(K.users);
  // Always ensure the configured Admin account exists. The old version only
  // created Admin when the database was completely empty, so the first Player
  // registration could accidentally prevent the Admin account from being seeded.
  const adminEmail=ADMIN_EMAIL;
  let ai=users.findIndex(u=>String(u.email||"").toLowerCase()===adminEmail);
  if(ai<0){
    const nextId=users.reduce((m,u)=>Math.max(m,Number(u.id)||0),0)+1;
    users.push({id:nextId,name:"Team Admin",email:adminEmail,password_hash:bcrypt.hashSync(ADMIN_PASSWORD,10),
      role:"admin",team:"Team Admin",xp:0,coins:0,wins:0,battles:0,streak:0,photo:"",badges:[],profile:{status:"approved"},activity:{},last_active_at:Date.now()});
    await put(K.users,users);
  }else if(users[ai].role!=="admin"){
    // The configured Admin email is authoritative; convert an accidentally
    // registered account with that exact email into the Admin account.
    users[ai]={...users[ai],name:users[ai].name||"Team Admin",role:"admin",password_hash:bcrypt.hashSync(ADMIN_PASSWORD,10),profile:{...(users[ai].profile||{}),status:"approved"}};
    await put(K.users,users);
  }else{
    // Only write when something actually changed. This keeps Admin login fast
    // and avoids an unnecessary Redis write on every sign-in.
    const current=users[ai];
    const passwordMatches=current.password_hash ? bcrypt.compareSync(ADMIN_PASSWORD,current.password_hash) : false;
    const profile={...(current.profile||{})};
    if(!passwordMatches || current.role!=="admin" || profile.status!=="approved") {
      users[ai]={...current,role:"admin",password_hash:bcrypt.hashSync(ADMIN_PASSWORD,10),profile:{...profile,status:"approved"}};
      await put(K.users,users);
    }
  }
  return true;
}

async function seedCatalog(){
  let products=await arr(K.products);
  if(products.length===0){
    products=[{id:1,name:"GLUCORYL MV",generic_name:"Replace with approved molecule",
      moa:"Replace with approved MOA",differentiators:"Replace with approved differentiators",approved:false}];
    await put(K.products,products);
  }
  let store=await arr(K.store);
  if(store.length===0){
    store=[{id:1,name:"Victory Poster",price:150,type:"poster"},
      {id:2,name:"Funny Poster",price:100,type:"poster"},
      {id:3,name:"Champion Frame",price:400,type:"frame"},
      {id:4,name:"Hint Token",price:100,type:"power"}];
    await put(K.store,store);
  }
}
async function requireUser(req){
  const h=req.headers.get("authorization")||"";
  if(!h.startsWith("Bearer ")) throw Object.assign(new Error("Login required"),{status:401});
  const p=jwt.verify(h.slice(7),SECRET),users=await arr(K.users),u=users.find(x=>x.id===p.id);
  if(!u) throw Object.assign(new Error("User not found"),{status:401});
  return u;
}
async function updateUser(id,fn){
  const users=await arr(K.users),i=users.findIndex(u=>u.id===Number(id));
  if(i<0)throw Error("User not found");
  users[i]=fn(users[i]);await put(K.users,users);return users[i];
}
async function addActivity(id,type,xp=0){
  return updateUser(id,u=>{
    const a={...(u.activity||{})};
    a[type]=(a[type]||0)+1;
    const day=new Date().toISOString().slice(0,10);
    const dailyXpDate=a.daily_xp_date===day?day:"";
    const dailyXp=dailyXpDate?((a.daily_xp||0)+Math.max(0,+xp||0)):Math.max(0,+xp||0);
    return {...u,activity:{...a,daily_xp_date:day,daily_xp:dailyXp},last_active_at:Date.now()};
  });
}

function extractText(output){
  if(!output)return "";
  if(typeof output==="string")return output;
  return (output||[]).filter(x=>x.type==="message").flatMap(x=>x.content||[]).map(c=>c.text||"").join("");
}
function cleanJSON(text){
  const t=(text||"").trim().replace(/^```(?:json)?/i,"").replace(/```$/g,"").trim();
  try{return JSON.parse(t)}catch{const a=t.indexOf("{"),b=t.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(t.slice(a,b+1));throw Error("AI returned an invalid JSON draft")}
}
async function filePart(file){
  if(!file||typeof file.arrayBuffer!=="function")return null;
  const bytes=Buffer.from(await file.arrayBuffer()),mime=file.type||"application/octet-stream";
  if(mime.startsWith("image/"))return {type:"input_image",image_url:`data:${mime};base64,${bytes.toString("base64")}`};
  if(mime==="text/plain"||mime==="text/markdown"||mime==="text/csv")return {type:"input_text",text:`FILE ${file.name}:\n${bytes.toString("utf8")}`};
  return {type:"input_file",filename:file.name,file_data:`data:${mime};base64,${bytes.toString("base64")}`};
}
async function aiGenerate(form){
  const key=process.env.OPENAI_API_KEY;if(!key)throw Object.assign(Error("OPENAI_API_KEY is not configured in Vercel."),{status:500});
  const model=process.env.OPENAI_MODEL||"gpt-5.6-luna",product=String(form.get("productName")||""),extra=String(form.get("extra")||""),research=form.get("research")==="true";
  const content=[{type:"input_text",text:`You are the AI content architect for ALKEM DIABETOLOGY NAGPUR REGION. Product name: ${product}. Extra instructions: ${extra}. Create a medico-marketing learning package ONLY from supplied source material for product-specific medical claims. If drug name or MOA cannot be confidently supported, say NEEDS VERIFICATION rather than guessing. Generate drug_name, moa, differentiators (3-6), 8-12 MCQs, 5-8 flashcards, moa_steps, a 60-90 second educational video storyboard, update_brief, source_notes and confidence. Return strict JSON with keys product_name, drug_name, moa, confidence, differentiators, questions, flashcards, moa_steps, video_script, update_brief, source_notes. Each question: question, options (4), correct_answer, explanation, difficulty. No diagnosis or patient-specific treatment advice.`}];
  for(const f of [form.get("lblFile"),form.get("storyFile")]){const part=await filePart(f);if(part)content.push(part)}
  const payload={model,input:[{role:"user",content}],max_output_tokens:5000};if(research)payload.tools=[{type:"web_search_preview"}];
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},body:JSON.stringify(payload)}),d=await r.json();
  if(!r.ok)throw Error(d.error?.message||"OpenAI request failed");return cleanJSON(d.output_text||extractText(d.output));
}

async function uploadDataUrl(form,key){
 const f=form?.get(key); if(!f||typeof f.arrayBuffer!=="function") return "";
 const bytes=Buffer.from(await f.arrayBuffer()); if(bytes.length>700000) throw Error(`${key} too large; keep uploads under 700 KB`);
 return `data:${f.type||"application/octet-stream"};base64,${bytes.toString("base64")}`;
}

async function handler(req){
  try{
    const u=new URL(req.url);
    const rawPath=u.searchParams.get("path")||u.pathname.replace(/^\/api\/?/,"");
    const parts=rawPath.split("/").filter(Boolean);
    const method=req.method;

    // Health must never depend on seed() or the normal login path.
    // This gives a real diagnostic even when Redis is misconfigured.
    if(parts.length===1&&parts[0]==="health"&&method==="GET"){
      if(!url||!token)return json({ok:false,database:false,error:"Database environment variables are missing. Check KV_REST_API_URL / STORAGE_KV_REST_API_URL and token.",kv_url_configured:!!url,kv_token_configured:!!token,admin_configured:!!(ADMIN_EMAIL&&ADMIN_PASSWORD&&SECRET)},500);
      try{
        await redisCommand(["PING"]);
        const users=await arr(K.users);
        return json({ok:true,database:true,users:users.length,admin_configured:!!(ADMIN_EMAIL&&ADMIN_PASSWORD&&SECRET),kv_url_configured:!!url,kv_token_configured:!!token});
      }catch(e){
        return json({ok:false,database:false,error:String(e?.message||e),admin_configured:!!(ADMIN_EMAIL&&ADMIN_PASSWORD&&SECRET),kv_url_configured:!!url,kv_token_configured:!!token},503);
      }
    }

    if(!url||!token)return fail("Database environment variables are missing. Check KV_REST_API_URL and KV_REST_API_TOKEN in Vercel.",500);
    if(!SECRET)return fail("JWT_SECRET is missing in Vercel Environment Variables.",500);
    let b={},form=null;
    if(method!=="GET"){
      const ct=req.headers.get("content-type")||"";
      if(ct.includes("multipart/form-data")) form=await req.formData();
      else b=await body(req);
    }

    if(parts.length===1&&parts[0]==="register"&&method==="POST"){
      if(!b.name||!b.email||!b.password||String(b.password).length<8)return fail("Name, email and 8+ character password required");
      const users=await arr(K.users),email=String(b.email).toLowerCase();
      if(users.some(x=>x.email===email))return fail("Email already registered",409);
      const id=users.length?Math.max(...users.map(x=>x.id))+1:1;
      const user={id,name:b.name,email,password_hash:bcrypt.hashSync(b.password,10),role:"player",team:b.team||"",
        xp:0,coins:0,wins:0,battles:0,streak:0,photo:"",badges:[]};
      users.push(user);await put(K.users,users);return json({token:sign(user),user:pub(user)});
    }

    if(parts.length===1&&parts[0]==="login"&&method==="POST"){
      const email=String(b.email||"").trim().toLowerCase();
      const password=String(b.password||"");
      if(!email||!password)return fail("Email and password are required",400);
      try{ await ensureAdmin(); }catch(e){ return fail("Admin/database initialization failed: "+String(e?.message||e),503); }
      const users=await arr(K.users),user=users.find(x=>String(x.email||"").toLowerCase()===email);
      if(!user||!bcrypt.compareSync(password,user.password_hash||""))return fail("Invalid credentials",401);
      // Seed non-critical demo catalog only after a successful login.
      try{ await seedCatalog(); }catch(e){ console.error("Catalog seed skipped:",e?.message||e); }
      return json({token:sign(user),user:pub(user)});
    }

    if(parts[0]==="ai"&&parts[1]==="generate"&&method==="POST"){
      const me=await requireUser(req);
      if(me.role!=="admin")return fail("Admin only",403);
      if(!form)return fail("Use multipart/form-data for AI uploads");
      const pack=await aiGenerate(form);
      return json({package:pack});
    }

    const me=await requireUser(req);

    if(parts[0]==="profile-master"&&parts.length===1&&method==="GET"){
      return json((await redisGet(K.profileMaster))||{name:[],hq:[],abm:[],rm:[],region:["Nagpur"]});
    }
    if(parts[0]==="admin"&&parts[1]==="profile-master"&&method==="POST"){
      if(me.role!=="admin")return fail("Admin only",403);
      const m=(await redisGet(K.profileMaster))||{name:[],hq:[],abm:[],rm:[],region:["Nagpur"]};
      const type=String(b.type||""),value=String(b.value||"").trim();
      if(!m[type]||!value)return fail("Invalid profile master value");
      if(!m[type].includes(value))m[type].push(value);
      await redisSet(K.profileMaster,m);return json(m);
    }
    if(parts[0]==="profile"&&parts.length===1&&method==="PUT"){
      const users=await arr(K.users),i=users.findIndex(x=>x.id===me.id);
      if(i<0)return fail("User not found",404);
      users[i].profile={...(users[i].profile||{}),...b,status:"pending"};
      users[i].name=b.name||users[i].name;users[i].team=b.hq||users[i].team;
      await put(K.users,users);return json({profile:users[i].profile});
    }
    if(parts[0]==="priorities"&&parts[1]==="today"&&method==="GET") return json(await arr(K.priorities));
    if(parts[0]==="admin"&&parts[1]==="priority"&&method==="POST"){
      if(me.role!=="admin")return fail("Admin only",403); if(!form)return fail("Use multipart/form-data");
      const a=await arr(K.priorities),id=a.length?Math.max(...a.map(x=>x.id))+1:1;
      const x={id,brand:String(form.get("brand")||""),title:String(form.get("title")||""),message:String(form.get("message")||""),
        link:String(form.get("link")||""),xp:+form.get("xp")||0,logo:await uploadDataUrl(form,"logo"),poster:await uploadDataUrl(form,"poster"),created_at:Date.now()};
      a.unshift(x);await put(K.priorities,a.slice(0,20));return json(x);
    }
    if(parts[0]==="skill"&&parts[1]==="award"&&method==="POST"){
      const xp=Math.max(0,Math.min(200,+b.xp||0));await updateUser(me.id,x=>({...x,xp:x.xp+xp,coins:x.coins+Math.floor(xp/10)}));await addActivity(me.id,"skill",xp);return json({ok:true,xp});
    }
    if(parts[0]==="admin"&&parts[1]==="skill"&&method==="POST"){
      if(me.role!=="admin")return fail("Admin only",403);
      const a=await arr(K.skills),id=a.length?Math.max(...a.map(x=>x.id))+1:1,x={id,...b,created_at:Date.now()};a.push(x);await put(K.skills,a);return json(x);
    }
    if(parts[0]==="admin"&&parts[1]==="profiles"&&method==="GET"){
      if(me.role!=="admin")return fail("Admin only",403);
      const users=await arr(K.users);return json(users.filter(x=>x.role==="player").map(x=>({id:x.id,name:x.name,email:x.email,profile:x.profile||{status:"pending"}})));
    }
    if(parts[0]==="admin"&&parts[1]==="profile"&&parts[2]==="approve"&&method==="POST"){
      if(me.role!=="admin")return fail("Admin only",403);
      const users=await arr(K.users),i=users.findIndex(x=>x.id===+b.id);if(i<0)return fail("Player not found",404);
      users[i].profile={...(users[i].profile||{}),status:"approved"};await put(K.users,users);return json({ok:true});
    }

    if(parts[0]==="admin"&&parts[1]==="abm"&&parts[2]==="promote"&&method==="POST"){
      if(me.role!=="admin")return fail("Admin only",403);
      const users=await arr(K.users),i=users.findIndex(x=>x.id===+b.id);
      if(i<0)return fail("Player not found",404);
      const u=users[i];
      users[i]={...u,role:"abm",manager_id:null,profile:{...(u.profile||{}),status:"approved",managed_hq:String(b.hq||u.profile?.hq||u.team||""),managed_region:String(b.region||u.profile?.region||"Nagpur")}};
      await put(K.users,users);return json({user:pub(users[i])});
    }

    if(parts[0]==="admin"&&parts[1]==="abm"&&parts[2]==="demote"&&method==="POST"){
      if(me.role!=="admin")return fail("Admin only",403);
      const users=await arr(K.users),i=users.findIndex(x=>x.id===+b.id);
      if(i<0)return fail("ABM not found",404);
      users[i].role="player";users[i].profile={...(users[i].profile||{}),managed_hq:"",managed_region:""};
      await put(K.users,users);return json({user:pub(users[i])});
    }

    if(parts[0]==="abm"&&parts[1]==="dashboard"&&method==="GET"){
      if(me.role!=="abm")return fail("ABM access only",403);
      const users=await arr(K.users);
      const team=users.filter(u=>u.role==="player" && (
        u.profile?.abm_id===me.id ||
        String(u.profile?.abm||"").trim().toLowerCase()===String(me.name||"").trim().toLowerCase()
      ));
      const leaderboard=[...team].sort((a,b)=>(b.xp||0)-(a.xp||0)).map((u,i)=>({
        rank:i+1,id:u.id,name:u.name,email:u.email,hq:u.profile?.hq||u.team||"",abm:u.profile?.abm||me.name,
        rm:u.profile?.rm||"",xp:u.xp||0,coins:u.coins||0,wins:u.wins||0,battles:u.battles||0,streak:u.streak||0,
        photo:u.photo||u.profile?.photo||"",status:u.profile?.status||"pending",last_active_at:u.last_active_at||0,
        activity:u.activity||{}
      }));
      const total=team.length,active7=team.filter(u=>u.last_active_at && Date.now()-u.last_active_at<7*86400000).length;
      const xp=team.reduce((n,u)=>n+(u.xp||0),0);
      const participation=team.reduce((n,u)=>n+Object.values(u.activity||{}).reduce((a,v)=>a+(+v||0),0),0);
      const avg=total?Math.round(xp/total):0;
      return json({
        abm:{id:me.id,name:me.name,hq:me.profile?.managed_hq||"",region:me.profile?.managed_region||"Nagpur"},
        metrics:{total,active7,avg_xp:avg,total_xp:xp,participation},
        leaderboard
      });
    }

    if(parts[0]==="abm"&&parts[1]==="team"&&method==="GET"){
      if(me.role!=="abm")return fail("ABM access only",403);
      const users=await arr(K.users);
      return json(users.filter(u=>u.role==="player" && (u.profile?.abm_id===me.id || String(u.profile?.abm||"").toLowerCase()===String(me.name).toLowerCase())).map(pub));
    }


    if(parts[0]==="myday"&&method==="GET"){
      const priorities=await arr(K.priorities);
      const priority=priorities[0]||null;
      const user=pub(me);
      const coach=[];
      if(!priority)coach.push("Admin has not published Today's Priority yet.");
      if((me.streak||0)===0)coach.push("Start your learning streak today.");
      if((me.xp||0)<300)coach.push("Complete one Skill Lab challenge to reach Level 2.");
      if((me.activity?.lbl||0)===0)coach.push("Try the latest LBL challenge.");
      if((me.activity?.battle||0)===0)coach.push("Challenge a teammate for a knowledge battle.");
      return json({user,priority,learn:{title:"5-minute Product Knowledge Sprint"},play:{title:"60-second Fun Zone challenge"},coach});
    }

    if(parts[0]==="admin"&&parts[1]==="hierarchy"&&parts.length===2&&method==="GET"){
      if(me.role!=="admin")return fail("Admin only",403);
      const users=await arr(K.users),byId=Object.fromEntries(users.map(u=>[u.id,u]));
      return json({players:users.filter(u=>u.role==="player").map(u=>({
        id:u.id,name:u.name,hq:u.profile?.hq||u.team||"",abm_name:byId[u.manager_id]?.name||u.profile?.abm||"",
        rm_name:byId[byId[u.manager_id]?.manager_id]?.name||u.profile?.rm||""
      })),abms:users.filter(u=>u.role==="abm").map(u=>({id:u.id,name:u.name,rm_name:byId[u.manager_id]?.name||u.profile?.rm||"",region:u.profile?.managed_region||"Nagpur"}))});
    }

    if(parts[0]==="admin"&&parts[1]==="hierarchy"&&parts[2]==="options"&&method==="GET"){
      if(me.role!=="admin")return fail("Admin only",403);
      const users=await arr(K.users);
      return json({abms:users.filter(u=>u.role==="abm").map(pub),rms:users.filter(u=>u.role==="rm").map(pub)});
    }

    if(parts[0]==="admin"&&parts[1]==="assign-player"&&method==="POST"){
      if(me.role!=="admin")return fail("Admin only",403);
      const users=await arr(K.users),i=users.findIndex(u=>u.id===+b.player_id),m=users.findIndex(u=>u.id===+b.abm_id);
      if(i<0||m<0||users[m].role!=="abm")return fail("Player or ABM not found",404);
      users[i].manager_id=users[m].id;users[i].profile={...(users[i].profile||{}),abm_id:users[m].id,abm:users[m].name};
      await put(K.users,users);return json({ok:true});
    }

    if(parts[0]==="admin"&&parts[1]==="rm"&&parts[2]==="promote"&&method==="POST"){
      if(me.role!=="admin")return fail("Admin only",403);
      const users=await arr(K.users),i=users.findIndex(u=>u.id===+b.id);if(i<0)return fail("User not found",404);
      users[i].role="rm";users[i].profile={...(users[i].profile||{}),status:"approved",managed_region:String(b.region||"Nagpur")};
      await put(K.users,users);return json({user:pub(users[i])});
    }
    if(parts[0]==="admin"&&parts[1]==="rm"&&parts[2]==="demote"&&method==="POST"){
      if(me.role!=="admin")return fail("Admin only",403);
      const users=await arr(K.users),i=users.findIndex(u=>u.id===+b.id);if(i<0)return fail("RM not found",404);
      users[i].role="player";users[i].manager_id=null;users[i].profile={...(users[i].profile||{}),managed_region:"",rm_id:null,rm:""};
      for(const u of users){if(u.role==="abm"&&u.manager_id===+b.id){u.manager_id=null;u.profile={...(u.profile||{}),rm_id:null,rm:""};}}
      await put(K.users,users);return json({user:pub(users[i])});
    }

    if(parts[0]==="admin"&&parts[1]==="assign-abm"&&method==="POST"){
      if(me.role!=="admin")return fail("Admin only",403);
      const users=await arr(K.users),i=users.findIndex(u=>u.id===+b.abm_id),r=users.findIndex(u=>u.id===+b.rm_id);
      if(i<0||users[i].role!=="abm")return fail("ABM not found",404);
      if(r<0||users[r].role!=="rm")return fail("RM not found",404);
      users[i].manager_id=users[r].id;users[i].profile={...(users[i].profile||{}),rm_id:users[r].id,rm:users[r].name};
      await put(K.users,users);return json({ok:true});
    }

    if(parts[0]==="rm"&&parts[1]==="dashboard"&&method==="GET"){
      if(!["rm","admin"].includes(me.role))return fail("RM access only",403);
      const users=await arr(K.users);
      const abms=users.filter(u=>u.role==="abm" && (me.role==="admin" || u.manager_id===me.id || u.profile?.rm_id===me.id || String(u.profile?.rm||"").toLowerCase()===String(me.name).toLowerCase()));
      const ids=new Set(abms.map(x=>x.id));
      const players=users.filter(u=>u.role==="player" && (ids.has(u.manager_id)||u.profile?.rm_id===me.id));
      const active7=players.filter(u=>u.last_active_at&&Date.now()-u.last_active_at<7*86400000).length;
      const totalxp=players.reduce((n,u)=>n+(u.xp||0),0);
      return json({metrics:{abms:abms.length,players:players.length,active7,avg_xp:players.length?Math.round(totalxp/players.length):0},
        abms:abms.map(a=>{const ps=players.filter(p=>p.manager_id===a.id);return {id:a.id,name:a.name,hq:a.profile?.managed_hq||"",players:ps.length,xp:ps.reduce((n,p)=>n+(p.xp||0),0),participation:ps.reduce((n,p)=>n+Object.values(p.activity||{}).reduce((aa,v)=>aa+(+v||0),0),0)}})});
    }

    if(parts[0]==="region"&&parts[1]==="dashboard"&&method==="GET"){
      if(!["admin","rm"].includes(me.role))return fail("Region access only",403);
      const users=await arr(K.users);
      const region=me.role==="admin"?"Nagpur":(me.profile?.managed_region||"Nagpur");
      const abms=users.filter(u=>u.role==="abm" && (me.role==="admin" || u.profile?.managed_region===region || u.profile?.rm_id===me.id));
      const ids=new Set(abms.map(a=>a.id));
      const players=users.filter(u=>u.role==="player" && (ids.has(u.manager_id)||u.profile?.region===region));
      const active7=players.filter(u=>u.last_active_at&&Date.now()-u.last_active_at<7*86400000).length;
      const totalxp=players.reduce((n,u)=>n+(u.xp||0),0);
      const participation=players.reduce((n,u)=>n+Object.values(u.activity||{}).reduce((aa,v)=>aa+(+v||0),0),0);
      return json({metrics:{abms:abms.length,players:players.length,active7,total_xp:totalxp,participation},
        abms:abms.map(a=>{const ps=players.filter(p=>p.manager_id===a.id);return {name:a.name,hq:a.profile?.managed_hq||"",players:ps.length,xp:ps.reduce((n,p)=>n+(p.xp||0),0)}}),
        health_message:players.length?`${Math.round(active7/players.length*100)}% of players have been active in the last 7 days.`:"No players assigned yet."});
    }

    if(parts[0]==="admin"&&parts[1]==="command"&&method==="GET"){
      if(me.role!=="admin")return fail("Admin only",403);
      const users=await arr(K.users),players=users.filter(u=>u.role==="player"),abms=users.filter(u=>u.role==="abm");
      const active7=players.filter(u=>u.last_active_at&&Date.now()-u.last_active_at<7*86400000).length;
      const attention=players.filter(u=>!u.last_active_at||Date.now()-u.last_active_at>7*86400000).sort((a,b)=>(a.xp||0)-(b.xp||0)).slice(0,10).map(u=>({name:u.name,xp:u.xp||0,reason:"No activity in 7+ days"}));
      return json({metrics:{players:players.length,abms:abms.length,active7,total_xp:players.reduce((n,u)=>n+(u.xp||0),0)},attention});
    }

    if(parts[0]==="me"&&method==="GET"){
      const user=await updateUser(me.id,x=>({...x,last_active_at:Date.now()}));
      return json({user:pub(user)});
    }
    if(parts[0]==="me"&&method==="PUT"){
      const user=await updateUser(me.id,x=>({...x,name:b.name||x.name,team:b.team||x.team,photo:b.photo||x.photo}));
      return json({user:pub(user)});
    }

    if(parts[0]==="products"&&parts.length===1&&method==="GET")return json(await arr(K.products));
    if(parts[0]==="products"&&parts.length===1&&method==="POST"){
      if(me.role!=="admin")return fail("Admin only",403);
      const a=await arr(K.products),id=a.length?Math.max(...a.map(x=>x.id))+1:1,x={
        id,name:b.name,generic_name:b.generic_name||"",moa:b.moa||"",differentiators:b.differentiators||"",approved:!!b.approved};
      a.push(x);await put(K.products,a);return json(x);
    }

    if(parts[0]==="lbl"&&parts.length===1&&method==="GET")return json(await arr(K.lbl));
    if(parts[0]==="lbl"&&parts.length===1&&method==="POST"){
      if(me.role!=="admin")return fail("Admin only",403);
      const a=await arr(K.lbl),id=a.length?Math.max(...a.map(x=>x.id))+1:1,x={
        id,month:b.month,year:+b.year,product_id:+b.product_id,taglines:b.taglines||[],indications:b.indications||[],
        visuals:b.visuals||[],messages:b.messages||[],ct:+b.ct,ci:+b.ci,cv:+b.cv,cm:+b.cm,
        time_limit:+(b.time_limit||90),xp_reward:+(b.xp_reward||200),active:true};
      a.push(x);await put(K.lbl,a);return json(x);
    }
    if(parts[0]==="lbl"&&parts.length===2&&method==="GET"){
      const x=(await arr(K.lbl)).find(z=>z.id===+parts[1]);return x?json(x):fail("LBL not found",404);
    }
    if(parts[0]==="lbl"&&parts.length===3&&parts[2]==="play"&&method==="POST"){
      const x=(await arr(K.lbl)).find(z=>z.id===+parts[1]);if(!x)return fail("LBL not found",404);
      const ans=[+b.t,+b.i,+b.v,+b.m],cor=[x.ct,x.ci,x.cv,x.cm],acc=ans.reduce((n,v,i)=>n+(v===cor[i]?1:0),0)/4;
      const sec=Math.max(1,+b.seconds||x.time_limit),speed=Math.max(0,1-sec/x.time_limit);
      const score=Math.round(acc*800+speed*200),xp=Math.round(x.xp_reward*acc+(acc===1?50:0)),coins=Math.floor(xp/10);
      await updateUser(me.id,x=>({...x,xp:x.xp+xp,coins:x.coins+coins}));await addActivity(me.id,"lbl",xp);return json({score,accuracy:acc,xp,coins});
    }

    if(parts[0]==="players"&&method==="GET")return json((await arr(K.users)).filter(x=>x.role==="player").map(pub).sort((a,b)=>b.xp-a.xp));
    if(parts[0]==="leaderboard"&&method==="GET")return json((await arr(K.users)).filter(x=>x.role==="player").map(pub).sort((a,b)=>b.xp-a.xp).slice(0,100));

    if(parts[0]==="challenge"&&parts.length===1&&method==="POST"){
      const opponent=+b.opponent,users=await arr(K.users),x=users.find(z=>z.id===opponent&&z.role==="player");
      if(!x||x.id===me.id)return fail("Choose another player");
      const a=await arr(K.challenges),id=a.length?Math.max(...a.map(z=>z.id))+1:1,t=Math.random().toString(36).slice(2)+Date.now().toString(36);
      a.push({id,challenger:me.id,opponent,status:"pending",token:t,score_a:0,score_b:0});await put(K.challenges,a);await addActivity(me.id,"challenge_sent");
      return json({id,url:"/?challenge="+id});
    }
    if(parts[0]==="challenges"&&method==="GET"){
      const a=await arr(K.challenges),users=await arr(K.users);
      return json(a.filter(x=>x.challenger===me.id||x.opponent===me.id).map(x=>({...x,
        aname:users.find(z=>z.id===x.challenger)?.name||"?",bname:users.find(z=>z.id===x.opponent)?.name||"?"})));
    }
    if(parts[0]==="challenge"&&parts.length===3&&parts[2]==="accept"&&method==="POST"){
      const a=await arr(K.challenges),x=a.find(z=>z.id===+parts[1]&&z.opponent===me.id);
      if(!x)return fail("Invitation not found",404);x.status="active";await put(K.challenges,a);await addActivity(me.id,"challenge_accept");return json({ok:true});
    }

    if(parts[0]==="store"&&parts.length===1&&method==="GET")return json(await arr(K.store));
    if(parts[0]==="store"&&parts[1]==="buy"&&method==="POST"){
      const x=(await arr(K.store)).find(z=>z.id===+b.id);if(!x)return fail("Item not found",404);
      if(me.coins<x.price)return fail("Not enough coins");
      await updateUser(me.id,u=>({...u,coins:u.coins-x.price}));return json({ok:true,coins:me.coins-x.price,type:x.type});
    }

    if(parts[0]==="cricket"&&parts.length===1&&method==="GET")return json(await arr(K.cricket));
    if(parts[0]==="cricket"&&parts.length===1&&method==="POST"){
      if(me.role!=="admin")return fail("Admin only",403);
      const a=await arr(K.cricket),id=a.length?Math.max(...a.map(x=>x.id))+1:1;
      a.push({id,name:b.name,overs:+(b.overs||2),entry_coins:+(b.entry_coins||0),prize_xp:+(b.prize_xp||1000),status:"open"});
      await put(K.cricket,a);return json({id});
    }
    if(parts[0]==="cricket"&&parts.length===3&&parts[2]==="answer"&&method==="POST"){
      const runs=Math.max(0,Math.min(6,+b.points||0)),a=await arr(K.cricketPlayers),key=`${+parts[1]}:${me.id}`,i=a.findIndex(x=>x.key===key);
      if(i<0)a.push({key,tournament_id:+parts[1],user_id:me.id,score:runs,wickets:runs===0?1:0});
      else{a[i].score+=runs;if(runs===0)a[i].wickets++}
      await put(K.cricketPlayers,a);await updateUser(me.id,x=>({...x,xp:x.xp+runs*10,coins:x.coins+Math.floor(runs/5)}));await addActivity(me.id,"cricket",runs*10);return json({ok:true,runs});
    }
    if(parts[0]==="cricket"&&parts.length===3&&parts[2]==="scoreboard"&&method==="GET"){
      const a=await arr(K.cricketPlayers),users=await arr(K.users);
      return json(a.filter(x=>x.tournament_id===+parts[1]).map(x=>({
        score:x.score,wickets:x.wickets,name:users.find(z=>z.id===x.user_id)?.name||"?",team:users.find(z=>z.id===x.user_id)?.team||""
      })).sort((a,b)=>b.score-a.score));
    }

    if(parts[0]==="ludo"&&parts[1]==="award"&&method==="POST"){
      const moves=Math.max(1,Math.min(6,+b.moves||1)),xp=moves*10,coins=Math.floor(moves/2);
      await updateUser(me.id,x=>({...x,xp:x.xp+xp,coins:x.coins+coins}));await addActivity(me.id,"ludo",xp);return json({ok:true,xp,coins});
    }

    if(parts[0]==="skills"&&parts.length===1&&method==="GET")return json(await arr(K.skills));
    if(parts[0]==="knowledge"&&parts.length===1&&method==="GET")return json((await arr(K.knowledge)).filter(x=>x.status==="approved").sort((a,b)=>(b.created_at||0)-(a.created_at||0)));
    if(parts[0]==="admin"&&parts[1]==="knowledge"&&parts.length===2&&method==="POST"){
      if(me.role!=="admin")return fail("Admin only",403);
      const a=await arr(K.knowledge),id=a.length?Math.max(...a.map(x=>x.id))+1:1,p=b.package||{};
      const x={id,status:"approved",created_at:Date.now(),type:"ai_package",title:`${p.product_name||"Product"} • AI Learning Package`,summary:p.update_brief||"",product_name:p.product_name||"",drug_name:p.drug_name||"",moa:p.moa||"",differentiators:p.differentiators||[],questions:p.questions||[],flashcards:p.flashcards||[],moa_steps:p.moa_steps||[],video_script:p.video_script||"",sources:p.source_notes||"",confidence:p.confidence||""};
      a.push(x);await put(K.knowledge,a);return json(x);
    }
    if(parts[0]==="games"&&parts[1]==="answer"&&method==="POST"){
      const xp=Math.max(0,Math.min(50,Math.floor(+b.xp||0)));
      const user=await updateUser(me.id,u=>({...u,xp:u.xp+xp,coins:u.coins+Math.floor(xp/10)}));
      await addActivity(me.id,"quiz",xp);
      return json({user:pub(user),xp});
    }
    if(parts[0]==="fun"&&parts[1]==="sprint-reward"&&method==="POST"){
      const day=new Date().toISOString().slice(0,10),key=`arena:sprint:${me.id}:${day}`;
      if(await redisGet(key))return fail("Today's sprint reward already claimed",409);
      const xp=Math.max(0,Math.min(250,Math.floor(+b.xp||0)));
      await redisSet(key,1,{ex:172800});
      const user=await updateUser(me.id,u=>({...u,xp:u.xp+xp,coins:u.coins+Math.floor(xp/25),streak:(u.streak||0)+1}));
      await addActivity(me.id,"sprint",xp);
      return json({user:pub(user),xp});
    }
    if(parts[0]==="admin"&&parts[1]==="users"&&method==="GET"){
      if(me.role!=="admin")return fail("Admin only",403);
      return json((await arr(K.users)).filter(x=>x.role!=="admin").map(pub));
    }
    if(parts[0]==="admin"&&parts[1]==="stats"&&method==="GET"){
      if(me.role!=="admin")return fail("Admin only",403);
      return json({players:(await arr(K.users)).filter(x=>x.role==="player").length,products:(await arr(K.products)).length,
        lbl:(await arr(K.lbl)).length,cricket:(await arr(K.cricket)).length,knowledge:(await arr(K.knowledge)).length});
    }
    if(parts[0]==="admin"&&parts[1]==="player"&&parts.length===3&&method==="PUT"){
      if(me.role!=="admin")return fail("Admin only",403);
      const target=+parts[2],delta=+b.xp_delta||0,coins=+b.coins_delta||0;
      const u=await updateUser(target,x=>({...x,xp:Math.max(0,(x.xp||0)+delta),coins:Math.max(0,(x.coins||0)+coins)}));
      return json({user:pub(u)});
    }
    if(parts[0]==="admin"&&parts[1]==="store"&&parts.length===2&&method==="POST"){
      if(me.role!=="admin")return fail("Admin only",403);
      const a=await arr(K.store),id=a.length?Math.max(...a.map(x=>x.id))+1:1;
      const item={id,name:b.name,price:+b.price,type:b.type||"poster"};
      a.push(item);await put(K.store,a);return json(item);
    }

    return fail("API route not found: /"+parts.join("/"),404);
  }catch(e){
    console.error(e);
    return fail(e?.message||"Server error",e?.status||500);
  }
}

export default { fetch: handler };
