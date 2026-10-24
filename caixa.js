'use strict';
// REGRAS: Dinheiro → "Dinheiro CAIXA" · Pix → "Caixa NUBANK" · Cartão FÁBRICA → 40% (100% − crédito) no "Caixa BLU" na hora ·
// Cartão LOJA (crédito, link Blu e débito) → valor líquido (já sem taxa) dividido nas parcelas; cada parcela fica na "Caixa AGENDA BLU"
// e entra no "Caixa BLU" na data de entrada (padrão: 30 dias por parcela; débito 1 dia). Dia, data e valor de cada parcela podem ser editados.
// Conceito: CAIXA (DFC) — substitui a antiga "Meta de lucro mensal".
// Contas: Caixa BLU (recebe sozinho das vendas no cartão), Caixa NUBANK e Dinheiro CAIXA (movimentos manuais/transferências).
// Regras automáticas (por venda não cancelada):
//   • Cartão FÁBRICA (crédito ou link Blu): entra o que NÃO vira crédito com a fábrica (hoje 100% − % de crédito = 40%).
//   • Cartão LOJA (crédito, link Blu) e débito: entra o valor pago já descontada a taxa do cartão.
// Dinheiro CAIXA: recebe sozinho o valor das vendas pagas em DINHEIRO.
// Pix: entra sozinho, valor cheio (sem taxa), na conta escolhida em "Pix entra em qual conta?" (padrão: Caixa NUBANK).
// Despesas PAGAS com a conta de origem = uma conta do caixa saem do saldo dessa conta (data = data do pagamento).
// Usa funções do app.js (data, money, saveData, id, esc, dayText, todayISO, localDateKey, parseMoneyInput, bindMoneyMask, toast, hasFullAccess, PM, getSettings).
(function(){
const $=x=>document.getElementById(x), r2=n=>Math.round(Number(n||0)*100)/100;
const ACCS=[
 {k:'blu',name:'Caixa BLU',sub:'Cartão fábrica e parcelas da loja que já venceram'},
 {k:'nubank',name:'Caixa NUBANK',sub:'Recebe os Pix das vendas e transferências'},
 {k:'dinheiro',name:'Dinheiro CAIXA',sub:'Dinheiro físico da loja'},
 {k:'agenda',name:'Caixa AGENDA BLU',sub:'Parcelas do cartão loja que ainda vão entrar no Caixa BLU'}
];
const accName=k=>(ACCS.find(a=>a.k===k)||{}).name||k;
const ledger=()=>data.cashLedger||(data.cashLedger=[]);
const conf=()=>data.cashConfig||(data.cashConfig={});
const signed=v=>(v<0?'−':'')+money(Math.abs(v));
const isCard=m=>m===PM.CREDIT||m===PM.BLU||m===PM.DEBIT;
const CASH='Dinheiro',PIX='Pix';
const addDays=(day,n)=>{const p=String(day).split('-').map(Number);return localDateKey(new Date(p[0],p[1]-1,p[2]+n));};
const dias=deb=>{const v=Number(conf()[deb?'debitDays':'creditDays']);return Number.isFinite(v)&&v>=0?Math.floor(v):(deb?1:30);};
const pixAcc=()=>{const k=conf().pixAccount;return ACCS.some(a=>a.k===k)?k:'nubank';};
const monthStart=()=>{const n=new Date();return localDateKey(new Date(n.getFullYear(),n.getMonth(),1));};
const fmtIn=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const KIND={transf:'Transferência',entrada:'Entrada',saida:'Saída',ajuste:'Ajuste de saldo'};
let shown=[];

function denied(){if(hasFullAccess())return false;toast('Seu perfil não tem permissão para alterar o caixa.',true);return true;}
// Data de corte: vendas anteriores a ela não entram no Caixa BLU (evita puxar todo o histórico antigo).
function ensureStart(){
 if(conf().start)return;
 conf().start=monthStart();
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));}catch(_){}
}

// ---------- entradas automáticas (vendas no cartão e em dinheiro) ----------
function autoEntries(){
 const start=conf().start||'',first=new Map(),ov=conf().parcelas||{};
 data.movements.forEach(m=>{
  if(m.type!=='venda'||m.canceled)return;
  const k=m.saleId||m.id;if(!first.has(k))first.set(k,m);   // os pagamentos ficam repetidos em cada item da venda: conta uma vez só
 });
 const out=[];
 first.forEach((m,k)=>{
  const day=localDateKey(m.date);if(!day||(start&&day<start))return;
  let fab=0,cash=0,pix=0;const parcs=[];
  (m.payments||[]).forEach((p,pi)=>{
   if(!p)return;
   const amt=Number(p.amount||0);
   if(p.method===CASH){cash+=amt;return;}
   if(p.method===PIX){pix+=amt;return;}
   if(!isCard(p.method))return;
   if((p.method===PM.CREDIT||p.method===PM.BLU)&&p.responsible==='fabrica'){fab+=amt-Number(p.factoryCredit||0);return;}
   // cartão loja / débito: valor líquido (sem taxa) dividido em parcelas, cada uma com sua data de entrada
   const deb=p.method===PM.DEBIT,n=deb?1:Math.max(1,Math.min(60,Math.floor(Number(p.installments)||1))),net=r2(amt-Number(p.fee||0));
   if(!(net>0))return;
   const cents=Math.round(net*100),q=Math.floor(cents/n);
   for(let i=1;i<=n;i++){
    const pkey=k+':'+pi+':'+i,o=ov[pkey]||null,defDate=addDays(day,deb?dias(true):dias(false)*i),defAmt=r2((i<n?q:cents-q*(n-1))/100);
    const date=(o&&o.date)||defDate,amount=(o&&o.amount!=null)?r2(o.amount):defAmt;
    if(!(amount>0))continue;
    parcs.push({pkey,saleKey:k,client:m.client||'',saleDay:day,method:p.method,i,n,date,amount,defDate,defAmt,edited:!!o});
   }
  });
  fab=r2(fab);cash=r2(cash);pix=r2(pix);
  if(fab+cash+pix<=0.004&&!parcs.length)return;
  out.push({key:k,date:day,ts:String(m.date||''),client:m.client||'',fab,cash,pix,blu:fab,parcs});
 });
 return out;
}
// Despesas pagas que saem de uma conta do caixa (conta de origem 'caixa:blu' etc.)
function expenseEntries(){
 const start=conf().start||'',out=[];
 (data.expenses||[]).forEach(x=>{
  if(!x||x.status!=='pago'||String(x.account||'').indexOf('caixa:')!==0)return;
  const acc=x.account.slice(6);if(!ACCS.some(a=>a.k===acc))return;
  const day=x.paidDate||x.date||'',amt=r2(x.amount);
  if(!day||(start&&day<start)||!(amt>0))return;
  out.push({key:x.id,date:day,ts:String(x.updatedAt||x.createdAt||''),acc,amount:-amt,desc:'Despesa: '+(x.description||'sem descrição'),sub:x.category||''});
 });
 return out;
}
function balances(){
 const b={blu:0,nubank:0,dinheiro:0,agenda:0},auto=autoEntries(),exp=expenseEntries(),pa=pixAcc(),hoje=todayISO(),parcs=[];
 let fab=0,cash=0,pix=0,lojaRec=0,lojaPend=0;
 auto.forEach(a=>{
  b.blu+=a.fab;b.dinheiro+=a.cash;b[pa]+=a.pix;fab+=a.fab;cash+=a.cash;pix+=a.pix;
  a.parcs.forEach(p=>{
   p.due=p.date<=hoje;   // venceu: já está no Caixa BLU; senão fica na Caixa AGENDA BLU
   if(p.due){b.blu+=p.amount;lojaRec+=p.amount;}else{b.agenda+=p.amount;lojaPend+=p.amount;}
   parcs.push(p);
  });
 });
 exp.forEach(x=>{b[x.acc]+=x.amount;});
 ledger().forEach(e=>{if(e.account in b)b[e.account]+=Number(e.amount||0);});
 Object.keys(b).forEach(k=>b[k]=r2(b[k]));
 return {b,auto,exp,parcs,fab:r2(fab),cash:r2(cash),pix:r2(pix),pa,lojaRec:r2(lojaRec),lojaPend:r2(lojaPend),total:r2(b.blu+b.nubank+b.dinheiro+b.agenda)};
}

// ---------- tela ----------
function renderCard(S){
 $('cxTotal').textContent=signed(S.total);
 const tl=document.querySelector('#cxCard .cx-total span');if(tl)tl.textContent='Saldo total (com o que está a receber)';
 $('cxContas').innerHTML=ACCS.map(a=>{
  let sub=a.sub;
  if(a.k==='blu')sub+=` · fábrica ${money(S.fab)} + loja ${money(S.lojaRec)}`;
  if(a.k==='dinheiro')sub+=` · vendas em dinheiro ${money(S.cash)}`;
  if(a.k==='agenda')sub+=` · a receber ${money(S.lojaPend)}`;
  if(a.k===S.pa)sub+=` · Pix ${money(S.pix)}`;
  return `<div class="cx-acc"><div class="cx-acc-top"><div><b>${esc(a.name)}</b><small>${esc(sub)}</small></div><strong class="${S.b[a.k]<0?'cx-neg':''}">${signed(S.b[a.k])}</strong></div><div class="cx-acc-btns"><button type="button" class="row-action" data-cx="transf" data-acc="${a.k}">Transferir</button><button type="button" class="row-action" data-cx="ajuste" data-acc="${a.k}">Editar saldo</button></div></div>`;
 }).join('');
 const fabPct=100-getSettings().factoryCreditPct;
 $('cxNota').innerHTML=`<b>Caixa BLU:</b> cartão fábrica entra na hora com ${fabPct.toLocaleString('pt-BR',{maximumFractionDigits:2})}% do valor (o resto vira crédito com a fábrica); cartão loja entra já sem a taxa, parcela por parcela, na data de entrada (veja a Agenda BLU abaixo). <b>Dinheiro CAIXA:</b> vendas pagas em dinheiro. <b>Pix:</b> entra com o valor cheio na conta escolhida abaixo. Despesas pagas saem da conta escolhida em "Saiu de qual conta?". <label class="field" style="margin-top:10px">Pix entra em qual conta?<select id="cxPixAcc">${ACCS.map(a=>`<option value="${a.k}"${a.k===S.pa?' selected':''}>${esc(a.name)}</option>`).join('')}</select></label> <label class="field" style="margin-top:10px">Contar vendas a partir de<input type="date" id="cxStart" value="${esc(conf().start||'')}"></label>`;
}
function rowsAll(S){
 const rows=[];
 S.auto.forEach(a=>{
  const desc=`Venda #${String(a.key).slice(-6)}${a.client?' · '+a.client:''}`;
  if(a.fab>0)rows.push({acc:'blu',date:a.date,ts:a.ts,amount:a.fab,auto:true,desc,sub:`cartão fábrica ${money(a.fab)}`});
  if(a.cash>0)rows.push({acc:'dinheiro',date:a.date,ts:a.ts,amount:a.cash,auto:true,desc,sub:'pago em dinheiro'});
  if(a.pix>0)rows.push({acc:S.pa,date:a.date,ts:a.ts,amount:a.pix,auto:true,desc,sub:'pago em Pix'});
  a.parcs.forEach(p=>rows.push({acc:p.due?'blu':'agenda',date:p.date,ts:a.ts,amount:p.amount,auto:true,desc,
   sub:`parcela ${p.i}/${p.n} · ${p.method} (líquido)${p.due?'':' · a receber'}`}));
 });
 S.exp.forEach(x=>rows.push({acc:x.acc,date:x.date,ts:x.ts,amount:x.amount,auto:true,desc:x.desc,sub:x.sub}));
 ledger().forEach(e=>{
  let desc=KIND[e.kind]||'Lançamento',sub=e.note||'';
  if(e.kind==='transf'){
   const o=ledger().find(x=>x.pair===e.pair&&x.id!==e.id);
   desc=Number(e.amount)<0?`Transferência para ${accName(o?o.account:'')}`:`Transferência de ${accName(o?o.account:'')}`;
  }
  rows.push({acc:e.account,date:e.date,ts:e.createdAt||'',amount:Number(e.amount||0),auto:false,id:e.id,desc,sub});
 });
 return rows.sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.ts).localeCompare(String(a.ts)));
}
function renderList(S){
 const f=$('cxFiltro').value;
 const rows=rowsAll(S).filter(r=>!f||r.acc===f);
 const ent=r2(rows.filter(r=>r.amount>0).reduce((n,r)=>n+r.amount,0)),sai=r2(rows.filter(r=>r.amount<0).reduce((n,r)=>n+r.amount,0));
 $('cxExtratoResumo').textContent=`${rows.length} lançamento(s) · entrou ${money(ent)} · saiu ${money(Math.abs(sai))}`;
 shown=rows.slice(0,300);
 $('cxLinhas').innerHTML=shown.map(r=>`<tr><td>${dayText(r.date)}</td><td>${esc(accName(r.acc))}</td><td><span class="product-name">${esc(r.desc)}</span>${r.sub?`<small class="fin-sub">${esc(r.sub)}</small>`:''}</td><td>${r.auto?'<span class="pill cxauto">Automático</span>':'<span class="pill cxman">Manual</span>'}</td><td><b class="${r.amount<0?'cx-neg':'cx-pos'}">${signed(r.amount)}</b></td><td class="fin-actions">${r.auto?'':`<button type="button" class="row-action delete" data-cx-del="${esc(r.id)}">Excluir</button>`}</td></tr>`).join('');
 $('cxVazio').style.display=rows.length?'none':'block';
}
// ---------- Agenda BLU: parcelas do cartão loja ----------
const INP='style="padding:7px 9px;border:1px solid #d9dfe9;border-radius:8px;font:inherit;font-size:13px;max-width:100%"';
function buildAgenda(){
 if($('cxAgenda')||!$('cxExtrato'))return;
 const sec=document.createElement('section');
 sec.className='surface list-surface';sec.id='cxAgenda';sec.style.marginBottom='17px';
 sec.innerHTML=`<div class="surface-heading responsive-heading"><div><h2>Agenda BLU · parcelas do cartão loja</h2><p id="cxAgResumo"></p></div><div class="search-tools"><select id="cxAgFiltro" aria-label="Filtrar parcelas"><option value="pend">A receber</option><option value="rec">Já entraram no Caixa BLU</option><option value="">Todas</option></select></div></div>
 <div style="display:flex;gap:14px;flex-wrap:wrap;padding:0 16px 8px">
  <label class="field" style="min-width:170px">Dias entre parcelas (crédito / link Blu)<input type="number" id="cxDiasCred" min="0" max="365" step="1" ${INP}></label>
  <label class="field" style="min-width:170px">Dias para entrar (débito)<input type="number" id="cxDiasDeb" min="0" max="365" step="1" ${INP}></label>
 </div>
 <p class="fin-meta-text" style="padding:0 16px">Cada parcela mostra de qual venda veio. Padrão: a parcela 1 entra X dias após a venda, a 2 entra 2×X dias, e assim por diante. Você pode digitar a <b>data</b> e o <b>valor</b> de qualquer parcela; ao chegar a data, ela sai da Caixa AGENDA BLU e entra no Caixa BLU.</p>
 <div class="table-wrap"><table><thead><tr><th>ENTRA EM</th><th>DE QUAL VENDA</th><th>PARCELA</th><th>VALOR (R$)</th><th>SITUAÇÃO</th><th>AÇÕES</th></tr></thead><tbody id="cxAgLinhas"></tbody></table></div>
 <div id="cxAgVazio" class="empty-state" style="display:none"><div class="empty-symbol">$</div><b>Nenhuma parcela aqui</b><p>As vendas no cartão loja (crédito, link Blu ou débito) aparecem aqui, parcela por parcela.</p></div>`;
 $('cxExtrato').parentNode.insertBefore(sec,$('cxExtrato'));
 $('cxAgFiltro').addEventListener('change',()=>renderAgenda(balances()));
 sec.addEventListener('change',onAgendaChange);
 sec.addEventListener('click',onAgendaClick);
}
function renderAgenda(S){
 if(!$('cxAgenda'))return;
 const f=$('cxAgFiltro').value,pend=S.parcs.filter(p=>!p.due),rec=S.parcs.filter(p=>p.due);
 $('cxAgResumo').textContent=`A receber: ${money(S.lojaPend)} em ${pend.length} parcela(s) · já entraram no Caixa BLU: ${money(S.lojaRec)} em ${rec.length} parcela(s)`;
 const a=$('cxDiasCred'),d=$('cxDiasDeb');
 if(document.activeElement!==a)a.value=dias(false);
 if(document.activeElement!==d)d.value=dias(true);
 const list=(f==='pend'?pend:f==='rec'?rec:S.parcs.slice()).sort((x,y)=>f==='rec'?String(y.date).localeCompare(String(x.date)):String(x.date).localeCompare(String(y.date))).slice(0,300);
 $('cxAgLinhas').innerHTML=list.map(p=>`<tr>
  <td><input type="date" value="${esc(p.date)}" data-pdate="${esc(p.pkey)}" ${INP}></td>
  <td><span class="product-name">Venda #${esc(String(p.saleKey).slice(-6))}${p.client?' · '+esc(p.client):''}</span><small class="fin-sub">vendida em ${dayText(p.saleDay)} · ${esc(p.method)}</small></td>
  <td>${p.i}/${p.n}</td>
  <td><input type="text" inputmode="decimal" value="${fmtIn(p.amount)}" data-pamt="${esc(p.pkey)}" style="width:110px;padding:7px 9px;border:1px solid #d9dfe9;border-radius:8px;font:inherit;font-size:13px"></td>
  <td>${p.due?'<span class="pill" style="background:#e8f7f0;color:#1b9869">Entrou no Caixa BLU</span>':'<span class="pill cxauto">A receber</span>'}${p.edited?'<small class="fin-sub">editada por você</small>':''}</td>
  <td class="fin-actions">${p.edited?`<button type="button" class="row-action" data-prest="${esc(p.pkey)}">Restaurar padrão</button>`:''}</td></tr>`).join('');
 $('cxAgVazio').style.display=list.length?'none':'block';
}
function setOv(key,o){
 const m=conf().parcelas||(conf().parcelas={});
 if(o.date==null&&o.amount==null)delete m[key];else m[key]=o;
}
function onAgendaChange(ev){
 const el=ev.target;
 if(el.id==='cxDiasCred'||el.id==='cxDiasDeb'){
  if(denied()){render();return;}
  const v=Math.floor(Number(el.value));
  if(!(el.value!==''&&v>=0&&v<=365)){toast('Informe de 0 a 365 dias.',true);render();return;}
  conf()[el.id==='cxDiasCred'?'creditDays':'debitDays']=v;
  if(saveData())toast('Prazos atualizados. As parcelas que você não editou foram recalculadas.');
  return;
 }
 const kd=el.dataset.pdate,ka=el.dataset.pamt,key=kd||ka;if(!key)return;
 if(denied()){render();return;}
 const p=balances().parcs.find(x=>x.pkey===key);if(!p){render();return;}
 const o=Object.assign({},(conf().parcelas||{})[key]);
 if(kd){
  if(!el.value||el.value===p.defDate)delete o.date;else o.date=el.value;
 }else{
  const v=r2(parseMoneyInput(el.value));
  if(!(v>0)){toast('Informe um valor maior que zero.',true);render();return;}
  if(Math.abs(v-p.defAmt)<0.005)delete o.amount;else o.amount=v;
 }
 setOv(key,o);
 if(saveData())toast('Parcela atualizada.');
}
function onAgendaClick(ev){
 const b=ev.target.closest('[data-prest]');if(!b||denied())return;
 setOv(b.dataset.prest,{});
 if(saveData())toast('Parcela voltou ao padrão.');
}

function render(){
 ensureStart();
 const panel=$('panel-financeiro');if(!panel||!panel.classList.contains('active'))return;
 const S=balances();renderCard(S);renderAgenda(S);renderList(S);
 if(!$('cxFormCard').style.display)syncForm();
}

// ---------- formulário ----------
function fillSelects(){
 const o=ACCS.map(a=>`<option value="${a.k}">${esc(a.name)}</option>`).join('');
 $('cxDe').innerHTML=o;$('cxPara').innerHTML=o;$('cxPara').value='nubank';
 $('cxFiltro').innerHTML='<option value="">Todas as contas</option>'+o;
}
function syncForm(){
 const op=$('cxOp').value,S=balances().b;
 $('cxDeBox').hidden=!(op==='transf'||op==='saida');
 $('cxParaBox').hidden=!(op==='transf'||op==='entrada'||op==='ajuste');
 $('cxDeLbl').textContent=op==='saida'?'Saiu de qual conta?':'De';
 $('cxParaLbl').textContent=op==='transf'?'Para':op==='entrada'?'Entrou em qual conta?':'Conta';
 $('cxValorLbl').textContent=op==='ajuste'?'Saldo correto da conta (R$)':'Valor (R$)';
 $('cxHint').textContent=op==='ajuste'?`Saldo atual no sistema: ${signed(S[$('cxPara').value]||0)}. Digite quanto realmente tem na conta; o sistema lança só a diferença.`
  :op==='transf'?`Saldo disponível em ${accName($('cxDe').value)}: ${signed(S[$('cxDe').value]||0)}.`:'';
}
function openForm(op,from,to){
 if(denied())return;
 $('cxForm').reset();fillSelects();
 $('cxOp').value=op||'transf';
 if(from)$('cxDe').value=from;if(to)$('cxPara').value=to;
 $('cxData').value=todayISO();
 if(op==='ajuste'){const v=balances().b[to];$('cxValor').value=v>0?fmtIn(v):'';}
 $('cxFormTitulo').textContent=op==='ajuste'?'Editar saldo da conta':'Movimentar caixa';
 syncForm();
 const c=$('cxFormCard');c.style.display='';c.scrollIntoView({behavior:'smooth',block:'start'});
 setTimeout(()=>$('cxValor').focus({preventScroll:true}),250);
}
function closeForm(){$('cxFormCard').style.display='none';}
function push(account,amount,kind,date,note,pair){
 ledger().push({id:id(),date,account,amount:r2(amount),kind,pair:pair||'',note,by:(typeof currentUserName==='function'?currentUserName():''),createdAt:new Date().toISOString()});
}
function save(ev){
 ev.preventDefault();if(denied())return;
 const op=$('cxOp').value,de=$('cxDe').value,para=$('cxPara').value,raw=$('cxValor').value.trim(),v=r2(parseMoneyInput(raw)),
  date=$('cxData').value||todayISO(),note=$('cxDesc').value.trim(),bal=balances().b;
 if(op==='ajuste'){
  if(!raw){toast('Informe o saldo correto da conta.',true);$('cxValor').focus();return;}
  const diff=r2(v-bal[para]);
  if(Math.abs(diff)<0.005){toast('O saldo já está com esse valor.');return;}
  push(para,diff,'ajuste',date,note||`Ajuste de saldo: de ${signed(bal[para])} para ${signed(v)}`);
 }else{
  if(!(v>0)){toast('Informe um valor maior que zero.',true);$('cxValor').focus();return;}
  if(op==='transf'){
   if(de===para){toast('Escolha contas diferentes para transferir.',true);return;}
   if(v>bal[de]+0.009&&!confirm(`${accName(de)} tem só ${signed(bal[de])}. Transferir ${money(v)} mesmo assim? A conta ficará negativa.`))return;
   const pair=id();push(de,-v,'transf',date,note,pair);push(para,v,'transf',date,note,pair);
  }else if(op==='entrada')push(para,v,'entrada',date,note);
  else{
   if(v>bal[de]+0.009&&!confirm(`${accName(de)} tem só ${signed(bal[de])}. Lançar saída de ${money(v)} mesmo assim?`))return;
   push(de,-v,'saida',date,note);
  }
 }
 if(saveData()){closeForm();toast('Caixa atualizado.');}
}
function onCardClick(ev){
 const b=ev.target.closest('[data-cx]');if(!b)return;
 const k=b.dataset.acc;
 if(b.dataset.cx==='transf')openForm('transf',k,k==='blu'?'nubank':k==='nubank'?'blu':'nubank');
 else openForm('ajuste',null,k);
}
function onListClick(ev){
 const b=ev.target.closest('[data-cx-del]');if(!b||denied())return;
 const e=ledger().find(x=>x.id===b.dataset.cxDel);if(!e)return;
 const par=e.pair?ledger().filter(x=>x.pair===e.pair):[e];
 if(!confirm(e.pair?'Excluir esta transferência? Os dois lados (saída e entrada) serão desfeitos.':`Excluir este lançamento de ${signed(e.amount)} em ${accName(e.account)}?`))return;
 const ids=new Set(par.map(x=>x.id));
 data.cashLedger=ledger().filter(x=>!ids.has(x.id));
 if(saveData())toast('Lançamento excluído.');
}

// ---------- ligações ----------
function init(){
 if(!$('cxCard'))return;
 buildAgenda();fillSelects();bindMoneyMask($('cxValor'));$('cxData').value=todayISO();
 $('cxNovo').addEventListener('click',()=>openForm('transf','blu','nubank'));
 $('cxCancelar').addEventListener('click',closeForm);
 $('cxForm').addEventListener('submit',save);
 ['cxOp','cxDe','cxPara'].forEach(k=>$(k).addEventListener('change',syncForm));
 $('cxFiltro').addEventListener('change',()=>renderList(balances()));
 $('cxCard').addEventListener('click',onCardClick);
 $('cxExtrato').addEventListener('click',onListClick);
 $('cxCard').addEventListener('change',ev=>{
  if(ev.target.id==='cxPixAcc'){
   if(denied()){render();return;}
   if(!confirm(`Passar a contar os Pix das vendas em ${accName(ev.target.value)}? O saldo das contas será recalculado, inclusive os Pix já recebidos.`)){render();return;}
   conf().pixAccount=ev.target.value;saveData();return;
  }
  if(ev.target.id!=='cxStart')return;
  if(denied()){render();return;}
  const v=ev.target.value||monthStart();
  if(!confirm(`Contar as vendas no Caixa BLU a partir de ${dayText(v)}? Vendas anteriores a essa data saem do saldo automático.`)){render();return;}
  conf().start=v;saveData();
 });
}
init();

const baseRender=window.renderAll;
window.renderAll=function(){baseRender();render();};
const baseGoTo=window.goTo;
window.goTo=function(name){baseGoTo.apply(this,arguments);if(name==='financeiro')render();};
render();
})();
