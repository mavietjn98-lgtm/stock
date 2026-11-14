export const sites = {kookasia:{name:'Kookasia',company:'BJNM',people:['Tara']},mojo:{name:'Mojo',company:'HJNM',people:['Andrea']},'oncle-ho':{name:'Oncle Hô',company:'EJNM',people:['Annie','Cathy','Michel','Noi']}};
export const suppliers=['Serdis','Rabot','SIB','Sodevia','GBNC','Ridolfi','Bargibant','Appaloosa','Nouméa Gros','Packmee','Sullivan'];
export const empty=()=>({products:[],orders:[],receipts:[],invoices:[],movements:[],events:[]});
const fail=m=>{throw new Error(m)};
const text=(v,n=160)=>typeof v==='string'&&v.trim()&&v.length<=n?v.trim():fail('Champ texte manquant ou trop long.');
const num=(v,min=0)=>typeof v==='number'&&Number.isFinite(v)&&v>=min?v:fail('Nombre invalide.');
const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v?v:fail('Date invalide.');
export function stock(s,site,product){return s.movements.filter(x=>x.site===site&&x.product===product).reduce((n,x)=>n+x.quantity,0)}
export function received(s,id){return s.receipts.filter(x=>x.order===id).reduce((n,x)=>n+x.quantity,0)}
export function discrepancy(expected,actual){return expected==null?null:Math.round((actual-expected)*100)/100}
export function apply(state,cmd){
 const s=structuredClone(state), a=cmd.payload||{}, now=new Date().toISOString(), id=cmd.id;
 if(typeof id!=='string'||!/^[\w-]{8,80}$/.test(id))fail('Identifiant invalide.');
 if(s.events.some(e=>e.id===id))return s;
 const actor=text(a.actor||'Équipe',80), event={id,at:now,actor,type:cmd.type};
 const site=()=>sites[a.site]?a.site:fail('Établissement invalide.');
 const product=()=>{const p=s.products.find(p=>p.id===a.product)||fail('Produit introuvable.');if(p.site&&p.site!==site())fail('Produit réservé à un autre établissement.');return p};
 const photo=v=>{if(!v)return '';if(typeof v!=='string'||v.length>220000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(v))fail('Photo JPEG invalide ou trop volumineuse.');return v};
 const move=(p,q,kind,ref,day)=>s.movements.push({id,site:a.site,product:p,quantity:q,kind,ref,date:day,actor,at:now});
 if(cmd.type==='invoice-batch'){
  site();if(!Array.isArray(a.lines)||!a.lines.length||a.lines.length>100)fail('Ajoutez de 1 à 100 lignes de facture.');
  let next=s;
  for(const [i,line] of a.lines.entries())next=apply(next,{id:id+'-'+i,type:'invoice',payload:{...line,site:a.site,actor,reference:a.reference,date:a.date,note:line.source||a.note||'',order:null}});
  next.events.push(event);return next;
 }else if(cmd.type==='order-batch'){
  site();if(!Array.isArray(a.lines)||!a.lines.length||a.lines.length>30)fail('Ajoutez de 1 à 30 lignes.');
  let next=s;
  for(const [i,line] of a.lines.entries())next=apply(next,{id:id+'-'+i,type:'order',payload:{...a,...line,site:a.site,actor,batch:id}});
  next.events.push(event);return next;
 }else if(cmd.type==='supplier-contact'){
  if(!suppliers.includes(a.supplier)||typeof a.email!=='string'||a.email.length>160||! /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(a.email))fail('Adresse e-mail invalide.');
  s.contacts={...s.contacts,[a.supplier]:a.email.trim()};
 }else if(cmd.type==='product-photo'){
  const p=s.products.find(p=>p.id===a.product)||fail('Produit introuvable.');p.photo=photo(a.photo);
 }else if(cmd.type==='product'){
  if(!suppliers.includes(a.supplier))fail('Fournisseur invalide.');
  const p={id,site:a.site?site():null,photo:photo(a.photo),packaging:String(a.packaging||'').slice(0,120),name:text(a.name),supplier:a.supplier,reference:text(a.reference),unit:text(a.unit,60),category:text(a.category,60),minimum:num(a.minimum),factor:num(a.factor,0.001),baseUnit:text(a.baseUnit,20)};
  if(s.products.some(x=>(x.site||null)===p.site&&x.supplier===p.supplier&&x.reference.toLowerCase()===p.reference.toLowerCase()))fail('Cette référence existe déjà chez ce fournisseur.');
  s.products.push(p);
 }else if(cmd.type==='order'){
  site();const p=product(); const quantity=num(a.quantity,0.001);const price=a.price===null?null:num(a.price);
  s.orders.push({id,batch:a.batch||null,site:a.site,product:p.id,quantity,price,date:date(a.date),channel:text(a.channel,60),actor,note:String(a.note||'').slice(0,1000),at:now});
 }else if(cmd.type==='receipt'){
  const o=s.orders.find(x=>x.id===a.order)||fail('Commande introuvable.');a.site=o.site;site();
  if(actor!=='Jean-Noel'&&!sites[o.site].people.includes(actor))fail('Réceptionnaire non autorisé pour cet établissement.');
  const quantity=num(a.quantity,0.001),remaining=o.quantity-received(s,o.id);
  if(quantity>remaining+1e-8)fail('La quantité dépasse le reste à recevoir.');
  const day=date(a.date);s.receipts.push({id,order:o.id,site:o.site,product:o.product,quantity,date:day,actor,reference:text(a.reference),note:String(a.note||'').slice(0,4000),at:now});move(o.product,quantity,'Réception',o.id,day);
 }else if(cmd.type==='invoice'){
  site();const p=product();const order=a.order?s.orders.find(x=>x.id===a.order):null;
  if(a.order&&(!order||order.site!==a.site||order.product!==p.id))fail('Commande incompatible.');
  const reference=text(a.reference),day=date(a.date),quantity=num(a.quantity,0.001),price=num(a.price);
  if(s.invoices.some(x=>x.site===a.site&&x.product===p.id&&x.reference===reference))fail('Cette ligne de facture est déjà enregistrée.');
  if(order&&s.invoices.filter(x=>x.order===order.id).reduce((v,x)=>v+x.quantity,0)+quantity>order.quantity+1e-8)fail('Quantité facturée supérieure à la commande.');
  s.invoices.push({id,site:a.site,product:p.id,order:order?.id||null,quantity,price,expected:order?.price??null,date:day,reference,note:a.note?text(a.note,4000):'',actor,at:now});
 }else if(cmd.type==='count'||cmd.type==='out'){
  site();const p=product(),q=num(a.quantity),day=date(a.date),current=stock(s,a.site,p.id);
  if(cmd.type==='out'&&q>current)fail('Sortie supérieure au stock disponible.');
  move(p.id,cmd.type==='count'?q-current:-q,cmd.type==='count'?'Comptage':'Sortie',text(a.note,500),day);
 }else fail('Action inconnue.');
 s.events.push(event);return s;
}
