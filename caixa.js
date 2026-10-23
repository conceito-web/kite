'use strict';
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
 {k:'blu',name:'Caixa BLU',sub:'Recebe sozinho das vendas no cartão'},
 {k:'nubank',name:'Caixa NUBANK',sub:'Recebe por transferência do Caixa BLU'},
 {k:'dinheiro',name:'Dinheiro CAIXA',sub:'Dinheiro físico da loja'}
];
const accName=k=>(ACCS.find(a=>a.k===k)||{}).name||k;
const ledger=()=>data.cashLedger||(data.cashLedger=[]);
const conf=()=>data.cashConfig||(data.cashConfig={});
const signed=v=>(v<0?'−':'')+money(Math.abs(v));
const isCard=m=>m===PM.CREDIT||m===PM.BLU||m===PM.DEBIT;
const CASH='Dinheiro',PIX='Pix';
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
 const start=conf().start||'',first=new Map();
 data.movements.forEach(m=>{
  if(m.type!=='venda'||m.canceled)return;
  const k=m.saleId||m.id;if(!first.has(k))first.set(k,m);   // os pagamentos ficam repetidos em cada item da venda: conta uma vez só
 });
 const out=[];
 first.forEach((m,k)=>{
  const day=localDateKey(m.date);if(!day||(start&&day<start))return;
  let fab=0,loja=0,cash=0,pix=0;
  (m.payments||[]).forEach(p=>{
   if(p&&p.method===CASH){cash+=Number(p.amount||0);return;}
   if(p&&p.method===PIX){pix+=Number(p.amount||0);return;}
   if(!p||!isCard(p.method))return;
   const amt=Number(p.amount||0);
   if((p.method===PM.CREDIT||p.method===PM.BLU)&&p.responsible==='fabrica')fab+=amt-Number(p.factoryCredit||0);
   else loja+=amt-Number(p.fee||0);
  });
  fab=r2(fab);loja=r2(loja);cash=r2(cash);pix=r2(pix);
  if(fab+loja+cash+pix<=0.004)return;
  out.push({key:k,date:day,ts:String(m.date||''),client:m.client||'',fab,loja,cash,pix,blu:r2(fab+loja)});
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
 const b={blu:0,nubank:0,dinheiro:0},auto=autoEntries(),exp=expenseEntries(),pa=pixAcc();let fab=0,loja=0,cash=0,pix=0;
 auto.forEach(a=>{b.blu+=a.blu;b.dinheiro+=a.cash;b[pa]+=a.pix;fab+=a.fab;loja+=a.loja;cash+=a.cash;pix+=a.pix;});
 exp.forEach(x=>{b[x.acc]+=x.amount;});
 ledger().forEach(e=>{if(e.account in b)b[e.account]+=Number(e.amount||0);});
 Object.keys(b).forEach(k=>b[k]=r2(b[k]));
 return {b,auto,exp,fab:r2(fab),loja:r2(loja),cash:r2(cash),pix:r2(pix),pa,total:r2(b.blu+b.nubank+b.dinheiro)};
}

// ---------- tela ----------
function renderCard(S){
 $('cxTotal').textContent=signed(S.total);
 $('cxContas').innerHTML=ACCS.map(a=>{
  const sub=a.k==='blu'?`${a.sub} · fábrica ${money(S.fab)} + loja ${money(S.loja)}`:a.k==='dinheiro'?`${a.sub} · vendas em dinheiro ${money(S.cash)}`:a.sub;
  const sub2=a.k===S.pa?`${sub} · Pix ${money(S.pix)}`:sub;
  return `<div class="cx-acc"><div class="cx-acc-top"><div><b>${esc(a.name)}</b><small>${esc(sub2)}</small></div><strong class="${S.b[a.k]<0?'cx-neg':''}">${signed(S.b[a.k])}</strong></div><div class="cx-acc-btns"><button type="button" class="row-action" data-cx="transf" data-acc="${a.k}">Transferir</button><button type="button" class="row-action" data-cx="ajuste" data-acc="${a.k}">Editar saldo</button></div></div>`;
 }).join('');
 const fabPct=100-getSettings().factoryCreditPct;
 $('cxNota').innerHTML=`<b>Caixa BLU:</b> cartão fábrica entra com ${fabPct.toLocaleString('pt-BR',{maximumFractionDigits:2})}% do valor (o resto vira crédito com a fábrica); cartão loja e débito entram já sem a taxa. <b>Dinheiro CAIXA:</b> recebe as vendas pagas em dinheiro. Despesas pagas saem da conta escolhida em "Saiu de qual conta?". <b>Pix:</b> entra com o valor cheio (sem taxa) na conta escolhida abaixo. <label class="field" style="margin-top:10px">Pix entra em qual conta?<select id="cxPixAcc">${ACCS.map(a=>`<option value="${a.k}"${a.k===S.pa?' selected':''}>${esc(a.name)}</option>`).join('')}</select></label> <label class="field" style="margin-top:10px">Contar vendas a partir de<input type="date" id="cxStart" value="${esc(conf().start||'')}"></label>`;
}
function rowsAll(S){
 const rows=[];
 S.auto.forEach(a=>{
  const desc=`Venda #${String(a.key).slice(-6)}${a.client?' · '+a.client:''}`;
  if(a.blu>0)rows.push({acc:'blu',date:a.date,ts:a.ts,amount:a.blu,auto:true,desc,
   sub:[a.fab>0?`cartão fábrica ${money(a.fab)}`:'',a.loja>0?`cartão loja/débito líquido ${money(a.loja)}`:''].filter(Boolean).join(' + ')});
  if(a.cash>0)rows.push({acc:'dinheiro',date:a.date,ts:a.ts,amount:a.cash,auto:true,desc,sub:'pago em dinheiro'});
  if(a.pix>0)rows.push({acc:S.pa,date:a.date,ts:a.ts,amount:a.pix,auto:true,desc,sub:'pago em Pix'});
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
function render(){
 ensureStart();
 const panel=$('panel-financeiro');if(!panel||!panel.classList.contains('active'))return;
 const S=balances();renderCard(S);renderList(S);
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
 fillSelects();bindMoneyMask($('cxValor'));$('cxData').value=todayISO();
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
