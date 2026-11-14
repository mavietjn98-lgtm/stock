const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function productFromText(text,products=[],suppliers=[]){
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean), plain=normalize(text), result={};
 const supplier=suppliers.find(s=>new RegExp('(^|[^a-z])'+normalize(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z]|$)').test(plain));
 if(supplier)result.supplier=supplier;
 const ref=text.match(/(?:r[eé]f(?:[eé]rence)?\.?|code\s*(?:article|produit))\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,39})/i);
 if(ref)result.reference=ref[1];
 const matches=products.filter(p=>(!supplier||p.supplier===supplier)&&((ref&&normalize(p.reference)===normalize(ref[1]))||(!ref&&p.reference.length>=4&&new RegExp('(^|[^a-z0-9])'+normalize(p.reference).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z0-9]|$)').test(plain))));
 if(matches.length===1){const p=matches[0];for(const k of ['name','supplier','reference','category','unit','packaging','factor','baseUnit'])result[k]=p[k];return result}
 const named=lines.find(s=>/^(?:nom(?: du produit)?|produit|d[eé]signation)\s*:/i.test(s));
 if(named)result.name=named.replace(/^[^:]+:\s*/,'').slice(0,160);
 else {const name=lines.find(s=>s.length>=4&&s.length<=160&&/[a-zà-ÿ]{3}/i.test(s)&&!/(?:ingr[eé]dient|nutrition|conservation|adresse|www\.|https|t[eé]l|facture|livraison|r[eé]f|code|lot\s*:|date|fabriqu|origine|consommer|\d+\s*%)/i.test(s)&&!suppliers.some(p=>normalize(s)===normalize(p)));if(name)result.name=name}
 const amount=text.match(/(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|litres?|l)\b/i);
 if(amount){const count=Number(amount[1]||1),value=Number(amount[2].replace(',','.')),u=amount[3].toLowerCase();result.packaging=amount[0];result.baseUnit=/^(kg|g)$/.test(u)?'kg':'L';result.factor=count*value*(u==='g'||u==='ml'?0.001:u==='cl'?0.01:1);result.unit=amount[1]?'carton':/bouteille/i.test(text)?'bouteille':/sachet/i.test(text)?'sachet':/bo[iî]te/i.test(text)?'boîte':'unité'}
 const unit=text.match(/unit[eé](?: de (?:commande|vente|achat))?\s*:\s*(litres?|L|kg|carton|unit[eé]|sachet|bo[iî]te|bouteille)\b/i);
 if(unit){result.unit=/^(l|litre)/i.test(unit[1])?'L':normalize(unit[1])==='unite'?'unité':unit[1].toLowerCase();if(['L','kg'].includes(result.unit)){result.baseUnit=result.unit;result.factor=1}}
 return result;
}
export async function readProductPhoto(file){
 const url=URL.createObjectURL(file),img=new Image();
 try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Photo illisible. Reprenez une photo.'));img.src=url});
 const canvas=document.createElement('canvas'),scale=Math.min(1,2000/Math.max(img.naturalWidth,img.naturalHeight));canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
 const preview=document.createElement('canvas'),ratio=Math.min(1,640/Math.max(canvas.width,canvas.height));preview.width=Math.round(canvas.width*ratio);preview.height=Math.round(canvas.height*ratio);preview.getContext('2d').drawImage(canvas,0,0,preview.width,preview.height);
 let photo=preview.toDataURL('image/jpeg',0.65);if(photo.length>220000)photo=preview.toDataURL('image/jpeg',0.35);if(photo.length>220000)throw Error('Photo trop volumineuse. Reprenez la photo.');
 let worker;
 try{if(!window.Tesseract)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';script.onload=resolve;script.onerror=reject;document.head.append(script)});worker=await window.Tesseract.createWorker('fra');const result=await worker.recognize(canvas);return {photo,text:result.data.text||''};}catch{return {photo,text:'',error:'Lecture automatique indisponible. La photo est conservée ; complétez les champs manuellement.'}}finally{await worker?.terminate()}
 }finally{URL.revokeObjectURL(url)}
}
