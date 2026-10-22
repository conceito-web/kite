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
 $('pdvChips').innerHTML=pays.map((p,i)=>`<span class="pdv-chip">${esc(p.method)}${p.installments>1?' '+p.installments+'x':''}${p.responsible==='fabrica'?' (fábrica)':''} ${money(p.amount)}<button type="button" data-px="${i}" aria-label="Remover pagamento">×</button></span>`).join('');
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
// Busca do PDV: ignora acentos/maiúsculas; várias palavras valem em qualquer ordem.
// Com o quadrinho "Mostrar só produtos com estoque" marcado, produtos com estoque zerado não aparecem.
const search=q=>{const w=fold(q).split(/\s+/).filter(Boolean),so=$('pdvSoEstoque')&&$('pdvSoEstoque').checked;return w.length?data.products.filter(p=>(!so||Number(p.stock)>0)&&w.every(x=>fold(p.name+' '+(p.code||'')).includes(x))).sort(byName).slice(0,8):[];};
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
 const pay=pays.map(p=>({...p}));
 if(change){const cp=[...pay].reverse().find(p=>p.method==='Dinheiro'&&p.amount>=change-0.009);if(!cp){toast('O troco só pode sair de um pagamento em dinheiro.',true);return;}cp.amount=r2(cp.amount-change);}
 const payments=pay.filter(p=>p.amount>0.009);
 const client=$('pdvCliente').value.trim(),saleId=Date.now().toString(36).toUpperCase(),date=new Date().toISOString(),customer=findCustomerForSale(client,''),discount=r2(t.sub-t.total);
 if(payments.length){const perr=validatePayments(payments,client);if(perr){toast(perr,true);return;}}
 let alloc=0;
 const plan=planFifo(cart);
 const items=cart.map((it,i)=>{let lt;if(i===cart.length-1)lt=r2(t.total-alloc);else{lt=t.sub?r2(r2(it.quantity*it.price)*(t.total/t.sub)):0;alloc+=lt;}return {...it,cost:plan[i].unitCost,lineTotal:lt};});
 const fin=calcSaleFinance(items.map(it=>({lineTotal:it.lineTotal,quantity:it.quantity,unitCost:it.cost})),t.total,payments),payDet=payments.map(payLabel).join(' | ');
 const prefix=[client?`Cliente: ${client}`:'',`Venda ${saleId}`,'PDV',`Subtotal: ${money(t.sub)}`,discount?`Desconto total: ${money(discount)}`:'',`Pagamentos: ${payDet}`,change?`Troco: ${money(change)}`:''].filter(Boolean).join(' · ');
 cart.forEach((it,i)=>{
  const p=productById(it.productId),costTotal=plan[i].costTotal;
  stockOut(p,it.quantity,plan[i].allocs);
  recordMovement('venda',p,it.quantity,items[i].lineTotal,`${prefix} · Item ${i+1}/${cart.length}`,{client,clientCpf:customer?customer.cpf||'':'',customerId:customer?customer.id:'',note:'',payments:fin.payments,subtotal:t.sub,discountCash:t.dc,discountPercent:t.dp,unitPrice:it.price,unitCost:items[i].cost,fifo:plan[i].allocs,costTotal,profit:fin.items[i].profit,fee:fin.items[i].fee,factoryCredit:fin.items[i].factoryCredit,saleId,date,cashSessionId:s.id,source:'pdv',cashReceived:t.paid,change});
 });
 const rec={id:saleId,date,client,note:'',items,subtotal:t.sub,discount,total:t.total,payments:fin.payments,paid:t.paid,change};
 receivables().push(...buildReceivables(saleId,client,customer,fin.payments,date));markQuoteSold(saleId,'pdv');
 cart=[];pays=[];['pdvCliente','pdvDescReais','pdvDescPct','pdvPagValor','pdvBusca'].forEach(k=>$(k).value='');$('pdvPagMetodo').value='';pdvSync();
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
 const pay=(r.payments||[]).map(p=>`<tr><td>${esc(p.method)}${p.installments>1?' '+p.installments+'x':''}</td><td class="r">${money(p.amount)}</td></tr>`+(p.method===PM.PROM?promissorySchedule(p).map(x=>`<tr><td>&nbsp;${x.n}/${x.of} venc. ${brDate(x.dueDate)}</td><td class="r">${money(x.amount)}</td></tr>`).join(''):'')).join('');
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
$('pdvSoEstoque').addEventListener('change',showSug);
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
function pdvSync(){const t=totals();syncPayExtra($('pdvPagExtra'),$('pdvPagMetodo').value,r2(parseMoneyInput($('pdvPagValor').value)||Math.max(0,t.rest)));}
$('pdvPagExtra').innerHTML=payExtraHtml();
['pagamentoBandeira','pagamentoResponsavel','pagamentoVencimento','pagamentoExtendido'].forEach(c=>$('pdvPagExtra').querySelector('.'+c).addEventListener('change',pdvSync));
$('pdvPagExtra').querySelector('.pagamentoParcelas').addEventListener('input',pdvSync);
$('pdvPagValor').addEventListener('input',pdvSync);$('pdvPagValor').addEventListener('money-mask-updated',pdvSync);
$('pdvPagMetodo').addEventListener('change',()=>{const t=totals();$('pdvPagValor').value=t.rest>0?t.rest.toLocaleString('pt-BR',{minimumFractionDigits:2}):'';pdvSync();});
$('pdvPagAdd').addEventListener('click',()=>{
 const method=$('pdvPagMetodo').value,t=totals(),amount=parseMoneyInput($('pdvPagValor').value)||Math.max(0,t.rest);
 if(!method){toast('Escolha a forma de pagamento.',true);return;}
 if(amount<=0){toast('Informe o valor pago.',true);return;}
 const px=readPayExtra($('pdvPagExtra'),method,r2(amount)),perr=validatePayments([px],$('pdvCliente').value.trim());
 if(perr){toast(perr,true);return;}
 pays.push(px);$('pdvPagValor').value='';$('pdvPagMetodo').value='';$('pdvPagExtra').querySelector('.pagamentoParcelas').value='1';$('pdvPagExtra').querySelector('.pagamentoVencimento').value='';$('pdvPagExtra').querySelector('.pagamentoResponsavel').value='loja';$('pdvPagExtra').querySelector('.pagamentoBandeira').value='vm';$('pdvPagExtra').querySelector('.pagamentoExtendido').checked=true;pdvSync();render();
});
document.addEventListener('keydown',e=>{if(e.key==='F2'&&$('panel-pdv').classList.contains('active')&&!$('pdvAberto').hidden){e.preventDefault();finish();}});

// ================= IMPORTAR XML (NF-e de compra) =================
const idb=()=>new Promise((ok,err)=>{const q=indexedDB.open('conceito_xml',1);q.onupgradeneeded=()=>q.result.createObjectStore('xml');q.onsuccess=()=>ok(q.result);q.onerror=()=>err(q.error);});
const xmlPut=async(k,v)=>{const d=await idb();return new Promise((ok,err)=>{const t=d.transaction('xml','readwrite');t.objectStore('xml').put(v,k);t.oncomplete=ok;t.onerror=()=>err(t.error);});};
const xmlGet=async k=>{const d=await idb();return new Promise((ok,err)=>{const q=d.transaction('xml').objectStore('xml').get(k);q.onsuccess=()=>ok(q.result);q.onerror=()=>err(q.error);});};
function allocateCents(total,weights){
 const sum=weights.reduce((x,y)=>x+y,0),cents=Math.round(total*100);
 if(!(cents>0)||!(sum>0))return weights.map(()=>0);
 const out=weights.map(w=>Math.round(cents*w/sum)),diff=cents-out.reduce((x,y)=>x+y,0);
 out[out.indexOf(Math.max(...out))]+=diff;
 return out.map(c=>c/100);
}
function parseNfe(text){
 const doc=new DOMParser().parseFromString(text,'application/xml');
 if(doc.getElementsByTagName('parsererror').length)throw Error('XML inválido');
 const g=(el,n)=>{const x=el&&el.getElementsByTagNameNS('*',n)[0];return x?x.textContent.trim():'';};
 const inf=doc.getElementsByTagNameNS('*','infNFe')[0];
 if(!inf)throw Error('Não é NF-e/NFC-e');
 const key=(inf.getAttribute('Id')||'').replace(/^NFe/,'')||g(doc.documentElement,'chNFe');
 if(!key)throw Error('Sem chave de acesso');
 const ide=inf.getElementsByTagNameNS('*','ide')[0],emit=inf.getElementsByTagNameNS('*','emit')[0],tot=inf.getElementsByTagNameNS('*','ICMSTot')[0];
 const items=[...inf.getElementsByTagNameNS('*','det')].map(d=>{
  const pr=d.getElementsByTagNameNS('*','prod')[0],n=x=>Number(g(pr,x))||0,qty=n('qCom'),ean=g(pr,'cEAN');
  const base=r2(n('vProd')-n('vDesc')),frete=n('vFrete'),seg=n('vSeg'),outro=n('vOutro'),own=r2(frete+seg+outro);
  return {code:g(pr,'cProd'),ean:/^\d{8,14}$/.test(ean)?ean:'',name:g(pr,'xProd'),un:g(pr,'uCom'),qty,base,frete,seg,outro,cost:qty?r2((base+own)/qty):0};
 });
 // Rateio: frete, seguro e outras despesas informados só no TOTAL da nota (o que sobra depois do que já veio item a item).
 const nt=x=>Number(g(tot,x))||0,left=(k,sum)=>Math.max(0,r2(nt(k)-sum));
 const rateio={frete:left('vFrete',items.reduce((a,i)=>a+i.frete,0)),seg:left('vSeg',items.reduce((a,i)=>a+i.seg,0)),outro:left('vOutro',items.reduce((a,i)=>a+i.outro,0))};
 rateio.total=r2(rateio.frete+rateio.seg+rateio.outro);
 const weights=items.some(i=>i.base>0)?items.map(i=>i.base):items.map(i=>i.qty),shares=allocateCents(rateio.total,weights);
 items.forEach((i,k)=>{i.share=shares[k];i.costRateio=i.qty?r2((i.base+i.frete+i.seg+i.outro+i.share)/i.qty):0;});
 return {key,number:g(ide,'nNF'),serie:g(ide,'serie'),date:g(ide,'dhEmi')||g(ide,'dEmi'),supplier:g(emit,'xNome')||g(emit,'xFant'),cnpj:g(emit,'CNPJ')||g(emit,'CPF'),total:Number(g(inf,'vNF'))||0,items,rateio};
}
// ---- vínculos lembrados (fornecedor + código/EAN/nome do item da nota -> produto do Conceito) ----
const links=()=>data.productLinks||(data.productLinks={});
const supKey=n=>fold(n.cnpj||n.supplier||'');
const linkKeys=(n,it)=>[it.code&&`${supKey(n)}|c|${fold(it.code)}`,it.ean&&`${supKey(n)}|e|${it.ean}`,it.name&&`${supKey(n)}|n|${fold(it.name)}`].filter(Boolean);
function linkedProduct(n,it){for(const k of linkKeys(n,it)){const l=links()[k],p=l&&productById(l.productId);if(p)return p;}return null;}
function saveLink(n,it,p){const ks=linkKeys(n,it);if(!ks.length)return;const group=id();ks.forEach((k,i)=>{links()[k]={productId:p.id,group,primary:i===0,supplier:n.supplier||'',itemName:it.name||'',itemCode:it.code||it.ean||''};});}
function matchProduct(it){const c=fold(it.code),nm=fold(it.name);return data.products.find(p=>p.code&&(fold(p.code)===c||(it.ean&&fold(p.code)===it.ean)))||data.products.find(p=>fold(p.name)===nm)||null;}
const margin=()=>parsePercentInput($('xmlMargem').value);
const rateioOn=()=>$('xmlRateio').checked;
function xmlRow(ni,it,ii){
 const n=xmlNotes[ni],lp=linkedProduct(n,it),p=lp||matchProduct(it),cost=rateioOn()?it.costRateio:it.cost;
 const opts='<option value="">Cadastrar como novo</option><option value="skip">Ignorar este item</option>'+data.products.slice().sort(byName).map(q=>`<option value="${esc(q.id)}"${p&&p.id===q.id?' selected':''}>${esc(q.name)}</option>`).join('');
 return `<tr data-xn="${ni}" data-xi="${ii}"><td>${esc(it.name)}<br><small>${esc(it.code||it.ean)}</small><br><small class="xml-share"></small></td><td>${it.qty} ${esc(it.un)}</td><td><select class="xml-act">${opts}</select>${lp?'<br><small class="xml-linked">✓ vínculo lembrado</small>':''}</td><td><input class="xml-cost" inputmode="numeric" value="${brl(cost)}"></td><td><input class="xml-price" inputmode="numeric" value="${brl(p?p.price:r2(cost*(1+margin()/100)))}"${p?' disabled':''}></td></tr>`;
}
function applyRateio(){
 const on=rateioOn();
 document.querySelectorAll('#xmlRevisao tr[data-xn]').forEach(tr=>{
  const it=xmlNotes[+tr.dataset.xn].items[+tr.dataset.xi];
  tr.querySelector('.xml-cost').value=brl(on?it.costRateio:it.cost);
  tr.querySelector('.xml-share').textContent=on&&it.share>0?`+ ${money(it.share)} de frete/despesas rateados`:'';
  setPrice(tr);
 });
 document.querySelectorAll('.xml-rateio-note').forEach(p=>{const t=xmlNotes[+p.dataset.ni].rateio.total;p.hidden=!(t>0);p.textContent=t>0?(on?`Frete/despesas de ${money(t)} cobrados no total da nota foram rateados entre os itens, proporcional ao valor de cada um.`:`Atenção: ${money(t)} de frete/despesas cobrados no total da nota NÃO entraram no custo dos itens.`):'';});
}
function xmlRender(){
 $('xmlRevisao').innerHTML=xmlNotes.map((n,ni)=>`<section class="surface list-surface xml-note"><h3>${esc(n.supplier||'Fornecedor')} · NF ${esc(n.number)}/${esc(n.serie)}</h3><p class="subtitle">${esc(n.file)} · emitida em ${n.date?esc(new Date(n.date).toLocaleDateString('pt-BR')):'—'} · total ${money(n.total)}${n.dup?' · <b>já importada, será ignorada</b>':''}</p>${n.dup?'':`<p class="subtitle xml-rateio-note" data-ni="${ni}" hidden></p>`}${n.dup?'':`<div class="table-wrap"><table class="xml-table"><thead><tr><th>ITEM DA NOTA</th><th>QTD.</th><th>ENTRA COMO</th><th>CUSTO UNIT.</th><th>PREÇO DE VENDA</th></tr></thead><tbody>${n.items.map((it,ii)=>xmlRow(ni,it,ii)).join('')}</tbody></table></div>`}</section>`).join('');
 document.querySelectorAll('.xml-cost,.xml-price').forEach(i=>bindMoneyMask(i));
 applyRateio();
 $('xmlAcoes').hidden=!xmlNotes.some(n=>!n.dup);
}
function xmlHist(){
 $('xmlHist').innerHTML=imports().slice().reverse().map(n=>`<tr><td>${esc(dateText(n.importedAt))}</td><td>${esc(n.supplier||'—')}</td><td>${esc(n.number)}/${esc(n.serie)}</td><td>${money(n.total)}</td><td>${n.items}</td></tr>`).join('');
 $('xmlHistVazio').style.display=imports().length?'none':'block';
 const ls=Object.values(links()).filter(l=>l.primary).sort((x,y)=>(x.supplier+x.itemName).localeCompare(y.supplier+y.itemName,'pt-BR'));
 $('xmlLinks').innerHTML=ls.map(l=>{const p=productById(l.productId);return `<tr><td>${esc(l.supplier||'—')}</td><td>${esc(l.itemName)}<br><small>${esc(l.itemCode)}</small></td><td>${p?esc(p.name):'<i>produto excluído</i>'}</td><td><button type="button" class="row-action delete" data-link-group="${esc(l.group)}">Remover</button></td></tr>`;}).join('');
 $('xmlLinksVazio').style.display=ls.length?'none':'block';
}
function setPrice(tr){
 const act=tr.querySelector('.xml-act').value,pi=tr.querySelector('.xml-price'),p=productById(act);
 pi.disabled=act!==''; 
 if(p)pi.value=brl(p.price);
 else if(act==='')pi.value=brl(r2(parseMoneyInput(tr.querySelector('.xml-cost').value)*(1+margin()/100)));
}
$('xmlRevisao').addEventListener('change',e=>{if(e.target.classList.contains('xml-act'))setPrice(e.target.closest('tr'));});
$('xmlRateio').addEventListener('change',applyRateio);
$('xmlMargem').addEventListener('input',()=>document.querySelectorAll('#xmlRevisao tr[data-xn]').forEach(tr=>{if(tr.querySelector('.xml-act').value==='')setPrice(tr);}));
$('xmlArquivos').addEventListener('change',async e=>{
 xmlNotes=[];const keys=new Set(imports().map(n=>n.key)),bad=[];
 for(const f of e.target.files){
  try{const text=await f.text(),n=parseNfe(text);n.file=f.name;n.text=text;n.dup=keys.has(n.key)||xmlNotes.some(x=>x.key===n.key);xmlNotes.push(n);}catch(err){bad.push(f.name);}
 }
 if(bad.length)toast(`Não foi possível ler: ${bad.join(', ')}`,true);
 xmlRender();
});
$('xmlLinks').addEventListener('click',e=>{const b=e.target.closest('[data-link-group]');if(!b)return;if(!confirm('Remover este vínculo? Na próxima nota o sistema volta a sugerir pelo código/nome.'))return;Object.keys(links()).forEach(k=>{if(links()[k].group===b.dataset.linkGroup)delete links()[k];});if(saveData())toast('Vínculo removido.');});
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
  if(act===''){p={id:id(),name:it.name,code:it.code||it.ean||nextProductCode(),cost,price,stock:0,createdAt:todayISO()};data.products.push(p);novos++;}
  else{p=productById(act);}
  saveLink(n,it,p);
  const lc=stockIn(p,it.qty,cost); // PEPS: novo lote com o custo da nota
  recordMovement('entrada',p,it.qty,r2(lc*it.qty),`NF-e ${n.number}/${n.serie} · ${n.supplier}`,{xmlKey:n.key,supplier:n.supplier,supplierCnpj:n.cnpj,nfNumber:n.number,unitCost:lc});
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

// ================= PROMISSÓRIAS (a receber) =================
const todayKey=()=>localDateKey(new Date());
const daysBetween=(a,b)=>Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/86400000);
function recStatus(r){
 if(r.canceled)return {k:'cancelada',t:'Cancelada'};
 if(r.paid)return {k:'recebida',t:'Recebida'};
 const d=daysBetween(todayKey(),r.dueDate),lim=getSettings().promissory.remindDays;
 if(d<0)return {k:'vencida',t:`Vencida há ${-d} ${-d===1?'dia':'dias'}`,urgent:true,late:true};
 if(d===0)return {k:'avencer',t:'Vence hoje',urgent:true};
 if(d<=lim)return {k:'avencer',t:`Vence em ${d} ${d===1?'dia':'dias'}`,urgent:true};
 return {k:'aberta',t:`Vence em ${d} dias`};
}
const sumAmt=a=>r2(a.reduce((x,r)=>x+Number(r.amount||0),0));
function renderProm(){
 const lim=getSettings().promissory.remindDays,all=receivables().filter(r=>!r.canceled),open=all.filter(r=>!r.paid),late=open.filter(r=>recStatus(r).late),soon=open.filter(r=>recStatus(r).urgent&&!recStatus(r).late);
 const mk=todayKey().slice(0,7),recMonth=all.filter(r=>r.paid&&localDateKey(r.paidAt).slice(0,7)===mk);
 $('promAberto').textContent=money(sumAmt(open));$('promAbertoNota').textContent=`${open.length} parcela(s) em aberto`;
 $('promVencidas').textContent=money(sumAmt(late));$('promVencidasNota').textContent=`${late.length} parcela(s) vencida(s)`;
 $('promAvencer').textContent=money(sumAmt(soon));$('promAvencerNota').textContent=`${soon.length} parcela(s) em até ${lim} dia(s)`;
 $('promRecebido').textContent=money(sumAmt(recMonth));$('promRecebidoNota').textContent=`${recMonth.length} parcela(s) neste mês`;
 const urgent=late.length+soon.length,badge=$('menuPromissorias');badge.textContent=urgent;badge.classList.toggle('alert',urgent>0);
 const al=$('promAlerta');al.hidden=!urgent;
 if(urgent)$('promAlertaTexto').textContent=[late.length?`${late.length} parcela(s) de promissória vencida(s) (${money(sumAmt(late))})`:'',soon.length?`${soon.length} vence(m) em até ${lim} dia(s) (${money(sumAmt(soon))})`:''].filter(Boolean).join(' · ');
 const q=fold($('promBusca').value).trim(),f=$('promStatus').value;
 const rows=receivables().filter(r=>{const st=recStatus(r);if(st.k==='cancelada')return false;if(q&&!fold(r.client+' '+r.saleId).includes(q))return false;return f==='todas'||(f==='abertas'&&!r.paid)||(f==='vencidas'&&st.late)||(f==='avencer'&&st.urgent&&!st.late)||(f==='recebidas'&&r.paid);}).sort((x,y)=>x.dueDate.localeCompare(y.dueDate)||String(x.client).localeCompare(String(y.client),'pt-BR'));
 $('promRows').innerHTML=rows.map(r=>{const st=recStatus(r);return `<tr><td>${esc(brDate(r.dueDate))}</td><td><span class="product-name">${esc(r.client||'—')}</span></td><td>Venda ${esc(r.saleId)}<br><small>${esc(dateText(r.saleDate))}</small></td><td>${r.n}/${r.of}</td><td>${money(r.amount)}</td><td><span class="pill ${st.k}">${esc(st.t)}</span>${r.paid?`<br><small>${esc(dateText(r.paidAt))}</small>`:''}</td><td>${r.paid?`<button type="button" class="row-action" data-rec-undo="${esc(r.id)}">Desfazer</button>`:`<button type="button" class="row-action" data-rec-pay="${esc(r.id)}">Receber</button><button type="button" class="row-action" data-rec-wa="${esc(r.id)}">Lembrar</button>`}</td></tr>`;}).join('');
 $('promVazio').style.display=rows.length?'none':'block';
 $('promSubtitulo').textContent=`${rows.length} ${rows.length===1?'parcela':'parcelas'}`;
}
$('promRows').addEventListener('click',e=>{
 const pay=e.target.closest('[data-rec-pay]'),undo=e.target.closest('[data-rec-undo]'),wa=e.target.closest('[data-rec-wa]'),get=k=>receivables().find(r=>r.id===k);
 if(pay){const r=get(pay.dataset.recPay);if(!r||!confirm(`Confirmar o recebimento de ${money(r.amount)} de ${r.client||'cliente'} (parcela ${r.n}/${r.of})?`))return;r.paid=true;r.paidAt=new Date().toISOString();r.paidBy=currentUserName();if(saveData())toast('Parcela recebida.');}
 else if(undo){const r=get(undo.dataset.recUndo);if(!r||!confirm('Desfazer o recebimento desta parcela?'))return;r.paid=false;delete r.paidAt;delete r.paidBy;if(saveData())toast('Recebimento desfeito.');}
 else if(wa){
  const r=get(wa.dataset.recWa);if(!r)return;
  const c=customerById(r.customerId)||findCustomerForSale(r.client,''),ph=c?digits(c.phone):'',num=ph&&ph.length<=11?'55'+ph:ph,late=recStatus(r).late;
  const msg=`Olá${r.client?' '+r.client:''}! Passando para lembrar da parcela ${r.n}/${r.of} da sua compra na Conceito, no valor de ${money(r.amount)}, que ${late?'venceu':'vence'} em ${brDate(r.dueDate)}. Qualquer dúvida, é só chamar.`;
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`,'_blank','noopener');
  if(!num)toast('Cliente sem telefone cadastrado: escolha a conversa no WhatsApp.');
 }
});
['promBusca'].forEach(k=>$(k).addEventListener('input',renderProm));$('promStatus').addEventListener('change',renderProm);
setInterval(renderProm,600000);

// ================= TAXAS E CRÉDITO DA FÁBRICA =================
const RATE_ROWS=[['debit','Débito'],['cash','Crédito à vista'],['r2','Crédito 2x a 6x'],['r7','Crédito 7x a 12x'],['r13','Crédito 13x a 17x'],['r18','Crédito 18x a 21x']];
$('taxasTabela').innerHTML=RATE_ROWS.map(([k,l])=>`<tr><td>${l}</td><td><input class="rate-input" data-rate="vm.${k}" inputmode="decimal" autocomplete="off" aria-label="${l} Visa e Master"></td><td><input class="rate-input" data-rate="ae.${k}" inputmode="decimal" autocomplete="off" aria-label="${l} Amex e Elo"></td></tr>`).join('');
document.querySelectorAll('#panel-taxas .rate-input,#bluOnline,#bluExtraParcela,#fabCreditoPct').forEach(bindPercentInput);
let taxasDirty=false;
const fmtPct=v=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
function fabInfo(){const p=Math.min(100,parsePercentInput($('fabCreditoPct').value));$('fabLucroInfo').textContent=`${fmtPct(p)}% vira crédito com a fábrica e ${fmtPct(100-p)}% entra como lucro da loja. Ex.: venda de R$ 1.000,00 → ${money(p*10)} de crédito e ${money((100-p)*10)} de lucro.`;}
function loadTaxasForm(){
 const st=getSettings();
 document.querySelectorAll('#panel-taxas [data-rate]').forEach(i=>{const [b,k]=i.dataset.rate.split('.');i.value=fmtPct(st.rates[b][k]);});
 $('bluOnline').value=fmtPct(st.blu.online);$('bluExtraDe').value=st.blu.extraFrom;$('bluExtraParcela').value=fmtPct(st.blu.extraPerInstallment);
 $('fabCreditoPct').value=fmtPct(st.factoryCreditPct);$('promLembreteDias').value=st.promissory.remindDays;
 fabInfo();taxasDirty=false;
}
$('taxasForm').addEventListener('input',()=>{taxasDirty=true;fabInfo();});
$('taxasForm').addEventListener('submit',e=>{
 e.preventDefault();
 const st={rates:{vm:{},ae:{}}};
 document.querySelectorAll('#panel-taxas [data-rate]').forEach(i=>{const [b,k]=i.dataset.rate.split('.');st.rates[b][k]=parsePercentInput(i.value);});
 st.blu={online:parsePercentInput($('bluOnline').value),extraFrom:Math.max(1,Math.round(Number($('bluExtraDe').value)||10)),extraPerInstallment:parsePercentInput($('bluExtraParcela').value)};
 st.factoryCreditPct=Math.min(100,parsePercentInput($('fabCreditoPct').value));
 st.promissory={remindDays:Math.max(0,Math.round(Number($('promLembreteDias').value)||0))};
 data.settings=st;
 if(saveData()){loadTaxasForm();toast('Configurações salvas. Valem para as próximas vendas.');}
});
$('taxasPadrao').addEventListener('click',()=>{if(!confirm('Voltar todas as taxas e percentuais para os valores padrão?'))return;data.settings={};if(saveData()){loadTaxasForm();toast('Valores padrão restaurados.');}});
const ledger=()=>data.factoryLedger||(data.factoryLedger=[]);
const manual=()=>data.factoryCreditsManual||(data.factoryCreditsManual=[]);
const orders=()=>data.factoryOrders||(data.factoryOrders=[]);
function factoryStats(){
 const sales=r2(data.movements.filter(m=>m.type==='venda'&&!m.canceled).reduce((x,m)=>x+Number(m.factoryCredit||0),0)),man=r2(manual().reduce((x,e)=>x+Number(e.amount||0),0));
 const acc=r2(sales+man),used=r2(ledger().reduce((x,e)=>x+Number(e.amount||0),0));
 return {sales,man,acc,used,bal:r2(acc-used)};
}
function renderFactory(){
 const f=factoryStats();
 $('fabAcumulado').textContent=money(f.acc);$('fabUtilizado').textContent=money(f.used);$('fabSaldo').textContent=money(f.bal);
 $('fabLinhas').innerHTML=ledger().slice().reverse().map(e=>`<tr><td>${esc(dateText(e.date))}</td><td>${esc(e.note||'—')}</td><td>${money(e.amount)}</td><td>${e.orderId?'<span class="pill aberta">Pedido</span>':`<button type="button" class="row-action delete" data-fab-del="${esc(e.id)}">Desfazer</button>`}</td></tr>`).join('');
 $('fabVazio').style.display=ledger().length?'none':'block';
 renderCreditos();
}
$('fabUsar').addEventListener('click',()=>{
 const f=factoryStats(),raw=prompt(`Uso de crédito com a fábrica (saldo ${money(f.bal)}). Valor em R$ — digite 1050 para R$ 10,50:`,'');
 if(raw===null)return;const v=parseMoneyInput(raw);
 if(v<=0){toast('Informe um valor maior que zero.',true);return;}
 if(v>f.bal+0.009){toast(`O valor é maior que o saldo disponível (${money(f.bal)}).`,true);return;}
 const note=prompt('Descrição (ex.: compra de colchões, pedido 123):','')||'';
 ledger().push({id:id(),date:new Date().toISOString(),amount:v,note,by:currentUserName()});
 if(saveData())toast(`Uso de ${money(v)} registrado.`);
});
$('fabLinhas').addEventListener('click',e=>{const b=e.target.closest('[data-fab-del]');if(!b||!confirm('Desfazer este lançamento e devolver o valor ao saldo?'))return;data.factoryLedger=ledger().filter(x=>x.id!==b.dataset.fabDel);if(saveData())toast('Lançamento desfeito.');});

// ================= TODOS OS CRÉDITOS (qualquer data) =================
const keyToIso=k=>new Date(k+'T12:00:00').toISOString();
function creditRows(){
 const sales=new Map();
 data.movements.forEach(mv=>{
  if(mv.type!=='venda'||mv.canceled)return;
  const k=mv.saleId||mv.id;let x=sales.get(k);
  if(!x){x={kind:'venda',key:k,date:mv.date,client:mv.client||'',total:0,credit:0,payments:mv.payments||[]};sales.set(k,x);}
  x.total+=Number(mv.total||0);x.credit+=Number(mv.factoryCredit||0);
 });
 const rows=[];
 sales.forEach(x=>{
  const card=x.payments.some(p=>p.method===PM.CREDIT||p.method===PM.BLU);
  const base={...x,credit:r2(x.credit),total:r2(x.total),text:`Venda ${x.key} · ${x.client||'sem cliente'} · total ${money(x.total)} · ${x.payments.map(payLabel).join(' | ')}`};
  if(base.credit>0.004)rows.push(base);else if(card)rows.push({...base,noCredit:true});
 });
 manual().forEach(e=>rows.push({kind:'manual',key:e.id,date:e.date,credit:Number(e.amount),text:`${e.note||'Crédito lançado manualmente'}${e.by?' · por '+e.by:''}`}));
 return rows.sort((a,b)=>new Date(b.date)-new Date(a.date));
}
function renderCreditos(){
 const org=$('fabFiltroOrigem').value,q=fold($('fabFiltroBusca').value),de=$('fabFiltroDe').value,ate=$('fabFiltroAte').value,sem=$('fabFiltroSem').checked;
 const rows=creditRows().filter(r=>{
  if(r.noCredit&&!sem)return false;
  if(org==='venda'&&r.kind!=='venda')return false;
  if(org==='manual'&&r.kind!=='manual')return false;
  const d=localDateKey(r.date);if(de&&d<de)return false;if(ate&&d>ate)return false;
  return !q||fold(r.text).includes(q);
 });
 const sum=r2(rows.reduce((s,r)=>s+r.credit,0));
 $('fabCredLinhas').innerHTML=rows.map(r=>`<tr><td>${esc(dateText(r.date))}</td><td>${r.kind==='venda'?(r.noCredit?'<span class="pill cancelada">Venda sem crédito</span>':'<span class="pill entrada">Venda · cartão fábrica</span>'):'<span class="pill aberta">Manual</span>'}</td><td>${esc(r.text)}</td><td>${r.noCredit?'—':money(r.credit)}</td><td>${r.kind==='manual'?`<button type="button" class="row-action delete" data-fab-man-del="${esc(r.key)}">Excluir</button>`:''}</td></tr>`).join('');
 $('fabCredVazio').style.display=rows.length?'none':'block';
 $('fabCredResumo').textContent=`${rows.length} lançamento(s) · total ${money(sum)}${de||ate?'':' · sem filtro de data: aparecem todos os créditos, de qualquer dia'}`;
}
['fabFiltroOrigem','fabFiltroDe','fabFiltroAte','fabFiltroSem'].forEach(k=>$(k).addEventListener('change',renderCreditos));
$('fabFiltroBusca').addEventListener('input',renderCreditos);
bindMoneyMask($('fabManValor'));$('fabManData').value=localDateKey(new Date());
$('fabManAdd').addEventListener('click',()=>{
 const key=$('fabManData').value||localDateKey(new Date()),v=r2(parseMoneyInput($('fabManValor').value)),note=$('fabManDesc').value.trim();
 if(v<=0){toast('Informe o valor do crédito.',true);return;}
 manual().push({id:id(),date:keyToIso(key),amount:v,note:note||'Crédito lançado manualmente',by:currentUserName()});
 if(saveData()){$('fabManValor').value='';$('fabManDesc').value='';toast(`Crédito de ${money(v)} adicionado.`);}
});
$('fabCredLinhas').addEventListener('click',e=>{
 const b=e.target.closest('[data-fab-man-del]');if(!b)return;
 const x=manual().find(c=>c.id===b.dataset.fabManDel);if(!x)return;
 if(factoryStats().bal-Number(x.amount)<-0.009){toast('Não dá para excluir: esse crédito já foi usado em parte (o saldo ficaria negativo).',true);return;}
 if(!confirm(`Excluir o crédito de ${money(x.amount)}?`))return;
 data.factoryCreditsManual=manual().filter(c=>c.id!==x.id);if(saveData())toast('Crédito excluído.');
});

// ================= PEDIDOS À FÁBRICA =================
const PED_PAY=['Pix','Boleto','Transferência','Dinheiro','Cartão de crédito','Cartão de débito','Outro'];
// Pagamento imediato: as parcelas já ficam como pagas. Boleto, cartão de crédito e outro: ficam em aberto, com lembrete.
const PED_IMEDIATO=['Pix','Dinheiro','Transferência','Cartão de débito'];
$('pedForma').innerHTML='<option value="">Selecione...</option>'+PED_PAY.map(x=>`<option>${esc(x)}</option>`).join('');
const addDaysKey=(key,n)=>{const [y,mo,d]=key.split('-').map(Number);return localDateKey(new Date(y,mo-1,d+n));};
const termsText=t=>(t.length===1&&t[0]===0)?'À vista':t.join('/')+' dias';
const fmtBR=v=>v>0?v.toLocaleString('pt-BR',{minimumFractionDigits:2}):'';
function pedItemRow(prod){
 const tr=document.createElement('tr');
 if(prod)tr.dataset.pid=prod.id;
 tr.innerHTML=`<td><input class="pedNome" list="pedProdutos" autocomplete="off" placeholder="Produto (digite o nome)">${prod?`<small class="ped-est">Estoque atual: ${Number(prod.stock||0)}</small>`:''}</td><td><input class="pedQtd" type="number" min="1" step="1" value="1"></td><td><input class="pedUnit" type="text" inputmode="numeric" autocomplete="off" placeholder="0,00"></td><td class="pedLinha">R$ 0,00</td><td><button type="button" class="cart-remove pedDel" aria-label="Remover produto">×</button></td>`;
 $('pedItens').appendChild(tr);
 bindMoneyMask(tr.querySelector('.pedUnit'));
 if(prod){const nm=tr.querySelector('.pedNome');nm.value=prod.name;nm.readOnly=true;tr.querySelector('.pedUnit').value=fmtBR(Number(prod.cost||0));}
 tr.querySelector('.pedUnit').addEventListener('money-mask-updated',pedSync);
 tr.querySelector('.pedQtd').addEventListener('input',pedSync);
 return tr;
}
// Lista vertical de produtos do estoque (com estoque atual) para marcar o que comprar
function pedPickRender(){
 const q=fold($('pedPickBusca').value),sel=new Set([...$('pedItens').querySelectorAll('tr[data-pid]')].map(t=>t.dataset.pid));
 const list=data.products.filter(p=>!q||fold(p.name+' '+(p.code||'')).includes(q)).sort(byName);
 $('pedPickLista').innerHTML=list.length?list.map(p=>{const st=Number(p.stock||0),cls=st<=0?'zero':st<=2?'low':'';return `<label class="ped-pick-row"><input type="checkbox" data-pick="${esc(p.id)}"${sel.has(p.id)?' checked':''}><span class="nm">${esc(p.name)}${p.code?` <small>· ${esc(p.code)}</small>`:''}</span><span class="est ${cls}">Estoque atual: <b>${st}</b>${st<=0?' · sem estoque':st<=2?' · baixo':''}</span></label>`;}).join(''):'<p class="ped-pick-empty">Nenhum produto encontrado.</p>';
}
function pedState(){
 const items=[...$('pedItens').querySelectorAll('tr')].map(tr=>{
  const name=tr.querySelector('.pedNome').value.trim(),qty=Math.floor(Number(tr.querySelector('.pedQtd').value)||0),unit=r2(parseMoneyInput(tr.querySelector('.pedUnit').value));
  return {tr,pid:tr.dataset.pid||'',name,qty,unit,total:r2(qty*unit)};
 });
 const total=r2(items.reduce((s,i)=>s+i.total,0)),f=factoryStats(),use=$('pedUsarCredito').checked;
 const credit=use?r2(parseMoneyInput($('pedCredito').value)):0;
 const rest=Math.max(0,r2(total-Math.min(credit,total)));
 const sel=$('pedPrazo').value,raw=sel==='custom'?$('pedPrazoCustom').value:sel;
 const terms=[...new Set(String(raw).split(/[^\d]+/).filter(Boolean).map(Number))].filter(n=>n>=0&&n<=720).sort((a,b)=>a-b);
 return {items,total,f,use,credit,rest,terms};
}
function pedSync(){
 let s=pedState();
 if(s.use&&!$('pedCredito').dataset.manual){$('pedCredito').value=fmtBR(Math.min(s.f.bal,s.total));s=pedState();}
 s.items.forEach(i=>{i.tr.querySelector('.pedLinha').textContent=money(i.total);});
 $('pedTotal').textContent=money(s.total);$('pedItensVazio').hidden=s.items.length>0;
 $('pedCreditoBox').hidden=!s.use;
 $('pedSaldoInfo').textContent=`Saldo disponível: ${money(s.f.bal)}`;
 $('pedPrazoCustomBox').hidden=$('pedPrazo').value!=='custom';
 const hasRest=s.rest>0.004;
 $('pedRestoBox').hidden=!hasRest;
 $('pedRestoInfo').textContent=s.total<=0?'Adicione os produtos para ver o total.':(hasRest?`Crédito usado: ${money(Math.min(s.credit,s.total))} · Restante a pagar: ${money(s.rest)}`:`Pedido totalmente pago com o crédito da fábrica (${money(s.total)}).`);
 const date=$('pedData').value||localDateKey(new Date());
 const meth=$('pedForma').value,imm=PED_IMEDIATO.includes(meth);
 const head=!hasRest?'':(!meth?'Escolha a forma de pagamento do restante.<br>':(imm?`${meth}: pagamento imediato, as parcelas já ficam como <b>pagas</b>.<br>`:`${meth} a prazo: as parcelas ficam <b>em aberto</b> e o sistema avisa antes de cada vencimento.<br>`));
 $('pedPreview').innerHTML=hasRest?head+(s.terms.length?splitInstallments(s.rest,s.terms.length).map((v,i)=>`${s.terms[i]===0?'À vista':s.terms[i]+' dias'} · ${brDate(addDaysKey(date,s.terms[i]))} · <b>${money(v)}</b>${imm||s.terms[i]===0?' · paga':''}`).join('<br>'):'Informe os dias das parcelas, ex.: 30/60/90.'):'';
}
$('pedAddItem').addEventListener('click',()=>{const pk=$('pedPicker');pk.hidden=!pk.hidden;if(!pk.hidden){pedPickRender();$('pedPickBusca').focus();}});
$('pedPickFechar').addEventListener('click',()=>{$('pedPicker').hidden=true;});
$('pedPickBusca').addEventListener('input',pedPickRender);
$('pedAddLivre').addEventListener('click',()=>{const tr=pedItemRow();pedSync();tr.querySelector('.pedNome').focus();});
$('pedPickLista').addEventListener('change',e=>{
 const cb=e.target.closest('[data-pick]');if(!cb)return;
 const pid=cb.dataset.pick;
 if(cb.checked){const p=productById(pid);if(p&&![...$('pedItens').querySelectorAll('tr[data-pid]')].some(t=>t.dataset.pid===pid))pedItemRow(p);}
 else[...$('pedItens').querySelectorAll('tr[data-pid]')].filter(t=>t.dataset.pid===pid).forEach(t=>t.remove());
 pedSync();
});
$('pedItens').addEventListener('click',e=>{const b=e.target.closest('.pedDel');if(!b)return;b.closest('tr').remove();if(!$('pedPicker').hidden)pedPickRender();pedSync();});
$('pedUsarCredito').addEventListener('change',()=>{delete $('pedCredito').dataset.manual;if(!$('pedUsarCredito').checked)$('pedCredito').value='';pedSync();});
$('pedUsarTodo').addEventListener('click',()=>{delete $('pedCredito').dataset.manual;pedSync();});
bindMoneyMask($('pedCredito'));
$('pedCredito').addEventListener('input',()=>{$('pedCredito').dataset.manual='1';pedSync();});
$('pedCredito').addEventListener('money-mask-updated',pedSync);
['pedPrazo','pedData','pedForma'].forEach(k=>$(k).addEventListener('change',pedSync));
$('pedPrazoCustom').addEventListener('input',pedSync);
function pedReset(){
 $('pedItens').innerHTML='';$('pedPicker').hidden=true;$('pedPickBusca').value='';
 $('pedData').value=localDateKey(new Date());$('pedObs').value='';$('pedEntregue').checked=false;$('pedUsarCredito').checked=false;$('pedCredito').value='';delete $('pedCredito').dataset.manual;
 $('pedForma').value='';$('pedPrazo').value='30';$('pedPrazoCustom').value='';pedSync();
}
$('pedLimpar').addEventListener('click',pedReset);
$('pedSalvar').addEventListener('click',()=>{
 const s=pedState(),date=$('pedData').value;
 if(!date){toast('Informe a data do pedido.',true);return;}
 const filled=s.items.filter(i=>i.name||i.unit>0);
 if(!filled.length){toast('Adicione ao menos um produto.',true);return;}
 if(filled.some(i=>!i.name||i.qty<1||i.unit<=0)){toast('Cada produto precisa de nome, quantidade e valor unitário.',true);return;}
 const total=r2(filled.reduce((a,i)=>a+i.total,0));
 if(s.credit>s.f.bal+0.009){toast(`O crédito informado é maior que o saldo disponível (${money(s.f.bal)}).`,true);return;}
 if(s.credit>total+0.009){toast('O crédito informado é maior que o total do pedido.',true);return;}
 const credit=s.use?r2(s.credit):0,rest=r2(total-credit),hasRest=rest>0.004;
 if(hasRest&&!$('pedForma').value){toast('Escolha a forma de pagamento do restante.',true);return;}
 if(hasRest&&!s.terms.length){toast('Informe o prazo do pagamento (ex.: 30/60/90).',true);return;}
 const now=new Date().toISOString(),terms=hasRest?s.terms:[],imm=PED_IMEDIATO.includes($('pedForma').value);
 const installments=hasRest?splitInstallments(rest,terms.length).map((amount,i)=>({n:i+1,of:terms.length,days:terms[i],dueDate:addDaysKey(date,terms[i]),amount,paid:imm||terms[i]===0,paidAt:(imm||terms[i]===0)?now:''})):[];
 const o={id:id(),date,items:filled.map(i=>({productId:i.pid,name:i.name,qty:i.qty,unit:i.unit,total:i.total})),total,creditUsed:credit,remainder:hasRest?rest:0,payMethod:hasRest?$('pedForma').value:'',terms,installments,note:$('pedObs').value.trim(),delivered:$('pedEntregue').checked,deliveredAt:$('pedEntregue').checked?now:'',by:currentUserName(),createdAt:now};
 orders().push(o);
 if(credit>0.004)ledger().push({id:id(),date:now,amount:credit,note:`Pedido de ${brDate(date)}${o.note?' · '+o.note:''}`,by:currentUserName(),orderId:o.id});
 if(saveData()){pedReset();toast('Pedido registrado.');}
});
// ---- PDF para a fábrica: conferência de valores antes de fechar o pedido ----
function pedDraft(){
 const s=pedState(),date=$('pedData').value||localDateKey(new Date());
 const filled=s.items.filter(i=>i.name||i.unit>0);
 if(!filled.length){toast('Adicione ao menos um produto ao pedido.',true);return null;}
 if(filled.some(i=>!i.name||i.qty<1||i.unit<=0)){toast('Cada produto precisa de nome, quantidade e valor unitário.',true);return null;}
 const total=r2(filled.reduce((a,i)=>a+i.total,0)),credit=s.use?r2(Math.min(s.credit,total,s.f.bal>0?s.f.bal:0)):0,rest=r2(total-credit),hasRest=rest>0.004;
 const terms=hasRest?s.terms:[],installments=hasRest&&terms.length?splitInstallments(rest,terms.length).map((amount,i)=>({n:i+1,of:terms.length,days:terms[i],dueDate:addDaysKey(date,terms[i]),amount})):[];
 return {date,items:filled.map(i=>({name:i.name,qty:i.qty,unit:i.unit,total:i.total})),total,creditUsed:credit,remainder:hasRest?rest:0,payMethod:hasRest?$('pedForma').value:'',terms,installments,note:$('pedObs').value.trim()};
}
function buildOrderPdf(o){
 if(!window.jspdf||!window.jspdf.jsPDF){toast('A biblioteca de PDF não carregou. Verifique a internet e tente novamente.',true);return null;}
 const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});let y=18;
 const room=h=>{if(y+h>272){doc.addPage();y=18;}};
 doc.setFont('helvetica','bold');doc.setFontSize(17);doc.text('CONCEITO - PEDIDO À FÁBRICA',15,y);y+=7;
 doc.setFontSize(11);doc.text('Conferência de valores antes do fechamento',15,y);y+=8;
 doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text(`Data do pedido: ${brDate(o.date)}`,15,y);y+=6;
 if(o.note){const ls=doc.splitTextToSize(`Observação: ${o.note}`,180);doc.text(ls,15,y);y+=ls.length*5;}
 y+=4;
 doc.setFont('helvetica','bold');doc.text('PRODUTO',15,y);doc.text('QTD.',122,y,{align:'right'});doc.text('VALOR UNIT.',160,y,{align:'right'});doc.text('VALOR TOTAL',195,y,{align:'right'});y+=3;doc.line(15,y,195,y);y+=6;doc.setFont('helvetica','normal');
 o.items.forEach((it,i)=>{const nm=doc.splitTextToSize(`${i+1}. ${it.name}`,98);room(Math.max(7,nm.length*5));doc.text(nm,15,y);doc.text(String(it.qty),122,y,{align:'right'});doc.text(money(it.unit),160,y,{align:'right'});doc.text(money(it.total),195,y,{align:'right'});y+=Math.max(7,nm.length*5);});
 y+=1;doc.line(15,y,195,y);y+=7;
 const units=o.items.reduce((a,i)=>a+i.qty,0);
 room(40);doc.setFontSize(10);doc.text(`${o.items.length} item(ns) · ${units} unidade(s)`,15,y);
 doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('TOTAL DO PEDIDO:',125,y);doc.text(money(o.total),195,y,{align:'right'});y+=9;
 doc.setFont('helvetica','normal');doc.setFontSize(10);
 if(o.creditUsed>0){doc.text('Crédito com a fábrica a abater:',125,y);doc.text('- '+money(o.creditUsed),195,y,{align:'right'});y+=6;doc.setFont('helvetica','bold');doc.text('Restante a pagar:',125,y);doc.text(money(o.remainder),195,y,{align:'right'});doc.setFont('helvetica','normal');y+=8;}
 else y+=1;
 if(o.remainder>0){
  const forma=o.payMethod?`${o.payMethod}${o.terms.length?' - '+termsText(o.terms):''}`:'a combinar';
  doc.text(`Forma de pagamento prevista: ${forma}`,15,y);y+=6;
  o.installments.forEach(p=>{room(6);doc.text(`   Parcela ${p.n}/${p.of}: ${p.days===0?'à vista':'vencimento '+brDate(p.dueDate)} - ${money(p.amount)}`,15,y);y+=5;});
 }else if(o.creditUsed>0){doc.text('Pedido totalmente abatido com o crédito da fábrica.',15,y);y+=6;}
 y+=8;room(60);
 doc.setDrawColor(120);doc.rect(15,y,180,52);y+=8;
 doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text('CONFIRMAÇÃO DA FÁBRICA',20,y);y+=7;
 doc.setFont('helvetica','normal');doc.setFontSize(10);
 const ls=doc.splitTextToSize('Por favor, confira os produtos, quantidades e valores acima e responda antes de fecharmos o pedido.',170);doc.text(ls,20,y);y+=ls.length*5+4;
 doc.rect(20,y-3.5,4.5,4.5);doc.text('Os valores conferem.',27,y);y+=8;
 doc.rect(20,y-3.5,4.5,4.5);doc.text('Há divergência. Valores corretos / observações:',27,y);y+=7;
 doc.line(20,y,190,y);y+=7;doc.line(20,y,190,y);y+=9;
 doc.text('Responsável: ______________________________   Data: ____/____/______',20,y);
 doc.setFontSize(8);doc.setTextColor(110);doc.text('Documento para conferência de valores. Não é nota fiscal.',15,287);doc.setTextColor(0);
 return doc;
}
async function pedPdf(o){
 const doc=buildOrderPdf(o);if(!doc)return;
 const name=`pedido-fabrica-${o.date}.pdf`,file=new File([doc.output('blob')],name,{type:'application/pdf'});
 if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:'Pedido à fábrica - conferência de valores',text:'Segue o pedido para conferência dos valores.'});return;}catch(e){if(e.name==='AbortError')return;}}
 doc.save(name);toast('PDF gerado. Envie para a fábrica pedindo a confirmação.');
}
$('pedPdf').addEventListener('click',()=>{const o=pedDraft();if(o)pedPdf(o);});
const todayDiff=k=>{const [y,mo,d]=k.split('-').map(Number),[a,b,c]=localDateKey(new Date()).split('-').map(Number);return Math.round((new Date(y,mo-1,d)-new Date(a,b-1,c))/86400000);};
function pedStatus(p,lim){
 if(p.paid)return {k:'recebida',t:'Paga',late:false,urgent:false};
 const d=todayDiff(p.dueDate);
 if(d<0)return {k:'vencida',t:`Vencida há ${-d} dia(s)`,late:true,urgent:true};
 if(d<=lim)return {k:'avencer',t:d===0?'Vence hoje':`Vence em ${d} dia(s)`,late:false,urgent:true};
 return {k:'aberta',t:`Vence em ${d} dia(s)`,late:false,urgent:false};
}
function renderPedidos(){
 const f=factoryStats(),lim=getSettings().promissory.remindDays,q=fold($('pedBusca').value);
 const all=orders().slice().sort((a,b)=>b.date.localeCompare(a.date)||String(b.createdAt).localeCompare(String(a.createdAt)));
 const open=[];all.forEach(o=>o.installments.forEach(p=>{if(!p.paid)open.push({o,p,st:pedStatus(p,lim)});}));
 open.sort((a,b)=>a.p.dueDate.localeCompare(b.p.dueDate));
 const sum=l=>r2(l.reduce((s,x)=>s+x.p.amount,0)),late=open.filter(x=>x.st.late),soon=open.filter(x=>x.st.urgent&&!x.st.late),urgent=late.length+soon.length;
 $('pedStatSaldo').textContent=f.bal>=0?money(f.bal):money(0);
 $('pedStatPedidos').textContent=`${all.length} · ${money(r2(all.reduce((s,o)=>s+o.total,0)))}`;
 $('pedStatPendente').textContent=money(sum(open));
 $('pedStatEntrega').textContent=all.filter(o=>!o.delivered).length;
 const badge=$('menuPedidos');badge.textContent=urgent;badge.classList.toggle('alert',urgent>0);
 const txt=[late.length?`${late.length} boleto(s)/parcela(s) da fábrica vencido(s) (${money(sum(late))})`:'',soon.length?`${soon.length} vence(m) em até ${lim} dia(s) (${money(sum(soon))})`:''].filter(Boolean).join(' · ');
 $('pedAlerta').hidden=!urgent;$('pedAlertaPainel').hidden=!urgent;$('pedAlertaTexto').textContent=txt;$('pedAlertaPainelTexto').textContent=txt;
 $('pedAgenda').innerHTML=open.map(({o,p,st})=>`<tr><td><b>${esc(brDate(p.dueDate))}</b></td><td><span class="pill ${st.k}">${esc(st.t)}</span></td><td><b>${money(p.amount)}</b></td><td>${p.n}/${p.of} · ${esc(o.payMethod)}</td><td>Pedido de ${esc(brDate(o.date))}<br><small>${esc(o.items.map(i=>i.name).join(', '))}</small></td><td><button type="button" class="row-action" data-ped-pay="${esc(o.id)}|${p.n}">Marcar paga</button></td></tr>`).join('');
 $('pedAgendaVazio').style.display=open.length?'none':'block';
 $('pedProdutos').innerHTML=data.products.map(p=>`<option value="${esc(p.name)}"></option>`).join('');
 const fe=$('pedFiltroEntrega').value;
 const list=all.filter(o=>(fe==='todos'||(fe==='aguardando'&&!o.delivered)||(fe==='entregues'&&o.delivered))&&(!q||fold([brDate(o.date),o.payMethod,o.note,o.items.map(i=>i.name).join(' ')].join(' ')).includes(q)));
 $('pedLista').innerHTML=list.map(o=>{
  const prods=o.items.map(i=>`${i.qty}× ${esc(i.name)} (${money(i.unit)})`).join('<br>');
  const parc=o.installments.length?o.installments.map(p=>{
   const st=pedStatus(p,lim);
   return `<span class="p">${p.n}/${p.of} · ${brDate(p.dueDate)} · <b>${money(p.amount)}</b> <span class="pill ${st.k}">${esc(st.t)}</span><button type="button" class="row-action" data-ped-pay="${esc(o.id)}|${p.n}">${p.paid?'Desmarcar':'Marcar paga'}</button></span>`;
  }).join(''):'<span class="p">Pago totalmente com crédito da fábrica</span>';
  return `<tr><td>${esc(brDate(o.date))}</td><td>${prods}${o.note?`<br><small>${esc(o.note)}</small>`:''}</td><td><b>${money(o.total)}</b></td><td>${o.creditUsed>0?money(o.creditUsed):'—'}</td><td>${o.remainder>0?`${money(o.remainder)} · <b>${esc(o.payMethod)}</b>`:'—'}</td><td>${o.terms.length?termsText(o.terms):'—'}</td><td>${o.delivered?`<span class="pill recebida">Entregue</span>${o.deliveredAt?`<br><small>${esc(dateText(o.deliveredAt))}</small>`:''}<br><button type="button" class="row-action" data-ped-ent="${esc(o.id)}">Desmarcar</button>`:`<span class="pill aberta">Aguardando</span><br><button type="button" class="row-action" data-ped-ent="${esc(o.id)}">Marcar entregue</button>`}</td><td><button type="button" class="row-action" data-ped-pdf="${esc(o.id)}">PDF</button><button type="button" class="row-action delete" data-ped-del="${esc(o.id)}">Excluir</button></td></tr><tr class="ped-sub"><td></td><td colspan="7"><div class="ped-parc">${parc}</div></td></tr>`;
 }).join('');
 $('pedVazio').style.display=list.length?'none':'block';
}
$('pedBusca').addEventListener('input',renderPedidos);$('pedFiltroEntrega').addEventListener('change',renderPedidos);
function pedTogglePay(btn){
 const [oid,n]=btn.dataset.pedPay.split('|'),o=orders().find(x=>x.id===oid),inst=o&&o.installments.find(x=>String(x.n)===n);if(!inst)return;
 inst.paid=!inst.paid;inst.paidAt=inst.paid?new Date().toISOString():'';if(saveData())toast(inst.paid?'Parcela marcada como paga.':'Parcela reaberta.');
}
$('pedAgenda').addEventListener('click',e=>{const p=e.target.closest('[data-ped-pay]');if(p)pedTogglePay(p);});
$('pedLista').addEventListener('click',e=>{
 const pf=e.target.closest('[data-ped-pdf]');if(pf){const o=orders().find(x=>x.id===pf.dataset.pedPdf);if(o)pedPdf(o);return;}
 const d=e.target.closest('[data-ped-del]'),p=e.target.closest('[data-ped-pay]'),en=e.target.closest('[data-ped-ent]');
 if(d){
  const o=orders().find(x=>x.id===d.dataset.pedDel);if(!o)return;
  if(!confirm(`Excluir o pedido de ${brDate(o.date)} (${money(o.total)})?${o.creditUsed>0?` O crédito de ${money(o.creditUsed)} volta para o saldo.`:''}`))return;
  data.factoryOrders=orders().filter(x=>x.id!==o.id);data.factoryLedger=ledger().filter(x=>x.orderId!==o.id);
  if(saveData())toast('Pedido excluído.');
 }else if(en){
  const o=orders().find(x=>x.id===en.dataset.pedEnt);if(!o)return;
  o.delivered=!o.delivered;o.deliveredAt=o.delivered?new Date().toISOString():'';
  if(saveData())toast(o.delivered?'Pedido marcado como entregue.':'Entrega desmarcada.');
 }else if(p)pedTogglePay(p);
});
setInterval(renderPedidos,600000);

// ================= ORÇAMENTOS =================
// Orçamento = cliente + itens + desconto gravados SEM baixar estoque e SEM lançar no financeiro.
// Situação: aberto → vendido (ao finalizar a venda convertida) ou cancelado.
const quotes=()=>data.quotes||(data.quotes=[]);
let pendingQuote=null; // {id,target:'venda'|'pdv'} orçamento carregado no carrinho, aguardando finalizar
const qNum=q=>'Nº '+String(q.number).padStart(4,'0');
const qDays=()=>Math.max(1,Math.round(Number((data.settings||{}).quoteDays))||7);
const qUntil=q=>new Date(new Date(q.date).getTime()+(q.validDays||7)*864e5);
const qExpired=q=>q.status==='aberto'&&qUntil(q).getTime()<Date.now();
const qFmt=v=>v>0?Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'';
const qMonth=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0');};

function saveQuote(src,target){
 // src: {client,note,items:[{productId,name,quantity,price,cost}],subtotal,discountCash,discountPercent,total}
 if(!src.items.length){toast('Adicione pelo menos um produto antes de salvar o orçamento.',true);return;}
 let alloc=0;
 const items=src.items.map((it,i)=>{let lt;if(i===src.items.length-1)lt=r2(src.total-alloc);else{lt=src.subtotal?r2(r2(it.quantity*it.price)*(src.total/src.subtotal)):0;alloc+=lt;}return {productId:it.productId,name:it.name,quantity:it.quantity,price:it.price,cost:Number(it.cost||0),lineTotal:lt};});
 const base={client:src.client,note:src.note||'',items,subtotal:src.subtotal,discountCash:src.discountCash,discountPercent:src.discountPercent,discount:r2(src.subtotal-src.total),total:src.total};
 const old=pendingQuote&&pendingQuote.target===target?quotes().find(x=>x.id===pendingQuote.id&&x.status==='aberto'):null;
 let q;
 if(old){Object.assign(old,base,{editedAt:new Date().toISOString()});q=old;}
 else{q={id:id(),number:quotes().reduce((n,x)=>Math.max(n,x.number||0),0)+1,date:new Date().toISOString(),validDays:qDays(),status:'aberto',createdBy:currentUserName(),...base};quotes().push(q);}
 pendingQuote=null;
 if(saveData()){toast(`Orçamento ${qNum(q)} ${old?'atualizado':'salvo'}. Estoque e financeiro não foram alterados.`);return q;}
}
function markQuoteSold(saleId,target){
 if(!pendingQuote||pendingQuote.target!==target)return;
 const q=quotes().find(x=>x.id===pendingQuote.id);
 if(q&&q.status==='aberto'){q.status='vendido';q.saleId=saleId;q.soldAt=new Date().toISOString();}
 pendingQuote=null;
}
window.markQuoteSold=markQuoteSold;

// ---- salvar a partir de Registrar venda ----
$('salvarOrcamentoVenda').addEventListener('click',()=>{
 if(editingSale){toast('Termine ou cancele a edição da venda antes de salvar um orçamento.',true);return;}
 const t=saleTotals();
 const q=saveQuote({client:$('vendaCliente').value.trim(),note:$('vendaObs').value.trim(),items:saleCart.map(x=>({...x})),subtotal:t.subtotal,discountCash:t.discountCash,discountPercent:t.discountPercent,total:t.total},'venda');
 if(!q)return;
 saleCart=[];$('formVenda').reset();$('linhasPagamento').innerHTML='';addPaymentRow();renderCart();updateSalePreview();goTo('orcamentos');
});
// ---- salvar a partir do PDV ----
$('pdvOrcamento').addEventListener('click',()=>{
 const t=totals();
 const q=saveQuote({client:$('pdvCliente').value.trim(),note:'',items:cart.map(x=>({...x})),subtotal:t.sub,discountCash:t.dc,discountPercent:t.dp,total:t.total},'pdv');
 if(!q)return;
 cart=[];pays=[];['pdvCliente','pdvDescReais','pdvDescPct','pdvPagValor','pdvBusca'].forEach(k=>$(k).value='');$('pdvPagMetodo').value='';pdvSync();render();goTo('orcamentos');
});

// ---- converter em venda ----
function qLines(q){
 const out=[],missing=[];
 q.items.forEach(it=>{const p=productById(it.productId);if(!p){missing.push(it.name);return;}out.push({productId:p.id,name:p.name,quantity:it.quantity,price:it.price,cost:Number(p.cost||0)});});
 if(missing.length)toast('Produto(s) não encontrado(s) no catálogo e ignorado(s): '+missing.join(', '),true);
 return out;
}
function qToSale(q){
 if(editingSale){toast('Termine ou cancele a edição da venda antes de converter um orçamento.',true);return;}
 if(saleCart.length&&!confirm('O carrinho de Registrar venda tem itens. Substituí-los pelos do orçamento?'))return;
 const lines=qLines(q);if(!lines.length)return;
 saleCart=lines;$('vendaCliente').value=q.client||'';$('vendaObs').value=q.note||'';$('vendaDescontoReais').value=qFmt(q.discountCash);$('vendaDescontoPercentual').value=qFmt(q.discountPercent);
 pendingQuote={id:q.id,target:'venda'};renderCart();updateSalePreview();qBanners();goTo('venda');
 toast(`Orçamento ${qNum(q)} carregado. Ajuste o que precisar e confirme a venda.`);
}
function qToPdv(q){
 if(!openSession()){toast('Abra o caixa no PDV antes de levar o orçamento para lá.',true);goTo('pdv');return;}
 if(cart.length&&!confirm('O carrinho do PDV tem itens. Substituí-los pelos do orçamento?'))return;
 const lines=qLines(q);if(!lines.length)return;
 cart=lines;pays=[];$('pdvCliente').value=q.client||'';$('pdvDescReais').value=qFmt(q.discountCash);$('pdvDescPct').value=qFmt(q.discountPercent);
 pendingQuote={id:q.id,target:'pdv'};$('pdvPos').hidden=true;pdvSync();render();qBanners();goTo('pdv');
 toast(`Orçamento ${qNum(q)} carregado no PDV.`);
}
function qBanners(){
 const q=pendingQuote&&quotes().find(x=>x.id===pendingQuote.id),on=t=>!!(q&&pendingQuote.target===t);
 $('vendaOrcAviso').hidden=!on('venda');$('pdvOrcAviso').hidden=!on('pdv');
 if(q){$('vendaOrcTitulo').textContent=`Convertendo orçamento ${qNum(q)}`;$('pdvOrcAviso').textContent=`Convertendo orçamento ${qNum(q)}. Ao finalizar, ele passa para “Vendido”.`;}
}
$('cancelarOrcVenda').addEventListener('click',()=>{pendingQuote=null;qBanners();toast('Orçamento desvinculado. O carrinho continua como está.');});

// ---- PDF, cupom 80 mm e WhatsApp ----
const qItemsText=q=>q.items.map(x=>`${x.name} | Qtd.: ${x.quantity} | Unit.: ${money(x.price)} | Total: ${money(x.lineTotal)}`);
function qPdf(q){
 if(!window.jspdf||!window.jspdf.jsPDF){toast('A biblioteca de PDF não carregou. Verifique a internet e tente novamente.',true);return;}
 const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});let y=18;
 doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('CONCEITO - ORÇAMENTO '+qNum(q),15,y);y+=10;
 doc.setFont('helvetica','normal');doc.setFontSize(10);
 doc.text(`Data: ${new Date(q.date).toLocaleDateString('pt-BR')}   |   Válido até: ${qUntil(q).toLocaleDateString('pt-BR')}`,15,y);y+=6;
 doc.text(`Cliente: ${q.client||'Não informado'}`,15,y);y+=9;
 doc.setFont('helvetica','bold');doc.text('PRODUTO',15,y);doc.text('QTD.',108,y);doc.text('VALOR UNIT.',126,y);doc.text('VALOR TOTAL',166,y);y+=3;doc.line(15,y,195,y);y+=6;doc.setFont('helvetica','normal');
 q.items.forEach(it=>{const nm=doc.splitTextToSize(it.name,88),h=Math.max(7,nm.length*5);if(y+h>265){doc.addPage();y=18;}doc.text(nm,15,y);doc.text(String(it.quantity),108,y);doc.text(money(it.price),126,y);doc.text(money(it.lineTotal),166,y);y+=h;});
 y+=2;doc.line(15,y,195,y);y+=8;
 if(q.discount>0){doc.text('Subtotal:',135,y);doc.text(money(q.subtotal),195,y,{align:'right'});y+=6;doc.text('Desconto:',135,y);doc.text('- '+money(q.discount),195,y,{align:'right'});y+=7;}
 doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('TOTAL:',125,y);doc.text(money(q.total),195,y,{align:'right'});y+=11;
 doc.setFont('helvetica','normal');doc.setFontSize(10);if(y>255){doc.addPage();y=18;}
 if(q.note){const l=doc.splitTextToSize('Obs.: '+q.note,175);doc.text(l,15,y);y+=l.length*5+2;}
 const f=doc.splitTextToSize(`Orçamento válido por ${q.validDays} dias (até ${qUntil(q).toLocaleDateString('pt-BR')}). Não é documento fiscal e não reserva estoque; preços e disponibilidade podem mudar após a validade.`,175);doc.text(f,15,y);
 doc.save(`orcamento-conceito-${String(q.number).padStart(4,'0')}.pdf`);
}
function qCoupon(q){
 const rows=q.items.map(i=>`<tr><td colspan="2">${esc(i.name)}</td></tr><tr><td>${i.quantity} x ${money(i.price)}</td><td class="r">${money(i.lineTotal)}</td></tr>`).join('');
 const html=`<!doctype html><meta charset="utf-8"><style>@page{size:80mm auto;margin:3mm}body{font:12px/1.4 monospace;width:74mm;margin:0}h1{font-size:15px;text-align:center;margin:0}.c{text-align:center}.r{text-align:right}table{width:100%;border-collapse:collapse}hr{border:0;border-top:1px dashed #000}</style><h1>CONCEITO</h1><p class="c"><b>ORÇAMENTO ${esc(qNum(q))}</b><br>NÃO É DOCUMENTO FISCAL<br>${esc(new Date(q.date).toLocaleDateString('pt-BR'))}<br>Válido até ${esc(qUntil(q).toLocaleDateString('pt-BR'))}${q.client?'<br>Cliente: '+esc(q.client):''}</p><hr><table>${rows}</table><hr><table>${q.discount>0?`<tr><td>Subtotal</td><td class="r">${money(q.subtotal)}</td></tr><tr><td>Desconto</td><td class="r">- ${money(q.discount)}</td></tr>`:''}<tr><td><b>TOTAL</b></td><td class="r"><b>${money(q.total)}</b></td></tr></table><hr><p class="c">Orçamento válido por ${q.validDays} dias.<br>Não reserva estoque.</p>`;
 const f=document.createElement('iframe');f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';document.body.appendChild(f);
 f.contentDocument.open();f.contentDocument.write(html);f.contentDocument.close();
 setTimeout(()=>{f.contentWindow.focus();f.contentWindow.print();setTimeout(()=>f.remove(),1500);},250);
}
function qWhats(q){
 const cust=findCustomerForSale(q.client,''),phone=prompt('Digite o WhatsApp do cliente com DDD (somente números), ou deixe vazio para escolher uma conversa:',cust?digits(cust.phone):'');
 if(phone===null)return;
 let n=phone.replace(/\D/g,'');if(n&&n.length<10){toast('Informe um número com DDD válido.',true);return;}if(n&&n.length<=11)n='55'+n;
 const L=[`Olá${q.client?' '+q.client:''}! Segue o *ORÇAMENTO ${qNum(q)}* da Conceito.`,`Data: ${new Date(q.date).toLocaleDateString('pt-BR')} · Válido até ${qUntil(q).toLocaleDateString('pt-BR')}`,...qItemsText(q)];
 if(q.discount>0)L.push(`Subtotal: ${money(q.subtotal)}`,`Desconto: ${money(q.discount)}`);
 L.push(`TOTAL: ${money(q.total)}`);if(q.note)L.push(`Observação: ${q.note}`);L.push('Orçamento sem valor fiscal e sem reserva de estoque.');
 window.open(`https://wa.me/${n}?text=${encodeURIComponent(L.join('\n'))}`,'_blank','noopener');
}

// ---- painel: relatório mensal + lista ----
if(!$('orcMes').value)$('orcMes').value=qMonth(new Date());
function renderQuotes(){
 const open=quotes().filter(q=>q.status==='aberto').length;$('menuOrcamentos').textContent=open;
 if(document.activeElement!==$('orcValidade'))$('orcValidade').value=qDays();
 const mes=$('orcMes').value,list=quotes().filter(q=>!mes||qMonth(q.date)===mes).sort((a,b)=>b.number-a.number);
 const c=s=>list.filter(q=>q.status===s),sum=a=>r2(a.reduce((t,q)=>t+q.total,0)),sold=c('vendido'),done=list.length-c('aberto').length;
 const conv=list.length?(sold.length/list.length*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'—';
 const row=(l,v)=>`<div class="sale-total"><span>${l}</span><strong>${v}</strong></div>`;
 $('orcResumo').innerHTML=row('Orçamentos feitos',list.length)+row('Viraram venda',`${sold.length} (${money(sum(sold))})`)+row('Em aberto',c('aberto').length)+row('Cancelados',c('cancelado').length)+row('Valor total orçado',money(sum(list)))+row('Taxa de conversão (vendidos ÷ feitos)',conv);
 qBanners();
 const pill=q=>q.status==='vendido'?`<span class="pill ativa">Vendido</span>${q.saleId?`<br><small>Venda ${esc(q.saleId)}</small>`:''}`:q.status==='cancelado'?'<span class="pill cancelada">Cancelado</span>':`<span class="pill">Aberto</span>${qExpired(q)?'<br><small>vencido</small>':''}`;
 const btn=(a,t,i)=>`<button type="button" class="row-action" data-q-act="${a}" data-q-id="${esc(i)}">${t}</button>`;
 $('orcLista').innerHTML=list.map(q=>`<tr${q.status==='cancelado'?' class="row-canceled"':''}><td>${esc(qNum(q))}</td><td>${esc(new Date(q.date).toLocaleDateString('pt-BR'))}</td><td>${esc(q.client||'—')}</td><td>${money(q.total)}</td><td class="sale-status">${pill(q)}</td><td>${btn('pdf','PDF',q.id)}${btn('cup','Cupom 80 mm',q.id)}${btn('wa','WhatsApp',q.id)}${q.status==='aberto'?btn('venda','Converter em venda',q.id)+btn('pdv','Levar ao PDV',q.id)+btn('cancel','Cancelar',q.id):''}${q.status==='cancelado'?btn('reabrir','Reabrir',q.id):''}</td></tr>`).join('')||'<tr><td colspan="6" class="cart-empty">Nenhum orçamento neste período.</td></tr>';
}
window.renderQuotes=renderQuotes;
$('orcMes').addEventListener('input',renderQuotes);
$('orcValidade').addEventListener('change',()=>{data.settings=data.settings||{};data.settings.quoteDays=Math.max(1,Math.min(365,Math.round(Number($('orcValidade').value))||7));saveData();});
$('orcLista').addEventListener('click',e=>{
 const b=e.target.closest('[data-q-act]');if(!b)return;
 const q=quotes().find(x=>x.id===b.dataset.qId);if(!q)return;
 switch(b.dataset.qAct){
  case 'pdf':qPdf(q);break;case 'cup':qCoupon(q);break;case 'wa':qWhats(q);break;
  case 'venda':qToSale(q);break;case 'pdv':qToPdv(q);break;
  case 'cancel':if(confirm(`Cancelar o orçamento ${qNum(q)}?`)){q.status='cancelado';q.canceledAt=new Date().toISOString();if(pendingQuote&&pendingQuote.id===q.id)pendingQuote=null;if(saveData())toast('Orçamento cancelado.');}break;
  case 'reabrir':q.status='aberto';q.canceledAt='';if(saveData())toast('Orçamento reaberto.');break;
 }
});

// ================= integração =================
const baseRender=window.renderAll;
window.renderAll=function(){baseRender();render();renderQuotes();xmlHist();ctPreview();renderProm();renderFactory();renderPedidos();pedSync();if(!taxasDirty)loadTaxasForm();};
render();xmlHist();ctPreview();renderProm();renderFactory();loadTaxasForm();pedReset();renderPedidos();renderQuotes();
})();
