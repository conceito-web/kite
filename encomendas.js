'use strict';
// ============================================================================
// ENCOMENDAS (sob-medida, pagamento em partes e entrega)  ·  Conceito
// ----------------------------------------------------------------------------
// Como funciona:
//  • A venda continua sendo a de sempre (movimentos tipo "venda", um por item). A encomenda só ACRESCENTA dados:
//      m.order = { isOrder, partial, status:'pendente'|'entregue'|'cancelado', deliveryMode:'entrega'|'retirada',
//                  expectedDate, deliveredAt, address, notes, balanceDueDate, sinalPct, cancel:{...} }
//      m.madeToOrder = true  → item sob encomenda: NÃO baixa estoque e NÃO volta ao estoque ao cancelar.
//      payments[i].paidAt (AAAA-MM-DD) e payments[i].kind ('sinal' | 'saldo' | 'pagamento')
//  • Saldo = total da venda − soma dos pagamentos recebidos.
//  • Receber o saldo adiciona um novo pagamento à venda (com a data em que foi recebido) e recalcula taxas/lucro.
//  • Usa funções do app.js: data, money, esc, id, round2, saveData, toast, goTo, getSales, PM, PAY_METHODS, payLabel,
//    payExtraHtml, syncPayExtra, readPayExtra, validatePayments, enrichPayment, calcSaleFinance, buildReceivables,
//    findCustomerForSale, receiptFromSale, createReceiptPdf, sendReceiptWhatsapp, cancelSale, parseMoneyInput,
//    bindMoneyMask, nextProductCode, todayISO, dayText, localDateKey, hasFullAccess, currentUserName.
// ============================================================================
(function(){
const $=x=>document.getElementById(x), r2=n=>Math.round(Number(n||0)*100)/100;
const fmtIn=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const DAY=864e5;

// ---------- utilidades de venda/encomenda ----------
const saleMovs=sid=>data.movements.filter(m=>m.type==='venda'&&(m.saleId||m.id)===sid);
const orderOf=sale=>{const m=sale.movements.find(x=>x.order&&x.order.isOrder);return m?m.order:null;};
const paidOf=pays=>r2((pays||[]).reduce((s,p)=>s+Number(p.amount||0),0));
function info(sale){ // dados calculados de uma venda (getSales)
 const ord=orderOf(sale),paid=paidOf(sale.payments),balance=Math.max(0,r2(sale.total-paid));
 return {ord,paid,balance};
}
function setOrder(saleId,patch){saleMovs(saleId).forEach(m=>{m.order=Object.assign({},m.order||{},patch);});}
function addDaysKey(key,n){const [y,m,d]=String(key).split('-').map(Number);return localDateKey(new Date(y,m-1,d+n));}
function daysTo(key){ // dias até a data (negativo = atrasada)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(key||''))return null;
 const [y,m,d]=key.split('-').map(Number),[a,b,c]=todayISO().split('-').map(Number);
 return Math.round((new Date(y,m-1,d)-new Date(a,b-1,c))/DAY);
}
window.ckrIsOrderSale=function(saleId){const s=getSales().find(x=>x.id===saleId);return !!(s&&orderOf(s));};

// Recalcula taxa, crédito da fábrica e lucro de TODOS os itens da venda a partir dos pagamentos atuais.
// Pagamentos já gravados ficam "travados" (mantêm a taxa da época); só o pagamento novo usa a taxa atual.
function recalcSale(saleId,payments){
 const movs=saleMovs(saleId).filter(m=>!m.canceled);if(!movs.length)return;
 const total=r2(movs.reduce((s,m)=>s+Number(m.total||0),0));
 const lines=movs.map(m=>({lineTotal:Number(m.total||0),quantity:Number(m.quantity||0),unitCost:Number(m.unitCost||0)}));
 const fin=calcSaleFinance(lines,total,payments.map(p=>({...p})));
 const locked=fin.payments.map(p=>({...p,locked:true}));
 movs.forEach((m,i)=>{
  m.payments=locked.map(p=>({...p}));
  m.profit=fin.items[i].profit;m.fee=fin.items[i].fee;m.factoryCredit=fin.items[i].factoryCredit;
 });
 return locked;
}

// ============================================================================
// 1) BLOCO "ENCOMENDA" DENTRO DE "REGISTRAR VENDA" E DO PDV
// ============================================================================
const CFG={venda:{box:'ordBoxVenda',p:'ov'},pdv:{box:'ordBoxPdv',p:'op'}};
const el=(pre,name)=>$(pre+name);
function boxHtml(pre){return `
<section class="ord-box" id="${pre}Box">
 <label class="check-filter ord-main"><input type="checkbox" id="${pre}On"><span><b>Encomenda</b> · sob-medida, produto sem estoque, pagamento em partes ou entrega</span></label>
 <div class="ord-body" id="${pre}Body" hidden>
  <div class="form-two">
   <label class="field">Pagamento
    <select id="${pre}Pag"><option value="total">Pagamento total agora</option><option value="partes">Em partes (sinal agora + saldo depois)</option></select></label>
   <label class="field" id="${pre}PctWrap">Sinal (%)<input id="${pre}Pct" type="text" inputmode="decimal" value="30" autocomplete="off"></label>
  </div>
  <p class="pay-hint" id="${pre}SinalInfo" hidden></p>
  <div class="form-two">
   <label class="field">Entrega
    <select id="${pre}Modo"><option value="entrega">Entrega ao cliente</option><option value="retirada">Cliente retira na loja</option></select></label>
   <label class="field">Situação
    <select id="${pre}Status"><option value="pendente">Pendente (ainda não entregue)</option><option value="entregue">Entregue</option></select></label>
  </div>
  <div class="form-two">
   <label class="field" id="${pre}PrevWrap">Previsão de entrega<input id="${pre}Prev" type="date"></label>
   <label class="field" id="${pre}EntWrap" hidden>Data da entrega<input id="${pre}Ent" type="date"></label>
   <label class="field" id="${pre}SaldoWrap">Saldo previsto para<input id="${pre}SaldoData" type="date"></label>
  </div>
  <label class="field" id="${pre}EndWrap">Endereço / local da entrega<input id="${pre}End" maxlength="220" placeholder="Rua, número, bairro — preenchido pelo cadastro do cliente quando houver"></label>
  <label class="field">Detalhes da encomenda (medidas, cor, tecido...)<input id="${pre}Obs" maxlength="220" placeholder="Ex.: 1,58 x 1,98 · tecido cinza · base box baú"></label>
  <div class="ord-actions"><button type="button" class="button button-light button-small" id="${pre}UsarSinal" hidden>Usar valor do sinal no pagamento</button></div>
 </div>
 <div class="ord-actions"><button type="button" class="button button-light button-small" id="${pre}NovoProd">＋ Cadastrar produto na hora (sob-medida / nunca comprado)</button></div>
</section>`;}
function setup(key){
 const c=CFG[key],host=$(c.box);if(!host||host.dataset.ready)return;host.dataset.ready='1';
 const pre=c.p;host.innerHTML=boxHtml(pre);
 bindPercentInput($(pre+'Pct'));
 const sync=()=>{
  const on=$(pre+'On').checked,partes=$(pre+'Pag').value==='partes',ent=$(pre+'Status').value==='entregue';
  $(pre+'Body').hidden=!on;
  $(pre+'PctWrap').hidden=!partes;$(pre+'SaldoWrap').hidden=!partes;
  $(pre+'PrevWrap').hidden=ent;$(pre+'EntWrap').hidden=!ent;
  $(pre+'EndWrap').hidden=$(pre+'Modo').value!=='entrega';
  if(ent&&!$(pre+'Ent').value)$(pre+'Ent').value=todayISO();
  if(on&&!$(pre+'Prev').value)$(pre+'Prev').value=addDaysKey(todayISO(),20);
  if(on&&$(pre+'Modo').value==='entrega'&&!$(pre+'End').value)fillAddress(key);
  sinalInfo(key);
  document.dispatchEvent(new CustomEvent('ckr-order-change',{detail:{prefix:key}}));
 };
 host.addEventListener('change',sync);
 host.addEventListener('input',e=>{if(e.target.id===pre+'Pct'){sinalInfo(key);document.dispatchEvent(new CustomEvent('ckr-order-change',{detail:{prefix:key}}));}});
 $(pre+'NovoProd').addEventListener('click',()=>openNewProduct(key));
 $(pre+'UsarSinal').addEventListener('click',()=>{if(window.ckrUseSinal)window.ckrUseSinal(key);});
 const cli=$(key==='venda'?'vendaCliente':'pdvCliente');
 if(cli)cli.addEventListener('change',()=>{if($(pre+'On').checked&&!$(pre+'End').value)fillAddress(key);});
}
function fillAddress(key){
 const cli=$(key==='venda'?'vendaCliente':'pdvCliente'),c=cli&&findCustomerForSale(cli.value.trim(),'');
 if(!c)return;
 const parts=[[c.street,c.number].filter(Boolean).join(', '),c.complement,c.neighborhood,[c.city,c.state].filter(Boolean).join('/')].filter(Boolean);
 if(parts.length)$(CFG[key].p+'End').value=parts.join(' - ');
}
function totalOf(key){try{return window.ckrTotalFn&&window.ckrTotalFn[key]?Number(window.ckrTotalFn[key]())||0:0;}catch(_){return 0;}}
function pctOf(key){const v=parsePercentInput($(CFG[key].p+'Pct').value);return Math.min(100,Math.max(0,Number.isFinite(v)?v:0));}
function sinalInfo(key){
 const pre=CFG[key].p,box=$(pre+'SinalInfo'),btn=$(pre+'UsarSinal');
 const partes=$(pre+'On').checked&&$(pre+'Pag').value==='partes',total=totalOf(key);
 btn.hidden=!partes;box.hidden=!partes;
 if(!partes)return;
 const pct=pctOf(key),sinal=r2(total*pct/100);
 box.textContent=total>0?`Sinal de ${fmtIn(pct)}%: ${money(sinal)} · saldo na entrega: ${money(r2(total-sinal))}`:'Adicione os produtos para calcular o sinal.';
}
window.ckrSinalValue=key=>r2(totalOf(key)*pctOf(key)/100);
window.ckrUseSinal=function(key){
 const v=window.ckrSinalValue(key);if(!(v>0)){toast('Adicione os produtos antes de calcular o sinal.',true);return;}
 if(key==='pdv'){const e=$('pdvPagValor');e.value=fmtIn(v);e.dispatchEvent(new Event('input',{bubbles:true}));toast('Sinal no campo de pagamento. Escolha a forma e clique em Adicionar.');return;}
 let row=[...document.querySelectorAll('#linhasPagamento .payment-row')].find(r=>!r.querySelector('.pagamentoValor').value.trim());
 if(!row)row=addPaymentRow();
 const e=row.querySelector('.pagamentoValor');e.value=fmtIn(v);e.dispatchEvent(new Event('input',{bubbles:true}));
 toast('Sinal colocado no pagamento. Escolha a forma de pagamento.');
};
// Adiciona ao carrinho o produto recém-cadastrado (liga o modo Encomenda se ainda não estiver ligado).
window.ckrAddOrderItem=function(key,p,qty,price,cost){
 const pre=CFG[key].p,on=$(pre+'On');
 if(on&&!on.checked){on.checked=true;on.dispatchEvent(new Event('change',{bubbles:true}));}
 return key==='venda'?(window.ckrAddItemVenda&&window.ckrAddItemVenda(p,qty,price,cost)):(window.ckrAddItemPdv&&window.ckrAddItemPdv(p,qty,price,cost));
};

// ---- API usada por app.js (Registrar venda) e modulos.js (PDV) ----
window.ckrOrder={
 enabled:key=>!!($(CFG[key].p+'On')&&$(CFG[key].p+'On').checked),
 partial:key=>!!($(CFG[key].p+'On')&&$(CFG[key].p+'On').checked&&$(CFG[key].p+'Pag').value==='partes'),
 refresh:key=>sinalInfo(key),
 // Lê o bloco e devolve o objeto da encomenda (ou null se não for encomenda).
 read(key){
  const pre=CFG[key].p;if(!this.enabled(key))return null;
  const partial=this.partial(key),delivered=$(pre+'Status').value==='entregue',mode=$(pre+'Modo').value;
  return {isOrder:true,partial,status:delivered?'entregue':'pendente',deliveryMode:mode,
   expectedDate:delivered?'':($(pre+'Prev').value||''),deliveredAt:delivered?($(pre+'Ent').value||todayISO()):'',
   address:mode==='entrega'?$(pre+'End').value.trim():'',notes:$(pre+'Obs').value.trim(),
   balanceDueDate:partial?($(pre+'SaldoData').value||''):'',sinalPct:partial?pctOf(key):100};
 },
 // Valida a encomenda; devolve texto de erro ou ''.
 validate(key,ord,received,total,allowChange){
  if(!ord)return '';
  if(ord.deliveryMode==='entrega'&&ord.status==='pendente'&&!ord.expectedDate)return 'Informe a previsão de entrega da encomenda.';
  if(ord.status==='entregue'&&!ord.deliveredAt)return 'Informe a data da entrega.';
  if(ord.partial){
   if(!(received>0.009))return 'Em pagamento em partes, receba pelo menos o sinal agora e informe a forma de pagamento.';
   if(received>total+0.009)return `Os pagamentos ultrapassam o total em ${money(received-total)}.`;
  }else if(received<total-0.009)return `Falta receber ${money(total-received)}.`;
  else if(!allowChange&&received>total+0.009)return `Os pagamentos ultrapassam o total em ${money(received-total)}.`;
  return '';
 },
 // Marca cada pagamento com a data em que foi recebido e o tipo.
 stamp(payments,ord,dateKey){
  return payments.map(p=>({...p,paidAt:dateKey,kind:ord&&ord.partial?'sinal':'pagamento'}));
 },
 stockless:key=>!!($(CFG[key].p+'On')&&$(CFG[key].p+'On').checked),
 reset(key){
  const pre=CFG[key].p;if(!$(pre+'On'))return;
  $(pre+'On').checked=false;$(pre+'Pag').value='total';$(pre+'Pct').value='30';$(pre+'Modo').value='entrega';$(pre+'Status').value='pendente';
  ['Prev','Ent','SaldoData','End','Obs'].forEach(k=>$(pre+k).value='');
  $(pre+'Body').hidden=true;sinalInfo(key);
 },
 openNewProduct:key=>openNewProduct(key)
};

// ============================================================================
// 2) CADASTRAR PRODUTO NA HORA DA VENDA (sob-medida ou nunca comprado)
// ============================================================================
function openNewProduct(key){
 let m=$('ordProdModal');
 if(!m){
  m=document.createElement('div');m.id='ordProdModal';m.className='ord-modal';m.hidden=true;
  m.innerHTML=`<div class="ord-modal-card" role="dialog" aria-modal="true" aria-labelledby="npTitulo">
   <h3 id="npTitulo">Cadastrar produto na hora</h3>
   <p class="pay-hint">O produto vai para o catálogo e já entra no carrinho. Itens sob encomenda não baixam estoque.</p>
   <label class="field">Nome do produto<input id="npNome" maxlength="150" placeholder="Ex.: Cama box sob-medida 1,58 x 1,98"></label>
   <div class="form-two"><label class="field">Código<input id="npCod" maxlength="40"></label>
   <label class="field">Quantidade<input id="npQtd" type="number" min="1" step="1" value="1"></label></div>
   <div class="form-two"><label class="field">Valor de venda (R$)<input id="npPreco" type="text" inputmode="numeric" autocomplete="off" placeholder="0,00"></label>
   <label class="field">Custo estimado (R$)<input id="npCusto" type="text" inputmode="numeric" autocomplete="off" placeholder="0,00"></label></div>
   <label class="field">Tipo
    <select id="npTipo"><option value="mto">Sob-medida / sob encomenda (não passa pelo estoque)</option><option value="novo">Produto novo que ainda não comprei (vendo antes de receber)</option><option value="outro">Outro (digitar)…</option></select></label>
   <label class="field" id="npTipoOutroWrap" hidden>Digite o tipo<input id="npTipoOutro" maxlength="80" placeholder="Ex.: Importado, Reforma, Brinde…"></label>
   <div class="ord-actions"><button type="button" class="button button-primary" id="npSalvar">Cadastrar e adicionar</button><button type="button" class="button button-light" id="npCancelar">Cancelar</button></div>
  </div>`;
  document.body.appendChild(m);
  bindMoneyMask($('npPreco'));bindMoneyMask($('npCusto'));
  $('npTipo').addEventListener('change',()=>{const o=$('npTipo').value==='outro';$('npTipoOutroWrap').hidden=!o;if(o)setTimeout(()=>$('npTipoOutro').focus(),30);});
  $('npCancelar').addEventListener('click',()=>{m.hidden=true;});
  m.addEventListener('click',e=>{if(e.target===m)m.hidden=true;});
  $('npSalvar').addEventListener('click',()=>{
   const name=$('npNome').value.trim(),qty=Math.floor(Number($('npQtd').value)),price=round2(parseMoneyInput($('npPreco').value)),cost=round2(parseMoneyInput($('npCusto').value));
   let code=$('npCod').value.trim();
   if(!name){toast('Informe o nome do produto.',true);$('npNome').focus();return;}
   if(!(qty>=1)){toast('Informe uma quantidade inteira maior que zero.',true);return;}
   if(!(price>0)){toast('Informe o valor de venda.',true);$('npPreco').focus();return;}
   const tipoSel=$('npTipo').value,tipoTxt=tipoSel==='outro'?$('npTipoOutro').value.trim():'';
   if(tipoSel==='outro'&&!tipoTxt){toast('Digite o tipo do produto.',true);$('npTipoOutro').focus();return;}
   if(code&&data.products.some(p=>(p.code||'').toLowerCase()===code.toLowerCase())){toast('Já existe produto com o código '+code+'.',true);return;}
   if(!code)code=nextProductCode();
   const p={id:id(),name,code,cost,price,stock:0,createdAt:todayISO(),nfNumber:'',madeToOrder:tipoSel==='mto'||tipoSel==='outro',typeLabel:tipoTxt,createdInSale:true};
   data.products.push(p);
   const k=m.dataset.key;
   if(!window.ckrAddOrderItem||!window.ckrAddOrderItem(k,p,qty,price,cost)){toast('Não foi possível adicionar ao carrinho.',true);return;}
   if(saveData()){m.hidden=true;toast(`${name} cadastrado e adicionado ao carrinho.`);}
  });
 }
 m.dataset.key=key;
 $('npNome').value=(key==='venda'?$('vendaBuscaProduto'):$('pdvBusca')).value.trim().replace(/^\s*\d+\s*\*\s*/,'');
 $('npCod').value=nextProductCode();$('npQtd').value='1';$('npPreco').value='';$('npCusto').value='';$('npTipo').value='mto';$('npTipoOutro').value='';$('npTipoOutroWrap').hidden=true;
 m.hidden=false;setTimeout(()=>$('npNome').focus(),50);
}

// ============================================================================
// 3) PAINEL "ENCOMENDAS"
// ============================================================================
function injectPanel(){
 if($('panel-encomendas'))return;
 const nav=document.querySelector('.nav-link[data-panel="pdv"]');
 if(nav&&!document.querySelector('.nav-link[data-panel="encomendas"]')){
  const b=document.createElement('button');b.className='nav-link';b.dataset.panel='encomendas';
  b.innerHTML='<span class="nav-icon">⛟</span> Encomendas <span class="nav-count" id="menuEncomendas">0</span>';
  nav.insertAdjacentElement('afterend',b);
  b.addEventListener('click',()=>goTo('encomendas'));
 }
 const ref=$('panel-orcamentos');
 const sec=document.createElement('section');sec.className='panel';sec.id='panel-encomendas';
 sec.innerHTML=`
 <div class="page-heading"><div><p class="eyebrow">COMERCIAL</p><h1>Encomendas e entregas</h1><p class="subtitle">Vendas sob-medida, sinal + saldo, entregas pendentes e cancelamentos.</p></div></div>
 <section class="stats-grid ord-stats" id="ordStats"></section>
 <section class="surface list-surface">
  <div class="surface-heading responsive-heading"><div><h2>Encomendas</h2><p id="ordResumo"></p></div>
   <div class="search-tools"><input id="ordBusca" type="search" placeholder="Buscar cliente, produto ou nº da venda"><select id="ordFiltro" aria-label="Filtrar"><option value="pendentes">Pendentes de entrega</option><option value="saldo">Com saldo a receber</option><option value="atrasadas">Atrasadas</option><option value="entregues">Entregues</option><option value="canceladas">Canceladas</option><option value="todas">Todas</option></select></div></div>
  <div class="table-wrap"><table><thead><tr><th>VENDA</th><th>CLIENTE / ITENS</th><th>TOTAL</th><th>PAGO</th><th>SALDO</th><th>ENTREGA</th><th>AÇÕES</th></tr></thead><tbody id="ordLinhas"></tbody></table></div>
  <div id="ordVazio" class="empty-state" style="display:none"><div class="empty-symbol">⛟</div><b>Nenhuma encomenda aqui</b><p>Ao registrar uma venda ou usar o PDV, marque a opção “Encomenda”.</p></div>
 </section>`;
 (ref&&ref.parentNode?ref.parentNode:document.querySelector('main')).insertBefore(sec,ref||null);
 $('ordBusca').addEventListener('input',render);$('ordFiltro').addEventListener('change',render);
 $('ordLinhas').addEventListener('click',onRowClick);
}
function statusOf(s,i){ // {txt, cls}
 if(s.canceled)return {txt:'Cancelada',cls:'cancelada',key:'canceladas'};
 const o=i.ord;if(!o)return {txt:'',cls:'',key:''};
 if(o.status==='entregue')return {txt:'Entregue',cls:'ativa',key:'entregues'};
 const d=daysTo(o.expectedDate);
 if(d!==null&&d<0)return {txt:`Atrasada ${-d} dia(s)`,cls:'cancelada',key:'pendentes',late:true};
 return {txt:d===0?'Entrega hoje':d===1?'Entrega amanhã':'Pendente',cls:'ord-pend',key:'pendentes'};
}
function orders(){
 return getSales().map(s=>({s,i:info(s)})).filter(x=>x.i.ord);
}
function render(){
 if(!$('panel-encomendas'))return;
 const all=orders(),act=all.filter(x=>!x.s.canceled);
 const pend=act.filter(x=>x.i.ord.status!=='entregue'),late=pend.filter(x=>{const d=daysTo(x.i.ord.expectedDate);return d!==null&&d<0;});
 const saldo=r2(act.reduce((n,x)=>n+x.i.balance,0)),mon=todayISO().slice(0,7);
 const entMes=act.filter(x=>x.i.ord.status==='entregue'&&String(x.i.ord.deliveredAt||'').startsWith(mon)).length;
 const mc=$('menuEncomendas');if(mc)mc.textContent=pend.length;
 $('ordStats').innerHTML=[['Pendentes de entrega',pend.length,'icon-blue','⛟'],['Atrasadas',late.length,'icon-violet','!'],['Saldo a receber',money(saldo),'icon-green','$'],['Entregues no mês',entMes,'icon-blue','✓']]
  .map(([t,v,ic,sy])=>`<article class="stat-card"><div class="stat-top"><span class="stat-icon ${ic}">${sy}</span><span class="stat-label">${t}</span></div><strong>${v}</strong></article>`).join('');
 const al=$('ordAlerta');
 if(al){const soon=pend.filter(x=>{const d=daysTo(x.i.ord.expectedDate);return d!==null&&d>=0&&d<=2;});
  al.hidden=!(late.length||soon.length);
  if(!al.hidden)$('ordAlertaTexto').textContent=[late.length?`${late.length} entrega(s) atrasada(s)`:'',soon.length?`${soon.length} entrega(s) nos próximos 2 dias`:'',saldo>0?`saldo a receber ${money(saldo)}`:''].filter(Boolean).join(' · ');}
 const f=$('ordFiltro').value,tokens=fold($('ordBusca').value).split(/\s+/).filter(Boolean);
 const rows=all.filter(x=>{
  const st=statusOf(x.s,x.i);
  if(f==='pendentes'&&!(st.key==='pendentes'))return false;
  if(f==='saldo'&&!(x.i.balance>0.009&&!x.s.canceled))return false;
  if(f==='atrasadas'&&!st.late)return false;
  if(f==='entregues'&&st.key!=='entregues')return false;
  if(f==='canceladas'&&st.key!=='canceladas')return false;
  const hay=fold([x.s.client,x.s.id,x.s.items.map(i=>i.name).join(' '),x.i.ord.notes].join(' '));
  return tokens.every(t=>hay.includes(t));
 }).sort((a,b)=>{ // pendentes primeiro, por previsão de entrega
  const ka=a.i.ord.status==='pendente'&&!a.s.canceled?(a.i.ord.expectedDate||'9999'):'z'+a.s.date,kb=b.i.ord.status==='pendente'&&!b.s.canceled?(b.i.ord.expectedDate||'9999'):'z'+b.s.date;
  return ka<kb?-1:ka>kb?1:0;
 });
 $('ordResumo').textContent=`${rows.length} encomenda(s) · saldo a receber das ativas: ${money(saldo)}`;
 $('ordLinhas').innerHTML=rows.map(({s,i})=>{
  const st=statusOf(s,i),o=i.ord,done=o.status==='entregue';
  const ent=s.canceled?'—':done?`${o.deliveryMode==='retirada'?'Retirada':'Entregue'} em ${dayText(o.deliveredAt)}`:`${o.deliveryMode==='retirada'?'Retirada':'Entrega'}: ${o.expectedDate?dayText(o.expectedDate):'sem data'}`;
  const btn=(a,t,cls='')=>`<button type="button" class="row-action ${cls}" data-oa="${a}" data-sid="${esc(s.id)}">${t}</button>`;
  const acts=s.canceled?btn('recibo','Recibo'):[
   i.balance>0.009?btn('receber','Receber saldo'):'',
   !done?btn('entregar','Marcar entregue'):btn('reabrir','Reabrir entrega'),
   btn('editar','Editar entrega'),btn('recibo','Recibo PDF'),btn('whats','WhatsApp'),btn('cancelar','Cancelar','delete')].join('');
  return `<tr class="${s.canceled?'row-canceled':''}">
   <td>${esc(dateText(s.date))}<br><small>Venda ${esc(s.id)}</small></td>
   <td><span class="product-name">${esc(s.client||'Sem cliente')}</span><ul class="sale-items">${s.items.map(x=>`<li>${x.quantity}× ${esc(x.name)}</li>`).join('')}</ul>${o.notes?`<small>${esc(o.notes)}</small>`:''}${o.address&&!s.canceled?`<br><small>📍 ${esc(o.address)}</small>`:''}</td>
   <td class="${s.canceled?'sale-money-canceled':''}">${esc(money(s.total))}</td>
   <td>${esc(money(i.paid))}</td>
   <td><b style="color:${i.balance>0.009&&!s.canceled?'#dc2626':'inherit'}">${esc(money(s.canceled?0:i.balance))}</b>${i.balance>0.009&&!s.canceled&&o.balanceDueDate?`<br><small>previsto ${esc(dayText(o.balanceDueDate))}</small>`:''}</td>
   <td><span class="pill ${st.cls}">${esc(st.txt)}</span><br><small>${esc(ent)}</small>${o.cancel?`<br><small>${o.cancel.retained>0?`retido ${esc(money(o.cancel.retained))}`:'valor devolvido'}${o.cancel.reason?' · '+esc(o.cancel.reason):''}</small>`:''}</td>
   <td>${acts}</td></tr>`;
 }).join('');
 $('ordVazio').style.display=rows.length?'none':'block';
}
function onRowClick(e){
 const b=e.target.closest('[data-oa]');if(!b)return;
 const sid=b.dataset.sid,a=b.dataset.oa,s=getSales().find(x=>x.id===sid);if(!s)return;
 if(a==='recibo'||a==='whats'){const r=receiptFromSale(s);if(a==='recibo')createReceiptPdf(r);else sendReceiptWhatsapp(r);return;}
 if(!hasFullAccess()&&a!=='receber'&&a!=='entregar'){toast('Seu perfil não tem permissão para esta ação.',true);return;}
 if(a==='receber')openReceive(sid,false);
 else if(a==='entregar')openReceive(sid,true);
 else if(a==='editar')openEdit(sid);
 else if(a==='cancelar')openCancel(sid);
 else if(a==='reabrir'){if(!confirm('Reabrir esta encomenda como pendente de entrega?'))return;setOrder(sid,{status:'pendente',deliveredAt:''});if(saveData())toast('Encomenda reaberta.');}
}

// ---------- modal genérico ----------
function modal(id,html){
 let m=$(id);
 if(!m){m=document.createElement('div');m.id=id;m.className='ord-modal';m.hidden=true;document.body.appendChild(m);m.addEventListener('click',e=>{if(e.target===m)m.hidden=true;});}
 m.innerHTML=`<div class="ord-modal-card" role="dialog" aria-modal="true">${html}</div>`;m.hidden=false;return m;
}

// ---------- receber saldo e/ou marcar entregue ----------
function payRowHtml(){
 return `<div class="payment-row-main"><label class="field">Forma de pagamento<select class="pagamentoMetodo"><option value="">Selecione...</option>${PAY_METHODS.map(m=>`<option>${esc(m)}</option>`).join('')}</select></label><label class="field">Valor (R$)<input class="pagamentoValor" type="text" inputmode="numeric" autocomplete="off" placeholder="0,00"></label><button type="button" class="payment-remove" aria-label="Remover" title="Remover">×</button></div><div class="payment-card-options" hidden>${payExtraHtml()}</div>`;
}
function openReceive(sid,deliver){
 const s=getSales().find(x=>x.id===sid);if(!s)return;
 const i=info(s),bal=i.balance,client=s.client;
 const m=modal('ordRecModal',`
  <h3>${deliver?'Entregar encomenda':'Receber pagamento'} · Venda ${esc(s.id)}</h3>
  <p class="pay-hint">${esc(s.client||'Sem cliente')} · total ${money(s.total)} · já pago ${money(i.paid)} · <b>saldo ${money(bal)}</b></p>
  <div id="orcPays" ${bal>0.009?'':'hidden'}>
   <label class="field">Data do recebimento<input id="orcData" type="date" value="${todayISO()}"></label>
   <div id="orcLinhas" class="payment-lines"></div>
   <div class="ord-actions"><button type="button" class="button button-light button-small" id="orcAdd">＋ Adicionar forma</button><button type="button" class="button button-light button-small" id="orcTudo">Receber o saldo todo</button></div>
   <p class="payment-notice" id="orcAviso"></p>
  </div>
  ${bal>0.009?'':'<p class="payment-notice payment-ok">Esta encomenda já está quitada.</p>'}
  <label class="check-filter ord-main"><input type="checkbox" id="orcEntregue" ${deliver?'checked':''}><span>Marcar como entregue</span></label>
  <div class="form-two" id="orcEntBox" ${deliver?'':'hidden'}>
   <label class="field">Data da entrega<input id="orcEntData" type="date" value="${todayISO()}"></label>
   <label class="field">Custo real da produção (opcional)<input id="orcCusto" type="text" inputmode="numeric" autocomplete="off" placeholder="${fmtIn(s.movements.reduce((n,x)=>n+Number(x.costTotal||0),0))}"></label>
  </div>
  <p class="pay-hint" id="orcCustoHint" ${deliver?'':'hidden'}>Se o custo final for diferente do estimado, informe aqui para o lucro ficar certo.</p>
  <div class="ord-actions"><button type="button" class="button button-primary" id="orcOk">Confirmar</button><button type="button" class="button button-light" id="orcCancela">Fechar</button></div>`);
 const lines=$('orcLinhas');
 bindMoneyMask($('orcCusto'));
 const readRows=()=>[...lines.children].map(row=>{
  const method=row.querySelector('.pagamentoMetodo').value,amount=r2(parseMoneyInput(row.querySelector('.pagamentoValor').value));
  return readPayExtra(row.querySelector('.payment-card-options'),method,amount);
 }).filter(x=>x.method||x.amount>0);
 const refresh=()=>{
  lines.querySelectorAll('.payment-row').forEach(row=>syncPayExtra(row.querySelector('.payment-card-options'),row.querySelector('.pagamentoMetodo').value,r2(parseMoneyInput(row.querySelector('.pagamentoValor').value))));
  const got=r2(readRows().reduce((n,x)=>n+x.amount,0)),left=r2(bal-got),av=$('orcAviso');if(!av)return;
  av.className='payment-notice'+(left<-0.009?' payment-error':left<=0.009?' payment-ok':'');
  av.textContent=left>0.009?`Recebendo ${money(got)} · continua faltando ${money(left)}.`:left<-0.009?`O valor ultrapassa o saldo em ${money(-left)}.`:'Saldo quitado com este recebimento.';
 };
 const addRow=(method,amount)=>{
  const row=document.createElement('div');row.className='payment-row';row.innerHTML=payRowHtml();lines.appendChild(row);
  bindMoneyMask(row.querySelector('.pagamentoValor'));
  ['pagamentoMetodo','pagamentoResponsavel','pagamentoBandeira','pagamentoVencimento','pagamentoExtendido'].forEach(c=>row.querySelector('.'+c).addEventListener('change',refresh));
  ['pagamentoValor','pagamentoParcelas'].forEach(c=>row.querySelector('.'+c).addEventListener('input',refresh));
  row.querySelector('.pagamentoValor').addEventListener('money-mask-updated',refresh);
  row.querySelector('.payment-remove').addEventListener('click',()=>{row.remove();refresh();});
  if(method)row.querySelector('.pagamentoMetodo').value=method;
  if(amount>0)row.querySelector('.pagamentoValor').value=fmtIn(amount);
  refresh();return row;
 };
 if(bal>0.009){
  addRow('',0);
  $('orcAdd').addEventListener('click',()=>addRow('',0));
  $('orcTudo').addEventListener('click',()=>{lines.innerHTML='';addRow('',bal);});
 }
 $('orcEntregue').addEventListener('change',()=>{const on=$('orcEntregue').checked;$('orcEntBox').hidden=!on;$('orcCustoHint').hidden=!on;});
 $('orcCancela').addEventListener('click',()=>{m.hidden=true;});
 $('orcOk').addEventListener('click',()=>{
  const pays=bal>0.009?readRows():[],got=r2(pays.reduce((n,x)=>n+x.amount,0)),wantDeliver=$('orcEntregue').checked;
  if(!pays.length&&!wantDeliver){toast('Informe um pagamento ou marque como entregue.',true);return;}
  if(pays.length){
   const perr=validatePayments(pays,client);if(perr){toast(perr,true);return;}
   if(got>bal+0.009){toast(`O valor ultrapassa o saldo (${money(bal)}).`,true);return;}
  }
  const left=r2(bal-got);
  if(wantDeliver&&left>0.009&&!confirm(`Ainda faltam ${money(left)}. Entregar mesmo assim, deixando o saldo em aberto?`))return;
  const day=($('orcData')&&$('orcData').value)||todayISO(),entDay=$('orcEntData').value||todayISO();
  if(pays.length){
   const ses=(data.cashSessions||[]).find(x=>!x.closedAt),add=pays.map(p=>({...p,paidAt:day,kind:'saldo',sessionId:ses?ses.id:''})),all=[...(s.payments||[]).map(p=>({...p,locked:true})),...add];
   recalcSale(sid,all);
   const customer=findCustomerForSale(client,'');
   const novas=buildReceivables(sid,client,customer,add,day);novas.forEach(r=>{r.fromBalance=true;});
   (data.receivables||(data.receivables=[])).push(...novas);
  }
  const patch={};
  if(wantDeliver){patch.status='entregue';patch.deliveredAt=entDay;}
  if(left<=0.009)patch.balanceDueDate='';
  setOrder(sid,patch);
  const real=r2(parseMoneyInput($('orcCusto').value));
  if(wantDeliver&&real>0)applyRealCost(sid,real);
  if(saveData()){m.hidden=true;toast(wantDeliver?'Encomenda entregue.':`Recebimento de ${money(got)} registrado.`);}
 });
}
// Troca o custo estimado pelo custo real (distribuído proporcionalmente entre os itens) e recalcula o lucro.
function applyRealCost(sid,real){
 const movs=saleMovs(sid).filter(m=>!m.canceled),est=movs.reduce((n,m)=>n+Number(m.costTotal||0),0);
 if(!movs.length)return;
 let used=0;
 movs.forEach((m,idx)=>{
  const share=idx===movs.length-1?r2(real-used):r2(est>0?real*Number(m.costTotal||0)/est:real/movs.length);used+=share;
  m.costTotal=share;m.unitCost=Number(m.quantity)?share/m.quantity:share;m.costReal=true;
 });
 recalcSale(sid,movs[0].payments||[]);
}

// ---------- editar dados de entrega ----------
function openEdit(sid){
 const s=getSales().find(x=>x.id===sid);if(!s)return;const o=info(s).ord;
 const m=modal('ordEditModal',`
  <h3>Editar entrega · Venda ${esc(s.id)}</h3>
  <div class="form-two"><label class="field">Entrega<select id="oeModo"><option value="entrega">Entrega ao cliente</option><option value="retirada">Cliente retira na loja</option></select></label>
  <label class="field">Situação<select id="oeStatus"><option value="pendente">Pendente</option><option value="entregue">Entregue</option></select></label></div>
  <div class="form-two"><label class="field">Previsão de entrega<input id="oePrev" type="date"></label><label class="field">Data da entrega<input id="oeEnt" type="date"></label></div>
  <label class="field">Saldo previsto para<input id="oeSaldo" type="date"></label>
  <label class="field">Endereço / local<input id="oeEnd" maxlength="220"></label>
  <label class="field">Detalhes da encomenda<input id="oeObs" maxlength="220"></label>
  <div class="ord-actions"><button type="button" class="button button-primary" id="oeOk">Salvar</button><button type="button" class="button button-light" id="oeFecha">Fechar</button></div>`);
 $('oeModo').value=o.deliveryMode||'entrega';$('oeStatus').value=o.status||'pendente';$('oePrev').value=o.expectedDate||'';$('oeEnt').value=o.deliveredAt||'';$('oeSaldo').value=o.balanceDueDate||'';$('oeEnd').value=o.address||'';$('oeObs').value=o.notes||'';
 $('oeFecha').addEventListener('click',()=>{m.hidden=true;});
 $('oeOk').addEventListener('click',()=>{
  const st=$('oeStatus').value;
  if(st==='entregue'&&!$('oeEnt').value)$('oeEnt').value=todayISO();
  setOrder(sid,{deliveryMode:$('oeModo').value,status:st,expectedDate:st==='pendente'?$('oePrev').value:(o.expectedDate||''),deliveredAt:st==='entregue'?$('oeEnt').value:'',balanceDueDate:$('oeSaldo').value,address:$('oeEnd').value.trim(),notes:$('oeObs').value.trim()});
  if(saveData()){m.hidden=true;toast('Dados da entrega atualizados.');}
 });
}

// ---------- cancelar encomenda (devolver ou reter o valor pago) ----------
function openCancel(sid){
 const s=getSales().find(x=>x.id===sid);if(!s||s.canceled)return;
 const i=info(s),paid=i.paid,cx=window.ckrCaixa,accs=cx?cx.accounts():[];
 const first=(s.payments||[]).find(p=>p.method);
 const defAcc=!first?'nubank':first.method==='Dinheiro'?'dinheiro':first.method==='Pix'?cx&&cx.pixAcc():'blu';
 const m=modal('ordCancelModal',`
  <h3>Cancelar encomenda · Venda ${esc(s.id)}</h3>
  <p class="pay-hint">${esc(s.client||'Sem cliente')} · total ${money(s.total)} · já recebido <b>${money(paid)}</b>. Produtos de estoque voltam ao estoque; itens sob encomenda não mexem no estoque.</p>
  ${paid>0.009?`
  <label class="check-filter ord-main"><input type="radio" name="ocModo" value="devolver" checked><span>Devolver todo o valor pago (${money(paid)}) ao cliente</span></label>
  <label class="check-filter ord-main"><input type="radio" name="ocModo" value="reter"><span>Reter parte do valor (multa / sinal não reembolsável)</span></label>
  <div class="form-two" id="ocReterBox" hidden>
   <label class="field">Valor retido (R$)<input id="ocReter" type="text" inputmode="numeric" autocomplete="off" placeholder="0,00"></label>
   <label class="field">Entra em qual caixa?<select id="ocConta">${accs.map(a=>`<option value="${a.k}"${a.k===defAcc?' selected':''}>${esc(a.name)}</option>`).join('')}</select></label>
  </div>`:'<p class="payment-notice">Nenhum valor foi recebido, então não há o que devolver.</p>'}
  <label class="field">Motivo do cancelamento<input id="ocMotivo" maxlength="160" placeholder="Ex.: cliente desistiu"></label>
  <div class="ord-actions"><button type="button" class="button button-primary" id="ocOk" style="background:#dc2626">Cancelar encomenda</button><button type="button" class="button button-light" id="ocFecha">Voltar</button></div>`);
 if(paid>0.009){
  bindMoneyMask($('ocReter'));
  m.querySelectorAll('input[name=ocModo]').forEach(r=>r.addEventListener('change',()=>{$('ocReterBox').hidden=m.querySelector('input[name=ocModo]:checked').value!=='reter';}));
 }
 $('ocFecha').addEventListener('click',()=>{m.hidden=true;});
 $('ocOk').addEventListener('click',()=>{
  let retained=0,acc='';
  if(paid>0.009&&m.querySelector('input[name=ocModo]:checked').value==='reter'){
   retained=r2(parseMoneyInput($('ocReter').value));acc=$('ocConta').value;
   if(!(retained>0)||retained>paid+0.009){toast(`Informe o valor retido (até ${money(paid)}).`,true);return;}
  }
  const reason=$('ocMotivo').value.trim();
  if(!confirm(`Confirmar o cancelamento da venda ${s.id}?\n${retained>0?`Retido: ${money(retained)} · devolvido: ${money(paid-retained)}`:paid>0.009?`Devolver ${money(paid)} ao cliente.`:'Sem valores recebidos.'}`))return;
  setOrder(sid,{status:'cancelado',cancel:{at:new Date().toISOString(),by:currentUserName(),reason,paid,retained:retained,refunded:r2(paid-retained)}});
  m.hidden=true;
  cancelSale(sid,{skipConfirm:true});
  if(retained>0&&cx){ // o valor retido continua no caixa como entrada manual
   cx.push(acc,retained,'entrada',todayISO(),`Valor retido do cancelamento da venda ${sid}${reason?' · '+reason:''}`);saveData();
  }
 });
}
window.ckrOrder.openCancel=openCancel;

// ============================================================================
// 4) INTEGRAÇÃO
// ============================================================================
function boot(){
 injectPanel();setup('venda');setup('pdv');
 const base=window.renderAll;
 window.renderAll=function(){base.apply(this,arguments);try{render();}catch(e){console.error(e);}try{sinalInfo('venda');sinalInfo('pdv');}catch(_){}};
 const baseGo=window.goTo;
 window.goTo=function(name){baseGo.apply(this,arguments);if(name==='encomendas')render();};
 render();
}
boot();
})();
