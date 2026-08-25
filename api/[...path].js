import { Redis } from "@upstash/redis";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const SECRET = process.env.JWT_SECRET || "CHANGE_ME";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@team.local").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe_123!";

const redis = new Redis({ url, token });

const K = {
  users:"arena:users", products:"arena:products", lbl:"arena:lbl",
  challenges:"arena:challenges", knowledge:"arena:knowledge", cricket:"arena:cricket",
  cricketPlayers:"arena:cricketPlayers", store:"arena:store"
};

const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const fail=(m,s=400)=>json({error:m},s);
async function body(req){try{return await req.json()}catch{return {}}}
async function arr(k){const v=await redis.get(k);return Array.isArray(v)?v:[]}
async function put(k,v){await redis.set(k,v)}
function pub(u){return {id:u.id,name:u.name,email:u.email,role:u.role,team:u.team||"",xp:u.xp||0,coins:u.coins||0,wins:u.wins||0,battles:u.battles||0,streak:u.streak||0,photo:u.photo||"",badges:u.badges||[]}}
function sign(u){return jwt.sign({id:u.id,role:u.role},SECRET,{expiresIn:"7d"})}

async function seed(){
  let users=await arr(K.users);
  if(users.length===0){
    users=[{id:1,name:"Team Admin",email:ADMIN_EMAIL,password_hash:bcrypt.hashSync(ADMIN_PASSWORD,10),
      role:"admin",team:"Team Admin",xp:0,coins:0,wins:0,battles:0,streak:0,photo:"",badges:[]}];
    await put(K.users,users);
  }
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

export default async function handler(req){
  try{
    if(!url||!token)return fail("Database environment variables are missing. Check KV_REST_API_URL and KV_REST_API_TOKEN in Vercel.",500);
    await seed();
    const u=new URL(req.url);
    const parts=u.pathname.replace(/^\/api\/?/,"").split("/").filter(Boolean);
    const method=req.method;
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
      const users=await arr(K.users),email=String(b.email||"").toLowerCase(),user=users.find(x=>x.email===email);
      if(!user||!bcrypt.compareSync(b.password||"",user.password_hash))return fail("Invalid credentials",401);
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

    if(parts[0]==="me"&&method==="GET")return json({user:pub(me)});
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
      await updateUser(me.id,x=>({...x,xp:x.xp+xp,coins:x.coins+coins}));return json({score,accuracy:acc,xp,coins});
    }

    if(parts[0]==="players"&&method==="GET")return json((await arr(K.users)).filter(x=>x.role==="player").map(pub).sort((a,b)=>b.xp-a.xp));
    if(parts[0]==="leaderboard"&&method==="GET")return json((await arr(K.users)).filter(x=>x.role==="player").map(pub).sort((a,b)=>b.xp-a.xp).slice(0,100));

    if(parts[0]==="challenge"&&parts.length===1&&method==="POST"){
      const opponent=+b.opponent,users=await arr(K.users),x=users.find(z=>z.id===opponent&&z.role==="player");
      if(!x||x.id===me.id)return fail("Choose another player");
      const a=await arr(K.challenges),id=a.length?Math.max(...a.map(z=>z.id))+1:1,t=Math.random().toString(36).slice(2)+Date.now().toString(36);
      a.push({id,challenger:me.id,opponent,status:"pending",token:t,score_a:0,score_b:0});await put(K.challenges,a);
      return json({id,url:"/challenge/"+t});
    }
    if(parts[0]==="challenges"&&method==="GET"){
      const a=await arr(K.challenges),users=await arr(K.users);
      return json(a.filter(x=>x.challenger===me.id||x.opponent===me.id).map(x=>({...x,
        aname:users.find(z=>z.id===x.challenger)?.name||"?",bname:users.find(z=>z.id===x.opponent)?.name||"?"})));
    }
    if(parts[0]==="challenge"&&parts.length===3&&parts[2]==="accept"&&method==="POST"){
      const a=await arr(K.challenges),x=a.find(z=>z.id===+parts[1]&&z.opponent===me.id);
      if(!x)return fail("Invitation not found",404);x.status="active";await put(K.challenges,a);return json({ok:true});
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
      await put(K.cricketPlayers,a);await updateUser(me.id,x=>({...x,xp:x.xp+runs*10,coins:x.coins+Math.floor(runs/5)}));return json({ok:true,runs});
    }
    if(parts[0]==="cricket"&&parts.length===3&&parts[2]==="scoreboard"&&method==="GET"){
      const a=await arr(K.cricketPlayers),users=await arr(K.users);
      return json(a.filter(x=>x.tournament_id===+parts[1]).map(x=>({
        score:x.score,wickets:x.wickets,name:users.find(z=>z.id===x.user_id)?.name||"?",team:users.find(z=>z.id===x.user_id)?.team||""
      })).sort((a,b)=>b.score-a.score));
    }

    if(parts[0]==="ludo"&&parts[1]==="award"&&method==="POST"){
      const moves=Math.max(1,Math.min(6,+b.moves||1)),xp=moves*10,coins=Math.floor(moves/2);
      await updateUser(me.id,x=>({...x,xp:x.xp+xp,coins:x.coins+coins}));return json({ok:true,xp,coins});
    }

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
      return json({user:pub(user),xp});
    }
    if(parts[0]==="fun"&&parts[1]==="sprint-reward"&&method==="POST"){
      const day=new Date().toISOString().slice(0,10),key=`arena:sprint:${me.id}:${day}`;
      if(await redis.get(key))return fail("Today's sprint reward already claimed",409);
      const xp=Math.max(0,Math.min(250,Math.floor(+b.xp||0)));
      await redis.set(key,1,{ex:172800});
      const user=await updateUser(me.id,u=>({...u,xp:u.xp+xp,coins:u.coins+Math.floor(xp/25),streak:(u.streak||0)+1}));
      return json({user:pub(user),xp});
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
