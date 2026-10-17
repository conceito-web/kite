'use strict';
// Conceito: PDV (caixa), importação de XML de compra e exportação para o contador.
// Usa as funções e dados do app.js (data, money, saveData, recordMovement, getSales...).
(function(){
const $=x=>document.getElementById(x), r2=n=>Math.round(Number(n||0)*100)/100;
const brl=n=>Number(n||0).toFixed(2).replace('.',',');
const byName=(a,b)=>a.name.localeCompare(b.name,'pt-BR');
const sessions=()=>data.cashSessions||(data.cashSessions=[]);
const imports=()=>data.xmlImports||(data.xmlImports=[]);
const openSession=()=>sessions().find(s=>!s.closedAt);
let cart=[],pays=[],xmlNotes=[];
const EMAIL_KEY='ckr_contador_email';

// ================= CAIXA / PDV =================
function sessionStats(s){
 const sales=new Map();
 data.movements.forEach(m=>{if(m.type!=='venda'||m.canceled||m.cashSessionId!==s.id)return;const k=m.saleId||m.id,x=sales.get(k)||{total:0,payments:m.payments||[]};x.total+=Number(m.total||0);sales.set(k,x);});
 let total=0,cash=0;const by={};
 sales.forEach(x=>{total+=x.total;x.payments.forEach(p=>{by[p.method]=r2((by[p.method]||0)+p.amount);if(p.method==='Dinheiro')cash+=p.amount;});});
 const ops=s.ops||[],sum=t=>ops.filter(o=>o.type===t).reduce((a,o)=>a+o.amount,0);
 return {count:sales.size,total:r2(total),by,cash:r2(cash),expected:r2(Number(s.opening||0)+cash+sum('suprimento')-sum('sangria'))};
}
function totals(){
 const sub=r2(cart.reduce((a,i)=>a+i.quantity*i.price,0));
 const dc=Math.min(sub,Math.max(0,parseMoneyInput($('pdvDescReais').value)));
 const dp=Math.min(100,Math.max(0,parsePercentInput($('pdvDescPct').value)));
 const total=r2((sub-dc)*(1-dp/100)),paid=r2(pays.reduce((a,p)=>a+p.amount,0));
 return {sub,dc,dp,total,paid,rest:r2(total-paid),change:r2(paid-total)};
}
function render(){
 const s=openSession();
 $('pdvFechado').hidden=!!s;$('pdvAberto').hidden=!s;
 if(!s){
  $('pdvHistCaixa').innerHTML=sessions().filter(x=>x.closedAt).slice(-6).reverse().map(x=>`<tr><td>${esc(dateText(x.openedAt))}</td><td>${esc(x.openedBy||'—')}</td><td>${sessionStats(x).count} · ${money(sessionStats(x).total)}</td><td>${money(x.expected)}</td><td>${money(x.counted)}</td><td>${money(x.counted-x.expected)}</td></tr>`).join('')||'<tr><td colspan="6" class="cart-empty">Nenhum fechamento ainda.</td></tr>';
  return;
 }
 $('pdvCaixaInfo').textContent=`Caixa aberto por ${s.openedBy||'—'} em ${dateText(s.openedAt)} · troco inicial ${money(s.opening)}`;
 $('pdvLinhas').innerHTML=cart.length?cart.map((it,i)=>`<tr><td>${esc(it.name)}</td><td><span class="pdv-qty"><button type="button" data-q="${i}" data-d="-1" aria-label="Diminuir">−</button>${it.quantity}<button type="button" data-q="${i}" data-d="1" aria-label="Aumentar">+</button></span></td><td>${money(it.price)}</td><td>${money(it.quantity*it.price)}</td><td><button type="button" class="cart-remove" data-x="${i}" aria-label="Remover ${esc(it.name)}">×</button></td></tr>`).join(''):'<tr><td colspan="5" class="cart-empty">Bipe ou busque um produto para começar.</td></tr>';
 const t=totals();
 $('pdvSub').textContent=money(t.sub);$('pdvTotal').textContent=money(t.total);
 $('pdvChips').innerHTML=pays.map((p,i)=>`<span class="pdv-chip">${esc(p.method)} ${money(p.amount)}<button type="button" data-px="${i}" aria-label="Remover pagamento">×</button></span>`).join('');
 $('pdvRestoLabel').textContent=t.change>0.009?'Troco':'Falta receber';
 $('pdvResto').textContent=money(t.change>0.009?t.change:Math.max(0,t.rest));
}
function add(p,q=1){
 if(!p||q<1)return;
 const have=cart.filter(x=>x.productId===p.id).reduce((n,x)=>n+x.quantity,0);
 if(have+q>Number(p.stock||0)){toast(`Estoque insuficiente para ${p.name}. Disponível: ${Number(p.stock||0)}.`,true);return;}
 const it=cart.find(x=>x.productId===p.id);
 if(it)it.quantity+=q;else cart.push({productId:p.id,name:p.name,quantity:q,price:r2(p.price),cost:Number(p.cost||0)});
 render();
}
const search=q=>{const w=fold(q).split(/\s+/).filter(Boolean);return w.length?data.products.filter(p=>w.every(x=>fold(p.name+' '+(p.code||'')).includes(x))).sort(byName).slice(0,8):[];};
const parseQuery=()=>{const m=$('pdvBusca').value.match(/^\s*(?:(\d+)\s*\*\s*)?(.*?)\s*$/);return {q:Math.max(1,Number(m[1]||1)),text:m[2]};};
function showSug(){
 const l=search(parseQuery().text),box=$('pdvSug');
 box.hidden=!l.length;
 box.innerHTML=l.map(p=>`<button type="button" data-p="${esc(p.id)}"${Number(p.stock)<1?' disabled':''}><span>${esc(p.name)}${p.code?' · '+esc(p.code):''}</span><b>${money(p.price)} · est. ${Number(p.stock)}</b></button>`).join('');
}
function finish(){
 const s=openSession();
 if(!s){toast('Abra o caixa primeiro.',true);return;}
 if(!cart.length){toast('O carrinho está vazio.',true);return;}
 const t=totals();
 for(const it of cart){const p=productById(it.productId);if(!p||it.quantity>Number(p.stock)){toast(`Estoque insuficiente ou produto removido: ${it.name}.`,true);return;}}
 if(t.rest>0.009){toast(`Falta receber ${money(t.rest)}.`,true);return;}
 const change=t.change>0.009?t.change:0;
 const pay=pays.map(p=>({method:p.method,amount:p.amount,installments:p.method==='Cartão de crédito'?1:null,responsible:p.method==='Cartão de crédito'?'loja':null}));
 if(change){const cp=[...pay].reverse().find(p=>p.method==='Dinheiro'&&p.amount>=change-0.009);if(!cp){toast('O troco só pode sair de um pagamento em dinheiro.',true);return;}cp.amount=r2(cp.amount-change);}
 const payments=pay.filter(p=>p.amount>0.009);
 const client=$('pdvCliente').value.trim(),saleId=Date.now().toString(36).toUpperCase(),date=new Date().toISOString(),customer=findCustomerForSale(client,''),discount=r2(t.sub-t.total);
 let alloc=0;
 const items=cart.map((it,i)=>{let lt;if(i===cart.length-1)lt=r2(t.total-alloc);else{lt=t.sub?r2(r2(it.quantity*it.price)*(t.total/t.sub)):0;alloc+=lt;}return {...it,lineTotal:lt};});
 const payDet=payments.map(x=>`${x.method}: ${money(x.amount)}`).join(' | ');
 const prefix=[client?`Cliente: ${client}`:'',`Venda ${saleId}`,'PDV',`Subtotal: ${money(t.sub)}`,discount?`Desconto total: ${money(discount)}`:'',`Pagamentos: ${payDet}`,change?`Troco: ${money(change)}`:''].filter(Boolean).join(' · ');
 cart.forEach((it,i)=>{
  const p=productById(it.productId),costTotal=r2(it.cost*it.quantity);
  p.stock-=it.quantity;
  recordMovement('venda',p,it.quantity,items[i].lineTotal,`${prefix} · Item ${i+1}/${cart.length}`,{client,clientCpf:customer?customer.cpf||'':'',customerId:customer?customer.id:'',note:'',payments,subtotal:t.sub,discountCash:t.dc,discountPercent:t.dp,unitPrice:it.price,unitCost:it.cost,costTotal,profit:r2(items[i].lineTotal-costTotal),saleId,date,cashSessionId:s.id,source:'pdv',cashReceived:t.paid,change});
 });
 const rec={id:saleId,date,client,note:'',items,subtotal:t.sub,discount,total:t.total,payments,paid:t.paid,change};
 cart=[];pays=[];['pdvCliente','pdvDescReais','pdvDescPct','pdvPagValor','pdvBusca'].forEach(k=>$(k).value='');
 if(saveData()){
  lastReceipt=rec;
  $('pdvPos').hidden=false;
  $('pdvPosTexto').textContent=`Venda ${saleId} registrada${change?` · troco ${money(change)}`:''}.`;
  toast('Venda registrada e estoque atualizado.');
 }
 render();$('pdvBusca').focus();
}
function printCoupon(r){
 const rows=r.items.map(i=>`<tr><td colspan="2">${esc(i.name)}</td></tr><tr><td>${i.quantity} x ${money(i.price)}</td><td class="r">${money(i.lineTotal)}</td></tr>`).join('');
 const pay=(r.payments||[]).map(p=>`<tr><td>${esc(p.method)}</td><td class="r">${money(p.amount)}</td></tr>`).join('');
 const html=`<!doctype html><meta charset="utf-8"><style>@page{size:80mm auto;margin:3mm}body{font:12px/1.4 monospace;width:74mm;margin:0}h1{font-size:15px;text-align:center;margin:0}.c{text-align:center}.r{text-align:right}table{width:100%;border-collapse:collapse}hr{border:0;border-top:1px dashed #000}</style><h1>CONCEITO</h1><p class="c">CUPOM NÃO FISCAL<br>${esc(new Date(r.date).toLocaleString('pt-BR'))}<br>Venda ${esc(r.id)}${r.client?'<br>Cliente: '+esc(r.client):''}</p><hr><table>${rows}</table><hr><table>${r.discount>0?`<tr><td>Subtotal</td><td class="r">${money(r.subtotal)}</td></tr><tr><td>Desconto</td><td class="r">- ${money(r.discount)}</td></tr>`:''}<tr><td><b>TOTAL</b></td><td class="r"><b>${money(r.total)}</b></td></tr>${pay}${r.change>0?`<tr><td>Troco</td><td class="r">${money(r.change)}</td></tr>`:''}</table><hr><p class="c">Garantia de 3 meses (90 dias).<br>Obrigado pela preferência!</p>`;
 const f=document.createElement('iframe');
 f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';
 document.body.appendChild(f);
 f.contentDocument.open();f.contentDocument.write(html);f.contentDocument.close();
 setTimeout(()=>{f.contentWindow.focus();f.contentWindow.print();setTimeout(()=>f.remove(),1500);},250);
}
function cashOp(type){
 const s=openSession();if(!s)return;
 const raw=prompt(type==='sangria'?'Sangria (retirada de dinheiro) em R$ — digite 1050 para R$ 10,50:':'Suprimento (entrada de dinheiro) em R$ — digite 1050 para R$ 10,50:','');
 if(raw===null)return;
 const v=parseMoneyInput(raw);if(v<=0){toast('Informe um valor maior que zero.',true);return;}
 const note=prompt('Motivo (opcional):','')||'';
 (s.ops=s.ops||[]).push({type,amount:v,note,date:new Date().toISOString(),by:currentUserName()});
 if(saveData())toast(`${type==='sangria'?'Sangria':'Suprimento'} de ${money(v)} registrado.`);
}
function closeCash(){
 const s=openSession();if(!s)return;
 if(cart.length&&!confirm('Há itens no carrinho. Eles serão descartados. Fechar o caixa mesmo assim?'))return;
 const st=sessionStats(s);
 const raw=prompt(`Fechamento do caixa\nVendas: ${st.count} · ${money(st.total)}\nDinheiro esperado na gaveta: ${money(st.expected)}\n\nDigite o dinheiro contado (R$):`,'');
 if(raw===null)return;
 if(!raw.trim()){toast('Informe o valor contado (pode ser 0).',true);return;}
 const counted=parseMoneyInput(raw);
 Object.assign(s,{closedAt:new Date().toISOString(),closedBy:currentUserName(),counted,expected:st.expected});
 cart=[];pays=[];
 if(saveData())alert(`Caixa fechado.\n\n${Object.entries(st.by).map(([k,v])=>`${k}: ${money(v)}`).join('\n')||'Sem vendas.'}\n\nEsperado em dinheiro: ${money(st.expected)}\nContado: ${money(counted)}\nDiferença: ${money(counted-st.expected)}`);
}
['pdvAbertura','pdvDescReais','pdvPagValor'].forEach(k=>bindMoneyMask($(k)));
bindPercentInput($('pdvDescPct'));
['pdvDescReais','pdvDescPct'].forEach(k=>{$(k).addEventListener('input',render);$(k).addEventListener('money-mask-updated',render);});
$('pdvAbrir').addEventListener('click',()=>{sessions().push({id:id(),openedAt:new Date().toISOString(),openedBy:currentUserName(),opening:parseMoneyInput($('pdvAbertura').value),ops:[]});if(saveData()){$('pdvPos').hidden=true;toast('Caixa aberto.');setTimeout(()=>$('pdvBusca').focus(),50);}});
$('pdvSangria').addEventListener('click',()=>cashOp('sangria'));
$('pdvSuprimento').addEventListener('click',()=>cashOp('suprimento'));
$('pdvFechar').addEventListener('click',closeCash);
$('pdvFinalizar').addEventListener('click',finish);
$('pdvImprimir').addEventListener('click',()=>{if(lastReceipt)printCoupon(lastReceipt);});
$('pdvPdf').addEventListener('click',()=>{if(lastReceipt)createReceiptPdf(lastReceipt);});
$('pdvBusca').addEventListener('input',()=>{$('pdvPos').hidden=true;showSug();});
$('pdvBusca').addEventListener('keydown',e=>{
 if(e.key==='Escape'){$('pdvBusca').value='';$('pdvSug').hidden=true;return;}
 if(e.key!=='Enter')return;
 e.preventDefault();
 const {q,text}=parseQuery();if(!text)return;
 const exact=data.products.find(p=>p.code&&fold(p.code)===fold(text)),l=search(text),p=exact||(l.length===1?l[0]:null);
 if(!p){toast(l.length?'Escolha o produto na lista.':'Produto não encontrado.',true);return;}
 add(p,q);$('pdvBusca').value='';$('pdvSug').hidden=true;
});
$('pdvSug').addEventListener('click',e=>{const b=e.target.closest('[data-p]');if(!b)return;add(productById(b.dataset.p),parseQuery().q);$('pdvBusca').value='';$('pdvSug').hidden=true;$('pdvBusca').focus();});
$('pdvLinhas').addEventListener('click',e=>{
 const q=e.target.closest('[data-q]'),x=e.target.closest('[data-x]');
 if(q){const it=cart[+q.dataset.q],n=it.quantity+Number(q.dataset.d),p=productById(it.productId);if(n<1)cart.splice(+q.dataset.q,1);else if(!p||n>Number(p.stock)){toast('Estoque insuficiente.',true);return;}else it.quantity=n;render();}
 else if(x){cart.splice(+x.dataset.x,1);render();}
});
$('pdvChips').addEventListener('click',e=>{const b=e.target.closest('[data-px]');if(b){pays.splice(+b.dataset.px,1);render();}});
$('pdvPagMetodo').addEventListener('change',()=>{const t=totals();$('pdvPagValor').value=t.rest>0?t.rest.toLocaleString('pt-BR',{minimumFractionDigits:2}):'';});
$('pdvPagAdd').addEventListener('click',()=>{
 const method=$('pdvPagMetodo').value,t=totals(),amount=parseMoneyInput($('pdvPagValor').value)||Math.max(0,t.rest);
 if(!method){toast('Escolha a forma de pagamento.',true);return;}
 if(amount<=0){toast('Informe o valor pago.',true);return;}
 pays.push({method,amount:r2(amount)});$('pdvPagValor').value='';$('pdvPagMetodo').value='';render();
});
document.addEventListener('keydown',e=>{if(e.key==='F2'&&$('panel-pdv').classList.contains('active')&&!$('pdvAberto').hidden){e.preventDefault();finish();}});

// ================= IMPORTAR XML (NF-e de compra) =================
const idb=()=>new Promise((ok,err)=>{const q=indexedDB.open('conceito_xml',1);q.onupgradeneeded=()=>q.result.createObjectStore('xml');q.onsuccess=()=>ok(q.result);q.onerror=()=>err(q.error);});
const xmlPut=async(k,v)=>{const d=await idb();return new Promise((ok,err)=>{const t=d.transaction('xml','readwrite');t.objectStore('xml').put(v,k);t.oncomplete=ok;t.onerror=()=>err(t.error);});};
const xmlGet=async k=>{const d=await idb();return new Promise((ok,err)=>{const q=d.transaction('xml').objectStore('xml').get(k);q.onsuccess=()=>ok(q.result);q.onerror=()=>err(q.error);});};
function parseNfe(text){
 const doc=new DOMParser().parseFromString(text,'application/xml');
 if(doc.getElementsByTagName('parsererror').length)throw Error('XML inválido');
 const g=(el,n)=>{const x=el&&el.getElementsByTagNameNS('*',n)[0];return x?x.textContent.trim():'';};
 const inf=doc.getElementsByTagNameNS('*','infNFe')[0];
 if(!inf)throw Error('Não é NF-e/NFC-e');
 const key=(inf.getAttribute('Id')||'').replace(/^NFe/,'')||g(doc.documentElement,'chNFe');
 if(!key)throw Error('Sem chave de acesso');
 const ide=inf.getElementsByTagNameNS('*','ide')[0],emit=inf.getElementsByTagNameNS('*','emit')[0];
 const items=[...inf.getElementsByTagNameNS('*','det')].map(d=>{
  const pr=d.getElementsByTagNameNS('*','prod')[0],n=x=>Number(g(pr,x))||0,qty=n('qCom'),tot=n('vProd')-n('vDesc')+n('vFrete')+n('vSeg')+n('vOutro'),ean=g(pr,'cEAN');
  return {code:g(pr,'cProd'),ean:/^\d{8,14}$/.test(ean)?ean:'',name:g(pr,'xProd'),un:g(pr,'uCom'),qty,cost:qty?r2(tot/qty):0};
 });
 return {key,number:g(ide,'nNF'),serie:g(ide,'serie'),date:g(ide,'dhEmi')||g(ide,'dEmi'),supplier:g(emit,'xNome')||g(emit,'xFant'),cnpj:g(emit,'CNPJ')||g(emit,'CPF'),total:Number(g(inf,'vNF'))||0,items};
}
function matchProduct(it){const c=fold(it.code),nm=fold(it.name);return data.products.find(p=>p.code&&(fold(p.code)===c||(it.ean&&fold(p.code)===it.ean)))||data.products.find(p=>fold(p.name)===nm)||null;}
const margin=()=>parsePercentInput($('xmlMargem').value);
function xmlRow(ni,it,ii){
 const p=matchProduct(it);
 const opts='<option value="">Cadastrar como novo</option><option value="skip">Ignorar este item</option>'+data.products.slice().sort(byName).map(q=>`<option value="${esc(q.id)}"${p&&p.id===q.id?' selected':''}>${esc(q.name)}</option>`).join('');
 return `<tr data-xn="${ni}" data-xi="${ii}"><td>${esc(it.name)}<br><small>${esc(it.code||it.ean)}</small></td><td>${it.qty} ${esc(it.un)}</td><td><select class="xml-act">${opts}</select></td><td><input class="xml-cost" inputmode="numeric" value="${brl(it.cost)}"></td><td><input class="xml-price" inputmode="numeric" value="${brl(p?p.price:r2(it.cost*(1+margin()/100)))}"${p?' disabled':''}></td></tr>`;
}
function xmlRender(){
 $('xmlRevisao').innerHTML=xmlNotes.map((n,ni)=>`<section class="surface list-surface xml-note"><h3>${esc(n.supplier||'Fornecedor')} · NF ${esc(n.number)}/${esc(n.serie)}</h3><p class="subtitle">${esc(n.file)} · emitida em ${n.date?esc(new Date(n.date).toLocaleDateString('pt-BR')):'—'} · total ${money(n.total)}${n.dup?' · <b>já importada, será ignorada</b>':''}</p>${n.dup?'':`<div class="table-wrap"><table class="xml-table"><thead><tr><th>ITEM DA NOTA</th><th>QTD.</th><th>ENTRA COMO</th><th>CUSTO UNIT.</th><th>PREÇO DE VENDA</th></tr></thead><tbody>${n.items.map((it,ii)=>xmlRow(ni,it,ii)).join('')}</tbody></table></div>`}</section>`).join('');
 document.querySelectorAll('.xml-cost,.xml-price').forEach(i=>bindMoneyMask(i));
 $('xmlAcoes').hidden=!xmlNotes.some(n=>!n.dup);
}
function xmlHist(){
 $('xmlHist').innerHTML=imports().slice().reverse().map(n=>`<tr><td>${esc(dateText(n.importedAt))}</td><td>${esc(n.supplier||'—')}</td><td>${esc(n.number)}/${esc(n.serie)}</td><td>${money(n.total)}</td><td>${n.items}</td></tr>`).join('');
 $('xmlHistVazio').style.display=imports().length?'none':'block';
}
function setPrice(tr){
 const act=tr.querySelector('.xml-act').value,pi=tr.querySelector('.xml-price'),p=productById(act);
 pi.disabled=act!==''; 
 if(p)pi.value=brl(p.price);
 else if(act==='')pi.value=brl(r2(parseMoneyInput(tr.querySelector('.xml-cost').value)*(1+margin()/100)));
}
$('xmlRevisao').addEventListener('change',e=>{if(e.target.classList.contains('xml-act'))setPrice(e.target.closest('tr'));});
$('xmlMargem').addEventListener('input',()=>document.querySelectorAll('#xmlRevisao tr[data-xn]').forEach(tr=>{if(tr.querySelector('.xml-act').value==='')setPrice(tr);}));
$('xmlArquivos').addEventListener('change',async e=>{
 xmlNotes=[];const keys=new Set(imports().map(n=>n.key)),bad=[];
 for(const f of e.target.files){
  try{const text=await f.text(),n=parseNfe(text);n.file=f.name;n.text=text;n.dup=keys.has(n.key)||xmlNotes.some(x=>x.key===n.key);xmlNotes.push(n);}catch(err){bad.push(f.name);}
 }
 if(bad.length)toast(`Não foi possível ler: ${bad.join(', ')}`,true);
 xmlRender();
});
$('xmlCancelar').addEventListener('click',()=>{xmlNotes=[];$('xmlArquivos').value='';xmlRender();});
$('xmlConfirmar').addEventListener('click',async()=>{
 const rows=[...document.querySelectorAll('#xmlRevisao tr[data-xn]')].map(tr=>({tr,n:xmlNotes[+tr.dataset.xn],it:xmlNotes[+tr.dataset.xn].items[+tr.dataset.xi],act:tr.querySelector('.xml-act').value,cost:parseMoneyInput(tr.querySelector('.xml-cost').value),price:parseMoneyInput(tr.querySelector('.xml-price').value)})).filter(x=>x.act!=='skip');
 const bad=rows.find(x=>x.act===''&&(x.price<=0||!x.it.name));
 if(bad){toast(`Informe o preço de venda de "${bad.it.name}".`,true);return;}
 if(!rows.length){toast('Nenhum item para importar.',true);return;}
 if(!confirm(`Dar entrada em ${rows.length} item(ns) no estoque?`))return;
 const upd=$('xmlAtualizaCusto').checked,done=new Set();let novos=0;
 try{for(const n of xmlNotes)if(!n.dup&&rows.some(x=>x.n===n)){await xmlPut(n.key,n.text);}}
 catch(err){toast('Não foi possível guardar os arquivos XML neste navegador.',true);return;}
 rows.forEach(({n,it,act,cost,price})=>{
  let p;
  if(act===''){p={id:id(),name:it.name,code:it.code||it.ean||'',cost,price,stock:0};data.products.push(p);novos++;}
  else{p=productById(act);if(upd&&cost>0)p.cost=cost;}
  p.stock=Number(p.stock||0)+it.qty;
  recordMovement('entrada',p,it.qty,r2(cost*it.qty),`NF-e ${n.number}/${n.serie} · ${n.supplier}`,{xmlKey:n.key,supplier:n.supplier,supplierCnpj:n.cnpj,nfNumber:n.number,unitCost:cost});
  done.add(n);
 });
 done.forEach(n=>imports().push({key:n.key,number:n.number,serie:n.serie,supplier:n.supplier,cnpj:n.cnpj,date:n.date,total:n.total,importedAt:new Date().toISOString(),importedBy:currentUserName(),items:rows.filter(x=>x.n===n).length}));
 xmlNotes=[];$('xmlArquivos').value='';
 if(saveData()){xmlRender();toast(`Entrada feita: ${rows.length} item(ns), ${novos} produto(s) novo(s).`);}
});

// ================= EXPORTAR PARA O CONTADOR =================
async function zipMonth(){
 const ym=$('ctMes').value;
 if(!ym){toast('Escolha o mês.',true);return null;}
 if(!window.JSZip){toast('A biblioteca de ZIP não carregou. Verifique a internet.',true);return null;}
 const zip=new JSZip(),cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"',csv=rows=>'\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n');
 const sales=getSales().filter(s=>localDateKey(s.date).slice(0,7)===ym).sort((a,b)=>new Date(a.date)-new Date(b.date));
 const vr=[['Venda','Data','Cliente','CPF','Produto','Código','Qtd.','Valor unitário','Total do item','Situação','Pagamentos']];
 sales.forEach(s=>s.items.forEach(i=>vr.push([s.id,new Date(s.date).toLocaleString('pt-BR'),s.client,s.cpf,i.name,i.code,i.quantity,brl(i.price),brl(i.lineTotal),s.canceled?'Cancelada':'Ativa',(s.payments||[]).map(p=>`${p.method} ${brl(p.amount)}`).join(' + ')])));
 const notes=imports().filter(n=>String(n.date||'').slice(0,7)===ym).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 const cr=[['Emissão','Fornecedor','CNPJ/CPF','Número','Série','Chave de acesso','Valor total']];
 const missing=[];
 for(const n of notes){
  cr.push([n.date?new Date(n.date).toLocaleDateString('pt-BR'):'',n.supplier,n.cnpj,n.number,n.serie,n.key,brl(n.total)]);
  let t=null;try{t=await xmlGet(n.key);}catch(e){}
  if(t)zip.file(`xml-compras/${n.key}.xml`,t);else missing.push(`${n.number}/${n.serie} (${n.supplier})`);
 }
 const ativas=sales.filter(s=>!s.canceled);
 zip.file(`vendas-${ym}.csv`,csv(vr));
 zip.file(`compras-${ym}.csv`,csv(cr));
 zip.file('resumo.txt',[`Conceito · pacote do contador · ${ym}`,`Vendas ativas: ${ativas.length} · ${money(ativas.reduce((a,s)=>a+s.total,0))}`,`Vendas canceladas: ${sales.length-ativas.length}`,`Notas de compra (XML): ${notes.length-missing.length} de ${notes.length}`,missing.length?`XML original ausente neste aparelho: ${missing.join('; ')}`:'','As NFC-e de venda são emitidas em outro sistema e não fazem parte deste pacote.'].filter(Boolean).join('\r\n'));
 return {blob:await zip.generateAsync({type:'blob'}),name:`conceito-contador-${ym}.zip`,ym,missing};
}
function saveBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);}
function ctPreview(){
 const ym=$('ctMes').value;if(!ym){$('ctPrev').textContent='';return;}
 const s=getSales().filter(x=>!x.canceled&&localDateKey(x.date).slice(0,7)===ym),n=imports().filter(x=>String(x.date||'').slice(0,7)===ym);
 $('ctPrev').textContent=`${s.length} venda(s) · ${money(s.reduce((a,x)=>a+x.total,0))} · ${n.length} nota(s) de compra com XML`;
}
$('ctBaixar').addEventListener('click',async()=>{const z=await zipMonth();if(z){saveBlob(z.blob,z.name);toast(z.missing.length?'ZIP gerado, mas faltam XML (veja resumo.txt).':'ZIP gerado.',z.missing.length>0);}});
$('ctEnviar').addEventListener('click',async()=>{
 const email=$('ctEmail').value.trim();
 if(!email||!$('ctEmail').checkValidity()){toast('Informe um e-mail válido do contador.',true);return;}
 try{localStorage.setItem(EMAIL_KEY,email);}catch(e){}
 const z=await zipMonth();if(!z)return;
 const title=`Conceito - documentos de ${z.ym}`,text=`Olá! Segue em anexo o pacote de ${z.ym} (XML das compras e planilhas de vendas e compras).`;
 const file=new File([z.blob],z.name,{type:'application/zip'});
 if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title,text});return;}catch(e){if(e.name==='AbortError')return;}}
 saveBlob(z.blob,z.name);
 location.href=`mailto:${email}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text+'\n\n(Anexe o arquivo '+z.name+' que acabou de ser baixado.)')}`;
 toast('ZIP baixado. Anexe o arquivo no e-mail que abriu.');
});
$('ctMes').addEventListener('change',ctPreview);
try{$('ctEmail').value=localStorage.getItem(EMAIL_KEY)||'';}catch(e){}
{const d=new Date();$('ctMes').value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}

// ================= integração =================
const baseRender=window.renderAll;
window.renderAll=function(){baseRender();render();xmlHist();ctPreview();};
render();xmlHist();ctPreview();
})();
