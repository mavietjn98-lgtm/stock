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
