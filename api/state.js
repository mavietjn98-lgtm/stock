import postgres from 'postgres';
import {createHmac,timingSafeEqual,randomBytes,scryptSync} from 'node:crypto';
import {empty,apply} from '../domain.js';
import {users,scope,authorize} from '../access.js';
let sql;
const sign=v=>createHmac('sha256',process.env.SESSION_SECRET).update(v).digest('hex');
const equal=(a,b)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const hash=(p,salt)=>scryptSync(p,salt,32).toString('hex');
async function identity(req){
 const raw=(req.headers.cookie||'').split('; ').find(x=>x.startsWith('inventory='))?.slice(10)||'';
 const [exp,id,version,nonce,sig]=raw.split('.');
 if(!sig||!Number.isFinite(Number(exp))||Number(exp)<Date.now()||!equal(sig,sign([exp,id,version,nonce].join('.'))))return null;
 const user=users.find(u=>u.id===id);if(!user)return null;
 const current=user.role==='admin'?sign(process.env.APP_PASSWORD):(await sql`SELECT version FROM inventory_users WHERE id=${id}`)[0]?.version;
 return current===version?user:null;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const configured=Boolean(process.env.DATABASE_URL&&process.env.APP_PASSWORD?.length>=16&&process.env.SESSION_SECRET?.length>=32);
 if(!configured){if(req.method==='GET'&&req.query?.status==='1')return res.json({configured:false,authenticated:false,setup:!process.env.DATABASE_URL?'DATABASE_URL manquante':!process.env.APP_PASSWORD?'APP_PASSWORD manquante':process.env.APP_PASSWORD.length<16?'APP_PASSWORD doit contenir au moins 16 caractères':!process.env.SESSION_SECRET?'SESSION_SECRET manquante':'SESSION_SECRET doit contenir au moins 32 caractères'});return res.status(503).json({error:'Espace partagé non configuré.'})}
 if(req.method==='POST'){try{if(new URL(req.headers.origin).host!==req.headers.host)throw Error()}catch{return res.status(403).json({error:'Origine refusée.'})}}
 let body=req.body;if(typeof body==='string'){try{body=JSON.parse(body)}catch{return res.status(400).json({error:'Données invalides.'})}}
 try{
  sql ||= postgres(process.env.DATABASE_URL,{ssl:'require',max:1,prepare:false});
  await sql`CREATE TABLE IF NOT EXISTS inventory_users (id text PRIMARY KEY,salt text NOT NULL,hash text NOT NULL,version text NOT NULL)`;
  if(req.method==='POST'&&body?.action==='login'){
   await sql`CREATE TABLE IF NOT EXISTS inventory_login_limits (key text PRIMARY KEY,attempts integer NOT NULL,expires bigint NOT NULL)`;
   const key=sign(String(req.headers['x-forwarded-for']||'unknown')+':'+Math.floor(Date.now()/900000));
   const [limit]=await sql`INSERT INTO inventory_login_limits(key,attempts,expires) VALUES(${key},1,${Date.now()+900000}) ON CONFLICT(key) DO UPDATE SET attempts=inventory_login_limits.attempts+1 RETURNING attempts`;
   await sql`DELETE FROM inventory_login_limits WHERE expires < ${Date.now()}`;
   if(limit.attempts>10)return res.status(429).json({error:'Trop de tentatives. Réessayez dans 15 minutes.'});
   const user=users.find(u=>u.id===body.user),input=String(body.password||'').slice(0,256);
   const stored=user?.role==='staff'?(await sql`SELECT salt,hash,version FROM inventory_users WHERE id=${user.id}`)[0]:null;
   const salt=stored?.salt||'inventory-admin-v2',expected=user?.role==='admin'?hash(process.env.APP_PASSWORD,salt):stored?.hash||'0'.repeat(64);
   if(!equal(hash(input,salt),expected))return res.status(401).json({error:'Identité ou code personnel incorrect. Contactez Jean-Noel si votre accès n’est pas encore activé.'});
   const version=user.role==='admin'?sign(process.env.APP_PASSWORD):stored.version;
   const token=[Date.now()+12*3600000,user.id,version,randomBytes(16).toString('hex')].join('.');
   res.setHeader('Set-Cookie',`inventory=${token}.${sign(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`);return res.json({ok:true});
  }
  const user=await identity(req);
  if(req.method==='GET'&&req.query?.status==='1')return res.json({configured:true,authenticated:!!user,user});
  if(!user)return res.status(401).json({error:'Connexion requise.'});
  if(req.method==='POST'&&body?.action==='logout'){res.setHeader('Set-Cookie','inventory=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');return res.json({ok:true})}
  if(body?.action==='set-access'){
   if(user.role!=='admin')return res.status(403).json({error:'Accès direction requis.'});
   const target=users.find(u=>u.id===body.user&&u.role==='staff');
   if(!target||typeof body.password!=='string'||body.password.length<12||body.password.length>128)return res.status(400).json({error:'Choisissez un collaborateur et un code de 12 à 128 caractères.'});
   if(equal(hash(body.password,'check'),hash(process.env.APP_PASSWORD,'check')))throw Error('Le code direction doit rester distinct.');
   const others=await sql`SELECT id,salt,hash FROM inventory_users`;
   if(others.some(x=>x.id!==target.id&&equal(hash(body.password,x.salt),x.hash)))throw Error('Chaque collaborateur doit avoir un code différent.');
   const salt=randomBytes(16).toString('hex'),digest=hash(body.password,salt),version=randomBytes(16).toString('hex');
   await sql`INSERT INTO inventory_users(id,salt,hash,version) VALUES(${target.id},${salt},${digest},${version}) ON CONFLICT(id) DO UPDATE SET salt=EXCLUDED.salt,hash=EXCLUDED.hash,version=EXCLUDED.version`;
   return res.json({ok:true});
  }
  await sql`CREATE TABLE IF NOT EXISTS inventory_state (id integer PRIMARY KEY,revision integer NOT NULL DEFAULT 0,data jsonb NOT NULL)`;
  await sql`INSERT INTO inventory_state(id,data) VALUES(1,${sql.json(empty())}) ON CONFLICT DO NOTHING`;
  const [row]=await sql`SELECT data,revision FROM inventory_state WHERE id=1`;
  const response=r=>({data:scope(r.data,user),revision:r.revision,user});
  if(req.method==='GET')return res.json(response(row));
  if(req.method!=='POST')return res.status(405).json({error:'Méthode refusée.'});
  if(body.revision!==row.revision)return res.status(409).json({error:'Les données ont changé. Actualisez puis recommencez.'});
  const next=apply(row.data,authorize(row.data,body.command,user));
  const updated=await sql`UPDATE inventory_state SET data=${sql.json(next)},revision=revision+1 WHERE id=1 AND revision=${row.revision} RETURNING data,revision`;
  if(!updated.length)return res.status(409).json({error:'Modification simultanée. Actualisez puis recommencez.'});
  return res.json(response(updated[0]));
 }catch(e){console.error(e.name);return res.status(400).json({error:e.code?'Stockage indisponible. Réessayez.':e.message})}
}
