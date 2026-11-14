import {test} from 'node:test';
import assert from 'node:assert/strict';
import {empty,apply,stock,received,discrepancy} from './domain.js';
const command=(type,payload,id=crypto.randomUUID())=>({type,payload,id});
function fixture(){let s=apply(empty(),command('product',{name:'Test poulet',reference:'TEST1',supplier:'Serdis',unit:'Sachet 2kg',factor:2,baseUnit:'kg',minimum:2,category:'Surgelés'}));const product=s.products[0].id;s=apply(s,command('order',{product,site:'kookasia',quantity:10,price:1200,date:'2026-11-14',channel:'Téléphone',actor:'Jean-Noël'}));return {s,product,order:s.orders[0].id}}
test('Réceptions partielles, protection contre doublons et dépassement',()=>{let {s,product,order}=fixture();const c=command('receipt',{order,quantity:4,date:'2026-11-14',reference:'BL1',actor:'Tara'});s=apply(s,c);assert.equal(stock(s,'kookasia',product),4);assert.equal(stock(apply(s,c),'kookasia',product),4);assert.equal(received(s,order),4);assert.throws(()=>apply(s,command('receipt',{...c.payload,quantity:7})),/dépasse/);assert.throws(()=>apply(s,command('receipt',{...c.payload,actor:'Andrea'})),/Réceptionnaire/)});
test('Prix convenu immuable et facture sans entrée de stock',()=>{let {s,product,order}=fixture();s=apply(s,command('invoice',{site:'kookasia',product,order,quantity:3,price:1250,date:'2026-11-14',reference:'F1',actor:'Tara'}));assert.equal(s.invoices[0].expected,1200);assert.equal(discrepancy(1200,1250),50);assert.equal(stock(s,'kookasia',product),0);assert.throws(()=>apply(s,command('invoice',{site:'kookasia',product,order,quantity:3,price:1250,date:'2026-11-14',reference:'F1',actor:'Tara'})),/déjà/)});
test('Prix inconnu distinct de zéro et quantité invalide rejetée',()=>{assert.equal(discrepancy(null,5),null);assert.equal(discrepancy(0,5),5);const {s,product}=fixture();assert.throws(()=>apply(s,command('order',{product,site:'mojo',quantity:-1,price:null,date:'2026-11-14',channel:'Téléphone'})),/Nombre/)});
test('Comptage et sortie ne touchent que le bon établissement',()=>{let {s,product}=fixture();s=apply(s,command('count',{site:'mojo',product,quantity:12,date:'2026-11-14',note:'Comptage initial',actor:'Andrea'}));s=apply(s,command('out',{site:'mojo',product,quantity:2,date:'2026-11-14',note:'Cuisine',actor:'Andrea'}));assert.equal(stock(s,'mojo',product),10);assert.equal(stock(s,'kookasia',product),0);assert.throws(()=>apply(s,command('out',{site:'mojo',product,quantity:11,date:'2026-11-14',note:'Cuisine'})),/supérieure/)});
import {users,scope,authorize} from './access.js';
test('Accès cloisonné et identité imposée côté serveur',()=>{
 const {s,order,product}=fixture(),tara=users.find(u=>u.id==='tara'),andrea=users.find(u=>u.id==='andrea');
 const view=scope(s,andrea);assert.equal(view.orders.length,0);assert.equal(view.events.length,0);
 assert.equal(scope(s,tara).orders.length,1);
 assert.throws(()=>authorize(s,command('receipt',{order,actor:'Tara'}),andrea),/refusé/);
 assert.throws(()=>authorize(s,command('order',{site:'mojo',product}),tara),/refusé/);
 assert.throws(()=>authorize(s,command('product',{}),tara),/direction/);
 assert.equal(authorize(s,command('receipt',{order,actor:'Jean-Noel'}),tara).payload.actor,'Tara');
 assert.equal(scope(s,users[0]).orders.length,1);
});
test('Direction peut réceptionner et conserver la note dictée',()=>{
 const {s,order}=fixture();const next=apply(s,authorize(s,command('receipt',{order,quantity:1,date:'2026-11-14',reference:'TEST',note:'Carton abîmé'}),users[0]));
 assert.equal(next.receipts[0].actor,'Jean-Noel');assert.equal(next.receipts[0].note,'Carton abîmé');
});
test('Catalogue par établissement et commandes multi-lignes atomiques',()=>{
 let {s,product}=fixture();s=apply(s,command('product',{site:'mojo',name:'Boisson',reference:'M1',supplier:'GBNC',unit:'carton',factor:24,baseUnit:'bouteille',minimum:2,category:'Boissons'}));const mojo=s.products.at(-1).id;
 assert.throws(()=>apply(s,command('order',{site:'kookasia',product:mojo,quantity:1,price:null,date:'2026-11-14',channel:'Téléphone'})),/autre établissement/);
 const batch=command('order-batch',{site:'mojo',date:'2026-11-14',channel:'E-mail',actor:'Andrea',lines:[{product:mojo,quantity:2,price:3000},{product,quantity:3.5,price:null}]});
 const next=apply(s,batch);assert.equal(next.orders.length,s.orders.length+2);assert.equal(next.orders.at(-1).batch,batch.id);assert.equal(apply(next,batch).orders.length,next.orders.length);
 assert.equal(scope(next,users.find(u=>u.id==='tara')).products.some(p=>p.id===mojo),false);
 assert.throws(()=>apply(s,command('order-batch',{...batch.payload,lines:[batch.payload.lines[0],{product:'missing',quantity:1,price:null}]})),/introuvable/);assert.equal(s.orders.length,1);
});
test('Photos sûres et adresses fournisseurs validées',()=>{
 const {s,product}=fixture();assert.throws(()=>apply(s,command('product-photo',{product,photo:'data:image/svg+xml,<svg/>'})),/Photo JPEG/);
 const updated=apply(s,command('product-photo',{product,photo:'data:image/jpeg;base64,/9j/2Q=='}));assert.ok(updated.products[0].photo.startsWith('data:image/jpeg'));
 assert.throws(()=>authorize(s,command('product-photo',{product}),users.find(u=>u.id==='tara')),/direction/);
 assert.throws(()=>apply(s,command('supplier-contact',{supplier:'Serdis',email:'bad\nBcc: x'})),/Adresse/);
 assert.equal(apply(s,command('supplier-contact',{supplier:'Serdis',email:'commande@example.com'})).contacts.Serdis,'commande@example.com');
});
import {catalogue,withCatalogue} from './catalogue.js';
test('Catalogue : ajout idempotent, conservation des saisies et cloisonnement',()=>{
 const source=empty(), first=withCatalogue(source);
 assert.equal(source.products.length,0);
 assert.equal(first.products.length,426);
 assert.deepEqual(withCatalogue(first),first);
 const saved={...first.products[0],id:'existing-product',name:'Nom modifié',photo:'photo conservée'};
 const custom={...saved,id:'custom-product',reference:'PERSONNEL'};
 const merged=withCatalogue({...empty(),products:[saved,custom]});
 assert.equal(merged.products.length,427);
 assert.deepEqual(merged.products[0],saved);
 assert.deepEqual(merged.products[1],custom);
 assert.equal(merged.orders.length+merged.invoices.length+merged.movements.length,0);
 for(const [site,n] of [['kookasia',224],['mojo',34],['oncle-ho',168]])assert.equal(first.products.filter(p=>p.site===site).length,n);
 const p=first.products.find(p=>p.site==='mojo');
 const payload={site:'mojo',product:p.id,quantity:2,price:null,date:'2026-11-14',channel:'Téléphone',actor:'Andrea'};
 assert.equal(apply(first,command('order',payload)).orders[0].product,p.id);
 assert.throws(()=>apply(first,command('order',{...payload,site:'kookasia'})),/autre établissement/);
 assert.equal(scope(first,users.find(u=>u.id==='andrea')).products.length,34);
 assert.ok(catalogue.every(p=>!('historique' in p)&&!('source' in p)&&!('price' in p)));
});
import {productFromText} from './product-photo.js';
test('Photo produit : référence connue, litres, conditionnement et absence de données',()=>{
 const p={site:'mojo',name:'Jus de citron',reference:'C651601',supplier:'Serdis',category:'Épicerie',unit:'bouteille',packaging:'1 L',factor:1,baseUnit:'L'};
 assert.deepEqual(productFromText('SERDIS\nRéf. C651601',[p],['Serdis']),{supplier:p.supplier,reference:p.reference,name:p.name,category:p.category,unit:p.unit,packaging:p.packaging,factor:p.factor,baseUnit:p.baseUnit});
 const parsed=productFromText('Produit : Jus de mangue\nRéférence : MANG-50\n6 x 50 cl',[],[]);
 assert.equal(parsed.name,'Jus de mangue');assert.equal(parsed.reference,'MANG-50');assert.equal(parsed.unit,'carton');assert.equal(parsed.factor,3);assert.equal(parsed.baseUnit,'L');
 assert.equal(productFromText('Produit : Huile\nUnité de commande : litres').unit,'L');
 assert.equal(productFromText('Riz\n500 g').factor,0.5);
 assert.deepEqual(productFromText(''),{});
 assert.equal(productFromText('Réf. C651601',[],[]).supplier,undefined);
});
import {invoiceFromText} from './invoice-photo.js';
test('Photo facture : produits, quantités, HT et lignes inconnues à vérifier',()=>{
 const products=[{id:'prod-1',name:'Jus de citron',reference:'C651601',supplier:'Serdis',site:'mojo'}];
 const parsed=invoiceFromText('SERDIS\nFacture N° F2026-123\n14/11/2026\nRéférence Désignation Quantité PU HT Total HT\nC651601 Jus de citron 2 500 1000\nZZ999 Produit inconnu 3 100 300\nTotal HT 1300\nTGC 78',products,['Serdis']);
 assert.equal(parsed.reference,'F2026-123');assert.equal(parsed.date,'2026-11-14');assert.equal(parsed.lines.length,2);assert.equal(parsed.lines[0].product,'prod-1');assert.equal(parsed.lines[0].quantity,2);assert.equal(parsed.lines[0].price,500);assert.equal(parsed.lines[1].product,'');
 assert.equal(invoiceFromText('PU TTC\nC651601 Jus de citron 2 530 1060',products).lines[0].price,null);
 assert.equal(invoiceFromText('PU HT\nC651601 Jus de citron 2 500 800',products).lines[0].price,null);
 assert.equal(invoiceFromText('PU HT\nC651601 Jus de citron 2 500 1000',[]).lines[0].product,'');
});
test('Import facture atomique : aucun ordre ou stock, doublons refusés, cloisonnement',()=>{
 const s=withCatalogue(empty()),products=s.products.filter(p=>p.site==='mojo').slice(0,2);
 const payload={site:'mojo',reference:'TEST-IMPORT',date:'2026-11-14',lines:products.map(p=>({product:p.id,quantity:2,price:500,order:'ignored'}))};
 const cmd=command('invoice-batch',payload),next=apply(s,cmd);
 assert.equal(next.invoices.length,2);assert.ok(next.invoices.every(x=>x.order===null&&x.expected===null));assert.equal(next.orders.length,0);assert.equal(next.movements.length,0);assert.deepEqual(apply(next,cmd),next);
 assert.throws(()=>apply(next,command('invoice-batch',payload)),/déjà/);
 assert.throws(()=>apply(s,command('invoice-batch',{...payload,lines:[payload.lines[0],{...payload.lines[1],price:-1}]})),/Nombre/);assert.equal(s.invoices.length,0);
 assert.throws(()=>apply(s,command('invoice-batch',{...payload,site:'kookasia'})),/autre établissement/);
 assert.throws(()=>authorize(s,cmd,users.find(u=>u.id==='tara')),/Accès refusé/);
});
import {readProductPhoto} from './product-photo.js';
test('Photo : format invalide, image illisible, OCR en erreur, annulation et reprise',async()=>{
 const originals={Image:globalThis.Image,document:globalThis.document,window:globalThis.window};let badImage=false,stops=0,ocrError=false,slow=false;
 globalThis.Image=class{naturalWidth=1200;naturalHeight=800;set src(value){if(value)queueMicrotask(()=>badImage?this.onerror():this.onload())}};
 globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,AAAA'})};
 globalThis.window={Tesseract:{createWorker:async()=>({recognize:async()=>{if(ocrError)throw Error('OCR unavailable');if(slow)return new Promise(()=>{});return {data:{text:'Produit test'}}},terminate:async()=>{stops++}})}};
 const photo=new Blob(['fake image'],{type:'image/jpeg'});
 try{
  await assert.rejects(readProductPhoto(new Blob(['txt'],{type:'text/plain'})),/pas une photo/);
  badImage=true;await assert.rejects(readProductPhoto(photo),/illisible/);badImage=false;
  assert.equal((await readProductPhoto(photo)).text,'Produit test');assert.equal(stops,1);
  ocrError=true;assert.ok((await readProductPhoto(photo)).error);assert.equal(stops,2);ocrError=false;
  const controller=new AbortController();slow=true;const pending=readProductPhoto(photo,{signal:controller.signal});setTimeout(()=>controller.abort(),10);await assert.rejects(pending,{name:'AbortError'});assert.equal(stops,3);slow=false;
  assert.equal((await readProductPhoto(photo)).text,'Produit test');
  const prior=stops;assert.ok((await readProductPhoto(photo,{recognize:false})).photo);assert.equal(stops,prior);
 }finally{for(const [k,v]of Object.entries(originals)){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}
});
test('Import : références numériques courtes non confondues avec quantités et dates invalides refusées',()=>{
 const p={id:'ridolfi-38',name:'Curaçao',supplier:'Ridolfi',reference:'38'};
 assert.equal(invoiceFromText('PU HT\nAUTRE Produit inconnu 38 100 3800',[p]).lines[0].product,'');
 assert.equal(invoiceFromText('PU HT\n38 Curacao 2 100 200',[p]).lines[0].product,p.id);
 const s=withCatalogue(empty()),product=s.products[0];
 assert.throws(()=>apply(s,command('invoice',{site:product.site,product:product.id,reference:'DATE-TEST',date:'2026-02-31',quantity:1,price:1})),/Date invalide/);
});
