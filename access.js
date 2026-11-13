import {sites} from './domain.js';
export const users=[{id:'jean-noel',name:'Jean-Noel',role:'admin',site:null},...Object.entries(sites).flatMap(([site,s])=>s.people.map(name=>({id:name.toLowerCase(),name,role:'staff',site})))];
export function scope(state,user){
 if(user.role==='admin')return state;
 const result=structuredClone(state);
 for(const key of ['orders','receipts','invoices','movements'])result[key]=result[key].filter(x=>x.site===user.site);
 result.products=result.products.filter(p=>!p.site||p.site===user.site);
 result.events=[];
 return result;
}
export function authorize(state,command,user){
 if(!command||!command.payload)throw Error('Action invalide.');
 const cmd=structuredClone(command);
 if(user.role!=='admin'){
  if(['product','product-photo','supplier-contact'].includes(cmd.type))throw Error('Seule la direction peut modifier le catalogue.');
  const target=cmd.type==='receipt'?state.orders.find(o=>o.id===cmd.payload.order)?.site:cmd.payload.site;
  if(target!==user.site)throw Error('Accès refusé à cet établissement.');
 }
 cmd.payload.actor=user.name;
 return cmd;
}
