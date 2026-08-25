import { Redis } from "@upstash/redis";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const redis = Redis.fromEnv();
const SECRET = process.env.JWT_SECRET || "CHANGE_ME";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@team.local").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe_123!";

const KEY = {
  users: "arena:users",
  products: "arena:products",
  lbl: "arena:lbl",
  challenges: "arena:challenges",
  cricket: "arena:cricket",
  cricketTeams: "arena:cricketTeams",
  cricketPlayers: "arena:cricketPlayers",
  store: "arena:store"
};

async function get(k, fallback=[]) { return (await redis.get(k)) ?? fallback; }
async function set(k,v) { await redis.set(k,v); }
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store"}})}
function fail(msg,status=400){return json({error:msg},status)}
async function body(req){try{return await req.json()}catch{return {}}}
function tokenFor(u){return jwt.sign({id:u.id,role:u.role},SECRET,{expiresIn:"7d"})}
function publicUser(u){return {id:u.id,name:u.name,email:u.email,role:u.role,team:u.team||"",xp:u.xp||0,coins:u.coins||0,wins:u.wins||0,battles:u.battles||0,streak:u.streak||0,photo:u.photo||"",badges:u.badges||[]}}
function auth(req){
  const h=req.headers.get("authorization")||"";
  if(!h.startsWith("Bearer ")) throw new Error("Login required");
  return jwt.verify(h.slice(7),SECRET);
}
async function seed(){
  let users=await get(KEY.users);
  if(!Array.isArray(users)) users=[];
  if(users.length===0){
    users=[{id:1,name:"Team Admin",email:ADMIN_EMAIL,password_hash:bcrypt.hashSync(ADMIN_PASSWORD,10),role:"admin",team:"Team Admin",xp:0,coins:0,wins:0,battles:0,streak:0,photo:"",badges:[]}];
    await set(KEY.users,users);
  }
  let products=await get(KEY.products);
  if(!Array.isArray(products)||products.length===0){
    products=[{id:1,name:"GLUCORYL MV",generic_name:"Replace with approved molecule",moa:"Replace with approved MOA",differentiators:"Replace with approved differentiators",approved:false}];
    await set(KEY.products,products);
  }
  let store=await get(KEY.store);
  if(!Array.isArray(store)||store.length===0){
    store=[
      {id:1,name:"Victory Poster",price:150,type:"poster"},
      {id:2,name:"Funny Poster",price:100,type:"poster"},
      {id:3,name:"Champion Frame",price:400,type:"frame"},
      {id:4,name:"Hint Token",price:100,type:"power"}
    ];
    await set(KEY.store,store);
  }
}
async function updateUser(id,fn){
  const users=await get(KEY.users);
  const i=users.findIndex(u=>u.id===Number(id));
  if(i<0) throw new Error("User not found");
  users[i]=fn(users[i])||users[i];
  await set(KEY.users,users);
  return users[i];
}
async function route(req){
  await seed();
  const url=new URL(req.url);
  let p=url.pathname.replace(/^\/api\/?/,"").split("/").filter(Boolean);
  const method=req.method;
  const b=method==="GET"?{}:await body(req);

  if(p[0]==="register" && method==="POST"){
    if(!b.name||!b.email||!b.password||String(b.password).length<8)return fail("Name, email and 8+ character password required");
    const users=await get(KEY.users);
    if(users.some(u=>u.email===String(b.email).toLowerCase()))return fail("Email already registered",409);
    const id=users.length?Math.max(...users.map(u=>u.id))+1:1;
    const u={id,name:b.name,email:String(b.email).toLowerCase(),password_hash:bcrypt.hashSync(b.password,10),role:"player",team:b.team||"",xp:0,coins:0,wins:0,battles:0,streak:0,photo:"",badges:[]};
    users.push(u);await set(KEY.users,users);return json({token:tokenFor(u),user:publicUser(u)});
  }
  if(p[0]==="login" && method==="POST"){
    const users=await get(KEY.users),u=users.find(x=>x.email===String(b.email||"").toLowerCase());
    if(!u||!bcrypt.compareSync(b.password||"",u.password_hash))return fail("Invalid credentials",401);
    return json({token:tokenFor(u),user:publicUser(u)});
  }

  let session=null;
  try{session=auth(req)}catch(e){/* public auth endpoints handled above */}
  const users=await get(KEY.users);
  const me=session?users.find(u=>u.id===session.id):null;
  if(!me)return fail("Login required",401);

  if(p[0]==="me" && method==="GET") return json({user:publicUser(me)});
  if(p[0]==="me" && method==="PUT"){
    const u=await updateUser(me.id,x=>({...x,name:b.name||x.name,team:b.team||x.team,photo:b.photo||x.photo}));
    return json({user:publicUser(u)});
  }

  if(p[0]==="products" && method==="GET") return json(await get(KEY.products));
  if(p[0]==="products" && method==="POST"){
    if(me.role!=="admin")return fail("Admin only",403);
    const a=await get(KEY.products);const id=a.length?Math.max(...a.map(x=>x.id))+1:1;
    const item={id,name:b.name,generic_name:b.generic_name||"",moa:b.moa||"",differentiators:b.differentiators||"",approved:!!b.approved};
    a.push(item);await set(KEY.products,a);return json(item);
  }

  if(p[0]==="lbl" && method==="GET" && p.length===1)return json(await get(KEY.lbl));
  if(p[0]==="lbl" && method==="POST" && p.length===1){
    if(me.role!=="admin")return fail("Admin only",403);
    const a=await get(KEY.lbl);const id=a.length?Math.max(...a.map(x=>x.id))+1:1;
    const item={id,month:b.month,year:Number(b.year),product_id:Number(b.product_id),taglines:b.taglines||[],indications:b.indications||[],visuals:b.visuals||[],messages:b.messages||[],ct:Number(b.ct),ci:Number(b.ci),cv:Number(b.cv),cm:Number(b.cm),time_limit:Number(b.time_limit||90),xp_reward:Number(b.xp_reward||200),active:true};
    a.push(item);await set(KEY.lbl,a);return json(item);
  }
  if(p[0]==="lbl" && p.length===2 && method==="GET"){
    const a=await get(KEY.lbl),x=a.find(z=>z.id===Number(p[1]));return x?json(x):fail("LBL not found",404);
  }
  if(p[0]==="lbl" && p.length===3 && p[2]==="play" && method==="POST"){
    const a=await get(KEY.lbl),x=a.find(z=>z.id===Number(p[1]));if(!x)return fail("LBL not found",404);
    const ans=[+b.t,+b.i,+b.v,+b.m],cor=[x.ct,x.ci,x.cv,x.cm],acc=ans.reduce((n,v,i)=>n+(v===cor[i]?1:0),0)/4;
    const sec=Math.max(1,+b.seconds||x.time_limit),speed=Math.max(0,1-sec/x.time_limit);
    const score=Math.round(acc*800+speed*200),xp=Math.round(x.xp_reward*acc+(acc===1?50:0)),coins=Math.floor(xp/10);
    await updateUser(me.id,u=>({...u,xp:u.xp+xp,coins:u.coins+coins}));
    return json({score,accuracy:acc,xp,coins});
  }

  if(p[0]==="players" && method==="GET")return json((await get(KEY.users)).filter(u=>u.role==="player").map(publicUser).sort((a,b)=>b.xp-a.xp));
  if(p[0]==="leaderboard" && method==="GET")return json((await get(KEY.users)).filter(u=>u.role==="player").map(publicUser).sort((a,b)=>b.xp-a.xp).slice(0,100));

  if(p[0]==="challenge" && method==="POST"){
    const opponent=Number(b.opponent),all=await get(KEY.users),u=all.find(x=>x.id===opponent&&x.role==="player");
    if(!u||u.id===me.id)return fail("Choose another player");
    const a=await get(KEY.challenges),id=a.length?Math.max(...a.map(x=>x.id))+1:1;
    const t=Math.random().toString(36).slice(2)+Date.now().toString(36);
    a.push({id,challenger:me.id,opponent,status:"pending",token:t,score_a:0,score_b:0});await set(KEY.challenges,a);
    return json({id,url:"/challenge/"+t});
  }
  if(p[0]==="challenges" && method==="GET"){
    const a=await get(KEY.challenges),us=await get(KEY.users);
    return json(a.filter(x=>x.challenger===me.id||x.opponent===me.id).map(x=>({...x,aname:us.find(u=>u.id===x.challenger)?.name||"?",bname:us.find(u=>u.id===x.opponent)?.name||"?"})));
  }
  if(p[0]==="challenge"&&p.length===3&&p[2]==="accept"&&method==="POST"){
    const a=await get(KEY.challenges),x=a.find(z=>z.id===Number(p[1])&&z.opponent===me.id);if(!x)return fail("Invitation not found",404);
    x.status="active";await set(KEY.challenges,a);return json({ok:true});
  }

  if(p[0]==="store"&&method==="GET")return json(await get(KEY.store));
  if(p[0]==="store"&&p[1]==="buy"&&method==="POST"){
    const a=await get(KEY.store),it=a.find(x=>x.id===Number(b.id));if(!it)return fail("Item not found",404);
    if(me.coins<it.price)return fail("Not enough coins");
    await updateUser(me.id,u=>({...u,coins:u.coins-it.price}));return json({ok:true,coins:me.coins-it.price,type:it.type});
  }

  if(p[0]==="cricket"&&method==="GET"&&p.length===1)return json(await get(KEY.cricket));
  if(p[0]==="cricket"&&method==="POST"&&p.length===1){
    if(me.role!=="admin")return fail("Admin only",403);
    const a=await get(KEY.cricket),id=a.length?Math.max(...a.map(x=>x.id))+1:1;
    a.push({id,name:b.name,overs:Number(b.overs||2),entry_coins:Number(b.entry_coins||0),prize_xp:Number(b.prize_xp||1000),status:"open"});
    await set(KEY.cricket,a);return json({id});
  }
  if(p[0]==="cricket"&&p.length===3&&p[2]==="answer"&&method==="POST"){
    const runs=Math.max(0,Math.min(6,Number(b.points||0)));
    const players=await get(KEY.cricketPlayers),key=`${Number(p[1])}:${me.id}`,idx=players.findIndex(x=>x.key===key);
    if(idx<0)players.push({key,tournament_id:Number(p[1]),user_id:me.id,score:runs,wickets:runs===0?1:0});
    else{players[idx].score+=runs;if(runs===0)players[idx].wickets++}
    await set(KEY.cricketPlayers,players);
    await updateUser(me.id,u=>({...u,xp:u.xp+runs*10,coins:u.coins+Math.floor(runs/5)}));
    return json({ok:true,runs});
  }
  if(p[0]==="cricket"&&p.length===3&&p[2]==="scoreboard"&&method==="GET"){
    const ps=await get(KEY.cricketPlayers),us=await get(KEY.users);
    return json(ps.filter(x=>x.tournament_id===Number(p[1])).map(x=>({score:x.score,wickets:x.wickets,name:us.find(u=>u.id===x.user_id)?.name||"?",team:us.find(u=>u.id===x.user_id)?.team||""})).sort((a,b)=>b.score-a.score));
  }

  if(p[0]==="ludo"&&p[1]==="award"&&method==="POST"){
    const moves=Math.max(1,Math.min(6,Number(b.moves||1)));
    const xp=moves*10,coins=Math.floor(moves/2);
    await updateUser(me.id,u=>({...u,xp:u.xp+xp,coins:u.coins+coins}));
    return json({ok:true,xp,coins});
  }

  if(p[0]==="admin"&&p[1]==="stats"&&method==="GET"){
    if(me.role!=="admin")return fail("Admin only",403);
    return json({players:users.filter(u=>u.role==="player").length,products:(await get(KEY.products)).length,lbl:(await get(KEY.lbl)).length,cricket:(await get(KEY.cricket)).length});
  }
  return fail("API route not found",404);
}
export default async function handler(req){try{return await route(req)}catch(e){console.error(e);return fail(e.message||"Server error",500)}}
