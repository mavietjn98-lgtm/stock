const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const number=s=>Number(s.replace(/[\s\u00a0]/g,'').replace(',','.'));
export function invoiceFromText(text,products=[],suppliers=[]){
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean), plain=norm(text);
 const supplier=suppliers.find(s=>new RegExp('(^|[^a-z])'+escaped(norm(s))+'([^a-z]|$)').test(plain))||'';
 const candidates=products.filter(p=>!supplier||p.supplier===supplier);
 const reference=text.match(/facture\s*(?:n[°oº.]|num[eé]ro|no\.)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]*\d[A-Z0-9/-]*)/i)?.[1]||'';
 const d=text.match(/\b(\d{2})[/.\-](\d{2})[/.\-](\d{4})\b/),date=d?`${d[3]}-${d[2]}-${d[1]}`:'';
 const ht=/\b(?:p\.?\s*u\.?|prix|montant|total)\s*(?:net\s*)?h\.?\s*t\b/i.test(text),ttc=/\b(?:p\.?\s*u\.?|prix)\s*t\.?\s*t\.?\s*c\b/i.test(text);
 const rows=[];
 for(const source of lines){
  if(/^(?:total|sous.total|net a payer|tva|tgc|taxe|consigne|avoir|remise|transport|livraison|port|facture|date|iban|telephone|tel\b)/i.test(norm(source)))continue;
  if(/(?:quantit[eé]|qt[eé])/.test(norm(source))&&/designation|reference|produit/i.test(norm(source)))continue;
  const matches=candidates.filter(p=>new RegExp((/^\d{1,4}$/.test(p.reference)?'^(?:ref\\.?\\s*[:#-]?\\s*)?':'(^|[^a-z0-9])')+escaped(norm(p.reference))+'([^a-z0-9]|$)').test(norm(source))||(p.name.length>7&&norm(source).includes(norm(p.name))));
  const product=matches.length===1?matches[0]:null;
  const tail=source.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s*(?:F|XPF|CFP)?$/i);
  const q=source.match(/(?:qt[eé]|quantit[eé])\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i),p=source.match(/(?:pu|prix)\s*(?:net\s*)?ht\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i);
  if(!product&&!tail&&!q)continue;
  if(!/[a-zà-ÿ]/i.test(source)&&!product)continue;
  let quantity=q?number(q[1]):null,price=p?number(p[1]):null,warning='';
  if(tail){const a=number(tail[1]),b=number(tail[2]),total=number(tail[3]);if(a>0&&Math.abs(a*b-total)<=Math.max(1,total*0.001)){quantity??=a;if(ht&&!ttc)price??=b;else warning='Vérifiez le prix unitaire net HT : colonne HT non identifiée.'}else warning='Montants ambigus : complétez quantité et prix net HT.'}
  if(!product)warning='Produit à sélectionner dans le catalogue. '+warning;
  if(quantity===null||price===null)warning=warning||'Complétez les valeurs non reconnues.';
  rows.push({product:product?.id||'',quantity,price,source,warning});
 }
 return {supplier,reference,date,lines:rows};
}
