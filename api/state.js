import postgres from 'postgres';
import {createHmac,timingSafeEqual,randomBytes,scryptSync} from 'node:crypto';
import {empty,apply} from '../domain.js';
let sql;
const sign=v=>createHmac('sha256',process.env.SESSION_SECRET).update(v).digest('hex');
function authenticated(req){const raw=(req.headers.cookie||'').split('; ').find(x=>x.startsWith('inventory='))?.slice(10)||'';const [exp,nonce,sig]=raw.split('.');if(!sig||Number(exp)<Date.now())return false;const expected=sign(exp+'.'+nonce);return sig.length===expected.length&&timingSafeEqual(Buffer.from(sig),Buffer.from(expected));}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const configured=Boolean(process.env.DATABASE_URL&&process.env.APP_PASSWORD&&process.env.SESSION_SECRET);
 if(req.method==='GET'&&req.query?.status==='1')return res.status(200).json({configured,authenticated:configured&&authenticated(req)});
 if(!configured)return res.status(503).json({error:'Espace partagé non configuré. Connecter la base de données et les accès dans Vercel.'});
 if(process.env.APP_PASSWORD.length<16||process.env.SESSION_SECRET.length<32)return res.status(503).json({error:'Les secrets d’accès doivent être renforcés dans Vercel.'});
 if(req.method==='POST'){
  const origin=req.headers.origin; if(!origin||new URL(origin).host!==req.headers.host)return res.status(403).json({error:'Origine refusée.'});
 }
 let body=req.body;if(typeof body==='string'){try{body=JSON.parse(body)}catch{return res.status(400).json({error:'Données invalides.'})}}
 if(req.method==='POST'&&body?.action==='login'){
  try{
   sql ||= postgres(process.env.DATABASE_URL,{ssl:'require',max:1,prepare:false});
   await sql`CREATE TABLE IF NOT EXISTS inventory_login_limits (key text PRIMARY KEY, attempts integer NOT NULL, expires bigint NOT NULL)`;
   const bucket=Math.floor(Date.now()/900000),key=sign(String(req.headers['x-forwarded-for']||'unknown')+':'+bucket);
   const [limit]=await sql`INSERT INTO inventory_login_limits(key,attempts,expires) VALUES(${key},1,${Date.now()+900000}) ON CONFLICT(key) DO UPDATE SET attempts=inventory_login_limits.attempts+1 RETURNING attempts`;
   await sql`DELETE FROM inventory_login_limits WHERE expires < ${Date.now()}`;
   if(limit.attempts>10)return res.status(429).json({error:'Trop de tentatives. Réessayez dans 15 minutes.'});
  }catch{return res.status(503).json({error:'Connexion au stockage impossible.'})}
  // Constant-cost verification. Passwords are never stored in the browser.
  const input=String(body.password||'').slice(0,256),salt='inventory-login-v1';
  if(!timingSafeEqual(scryptSync(input,salt,32),scryptSync(process.env.APP_PASSWORD,salt,32)))return res.status(401).json({error:'Code d’accès incorrect.'});
  const token=String(Date.now()+12*3600000)+'.'+randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie',`inventory=${token}.${sign(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`);return res.json({ok:true});
 }
 if(!authenticated(req))return res.status(401).json({error:'Connexion requise.'});
 if(req.method==='POST'&&body?.action==='logout'){res.setHeader('Set-Cookie','inventory=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');return res.json({ok:true})}
 try{
  sql ||= postgres(process.env.DATABASE_URL,{ssl:'require',max:1,prepare:false});
  await sql`CREATE TABLE IF NOT EXISTS inventory_state (id integer PRIMARY KEY, revision integer NOT NULL DEFAULT 0, data jsonb NOT NULL)`;
  await sql`INSERT INTO inventory_state(id,data) VALUES(1,${sql.json(empty())}) ON CONFLICT DO NOTHING`;
  const [row]=await sql`SELECT data,revision FROM inventory_state WHERE id=1`;
  if(req.method==='GET')return res.json(row);
  if(req.method!=='POST')return res.status(405).json({error:'Méthode refusée.'});
  if(body.revision!==row.revision)return res.status(409).json({error:'Les données ont changé. Actualisez puis recommencez.'});
  const next=apply(row.data,body.command);
  const updated=await sql`UPDATE inventory_state SET data=${sql.json(next)},revision=revision+1 WHERE id=1 AND revision=${row.revision} RETURNING data,revision`;
  if(!updated.length)return res.status(409).json({error:'Modification simultanée. Actualisez puis recommencez.'});
  return res.json(updated[0]);
 }catch(e){console.error(e.name);return res.status(400).json({error:e.code?'Stockage indisponible. Réessayez.':e.message})}
}
