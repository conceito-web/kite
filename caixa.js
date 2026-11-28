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
// 1º dia útil (seg–sex) DEPOIS da data informada (feriados não são considerados).
const nextBiz=day=>{let d=addDays(day,1);for(let i=0;i<10;i++){const p=d.split('-').map(Number),w=new Date(p[0],p[1]-1,p[2]).getDay();if(w!==0&&w!==6)return d;d=addDays(d,1);}return d;};
const maxD=(a,b)=>a>b?a:b;
const dias=deb=>{const v=Number(conf()[deb?'debitDays':'creditDays']);return Number.isFinite(v)&&v>=0?Math.floor(v):(deb?1:30);};
const pixAcc=()=>{const k=conf().pixAccount;return ACCS.some(a=>a.k===k)?k:'nubank';};
const monthStart=()=>{const n=new Date();return localDateKey(new Date(n.getFullYear(),n.getMonth(),1));};
const fmtIn=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const KIND={transf:'Transferência',entrada:'Entrada',saida:'Saída',ajuste:'Ajuste de saldo'};
let shown=[];
// CONSUMO DOS RECEBÍVEIS (conciliação da Agenda BLU): fonte única = pagamentos à fábrica com agendaConciliacao:'conciliado' e a lista agendaRecebiveis [{pkey,amount,...}].
// Nada é gravado nas vendas: a parcela original (data e valor) continua igual; o consumo é subtraído em tempo de cálculo, em centavos.
// Reabrir/excluir o pagamento remove o vínculo e o consumo some sozinho. CONS é recalculado a cada autoEntries().
let CONS={};
function consumoMap(){
 const m={};
 (data.factoryOrders||[]).forEach(o=>(o.installments||[]).forEach(p=>{
  const pg=p&&p.paid&&p.payment;
  if(!pg||pg.credit||pg.account!=='caixa:agenda'||pg.agendaConciliacao!=='conciliado'||!Array.isArray(pg.agendaRecebiveis))return;
  pg.agendaRecebiveis.forEach(x=>{if(x&&x.pkey)m[x.pkey]=(m[x.pkey]||0)+Math.round(Number(x.amount||0)*100);});
 }));
 return m;
}

function denied(){if(hasFullAccess())return false;toast('Seu perfil não tem permissão para alterar o caixa.',true);return true;}
// Data de corte: vendas anteriores a ela não entram no Caixa BLU (evita puxar todo o histórico antigo).
function ensureStart(){
 if(conf().start)return;
 conf().start=monthStart();
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));}catch(_){}
}

// ---------- entradas automáticas (vendas no cartão, dinheiro, Pix e encomendas) ----------
// Cartão fábrica: crédito e parcela financeira reconhecidos na data do pagamento; cartão loja mantém a agenda de vencimentos.
// Encomenda aberta: mesmas regras de recebimento das vendas, sem baixa de estoque.
function entryFor(k,day,ts,client,payments,opt){
 const hoje=todayISO(),ov=conf().parcelas||{},dFab=day,dNon=day;
 let fab=0,cash=0,pix=0,fcr=0;const parcs=[];
 payments.forEach((p,pi)=>{
  if(!p)return;
  if((opt.locked||opt.enc)&&p.fee==null&&typeof enrichPayment==='function')p=enrichPayment(p);
  const amt=Number(p.amount||0),card=isCard(p.method),eff=card?nextBiz(day):dNon;
  // A venda no cartão loja gera recebíveis na Agenda imediatamente;
  // a liquidação continua acontecendo apenas no vencimento de cada parcela.
  // Pagamentos pela fábrica são reconhecidos na data do pagamento.
  if(p.method===CASH){cash+=amt;return;}
  if(p.method===PIX){pix+=amt;return;}
  if(!card)return;
  if((p.method===PM.CREDIT||p.method===PM.BLU||p.method===PM.DEBIT)&&p.responsible==='fabrica'){
   if(day>hoje)return;   // não reconhece pagamentos futuros
   fab+=amt-Number(p.factoryCredit||0);fcr+=Number(p.factoryCredit||0);return;
  }
  if(day>hoje)return;   // não antecipa recebíveis de vendas registradas para data futura
  // cartão loja / débito: valor líquido (sem taxa) dividido em parcelas, cada uma com sua data de entrada
  const deb=p.method===PM.DEBIT,n=deb?1:Math.max(1,Math.min(60,Math.floor(Number(p.installments)||1))),net=r2(amt-Number(p.fee||0));
  if(!(net>0))return;
  const cents=Math.round(net*100),q=Math.floor(cents/n);
  for(let i=1;i<=n;i++){
   const pkey=k+':'+pi+':'+i,o=ov[pkey]||null,defDate=maxD(addDays(day,deb?dias(true):dias(false)*i),eff),defAmt=r2((i<n?q:cents-q*(n-1))/100);
   const date=(o&&o.date)||defDate,amount=(o&&o.amount!=null)?r2(o.amount):defAmt;
   if(!(amount>0))continue;
   const gc=Math.round(amount*100),uc=Math.min(gc,CONS[pkey]||0);   // amount = valor original da parcela (gross); consumo da conciliação sai só do que ainda seria recebido
   parcs.push({pkey,saleKey:k,client,saleDay:day,method:p.method,i,n,date,amount:r2((gc-uc)/100),gross:amount,used:r2(uc/100),defDate,defAmt,edited:!!o,locked:!!opt.locked});
  }
 });
 fab=r2(fab);cash=r2(cash);pix=r2(pix);fcr=r2(fcr);
 if(fab+cash+pix<=0.004&&!parcs.length)return null;
 return {key:k,date:day,dFab,dNon,ts,client,fab,cash,pix,fcr,blu:fab,parcs,locked:!!opt.locked};
}
function autoEntries(){
 CONS=consumoMap();
 const start=conf().start||'',first=new Map(),out=[];
 data.movements.forEach(m=>{
  if(m.type!=='venda'||m.canceled)return;
  const k=m.saleId||m.id;if(!first.has(k))first.set(k,m);   // os pagamentos ficam repetidos em cada item da venda: conta uma vez só
 });
 first.forEach((m,k)=>{
  const day=localDateKey(m.date);if(!day)return;
  // Sinal de encomenda entregue: o pagamento mantém a data em que o cliente pagou (paidDate), não a data da entrega.
  const pays=m.payments||[],dayOf=p=>{const d=p&&p.paidDate;return(/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&d<day)?d:day;};
  const days=[...new Set(pays.map(dayOf))];if(!days.length)days.push(day);
  days.forEach(d=>{
   if(start&&d<start)return;
   const e=entryFor(d===day?k:k+'@'+d,d,String(m.date||''),m.client||'',pays.map(p=>dayOf(p)===d?p:null),{});   // null mantém o índice do pagamento (chave das parcelas)
   if(e)out.push(e);
  });
 });
 // Encomendas em aberto: recebimentos disponíveis conforme modalidade, sem baixa de estoque.
 (data.preorders||[]).forEach(o=>{
  if(!o||o.status!=='aberta')return;
  (o.payments||[]).forEach((p,pi)=>{
   if(!p||!(Number(p.amount)>0))return;
   const day=localDateKey(p.date)||localDateKey(o.date);if(!day||(start&&day<start))return;
   const e=entryFor('enc-'+o.id+'-'+pi,day,String(p.date||o.createdAt||''),o.client||'',[p],{enc:true});
   if(e){e.enc=true;e.label='Encomenda '+String(o.number||0).padStart(4,'0');e.parcs.forEach(x=>{x.label=e.label;});out.push(e);}
  });
 });
 // receitas de serviços (janela "Serviço" do PDV / Registrar venda): mesmas regras das vendas (dinheiro/Pix na hora, cartão líquido de taxa)
 (typeof window.ckrServicos==='function'?window.ckrServicos():[]).forEach(sv=>{
  if(!sv||!sv.payment)return;
  const day=localDateKey(sv.date);if(!day||(start&&day<start))return;
  const e=entryFor('srv-'+sv.id,day,String(sv.createdAt||sv.date||''),sv.client||'',[sv.payment],{});
  if(e){e.service=true;e.label='Serviço: '+(sv.description||'');e.parcs.forEach(x=>{x.label=e.label;});out.push(e);}
 });
 return out;
}
// Despesas pagas que saem de uma conta do caixa (conta de origem 'caixa:blu' etc.)
function expenseEntries(){
 const start=conf().start||'',out=[];
 (data.expenses||[]).forEach(x=>{
  if(!x||x.status!=='pago')return;
  // uma despesa pode ter várias formas de pagamento (x.payments); despesas antigas usam x.account
  const pays=Array.isArray(x.payments)&&x.payments.length?x.payments:[{account:x.account,amount:x.amount}];
  pays.forEach((p,i)=>{
   if(String(p.account||'').indexOf('caixa:')!==0)return;
   const acc=p.account.slice(6);if(!ACCS.some(a=>a.k===acc))return;
   const day=x.paidDate||x.date||'',amt=r2(p.amount);
   if(!day||(start&&day<start)||!(amt>0))return;
   out.push({key:x.id+':'+i,date:day,ts:String(x.updatedAt||x.createdAt||''),acc,amount:-amt,desc:'Despesa: '+(x.description||'sem descrição'),sub:(x.category||'')+(pays.length>1?(x.category?' · ':'')+'pagamento dividido':'')});
  });
 });
 // Parcelas de pedidos à fábrica pagas (Pedidos à fábrica ▸ Marcar paga) com uma conta do caixa. Pagamento com crédito da fábrica não sai do caixa.
 (data.factoryOrders||[]).forEach(o=>(o.installments||[]).forEach(p=>{
  const pg=p&&p.paid&&p.payment;
  if(!pg||pg.credit||String(pg.account||'').indexOf('caixa:')!==0)return;
  const acc=pg.account.slice(6);if(!ACCS.some(a=>a.k===acc))return;
  const day=pg.date||'',amt=r2(p.amount);
  if(!day||(start&&day<start)||!(amt>0))return;
  const agConc=acc==='agenda'&&pg.agendaConciliacao==='conciliado'&&Array.isArray(pg.agendaRecebiveis)&&pg.agendaRecebiveis.length>0;   // conciliado: o consumo já está nos recebíveis, então esta linha não desconta de novo (amount 0)
  out.push({key:'ped:'+o.id+':'+p.n,date:day,ts:String(pg.at||''),acc,amount:agConc?0:-amt,agConc,agVal:amt,pedId:o.id,fab:true,agPend:acc==='agenda'&&pg.agendaConciliacao==='pendente',pedNum:o.num||'',pedN:p.n,pedOf:p.of,desc:'Pedido à fábrica nº '+(o.num||'')+' · parcela '+p.n+'/'+p.of,sub:pg.method||''});
 }));
 return out;
}
function balances(){
 const b={blu:0,nubank:0,dinheiro:0,agenda:0},auto=autoEntries(),exp=expenseEntries(),pa=pixAcc(),hoje=todayISO(),parcs=[];
 let fab=0,cash=0,pix=0,lojaRec=0,lojaPend=0;
 const lock={blu:0,nubank:0,dinheiro:0,agenda:0},lockRows=[],lockFabRows=[];
 let lockFab=0;   // valores de encomenda (ainda não entregue): contam no saldo, mas não podem ser usados
 auto.forEach(a=>{
  b.blu+=a.fab;b.dinheiro+=a.cash;b[pa]+=a.pix;
  const l={label:a.label||'',client:a.client,amts:{blu:0,nubank:0,dinheiro:0,agenda:0}};
  if(a.locked){l.amts.blu+=a.fab;l.amts.dinheiro+=a.cash;l.amts[pa]+=a.pix;}else{fab+=a.fab;cash+=a.cash;pix+=a.pix;}
  a.parcs.forEach(p=>{
   p.due=p.date<=hoje;   // venceu: já está no Caixa BLU; senão fica na Caixa AGENDA BLU
   if(p.due){b.blu+=p.amount;if(a.locked)l.amts.blu+=p.amount;else lojaRec+=p.amount;}else{b.agenda+=p.amount;if(a.locked)l.amts.agenda+=p.amount;else lojaPend+=p.amount;}
   parcs.push(p);
  });
  if(a.locked&&a.fcr>0.004){lockFab+=a.fcr;lockFabRows.push({label:a.label||'',client:a.client,amt:a.fcr});}
  if(a.locked){Object.keys(l.amts).forEach(k=>{l.amts[k]=r2(l.amts[k]);lock[k]+=l.amts[k];});lockRows.push(l);}
 });
 Object.keys(lock).forEach(k=>lock[k]=r2(lock[k]));
 exp.forEach(x=>{b[x.acc]+=x.amount;});
 ledger().forEach(e=>{if(e.account in b)b[e.account]+=Number(e.amount||0);});
 Object.keys(b).forEach(k=>b[k]=r2(b[k]));
// Agenda BLU: valores comprometidos = pagamentos à fábrica feitos com a Agenda e ainda pendentes de conciliação.
// A saída deles JÁ está em b.agenda (expenseEntries), então b.agenda é o saldo disponível: o comprometido só é somado de volta para mostrar o bruto.
const agComp=r2(exp.filter(x=>x.agPend).reduce((n,x)=>n-x.amount,0)),agQtd=exp.filter(x=>x.agPend).length;
 return {b,lock,lockRows,lockFab:r2(lockFab),lockFabRows,auto,exp,parcs,fab:r2(fab),cash:r2(cash),pix:r2(pix),pa,lojaRec:r2(lojaRec),lojaPend:r2(lojaPend),total:r2(b.blu+b.nubank+b.dinheiro+b.agenda),agComp,agQtd,agBruto:r2(b.agenda+agComp),agDisp:r2(b.agenda-(lock.agenda||0))};
}

// Total de Recebimentos no período (usado por Despesas e Lucro): só o que efetivamente entrou, pelas mesmas regras do Caixa
// (dinheiro/Pix na hora; cartão fábrica = parte que não vira crédito; cartão loja = parcelas líquidas já vencidas). Crédito com a fábrica não entra.
window.ckrRecebimentos=function(s,e){
 const hoje=todayISO(),inR=k=>!!k&&(!s||k>=s)&&(!e||k<=e);let t=0;
 autoEntries().forEach(a=>{
  if(inR(a.dFab))t+=a.fab;
  if(inR(a.dNon))t+=a.cash+a.pix;
  a.parcs.forEach(p=>{if(p.date<=hoje&&inR(p.date))t+=p.amount;});
 });
 return r2(t);
};
// Crédito com a fábrica das encomendas abertas (já pagas pelo cliente, produto ainda não entregue): já é saldo utilizável.
function encCreditos(){return autoEntries().filter(a=>a.enc&&Number(a.fcr)>0.004).map(a=>({key:a.key,date:a.date,client:a.client,label:a.label,credit:r2(a.fcr)}));}
window.ckrEncomendaCreditos=encCreditos;
window.ckrEncomendaCredito=()=>r2(encCreditos().reduce((n,x)=>n+x.credit,0));
// Linhas do extrato do Caixa (mesma fonte da tela Extrato) para o Fluxo de Caixa (fluxo.js). Somente leitura.
// flow: 'auto' (vendas/encomendas/serviços/parcelas) | 'desp' (despesas e pedidos à fábrica pagos) | tipo do lançamento manual ('transf','entrada','saida','ajuste').
// pairAcc: conta do outro lado de uma transferência. 'saldos' = saldo atual de cada conta no Conceito Caixa. 'inicio' = data de corte.
window.ckrCaixaLinhas=function(){ensureStart();const S=balances();return {rows:rowsAll(S),saldos:Object.assign({},S.b),inicio:conf().start||'',pend:{qtd:S.agQtd,valor:S.agComp}};};   // pend: pagamentos à fábrica com a Agenda BLU aguardando conciliação
// Agenda BLU: bruto (sem os comprometidos), comprometido (pagamentos pendentes de conciliação) e disponível (já sem comprometidos e sem o bloqueado de encomendas). Somente leitura.
window.ckrAgendaResumo=function(){ensureStart();const S=balances();return {pendentes:S.agQtd,bruto:S.agBruto,comprometido:S.agComp,disponivel:S.agDisp};};
// Consulta para a Visão Geral. Apenas apresenta os valores calculados pelo próprio Caixa.
// Não altera a data de corte, não grava e não cria lançamentos.
window.ckrCaixaPainelResumo=function(){
 const S=balances(),keys=['blu','nubank','dinheiro'],hoje=todayISO();
 // A tela Caixa pode exibir lançamento manual datado no futuro. O painel só considera
 // disponível o que consta no extrato ATÉ HOJE (mesma base cronológica do DFC).
 const realizados={blu:0,nubank:0,dinheiro:0};
 rowsAll(S).forEach(r=>{
  if(!keys.includes(r.acc)||!r.date)return;
  const dia=/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))?String(r.date):localDateKey(r.date);
  if(dia&&dia<=hoje)realizados[r.acc]=r2(realizados[r.acc]+Number(r.amount||0));
 });
 const disponivel=r2(keys.reduce((n,k)=>n+realizados[k]-Number(S.lock[k]||0),0));
 const futuro=r2(keys.reduce((n,k)=>n+S.b[k]-realizados[k],0));
 return {disponivel,contas:Object.fromEntries(keys.map(k=>[k,{saldo:realizados[k],bloqueado:S.lock[k]||0}])),
   agenda:S.b.agenda,agendaBloqueada:S.lock.agenda||0,agendaPendente:S.agQtd,
   agendaComprometida:S.agComp,lancamentosFuturos:futuro,inicio:conf().start||''};
};

// Saldo disponivel do credito com a fabrica (leitura; nao entra no saldo total)
function fabSaldo(){
 const sales=r2((data.movements||[]).filter(m=>m.type==='venda'&&!m.canceled).reduce((x,m)=>x+Number(m.factoryCredit||0),0));
 const sv=typeof window.ckrServicoCredito==='function'?window.ckrServicoCredito():0;   // crédito com a fábrica dos serviços
 const man=r2((data.factoryCreditsManual||[]).reduce((x,e)=>x+Number(e.amount||0),0));
 const used=r2((data.factoryLedger||[]).reduce((x,e)=>x+Number(e.amount||0),0));
 const enc=window.ckrEncomendaCredito();   // crédito das encomendas abertas
 return r2(sales+sv+enc+man-used);
}
window.ckrCreditoFabricaSaldo=fabSaldo;
// v130: snapshot de consulta para Controladoria. Reutiliza regras de vencimento e conciliação existentes.
window.ckrBLUAnalise=function(){
 if(!hasFullAccess())return null;
 const S=balances(),hoje=todayISO(),rows=rowsAll(S),dateKey=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d))?String(d):localDateKey(d);
 const cash=r2(rows.filter(x=>x.acc==='blu'&&dateKey(x.date)<=hoje).reduce((v,x)=>v+Number(x.amount||0),0)-Number(S.lock.blu||0));
 const creditRows=[];
 (data.movements||[]).forEach(x=>{if(x.type==='venda'&&!x.canceled&&Number(x.factoryCredit||0))creditRows.push({date:dateKey(x.date),amount:Number(x.factoryCredit),kind:'Venda'});});
 (typeof window.ckrServicos==='function'?window.ckrServicos():[]).forEach(x=>{if(Number(x.payment?.factoryCredit||0))creditRows.push({date:dateKey(x.date),amount:Number(x.payment.factoryCredit),kind:'Serviço'});});
 S.auto.filter(x=>x.enc&&Number(x.fcr)>0.004).forEach(x=>creditRows.push({date:x.date,amount:Number(x.fcr),kind:'Encomenda aberta'}));
 (data.factoryCreditsManual||[]).forEach(x=>creditRows.push({date:dateKey(x.date),amount:Number(x.amount||0),kind:x.kind==='balanceAdjustment'?'Ajuste de saldo':'Crédito manual'}));
 (data.factoryLedger||[]).forEach(x=>creditRows.push({date:dateKey(x.date),amount:-Number(x.amount||0),kind:'Utilização'}));
 const releases=[],missing=[];const start=conf().start||'';
 const inspect=(p,day)=>{if(!p||!day||!isCard(p.method)||(start&&day<start))return;const date=p.responsible==='fabrica'?day:nextBiz(day),amount=Number(p.amount);if(date>hoje||!Number.isFinite(amount)||amount<=0)return;const has=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  if(p.responsible==='fabrica'){if(!has(p.factoryCredit)||Number(p.factoryCredit)<0||Number(p.factoryCredit)>amount){missing.push({date,amount,kind:'crédito fábrica'});return;}releases.push({date,cash:r2(amount-Number(p.factoryCredit)),credit:Number(p.factoryCredit)});}
  else if(!has(p.fee)||Number(p.fee)<0||Number(p.fee)>amount)missing.push({date,amount,kind:'taxa cartão loja'});
 };
 const seen=new Set();(data.movements||[]).forEach(x=>{if(x.type!=='venda'||x.canceled)return;const k=x.saleId||x.id;if(seen.has(k))return;seen.add(k);const day=dateKey(x.date);(x.payments||[]).forEach(p=>inspect(p,p?.paidDate&&p.paidDate<day?p.paidDate:day));});
 (data.preorders||[]).filter(x=>x.status==='aberta').forEach(x=>(x.payments||[]).forEach(p=>inspect(p,dateKey(p?.date)||dateKey(x.date))));
 (typeof window.ckrServicos==='function'?window.ckrServicos():[]).forEach(x=>inspect(x.payment,dateKey(x.date)));
 return {today:hoje,start:conf().start||'',cash,agenda:S.agDisp,agendaGross:S.agBruto,committed:S.agComp,pendingCount:S.agQtd,blocked:S.lock.agenda||0,credit:fabSaldo(),rows:rows.filter(x=>x.acc==='blu'||x.acc==='agenda').map(x=>({...x,date:dateKey(x.date)})),creditRows,parcels:S.parcs.filter(x=>!x.due&&!x.locked&&x.amount>0).map(x=>({date:x.date,amount:x.amount,used:x.used||0,method:x.method,i:x.i,n:x.n})),releases,missing};
};

function ajustarFab(){
 if(denied())return;
 const antes=fabSaldo(),raw=prompt(`Saldo atual do crédito com a fábrica: ${money(antes)}. Informe o saldo real em reais (ex.: 1234,56):`,String(antes.toFixed(2)).replace(".",","));
 if(raw===null)return;const txt=raw.trim();if(!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(txt)){toast("Informe um valor válido em reais.",true);return;}
 const alvo=r2(Number(txt.replace(/\./g,"").replace(",",".")));if(!Number.isFinite(alvo)||alvo<0||!Number.isSafeInteger(Math.round(alvo*100))){toast("Informe um saldo real não negativo e válido.",true);return;}
 const motivo=prompt("Motivo obrigatório do ajuste (ex.: conciliação com extrato Ortobom):", "Conciliação de saldo");if(motivo===null||!motivo.trim())return;
 if(fabSaldo()!==antes){toast("Saldo mudou. Reabra o ajuste.",true);return;}const diff=r2(alvo-antes);if(!diff){toast("Saldo já conciliado.");return;}
 if(!confirm(`Saldo anterior: ${money(antes)}\nSaldo correto: ${money(alvo)}\nAjuste: ${signed(diff)}\nRegistrar somente a diferença, sem alterar caixa, estoque ou DRE?`))return;
 const prev=data.factoryCreditsManual;const item={id:id(),date:new Date().toISOString(),amount:diff,kind:"balanceAdjustment",before:antes,after:alvo,note:"Ajuste de saldo: "+motivo.trim(),by:currentUserName()};data.factoryCreditsManual=[...(prev||[]),item];
 if(saveData()){toast("Crédito com a fábrica ajustado.");}else{data.factoryCreditsManual=prev;}
}
// ---------- tela ----------
function renderCard(S){
 $('cxTotal').textContent=signed(S.total);
 const tl=document.querySelector('#cxCard .cx-total span');if(tl)tl.textContent='Saldo total (com o que está a receber)';
 $('cxContas').innerHTML=ACCS.map(a=>{
  let sub=a.sub;
  if(a.k==='blu')sub+=` · fábrica ${money(S.fab)} + loja ${money(S.lojaRec)}`;
  if(a.k==='dinheiro')sub+=` · vendas em dinheiro ${money(S.cash)}`;
  if(a.k==='agenda'){sub+=` · a receber ${money(S.lojaPend)}`;if(S.agComp>0.004){sub+=` · bruto ${signed(S.agBruto)} · comprometido (aguardando conciliação) ${money(S.agComp)}`;if(!(S.lock.agenda>0.004))sub+=` · disponível ${signed(S.agDisp)}`;}}
  if(a.k===S.pa)sub+=` · Pix ${money(S.pix)}`;
  const lk=S.lock[a.k]||0;
  const wp=(a.k==='agenda'&&S.agQtd>0)?`<p class="fin-meta-text" style="margin:8px 0 0">⚠ <b>${S.agQtd} pagamento(s) à fábrica aguardando conciliação · ${money(S.agComp)}.</b> Os recebíveis consumidos ainda não foram identificados: a distribuição dos recebimentos futuros (Agenda BLU × Caixa BLU) pode estar incorreta e estes saldos não são definitivos. <button type=\"button\" class=\"row-action\" data-cx=\"conciliar\" data-acc=\"agenda\">Conciliar</button></p>`:'';
  if(lk>0.004)sub+=` · bloqueado (encomenda) ${money(lk)} · disponível ${signed(r2(S.b[a.k]-lk))}`;
  return `<div class="cx-acc"><div class="cx-acc-top"><div><b>${esc(a.name)}</b><small>${esc(sub)}</small></div><strong class="${S.b[a.k]<0?'cx-neg':''}">${signed(S.b[a.k])}</strong></div><div class="cx-acc-btns"><button type="button" class="row-action" data-cx="transf" data-acc="${a.k}">Transferir</button><button type="button" class="row-action" data-cx="ajuste" data-acc="${a.k}">Editar saldo</button><button type="button" class="row-action" data-cx="extrato" data-acc="${a.k}">Extrato</button>${lk>0.004?`<button type="button" class="row-action" data-cx="lock" data-acc="${a.k}">⚠ ${money(lk)} de encomenda · saiba mais</button>`:''}</div>${wp}</div>`;
 }).join('')+(()=>{const fs=fabSaldo();return `<div class="cx-acc"><div class="cx-acc-top"><div><b>Crédito com a fábrica</b><small>Saldo disponível · não entra no saldo total</small></div><strong class="${fs<0?'cx-neg':''}">${signed(fs)}</strong></div><div class="cx-acc-btns"><button type="button" class="row-action" data-cx="ajustefab">Editar saldo</button><button type="button" class="row-action" data-cx="extratofab">Extrato</button>${S.lockFab>0.004?`<button type="button" class="row-action" data-cx="lockfab">⚠ ${money(S.lockFab)} de encomenda · saiba mais</button>`:''}</div></div>`;})();
 const fabPct=100-getSettings().factoryCreditPct;
 $('cxNota').innerHTML=`<b>Caixa BLU:</b> cartão fábrica entra na hora com ${fabPct.toLocaleString('pt-BR',{maximumFractionDigits:2})}% do valor (o resto vira crédito com a fábrica); cartão loja entra já sem a taxa, parcela por parcela, na data de entrada (veja a Agenda BLU abaixo). <b>Dinheiro CAIXA:</b> vendas pagas em dinheiro. <b>Encomendas:</b> seguem as mesmas regras de recebimento das vendas; cartão fábrica reconhecido imediatamente, cartão loja conforme vencimento das parcelas. A entrega é que baixa o estoque. <b>Pix:</b> entra com o valor cheio na conta escolhida abaixo. Despesas pagas saem da conta escolhida em "Saiu de qual conta?". <label class="field" style="margin-top:10px">Pix entra em qual conta?<select id="cxPixAcc">${ACCS.map(a=>`<option value="${a.k}"${a.k===S.pa?' selected':''}>${esc(a.name)}</option>`).join('')}</select></label> <label class="field" style="margin-top:10px">Contar vendas a partir de<input type="date" id="cxStart" value="${esc(conf().start||'')}"></label>`;
}
function rowsAll(S){
 const rows=[];
 S.auto.forEach(a=>{
  const src=a.enc?{t:'enc',id:String(a.key).replace(/^enc-/,'').replace(/-\d+$/,'')}:a.service?{t:'srv',id:String(a.key).slice(4)}:{t:'venda',id:String(a.key).split('@')[0]};   // de onde veio (para o botão Editar)
  const desc=(a.locked||a.service||a.enc)?`${a.label}${a.client?' · '+a.client:''}`:`Venda #${String(a.key).split('@')[0].slice(-6)}${a.client?' · '+a.client:''}`,lk=a.locked?' · BLOQUEADO até a entrega':(a.enc?' · encomenda (ainda não entregue)':'');
  if(a.fab>0)rows.push({acc:'blu',date:a.dFab,ts:a.ts,amount:a.fab,auto:true,flow:'auto',src,cat:'Cartão fábrica (entra na hora)',desc,sub:`cartão fábrica ${money(a.fab)}${lk}`});
  if(a.cash>0)rows.push({acc:'dinheiro',date:a.dNon,ts:a.ts,amount:a.cash,auto:true,flow:'auto',src,cat:'Vendas em dinheiro',desc,sub:'pago em dinheiro'+lk});
  if(a.pix>0)rows.push({acc:S.pa,date:a.dNon,ts:a.ts,amount:a.pix,auto:true,flow:'auto',src,cat:'Vendas em Pix',desc,sub:'pago em Pix'+lk});
  a.parcs.filter(p=>!(p.used>0&&p.amount<0.005)).forEach(p=>rows.push({acc:p.due?'blu':'agenda',date:p.date,ts:a.ts,amount:p.amount,auto:true,flow:'auto',src,cat:'Parcelas do cartão loja (já sem taxa)',desc,
   sub:`parcela ${p.i}/${p.n} · ${p.method} (líquido)${p.due?'':' · a receber'}${p.used>0?' · '+money(p.used)+' consumidos na conciliação da Agenda BLU (restante '+money(p.amount)+')':''}${lk}`}));
 });
 S.exp.forEach(x=>rows.push({acc:x.acc,date:x.date,ts:x.ts,amount:x.amount,auto:true,flow:'desp',src:x.fab?null:{t:'desp',id:String(x.key).split(':')[0]},cat:x.fab?'Pagamentos à fábrica':'Despesas pagas',desc:x.desc,sub:x.agPend?(x.sub?x.sub+' · ':'')+'aguardando conciliação da Agenda BLU':x.agConc?(x.sub?x.sub+' · ':'')+'conciliado com a Agenda BLU: '+money(x.agVal)+' já descontados dos recebíveis (sem novo desconto)':x.sub,pendConc:!!x.agPend}));
 ledger().forEach(e=>{
  let desc=KIND[e.kind]||'Lançamento',sub=e.note||'';
  if(e.kind==='transf'){
   const o=ledger().find(x=>x.pair===e.pair&&x.id!==e.id);
   desc=Number(e.amount)<0?`Transferência para ${accName(o?o.account:'')}`:`Transferência de ${accName(o?o.account:'')}`;
  }
  rows.push({acc:e.account,date:e.date,ts:e.createdAt||'',amount:Number(e.amount||0),auto:false,flow:e.kind||'',pairAcc:e.pair?((ledger().find(x=>x.pair===e.pair&&x.id!==e.id)||{}).account||''):'',cat:e.kind==='transf'?'Transferências entre contas':(KIND[e.kind]||'Lançamento manual'),id:e.id,desc,sub});
 });
 return rows.sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.ts).localeCompare(String(a.ts)));
}
function renderList(S){
 const f=$('cxFiltro').value;
 const rows=rowsAll(S).filter(r=>!f||r.acc===f);
 const ent=r2(rows.filter(r=>r.amount>0).reduce((n,r)=>n+r.amount,0)),sai=r2(rows.filter(r=>r.amount<0).reduce((n,r)=>n+r.amount,0));
 $('cxExtratoResumo').textContent=`${rows.length} lançamento(s) · entrou ${money(ent)} · saiu ${money(Math.abs(sai))}`;
 shown=rows.slice(0,300);
 $('cxLinhas').innerHTML=shown.map(r=>`<tr><td>${dayText(r.date)}</td><td>${esc(accName(r.acc))}</td><td><span class="product-name">${esc(r.desc)}</span>${r.sub?`<small class="fin-sub">${esc(r.sub)}</small>`:''}</td><td>${r.auto?'<span class="pill cxauto">Automático</span>':'<span class="pill cxman">Manual</span>'}</td><td><b class="${r.amount<0?'cx-neg':'cx-pos'}">${signed(r.amount)}</b></td><td class="fin-actions">${r.auto?(r.src?`<button type="button" class="row-action" data-cx-go="${esc(r.src.t)}" data-id="${esc(r.src.id)}" title="Abre a tela de origem para corrigir">Editar</button>`:''):`<button type="button" class="row-action" data-cx-edit="${esc(r.id)}">Editar</button> <button type="button" class="row-action delete" data-cx-del="${esc(r.id)}">Excluir</button>`}</td></tr>`).join('');
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
  <td><span class="product-name">${p.label?esc(p.label):'Venda #'+esc(String(p.saleKey).split('@')[0].slice(-6))}${p.client?' · '+esc(p.client):''}</span><small class="fin-sub">${p.label?'paga':'vendida'} em ${dayText(p.saleDay)} · ${esc(p.method)}${p.locked?' · bloqueado até a entrega':''}</small></td>
  <td>${p.i}/${p.n}</td>
  <td><input type="text" inputmode="decimal" value="${fmtIn(p.gross)}" data-pamt="${esc(p.pkey)}" style="width:110px;padding:7px 9px;border:1px solid #d9dfe9;border-radius:8px;font:inherit;font-size:13px"></td>
  <td>${p.used>0&&p.amount<0.005?'<span class="pill cxauto">Consumida na conciliação</span>':p.due?'<span class="pill" style="background:#e8f7f0;color:#1b9869">Entrou no Caixa BLU</span>':'<span class="pill cxauto">A receber</span>'}${p.used>0?`<small class="fin-sub">${p.amount<0.005?'100% consumida':'consumido '+money(p.used)+' · restante '+money(p.amount)}</small>`:''}${p.edited?'<small class="fin-sub">editada por você</small>':''}</td>
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
  if(v<p.used-0.005){toast(`Esta parcela já teve ${money(p.used)} consumidos em conciliação da Agenda BLU. O valor não pode ficar abaixo disso (reabra o pagamento da fábrica para liberar).`,true);render();return;}
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
 const op=$('cxOp').value,B=balances(),S=B.b,LK=B.lock;
 $('cxDeBox').hidden=!(op==='transf'||op==='saida');
 $('cxParaBox').hidden=!(op==='transf'||op==='entrada'||op==='ajuste');
 $('cxDeLbl').textContent=op==='saida'?'Saiu de qual conta?':'De';
 $('cxParaLbl').textContent=op==='transf'?'Para':op==='entrada'?'Entrou em qual conta?':'Conta';
 $('cxValorLbl').textContent=op==='ajuste'?'Saldo correto da conta (R$)':'Valor (R$)';
 $('cxHint').textContent=op==='ajuste'?`Saldo atual no sistema: ${signed(S[$('cxPara').value]||0)}. Digite quanto realmente tem na conta; o sistema lança só a diferença.`
  :op==='transf'?`Saldo disponível em ${accName($('cxDe').value)}: ${signed(r2((S[$('cxDe').value]||0)-(LK[$('cxDe').value]||0)))}${(LK[$('cxDe').value]||0)>0.004?` (mais ${money(LK[$('cxDe').value])} bloqueados de encomenda)`:''}.`:'';
}
function openForm(op,from,to){
 if(denied())return;
 editing=null;setEditUi(false);
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
function closeForm(){editing=null;setEditUi(false);$('cxFormCard').style.display='none';}
// ---------- editar lançamento manual (transferência, entrada, saída ou ajuste) ----------
// O saldo das contas é sempre recalculado a partir do extrato, então corrigir o lançamento já reajusta o Caixa inteiro.
let editing=null;
function setEditUi(on,e0){
 const op=$('cxOp');
 [...op.options].forEach(o=>{o.disabled=false;});op.disabled=false;
 $('cxForm').querySelector('button[type=submit]').textContent=on?'Salvar alterações':'Salvar';
 if(!on)return;
 if(e0&&e0.pair)op.disabled=true;                       // transferência continua sendo transferência
 else[...op.options].forEach(o=>{if(o.value==='transf'||o.value==='ajuste')o.disabled=true;});   // entrada/saída: só troca a direção
}
function openEdit(id0){
 if(denied())return;
 const e0=ledger().find(x=>x.id===id0);if(!e0)return;
 const par=e0.pair?ledger().filter(x=>x.pair===e0.pair):[e0];
 if(e0.pair&&par.length<2){toast('Esta transferência está incompleta. Exclua e lance de novo.',true);return;}
 editing={id:e0.id};
 $('cxForm').reset();fillSelects();
 if(e0.pair){
  const out=par.find(x=>Number(x.amount)<0),inn=par.find(x=>Number(x.amount)>0);
  $('cxOp').value='transf';$('cxDe').value=out.account;$('cxPara').value=inn.account;$('cxValor').value=fmtIn(Math.abs(out.amount));
 }else{
  const neg=Number(e0.amount)<0;
  $('cxOp').value=neg?'saida':'entrada';
  if(neg)$('cxDe').value=e0.account;else $('cxPara').value=e0.account;
  $('cxValor').value=fmtIn(Math.abs(e0.amount));
 }
 $('cxData').value=/^\d{4}-\d{2}-\d{2}/.test(e0.date||'')?String(e0.date).slice(0,10):todayISO();
 $('cxDesc').value=e0.note||'';
 $('cxFormTitulo').textContent='Editar lançamento do caixa';
 setEditUi(true,e0);syncForm();
 const c=$('cxFormCard');c.style.display='';c.scrollIntoView({behavior:'smooth',block:'start'});
 setTimeout(()=>$('cxValor').focus({preventScroll:true}),250);
}
function saveEdit(){
 const e0=ledger().find(x=>x.id===editing.id);if(!e0){closeForm();return;}
 const par=e0.pair?ledger().filter(x=>x.pair===e0.pair):[e0],ids=new Set(par.map(x=>x.id));
 const op=e0.pair?'transf':$('cxOp').value,de=$('cxDe').value,para=$('cxPara').value,v=r2(parseMoneyInput($('cxValor').value)),
  date=$('cxData').value||todayISO(),note=$('cxDesc').value.trim();
 if(!(v>0)){toast('Informe um valor maior que zero.',true);$('cxValor').focus();return;}
 if(op==='transf'&&de===para){toast('Escolha contas diferentes para transferir.',true);return;}
 // saldo da conta de origem SEM este lançamento (para avisar se a correção deixaria a conta negativa)
 const keep=data.cashLedger;data.cashLedger=keep.filter(x=>!ids.has(x.id));
 let BS;try{BS=balances();}finally{data.cashLedger=keep;}
 if((op==='transf'||op==='saida')&&v>BS.b[de]+0.009&&!confirm(`${accName(de)} ficará com ${signed(r2(BS.b[de]-v))}. Salvar mesmo assim?`))return;
 const snap=JSON.parse(JSON.stringify(par)),now=new Date().toISOString(),by=(typeof currentUserName==='function'?currentUserName():'');
 const touch=x=>{x.date=date;x.note=note;x.editedAt=now;x.editedBy=by;};
 if(e0.pair){
  const out=par.find(x=>Number(x.amount)<0),inn=par.find(x=>Number(x.amount)>0);
  out.account=de;out.amount=-v;inn.account=para;inn.amount=v;touch(out);touch(inn);
 }else{
  e0.account=op==='saida'?de:para;e0.amount=op==='saida'?-v:v;if(e0.kind!=='ajuste')e0.kind=op;touch(e0);
 }
 if(saveData()){closeForm();toast('Lançamento atualizado. Os saldos do Caixa foram recalculados.');}
 else snap.forEach(s=>{const x=ledger().find(y=>y.id===s.id);if(x)Object.assign(x,s);});
}
function push(account,amount,kind,date,note,pair){
 ledger().push({id:id(),date,account,amount:r2(amount),kind,pair:pair||'',note,by:(typeof currentUserName==='function'?currentUserName():''),createdAt:new Date().toISOString()});
}
function save(ev){
 ev.preventDefault();if(denied())return;
 if(editing){saveEdit();return;}
 const op=$('cxOp').value,de=$('cxDe').value,para=$('cxPara').value,raw=$('cxValor').value.trim(),v=r2(parseMoneyInput(raw)),
  date=$('cxData').value||todayISO(),note=$('cxDesc').value.trim(),BS=balances(),bal=BS.b,lkd=BS.lock;
 if(op==='ajuste'){
  if(!raw){toast('Informe o saldo correto da conta.',true);$('cxValor').focus();return;}
  const diff=r2(v-bal[para]);
  if(Math.abs(diff)<0.005){toast('O saldo já está com esse valor.');return;}
  push(para,diff,'ajuste',date,note||`Ajuste de saldo: de ${signed(bal[para])} para ${signed(v)}`);
 }else{
  if(!(v>0)){toast('Informe um valor maior que zero.',true);$('cxValor').focus();return;}
  if(op==='transf'){
   if(de===para){toast('Escolha contas diferentes para transferir.',true);return;}
   if(lkd[de]>0.004&&v>r2(bal[de]-lkd[de])+0.009){toast(`Só ${money(Math.max(0,r2(bal[de]-lkd[de])))} de ${accName(de)} pode ser usado: ${money(lkd[de])} são de encomenda ainda não entregue.`,true);return;}
   if(v>bal[de]+0.009&&!confirm(`${accName(de)} tem só ${signed(bal[de])}. Transferir ${money(v)} mesmo assim? A conta ficará negativa.`))return;
   const pair=id();push(de,-v,'transf',date,note,pair);push(para,v,'transf',date,note,pair);
  }else if(op==='entrada')push(para,v,'entrada',date,note);
  else{
   if(lkd[de]>0.004&&v>r2(bal[de]-lkd[de])+0.009){toast(`Só ${money(Math.max(0,r2(bal[de]-lkd[de])))} de ${accName(de)} pode ser usado: ${money(lkd[de])} são de encomenda ainda não entregue.`,true);return;}
   if(v>bal[de]+0.009&&!confirm(`${accName(de)} tem só ${signed(bal[de])}. Lançar saída de ${money(v)} mesmo assim?`))return;
   push(de,-v,'saida',date,note);
  }
 }
 if(saveData()){closeForm();toast('Caixa atualizado.');}
}
function showLock(k){
 const S=balances(),rows=S.lockRows.filter(r=>r.amts[k]>0.004);
 if(!rows.length){toast('Nenhum valor de encomenda bloqueado nesta conta.');return;}
 alert(`${accName(k)}: ${money(S.lock[k])} ainda NÃO podem ser usados.\n\nEsse valor é de venda por ENCOMENDA (o produto ainda não foi entregue ao cliente), por isso fica bloqueado.\n\n`+rows.map(r=>`• ${r.label}${r.client?' · '+r.client:''}: ${money(r.amts[k])}`).join('\n')+`\n\nQuando a venda for efetivada em Encomendas ▸ "Entregar (virar venda)", o valor é liberado e este aviso some.`);
}
function showLockFab(){
 const S=balances();
 if(!(S.lockFab>0.004)){toast('Nenhum crédito de encomenda pendente.');return;}
 alert(`Crédito com a fábrica: ${money(S.lockFab)} vêm de ENCOMENDAS ainda não entregues.\n\n`+S.lockFabRows.map(r=>`• ${r.label}${r.client?' · '+r.client:''}: ${money(r.amt)}`).join('\n')+`\n\nO crédito só vira saldo da fábrica quando a encomenda for entregue (Entregar > virar venda).`);
}
// ---------- extrato por conta: mostra de onde veio cada valor e como chegou no saldo ----------
function closeExtrato(){const m=document.getElementById('cxExtModal');if(m)m.remove();document.removeEventListener('keydown',extEsc);}
function extEsc(ev){if(ev.key==='Escape')closeExtrato();}
// ---------- janela de extrato (com filtro por data) usada por todas as contas e pelo crédito com a fábrica ----------
function extModal(o){
 closeExtrato();
 const asc=o.rows.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.ts||'').localeCompare(String(b.ts||'')));
 let run=0;asc.forEach(r=>{r.dk=/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))?String(r.date):localDateKey(r.date);run=r2(run+r.amount);r.run=run;});
 const cls=v=>v<0?'cx-neg':'cx-pos',td='padding:7px 8px;border-bottom:1px solid #e6eaf1;font-size:13px;vertical-align:top';
 const inp='padding:6px 8px;border:1px solid #d9dfe9;border-radius:8px;font:inherit;font-size:13px';
 const m=document.createElement('div');m.id='cxExtModal';
 m.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px';
 m.innerHTML=`<div role="dialog" aria-modal="true" style="background:#fff;color:#1c2433;border-radius:14px;width:100%;max-width:760px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.3)">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px 18px;border-bottom:1px solid #e6eaf1">
   <div><h2 style="margin:0;font-size:18px">${esc(o.title)}</h2><p style="margin:4px 0 0;color:#6b7587;font-size:13px">${o.sub}</p></div>
   <button type="button" class="button button-light button-small" data-ext-close>Fechar</button></div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;padding:10px 18px;border-bottom:1px solid #e6eaf1;font-size:12px;color:#6b7587">
   <label style="display:grid;gap:3px">De<input type="date" id="cxExtDe" style="${inp}"></label>
   <label style="display:grid;gap:3px">Até<input type="date" id="cxExtAte" style="${inp}"></label>
   <button type="button" class="row-action" id="cxExtMes">Este mês</button>
   <button type="button" class="row-action" id="cxExtLimpa">Limpar filtro</button></div>
  <div id="cxExtBody" style="overflow:auto;padding:14px 18px"></div></div>`;
 const body=m.querySelector('#cxExtBody'),eDe=m.querySelector('#cxExtDe'),eAte=m.querySelector('#cxExtAte');
 function draw(){
  const de=eDe.value,ate=eAte.value,filtro=!!(de||ate);
  const rows=asc.filter(r=>(!de||r.dk>=de)&&(!ate||r.dk<=ate));
  const ant=de?r2(asc.filter(r=>r.dk<de).reduce((n,r)=>n+r.amount,0)):0;
  const periodo=r2(rows.reduce((n,r)=>n+r.amount,0));
  const fim=ate?(asc.filter(r=>r.dk<=ate).slice(-1)[0]||{run:0}).run:o.saldo;
  const cats=new Map();rows.forEach(r=>{const c=r.cat||'Outros';cats.set(c,r2((cats.get(c)||0)+r.amount));});
  const linha=(t,v,b)=>`<tr><td style="${td}">${b?`<b>${t}</b>`:t}</td><td style="${td};text-align:right"><b class="${cls(v)}">${signed(v)}</b></td></tr>`;
  let resumo=[...cats.entries()].map(([c,v])=>linha(esc(c),v)).join('');
  if(!rows.length)resumo=`<tr><td style="${td}">Nenhuma movimentação ${filtro?'neste período':'nesta conta'}.</td><td style="${td}"></td></tr>`;
  if(filtro){
   resumo=(de?linha('Saldo anterior ao período',ant):'')+resumo+linha('Total do período',periodo,true)+(ate?linha('= Saldo ao fim do período',fim,true):linha('= Saldo atual',o.saldo,true));
  }else{
   const dif=r2(o.saldo-periodo);
   resumo+=(Math.abs(dif)>0.004&&o.mostraDif?linha('Diferença não detalhada',dif):'')+linha(esc(o.rotuloSaldo),o.saldo,true);
  }
  const lista=rows.slice().reverse().slice(0,500).map(r=>`<tr><td style="${td};white-space:nowrap">${esc(new Date(r.dk+'T12:00:00').toLocaleDateString('pt-BR'))}</td><td style="${td}"><b>${esc(r.desc)}</b>${r.sub?`<br><small style="color:#6b7587">${esc(r.sub)}</small>`:''}<br><small style="color:#6b7587">${esc(r.cat||'')}</small></td><td style="${td};text-align:right;white-space:nowrap"><b class="${cls(r.amount)}">${signed(r.amount)}</b></td><td style="${td};text-align:right;white-space:nowrap;color:#6b7587">${signed(r.run)}</td></tr>`).join('');
  body.innerHTML=`<h3 style="margin:0 0 6px;font-size:14px">${filtro?'Resumo do período':'Como chegou neste valor'}</h3>
   <table style="width:100%;border-collapse:collapse;min-width:0"><tbody>${resumo}</tbody></table>
   <h3 style="margin:18px 0 6px;font-size:14px">Movimentações (${rows.length}${filtro?' de '+asc.length:''})</h3>
   <table style="width:100%;border-collapse:collapse;min-width:0"><thead><tr style="text-align:left;color:#6b7587;font-size:11px"><th style="padding:6px 8px">DATA</th><th style="padding:6px 8px">ORIGEM</th><th style="padding:6px 8px;text-align:right">VALOR</th><th style="padding:6px 8px;text-align:right">SALDO</th></tr></thead><tbody>${lista}</tbody></table>
   ${rows.length>500?'<p style="color:#6b7587;font-size:12px">Mostrando as 500 mais recentes. O resumo acima considera todas.</p>':''}`;
 }
 eDe.addEventListener('change',draw);eAte.addEventListener('change',draw);
 m.querySelector('#cxExtLimpa').addEventListener('click',()=>{eDe.value='';eAte.value='';draw();});
 m.querySelector('#cxExtMes').addEventListener('click',()=>{const n=new Date();eDe.value=localDateKey(new Date(n.getFullYear(),n.getMonth(),1));eAte.value=localDateKey(new Date(n.getFullYear(),n.getMonth()+1,0));draw();});
 m.addEventListener('click',ev=>{if(ev.target===m||ev.target.closest('[data-ext-close]'))closeExtrato();});
 document.addEventListener('keydown',extEsc);
 document.body.appendChild(m);draw();
}
function showExtrato(k){
 const S=balances(),rows=rowsAll(S).filter(r=>r.acc===k),lk=S.lock[k]||0,cls=v=>v<0?'cx-neg':'cx-pos';
 extModal({title:'Extrato · '+accName(k),rows,saldo:S.b[k],mostraDif:true,rotuloSaldo:'= Saldo da conta',
  sub:`Saldo atual: <b class="${cls(S.b[k])}">${signed(S.b[k])}</b>${lk>0.004?` · bloqueado (encomenda) ${money(lk)} · disponível ${signed(r2(S.b[k]-lk))}`:''}`});
}
function showExtratoFab(){
 const vendas=new Map(),rows=[];
 (data.movements||[]).forEach(mv=>{
  if(mv.type!=='venda'||mv.canceled)return;
  const k=mv.saleId||mv.id;let x=vendas.get(k);
  if(!x){x={key:k,date:mv.date,client:mv.client||'',credit:0};vendas.set(k,x);}
  x.credit+=Number(mv.factoryCredit||0);
 });
 vendas.forEach(x=>{const v=r2(x.credit);if(v>0.004)rows.push({date:x.date,amount:v,cat:'Venda no cartão fábrica',desc:`Venda #${String(x.key).split('@')[0].slice(-6)}${x.client?' · '+x.client:''}`,sub:''});});
 (typeof window.ckrServicos==='function'?window.ckrServicos():[]).forEach(s=>{const v=Number(s.payment?.factoryCredit||0);if(v)rows.push({date:s.date,amount:v,cat:'Serviço (cartão fábrica)',desc:s.description||'Serviço',sub:''});});
 encCreditos().forEach(x=>rows.push({date:x.date,amount:x.credit,cat:'Encomenda (cartão fábrica)',desc:x.label+(x.client?' · '+x.client:''),sub:'produto ainda não entregue'}));
 (data.factoryCreditsManual||[]).forEach(e=>rows.push({date:e.date,amount:Number(e.amount||0),cat:e.kind==='balanceAdjustment'?'Ajuste de saldo':'Crédito lançado manualmente',desc:e.note||'Crédito lançado manualmente',sub:e.by?'por '+e.by:''}));
 (data.factoryLedger||[]).forEach(e=>rows.push({date:e.date,amount:-Number(e.amount||0),cat:e.orderId?'Uso em pedido à fábrica':'Uso de crédito',desc:e.note||'Uso de crédito',sub:e.by?'por '+e.by:''}));
 const saldo=fabSaldo(),S=balances(),cls=v=>v<0?'cx-neg':'cx-pos';
 extModal({title:'Extrato · Crédito com a fábrica',rows,saldo,mostraDif:true,rotuloSaldo:'= Saldo disponível',
  sub:`Saldo disponível: <b class="${cls(saldo)}">${signed(saldo)}</b>${S.lockFab>0.004?` · ${money(S.lockFab)} de encomendas ainda não entregues (não incluído)`:''}`});
}
// ---------- Conciliação da Agenda BLU: seleção dos recebíveis e confirmação ----------
// Lê os pagamentos à fábrica com agendaConciliacao:'pendente' (S.exp com agPend) e as parcelas da Agenda BLU (S.parcs, as mesmas da tabela "Agenda BLU · parcelas do cartão loja").
// A seleção fica na memória da janela; só confirmConc() grava, e apenas no pagamento (agendaConciliacao + agendaRecebiveis).
const CONC={pay:'',de:'',ate:'',sel:{}};   // sel[chaveDoPagamento][pkey] = texto do valor a utilizar
function concEsc(ev){if(ev.key==='Escape')closeConc();}
function closeConc(){const m=$('cxConcModal');if(m)m.remove();document.removeEventListener('keydown',concEsc);}
const concPend=S=>S.exp.filter(x=>x.agPend);
const concRecs=S=>S.parcs.filter(p=>!p.due&&!p.locked);   // a receber na Agenda BLU; as de encomenda não entregue estão bloqueadas e não entram
const concNome=p=>(p.label?p.label:'Venda #'+String(p.saleKey).split('@')[0].slice(-6))+(p.client?' · '+p.client:'');
function openConc(){
 closeConc();
 const pend=concPend(balances());
 if(!pend.length){toast('Nenhum pagamento aguardando conciliação.');return;}
 CONC.pay=pend[0].key;CONC.de='';CONC.ate='';CONC.sel={};
 const m=document.createElement('div');m.id='cxConcModal';
 m.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px';
 m.innerHTML=`<div role="dialog" aria-modal="true" style="background:#fff;color:#1c2433;border-radius:14px;width:100%;max-width:780px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.3)">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px 18px;border-bottom:1px solid #e6eaf1">
   <div><h2 style="margin:0;font-size:18px">Conciliar Agenda BLU</h2><p style="margin:4px 0 0;color:#6b7587;font-size:13px">Escolha o pagamento e selecione os recebíveis que a BLU consumiu. Ao confirmar, os recebíveis são baixados e o pagamento fica conciliado. Os saldos não mudam: o valor já estava descontado da Agenda BLU.</p></div>
   <button type="button" class="button button-light button-small" data-conc-close>Fechar</button></div>
  <div id="cxConcBody" style="overflow:auto;padding:14px 18px"></div></div>`;
 m.addEventListener('click',ev=>{
  if(ev.target===m||ev.target.closest('[data-conc-close]')){closeConc();return;}
  if(ev.target.closest('[data-conc-ok]')){confirmConc();return;}
  if(ev.target.closest('[data-conc-limpa]')){CONC.de='';CONC.ate='';drawConc();return;}   // limpa só o filtro; a seleção e os valores informados continuam
  const rm=ev.target.closest('[data-conc-rm]');if(rm){delete (CONC.sel[CONC.pay]||{})[rm.dataset.concRm];drawConc();}
 });
 m.addEventListener('change',ev=>{
  const el=ev.target;
  if(el.name==='cxConcPay'){CONC.pay=el.value;drawConc();return;}
  if(el.id==='cxConcDe'){CONC.de=el.value;drawConc();return;}
  if(el.id==='cxConcAte'){CONC.ate=el.value;drawConc();return;}
  if(el.dataset.concChk){
   const sel=CONC.sel[CONC.pay]||(CONC.sel[CONC.pay]={}),p=concRecs(balances()).find(x=>x.pkey===el.dataset.concChk);
   if(el.checked&&p)sel[p.pkey]=fmtIn(p.amount);else delete sel[el.dataset.concChk];
   drawConc();
  }
 });
 document.addEventListener('keydown',concEsc);
 document.body.appendChild(m);drawConc();
}
function drawConc(){
 const body=$('cxConcBody');if(!body)return;
 const S=balances(),pend=concPend(S),recs=concRecs(S);
 if(!pend.length){closeConc();toast('Nenhum pagamento aguardando conciliação.');return;}
 if(!pend.some(x=>x.key===CONC.pay))CONC.pay=pend[0].key;
 const pg=pend.find(x=>x.key===CONC.pay),total=r2(-pg.amount),sel=CONC.sel[CONC.pay]||(CONC.sel[CONC.pay]={});
 const box='border:1px solid #d9dfe9;border-radius:10px',h3='margin:18px 0 8px;font-size:14px';
 const inp='padding:7px 9px;border:1px solid #d9dfe9;border-radius:8px;font:inherit;font-size:13px';
 const pays=pend.map(x=>{const on=x.key===CONC.pay;return `<label style="display:flex;gap:10px;align-items:flex-start;padding:9px 11px;${box};${on?'border-color:#f97316;background:#fff7f0;':''}cursor:pointer"><input type="radio" name="cxConcPay" value="${esc(x.key)}"${on?' checked':''} style="margin-top:3px"><span style="font-size:13px"><b>Pedido nº ${esc(x.pedNum)}</b> · parcela do boleto ${esc(x.pedN)}/${esc(x.pedOf)}<br><small style="color:#6b7587">Pago em ${esc(dayText(x.date))} · valor utilizado da Agenda BLU <b>${money(-x.amount)}</b></small></span></label>`;}).join('');
 const datas=[...new Set(recs.map(p=>p.date))].sort();
 const de=CONC.de,ate=CONC.ate,invalido=!!(de&&ate&&de>ate);   // datas ISO (AAAA-MM-DD) comparam como texto; as duas pontas entram no intervalo
 const lista=(!invalido&&(de||ate))?recs.filter(p=>(!de||p.date>=de)&&(!ate||p.date<=ate)).sort((a,b)=>String(a.date).localeCompare(String(b.date))||concNome(a).localeCompare(concNome(b),'pt-BR')||String(a.saleKey).localeCompare(String(b.saleKey))||a.i-b.i):[];
 const foraN=Object.keys(sel).filter(k=>!lista.some(p=>p.pkey===k)&&recs.some(p=>p.pkey===k)).length;   // selecionados que não aparecem neste intervalo (continuam na seleção)
 const faixa=de&&ate?'de '+dayText(de)+' até '+dayText(ate):de?'a partir de '+dayText(de):ate?'até '+dayText(ate):'';
 const rows=lista.map(p=>{
  const on=Object.prototype.hasOwnProperty.call(sel,p.pkey);
  return `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:9px 11px;${box};margin-bottom:6px">
   <input type="checkbox" data-conc-chk="${esc(p.pkey)}"${on?' checked':''} aria-label="Selecionar recebível" style="width:18px;height:18px">
   <div style="flex:1;min-width:190px;font-size:13px"><b>${esc(concNome(p))}</b><br><small style="color:#6b7587">vendida em ${esc(dayText(p.saleDay))} · parcela ${p.i}/${p.n} · vence em ${esc(dayText(p.date))}${p.used>0?' · já consumido '+money(p.used)+' em outra conciliação':''}</small></div>
   <div style="font-size:12px;color:#6b7587;text-align:right">disponível<br><b style="font-size:13px;color:#1c2433">${money(p.amount)}</b></div>
   <label style="display:grid;gap:2px;font-size:11px;color:#6b7587">UTILIZAR (R$)<input type="text" inputmode="numeric" data-conc-val="${esc(p.pkey)}" value="${on?esc(sel[p.pkey]):''}"${on?'':' disabled'} placeholder="0,00" style="width:110px;${inp}"></label>
   <small data-conc-err="${esc(p.pkey)}" style="flex-basis:100%;color:#d74b55"></small></div>`;
 }).join('');
 body.innerHTML=`<h3 style="margin:0 0 8px;font-size:14px">1. Pagamento a conciliar</h3><div style="display:grid;gap:6px">${pays}</div>
  <h3 style="${h3}">2. Vencimento dos recebíveis</h3>
  <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end"><label style="display:grid;gap:3px;font-size:12px;color:#6b7587">Vencimento de<input type="date" id="cxConcDe" value="${esc(de)}" style="${inp}"></label><label style="display:grid;gap:3px;font-size:12px;color:#6b7587">Vencimento até<input type="date" id="cxConcAte" value="${esc(ate)}" style="${inp}"></label>${de||ate?'<button type="button" class="row-action" data-conc-limpa>Limpar filtro</button>':''}</div>
  ${invalido?'<p role="alert" style="margin:10px 0 0;font-size:13px;color:#d74b55">A data inicial é posterior à data final. Corrija o intervalo para pesquisar.</p>':datas.length?`<p style="margin:10px 0 0;font-size:12px;color:#6b7587">Há recebíveis a receber na Agenda BLU com vencimento de ${esc(dayText(datas[0]))} até ${esc(dayText(datas[datas.length-1]))}.</p>`:'<p style="margin:10px 0 0;font-size:13px;color:#6b7587">Não há recebíveis a receber na Agenda BLU.</p>'}
  <h3 style="${h3}">3. Recebíveis ${esc(faixa)}</h3>
  ${invalido?'':(de||ate)?(rows||'<p style="font-size:13px;color:#6b7587">Nenhum recebível da Agenda BLU vence neste intervalo.</p>'):'<p style="font-size:13px;color:#6b7587">Informe a data inicial e/ou a final para listar os recebíveis. Você pode mudar o intervalo e continuar selecionando: tudo o que foi selecionado, de qualquer data, é somado abaixo.</p>'}
  ${foraN&&!invalido?`<p style="margin:6px 0 0;font-size:12px;color:#6b7587">${foraN} recebível(is) selecionado(s) fora deste intervalo continua(m) na seleção (veja o resumo abaixo).</p>`:''}
  <h3 style="${h3}">Resumo da seleção</h3><div id="cxConcResumo"></div>`;
 body.querySelectorAll('[data-conc-val]').forEach(i=>{
  bindMoneyMask(i);
  i.addEventListener('money-mask-updated',()=>{(CONC.sel[CONC.pay]||{})[i.dataset.concVal]=i.value;concResumo();});
 });
 concResumo();
}
function confirmConc(){
 if(denied())return;
 const S=balances(),pg=concPend(S).find(x=>x.key===CONC.pay);   // tudo é relido agora: saldo disponível de cada recebível e situação do pagamento
 if(!pg){toast('Este pagamento não está mais aguardando conciliação.',true);drawConc();return;}
 const recs=concRecs(S),sel=CONC.sel[CONC.pay]||{},links=[];let totC=0;
 for(const k of Object.keys(sel)){
  const p=recs.find(x=>x.pkey===k);   // vínculo pela chave única da parcela (pkey), nunca pela posição na lista
  if(!p){toast('Um recebível selecionado não está mais disponível. Revise a seleção.',true);drawConc();return;}
  const vC=Math.round(parseMoneyInput(sel[k])*100);
  if(!(vC>0)||vC>Math.round(p.amount*100)){toast(`O recebível ${concNome(p)} (parcela ${p.i}/${p.n}) não tem valor suficiente: disponível ${money(p.amount)}.`,true);drawConc();return;}
  totC+=vC;
  links.push({pkey:k,amount:vC/100,date:p.date,saleKey:p.saleKey,label:concNome(p),parcela:p.i,de:p.n,saleDay:p.saleDay,method:p.method,original:p.gross});
 }
 const payC=Math.round(-pg.amount*100);
 if(!links.length||totC!==payC){toast(`O total selecionado (${money(totC/100)}) precisa ser exatamente ${money(payC/100)}.`,true);return;}
 const o=(data.factoryOrders||[]).find(x=>x.id===pg.pedId),inst=o&&(o.installments||[]).find(x=>x.n===pg.pedN),pay=inst&&inst.payment;
 if(!pay||pay.agendaConciliacao!=='pendente'){toast('Este pagamento não está mais aguardando conciliação.',true);drawConc();return;}
 if(!confirm(`Conciliar o pedido nº ${pg.pedNum} (parcela ${pg.pedN}/${pg.pedOf}) de ${money(payC/100)}?\n\nRecebíveis que serão baixados:\n`+links.map(l=>`• ${l.label} · ${l.parcela}/${l.de} · vence ${dayText(l.date)}: ${money(l.amount)}`).join('\n')+`\n\nOs saldos não mudam. Para desfazer, reabra o pagamento em Pedidos à fábrica.`))return;
 pay.agendaConciliacao='conciliado';pay.agendaRecebiveis=links;pay.agendaConciliadoEm=new Date().toISOString();pay.agendaConciliadoPor=typeof currentUserName==='function'?currentUserName():'';
 if(!saveData()){pay.agendaConciliacao='pendente';delete pay.agendaRecebiveis;delete pay.agendaConciliadoEm;delete pay.agendaConciliadoPor;return;}
 closeConc();
 toast(`Conciliação registrada: ${money(payC/100)} baixados de ${links.length} recebível(is). Os saldos não mudaram.`);
}
function concResumo(){
 const box=$('cxConcResumo');if(!box)return;
 const S=balances(),recs=concRecs(S),pg=concPend(S).find(x=>x.key===CONC.pay);if(!pg)return;
 const total=r2(-pg.amount),sel=CONC.sel[CONC.pay]||{};
 let usado=0,usadoC=0,invalidos=0;const itens=[];
 Object.keys(sel).forEach(k=>{
  const p=recs.find(x=>x.pkey===k);if(!p)return;
  const v=r2(parseMoneyInput(sel[k])),ok=v>0&&v<=p.amount+0.004;
  if(ok){usadoC+=Math.round(v*100);usado=r2(usadoC/100);}else invalidos++;
  const er=document.querySelector(`[data-conc-err="${k}"]`);
  if(er)er.textContent=!(v>0)?'Informe quanto será utilizado deste recebível.':v>p.amount+0.004?`O valor passa do disponível (${money(p.amount)}).`:'';
  itens.push({p,v,ok});
 });
 itens.sort((a,b)=>String(a.p.date).localeCompare(String(b.p.date))||a.p.i-b.p.i);
 const totalC=Math.round(total*100),pode=itens.length>0&&!invalidos&&usadoC===totalC,falta=r2((totalC-usadoC)/100),cor=Math.abs(falta)<0.005?'#1b9869':falta<0?'#d74b55':'#c2570c';
 const msg=Math.abs(falta)<0.005?'Valor completo.':falta>0?`Falta ${money(falta)} para completar o pagamento.`:`Excedente de ${money(-falta)} sobre o valor do pagamento.`;
 const linhas=itens.map(({p,v,ok})=>`<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid #eef0f4;font-size:13px"><span>${esc(dayText(p.date))} · <b>${esc(concNome(p))}</b> · parcela ${p.i}/${p.n}<br><small style="color:#6b7587">${ok?'usa '+money(v)+' de '+money(p.amount)+' disponível':'valor inválido'}</small></span><button type="button" class="row-action" data-conc-rm="${esc(p.pkey)}">Remover</button></div>`).join('');
 box.innerHTML=`${linhas||'<p style="font-size:13px;color:#6b7587;margin:0 0 8px">Nenhum recebível selecionado.</p>'}
  <div style="margin-top:10px;padding:12px;${'border:1px solid #d9dfe9;border-radius:10px'};font-size:14px;display:grid;gap:4px">
   <div style="display:flex;justify-content:space-between"><span>Valor do pagamento</span><b>${money(total)}</b></div>
   <div style="display:flex;justify-content:space-between"><span>Total selecionado (${itens.length-invalidos} recebível(is))</span><b>${money(usado)}</b></div>
   <div style="display:flex;justify-content:space-between;color:${cor}"><span>${falta<-0.004?'Excedente':'Falta selecionar'}</span><b>${money(Math.abs(falta))}</b></div>
   <small style="color:${cor}">${msg}${invalidos?` ${invalidos} item(ns) com valor inválido não entram na soma.`:''}</small></div>
  <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button type="button" class="button button-primary" data-conc-ok${pode?'':' disabled'}>Confirmar conciliação</button><small style="color:#6b7587">${pode?'Total igual ao pagamento. Pronto para confirmar.':'Só confirma quando o total selecionado for exatamente igual ao valor do pagamento.'}</small></div>`;
}
function onCardClick(ev){
 const b=ev.target.closest('[data-cx]');if(!b)return;
 const k=b.dataset.acc;
 if(b.dataset.cx==='conciliar'){openConc();return;}
 if(b.dataset.cx==='lockfab'){showLockFab();return;}
 if(b.dataset.cx==='ajustefab'){ajustarFab();return;}
 if(b.dataset.cx==='extratofab'){showExtratoFab();return;}
 if(b.dataset.cx==='extrato'){showExtrato(k);return;}
 if(b.dataset.cx==='lock'){showLock(k);return;}
 if(b.dataset.cx==='transf')openForm('transf',k,k==='blu'?'nubank':k==='nubank'?'blu':'nubank');
 else openForm('ajuste',null,k);
}
function goEdit(t,sid){
 if(denied())return;
 if(t==='venda'){if(typeof startSaleEdit==='function'){startSaleEdit(sid);toast('Corrija a venda e confirme. O Caixa se ajusta sozinho.');}return;}
 if(t==='desp'){if(window.ckrDespesaEdit)window.ckrDespesaEdit(sid);return;}
 if(t==='enc'){if(window.ckrEncomendaEdit)window.ckrEncomendaEdit(sid);return;}
 if(t==='srv'){if(window.ckrServicoEdit)window.ckrServicoEdit(sid);return;}
}
function onListClick(ev){
 const go=ev.target.closest('[data-cx-go]');if(go){goEdit(go.dataset.cxGo,go.dataset.id);return;}
 const ed=ev.target.closest('[data-cx-edit]');if(ed){openEdit(ed.dataset.cxEdit);return;}
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
