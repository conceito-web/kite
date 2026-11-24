'use strict';
// Conceito: Gestão de Despesas, geração líquida de caixa, gráficos financeiros, previsão de gastos.
// Usa as funções e dados do app.js (data, money, saveData, localDateKey, shortMoney, ...).
// Geração líquida de caixa = Total de Recebimentos (o que efetivamente entrou, pelas regras do Caixa) − despesas e pagamentos a fornecedores efetivamente pagos (regime de caixa, sem CMV).
// Catálogo de itens (data.expenseCatalog): a Descrição da despesa é um item do catálogo; o item define a linha da DRE e a competência padrão.
(function(){
const $=x=>document.getElementById(x), r2=n=>Math.round(Number(n||0)*100)/100;
const DEFAULT_CATS=[
 ['Fixas','Aluguel, internet, contador'],
 ['Consumo','Energia, água, telefone'],
 ['Pessoal','Salários, encargos, comissões'],
 ['Operacionais','Entregas, combustível, manutenção'],
 ['Marketing','Instagram, anúncios, divulgação'],
 ['Financeiras','Tarifas bancárias, juros (a taxa de cartão já está no lucro das vendas)'],
 ['Impostos','Impostos sobre vendas e outras obrigações (se já não estiverem no custo)'],
 ['Outras','Materiais, reparos e gastos diversos']
];
const METHODS=['Dinheiro','Pix','Cartão de débito','Cartão de crédito','Boleto','Transferência','Débito automático','Outro'];   // só para ler/filtrar o histórico: o formulário não pede mais a forma
const SEM_FORMA='Não informada';   // valor técnico neutro de 'method' nos lançamentos novos (compatibilidade)
const formaTxt=p=>(p&&p.method&&p.method!==SEM_FORMA)?p.method:'';   // forma real (despesas antigas); vazio nos lançamentos novos
const DEFAULT_ACCOUNTS=[
 ['Nubank',['Poupança','Jurídica']],
 ['Itaú',['Poupança CA*','Poupança CA','Poupança CE','Poupança AN']]
];
const SEP=' — ';
const FAB_CAT='Pagamentos à fábrica';   // parcelas de pedidos à fábrica pagas (vêm de Pedidos à fábrica; não passam pela DRE)
// Contas do Conceito caixa (value 'caixa:<chave>'): despesa PAGA com uma delas sai do saldo da conta.
const CAIXA=[['caixa:blu','Caixa BLU'],['caixa:nubank','Caixa NUBANK'],['caixa:dinheiro','Dinheiro CAIXA'],['caixa:agenda','Caixa AGENDA BLU']];
const isCaixa=a=>String(a||'').indexOf('caixa:')===0;
const PALETTE=['#3468f5','#1b9b6b','#e89b3b','#8c6be8','#d74b55','#14a3b8','#c2569e','#7a8699','#9bb23a','#e5733d'];
const MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const list=()=>data.expenses||(data.expenses=[]);
const cfg=()=>data.settings||(data.settings={});
let editId=null,catSig='',compManual=false,legacyText='';

// ---------- catálogo de itens de despesa ----------
// Item = {id (código estável), name, category, line (linha da DRE), comp ('pag' mês do pagamento | 'ant' mês anterior), active}.
// O nome pode mudar sem quebrar o histórico: a despesa guarda o id do item. Item que sai de uso é desativado, nunca apagado.
const CAT_DEFAULTS=[
 ['it_simples','Simples Nacional (DAS)','Impostos','simples','ant'],
 ['it_gps','GPS','Impostos','gps','ant'],
 ['it_fgts_f','FGTS (fixo)','Impostos','fgtsF','ant'],
 ['it_fgts_op','FGTS (vendas)','Impostos','fgtsOp','ant'],
 ['it_iptu','IPTU/TMRSD','Impostos','iptu','pag'],
 ['it_alvara','Alvará e taxas','Impostos','iptu','pag'],
 ['it_juros_imp','Juros e multa de impostos','Impostos','jurosPassivos','pag'],
 ['it_parcel_imp','Parcelamento de impostos','Impostos','ignorar','pag'],
 ['it_comissao','Comissão','Pessoal','comissao','pag'],
 ['it_prolabore','Pró-labore','Pessoal','salariosF','pag'],
 ['it_13','13º salário','Pessoal','salariosF','pag'],
 ['it_ferias','Férias','Pessoal','salariosF','pag'],
 ['it_aluguel','Aluguel','Fixas','aluguel','pag'],
 ['it_contab','Serviços contábeis','Fixas','contabeis','ant'],
 ['it_nfce','Solução NF-CE','Fixas','nfce','pag'],
 ['it_servprof','Serviços profissionais','Fixas','servprof','pag'],
 ['it_energia','Energia','Consumo','energia','ant'],
 ['it_agua','Água e esgoto','Consumo','agua','ant'],
 ['it_telefone','Telefone e internet','Consumo','telefone','ant'],
 ['it_frete','Frete e entregas','Operacionais','frete','pag'],
 ['it_comb','Combustível e manutenção','Operacionais','outras','pag'],
 ['it_propaganda','Propaganda e publicidade','Marketing','propaganda','pag'],
 ['it_tarifas','Tarifas bancárias','Financeiras','despBancarias','pag'],
 ['it_juros_pagos','Juros pagos','Financeiras','jurosPassivos','pag'],
 ['it_desc_conc','Descontos concedidos','Financeiras','descontosConc','pag'],
 ['it_material','Material de consumo','Outras','material','pag'],
 ['it_devolucao','Devolução de venda','Outras','devolucoes','pag'],
 ['it_outras','Outras despesas','Outras','outras','pag']
];
function seedCatalog(){
 const now=new Date().toISOString();
 data.expenseCatalog=CAT_DEFAULTS.map(([id,name,category,line,comp])=>({id,name,category,line,comp,active:true,createdAt:now}));
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));}catch(_){}
}
const catalog=()=>{if(!Array.isArray(data.expenseCatalog))seedCatalog();return data.expenseCatalog;};
const itemById=i=>i?(catalog().find(x=>x.id===i)||null):null;
const byNamePt=(a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR');
catalog();

// ---------- utilidades ----------
function cats(){
 const base=DEFAULT_CATS.map(c=>c[0]),extra=cfg().expenseCats||[],used=list().map(e=>e.category).filter(Boolean),fromCat=catalog().map(i=>i.category).filter(Boolean);
 return [...new Set([...base,...extra,...fromCat,...used])];
}
// ---------- contas de origem do dinheiro ----------
function accountList(){
 const map=new Map();
 DEFAULT_ACCOUNTS.forEach(([b,cs])=>map.set(b,[...cs]));
 const add=v=>{const i=String(v||'').indexOf(SEP);if(i<1)return;const b=v.slice(0,i),c=v.slice(i+SEP.length);if(!map.has(b))map.set(b,[]);if(!map.get(b).includes(c))map.get(b).push(c);};
 (cfg().expenseAccounts||[]).forEach(add);list().forEach(x=>{add(x.account);(x.payments||[]).forEach(p=>add(p.account));});
 return map;
}
function accountOptions(){
 return '<option value="">Não informar</option><optgroup label="Conceito caixa (desconta do saldo)">'+CAIXA.map(([v,n])=>`<option value="${v}">${esc(n)}</option>`).join('')+'</optgroup>'+[...accountList()].map(([b,cs])=>`<optgroup label="${esc(b)}">${cs.map(c=>`<option value="${esc(b+SEP+c)}">${esc(b)}: ${esc(c)}</option>`).join('')}</optgroup>`).join('');
}
// Campo "Saiu de qual conta?" da Nova despesa: só as 4 contas do Conceito caixa (Pedidos à fábrica continua usando accountOptions)
function expenseAccountOptions(){
 return '<option value="">Selecione a conta…</option>'+CAIXA.map(([v,n])=>`<option value="${v}">${esc(n)}</option>`).join('');
}
function syncAccounts(){
 const opts=expenseAccountOptions();
 document.querySelectorAll('#finPagtos .pg-c').forEach(sel=>{const cur=sel.value;sel.innerHTML=opts;if([...sel.options].some(o=>o.value===cur))sel.value=cur;});
}
// ---------- contas de origem (uma despesa pode sair de várias contas) ----------
// x.payments = [{method,account,amount}]. 'method' é legado: despesas antigas mantêm a forma; as novas gravam SEM_FORMA. Despesas antigas (só x.method/x.account) viram 1 pagamento.
function payList(x){
 if(Array.isArray(x.payments)&&x.payments.length)return x.payments;
 return [{method:x.method||'',account:x.account||'',amount:Number(x.amount||0)}];
}
const payRowHtml=()=>`<div class="fin-pag-row"><label class="field">Conta de origem<select class="pg-c">${expenseAccountOptions()}</select></label><label class="field pg-vbox">Valor (R$)<input class="pg-v" type="text" inputmode="numeric" placeholder="0,00"></label><button class="button button-light pg-rm" type="button" title="Remover esta conta">✕</button></div>`;
const fmtIn=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
function addPayRow(p){
 const box=$('finPagtos');box.insertAdjacentHTML('beforeend',payRowHtml());
 const row=box.lastElementChild;
 if(p){row.dataset.method=p.method||'';{const sc=row.querySelector('.pg-c');sc.value=p.account||'';if(p.account&&sc.value!==p.account){const op=document.createElement('option');op.value=p.account;op.textContent=accLabel(p.account);sc.appendChild(op);sc.value=p.account;}}row.querySelector('.pg-v').value=p.amount>0?fmtIn(p.amount):'';}
 bindMoneyMask(row.querySelector('.pg-v'));
 return row;
}
function setPays(arr){
 $('finPagtos').innerHTML='';
 (arr&&arr.length?arr:[{method:SEM_FORMA,account:'',amount:0}]).forEach(addPayRow);
 payLayout();
}
function payLayout(){
 const rows=[...document.querySelectorAll('#finPagtos .fin-pag-row')];
 rows.forEach(r=>r.classList.toggle('single',rows.length===1));
 paySum();
}
function readPays(){
 return [...document.querySelectorAll('#finPagtos .fin-pag-row')].map(r=>({method:r.dataset.method||SEM_FORMA,account:r.querySelector('.pg-c').value,amount:r2(parseMoneyInput(r.querySelector('.pg-v').value))}));
}
function paySum(){
 const el=$('finPagSoma'),rows=document.querySelectorAll('#finPagtos .fin-pag-row');
 if(!el)return;
 if(rows.length<2){el.textContent='';el.className='fin-pag-soma';return;}
 const tot=r2(parseMoneyInput($('finValor').value)),sum=r2(readPays().reduce((n,p)=>n+p.amount,0)),dif=r2(tot-sum);
 if(Math.abs(dif)<0.005){el.textContent=`Soma confere: ${money(sum)}`;el.className='fin-pag-soma ok';}
 else{el.textContent=dif>0?`Falta distribuir ${money(dif)} (total ${money(tot)})`:`Passou ${money(-dif)} do total ${money(tot)}`;el.className='fin-pag-soma bad';}
}
function onAddPay(){
 const rows=document.querySelectorAll('#finPagtos .fin-pag-row'),tot=r2(parseMoneyInput($('finValor').value));
 if(rows.length>=6){toast('No máximo 6 contas por despesa.',true);return;}
 const row=addPayRow({method:SEM_FORMA,account:'',amount:0});
 if(rows.length===1&&tot>0){   // 1ª vez que divide: metade em cada, ajustável
  const a=r2(tot/2),first=rows[0].querySelector('.pg-v');first.value=fmtIn(a);row.querySelector('.pg-v').value=fmtIn(r2(tot-a));
 }
 payLayout();
}
function onPagClick(ev){
 const b=ev.target.closest('.pg-rm');if(!b)return;
 b.closest('.fin-pag-row').remove();payLayout();
}
function newAccount(){
 if(denied())return;
 const v=(prompt('Nova conta. Escreva Banco: Conta\nEx.: Inter: Jurídica')||'').trim();if(!v)return;
 const i=v.indexOf(':');if(i<1||!v.slice(i+1).trim()){toast('Use o formato Banco: Conta (ex.: Inter: Jurídica).',true);return;}
 const val=v.slice(0,i).trim()+SEP+v.slice(i+1).trim();
 const ex=cfg().expenseAccounts||(cfg().expenseAccounts=[]);
 if(!ex.includes(val))ex.push(val);
 syncAccounts();const rs=[...document.querySelectorAll('#finPagtos .pg-c')],tg=rs.find(s=>!s.value)||rs[rs.length-1];if(tg)tg.value=val;saveData();
}
const accLabel=a=>isCaixa(a)?((CAIXA.find(c=>c[0]===a)||[])[1]||a):(a?a.replace(SEP,': '):'');
const hintOf=c=>(DEFAULT_CATS.find(x=>x[0]===c)||[])[1]||'Categoria criada por você.';
const colorOf=c=>{const i=cats().indexOf(c);return i<0?'#7a8699':PALETTE[i%PALETTE.length];};
function addMonths(key,n){
 const [y,m,d]=key.split('-').map(Number),t=new Date(y,m-1+n,1),last=new Date(t.getFullYear(),t.getMonth()+1,0).getDate();
 return localDateKey(new Date(t.getFullYear(),t.getMonth(),Math.min(d,last)));
}
function monthRange(off){
 const n=new Date(),a=new Date(n.getFullYear(),n.getMonth()+off,1),b=new Date(a.getFullYear(),a.getMonth()+1,0);
 return [localDateKey(a),localDateKey(b)];
}
const inR=(k,s,e)=>!!k&&(!s||k>=s)&&(!e||k<=e);
const profitOf=m=>{const p=numOrNaN(m.profit);if(Number.isFinite(p))return p;const c=numOrNaN(m.costTotal);return Number.isFinite(c)?Number(m.total||0)-c:NaN;};
const statusOf=(x,t)=>x.status==='pago'?'pago':(x.dueDate&&x.dueDate<t?'vencida':'pendente');
const pct=(v,d=1)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})+'%';
const fmtAxis=v=>(v<0?'−':'')+shortMoney(Math.abs(v));
const signed=v=>(v<0?'−':'')+money(Math.abs(v));

// ---------- cálculo central ----------
function calc(s,e){
 // Despesas pagas: por data do pagamento. Pendências do cartão: por vencimento no período; vencidas gerais: todos os meses.
 let desp=0,pagas=0,qtd=0,fab=0;const byCat={};
 list().forEach(x=>{
  const v=Number(x.amount||0);
  if(x.status==='pago'){
   if(!inR(x.paidDate||x.date,s,e))return;
   desp+=v;pagas+=v;qtd++;
   const c=x.category||'Outras';byCat[c]=(byCat[c]||0)+v;
  }
 });
 // Pagamentos a fornecedor (parcelas de pedidos à fábrica) pagos com dinheiro: entram aqui, não na DRE. Pagamento com crédito da fábrica não sai do caixa.
 (data.factoryOrders||[]).forEach(o=>(o.installments||[]).forEach(p=>{
  const pg=p&&p.paid&&p.payment;
  if(!pg||pg.credit||!inR(pg.date,s,e))return;
  const v=Number(p.amount||0);fab+=v;desp+=v;pagas+=v;qtd++;byCat[FAB_CAT]=(byCat[FAB_CAT]||0)+v;
 }));
 desp=r2(desp);
 return {desp,pagas:r2(pagas),qtd,fab:r2(fab),byCat};
}
// Obrigações em aberto (não pagas), SEM filtro de período e sem olhar a data do lançamento:
//  pend = tudo que não foi pago (vencidas + a vencer + sem vencimento) | venc = dueDate anterior a hoje | avencer = dueDate de hoje em diante | sem = sem dueDate (nunca vira "vencida" sozinha)
function abertas(s,e){
 const today=todayISO();let pend=0,venc=0,avencer=0,sem=0,nPend=0,nVenc=0;
 list().forEach(x=>{
  if(x.status==='pago'||x.forecast===true)return;
  // Quando há período, considerar somente vencimentos dentro dele.
  // Sem data de vencimento, a obrigação só entra na visão geral sem filtro.
  if((s||e)&&!inR(x.dueDate,s,e))return;
  const v=Number(x.amount||0);pend+=v;nPend++;
  if(!x.dueDate)sem+=v;
  else if(x.dueDate<today){venc+=v;nVenc++;}
  else avencer+=v;
 });
 return {pend:r2(pend),venc:r2(venc),avencer:r2(avencer),sem:r2(sem),nPend,nVenc};
}

// ---------- gráficos (SVG) ----------
function niceStep(range,div){
 const raw=range/div,p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p;
 return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p;
}
function barChart(items,label){
 const vals=items.map(i=>i.value);
 let max=Math.max(0,...vals),min=Math.min(0,...vals);if(max===0&&min===0)max=1;
 const step=niceStep(max-min,4),top=Math.ceil(max/step-1e-9)*step,bot=Math.floor(min/step+1e-9)*step;
 const W=720,H=300,L=76,R=14,T=28,B=42,pw=W-L-R,ph=H-T-B,y=v=>T+ph-((v-bot)/(top-bot))*ph;
 let g='';const n=Math.round((top-bot)/step);
 for(let i=0;i<=n;i++){
  let v=bot+i*step;if(Math.abs(v)<step/1e6)v=0;const yy=y(v);
  g+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="${v===0?'#c9d1de':'#e9edf4'}" ${v===0?'':'stroke-dasharray="4 5"'}/><text x="${L-10}" y="${yy+4}" text-anchor="end" fill="#8290a5" font-size="11">${v===0?'R$ 0':esc(fmtAxis(v))}</text>`;
 }
 const slot=pw/items.length,bw=Math.min(slot*.62,110),showVal=items.length<=6;let bars='';
 items.forEach((it,i)=>{
  const cx=L+slot*i+slot/2,y0=y(0),y1=y(it.value),yt=Math.min(y0,y1),h=Math.max(Math.abs(y1-y0),it.value?2:0);
  const col=it.value<0&&it.negColor?it.negColor:it.color;
  bars+=`<rect x="${cx-bw/2}" y="${yt}" width="${bw}" height="${h}" rx="7" fill="${col}" opacity=".93"><title>${esc(it.label)}: ${esc(signed(it.value))}</title></rect>`;
  if(showVal)bars+=`<text x="${cx}" y="${it.value>=0?yt-7:yt+h+15}" text-anchor="middle" fill="#253249" font-size="11" font-weight="700">${esc(signed(it.value))}</text>`;
  const lab=String(it.label),sp=[...lab].map((c,k)=>c===' '?k:-1).filter(k=>k>=0).sort((a,b)=>Math.abs(a-lab.length/2)-Math.abs(b-lab.length/2))[0];
  if(items.length<=6&&lab.length>16&&sp!==undefined)bars+=`<text text-anchor="middle" fill="#74839a" font-size="12"><tspan x="${cx}" y="${H-28}">${esc(lab.slice(0,sp))}</tspan><tspan x="${cx}" y="${H-14}">${esc(lab.slice(sp+1))}</tspan></text>`;
  else bars+=`<text x="${cx}" y="${H-15}" text-anchor="middle" fill="#74839a" font-size="${items.length>6?10:12}">${esc(it.label)}</text>`;
 });
 return `<svg class="fin-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}${bars}</svg>`;
}

// ---------- renderização ----------
function period(){return {s:$('finDe').value,e:$('finAte').value};}
function setPreset(p){
 const n=new Date();let s='',e='';
 if(p==='mes'){const r=monthRange(0);s=r[0];e=r[1];}
 else if(p==='anterior'){const r=monthRange(-1);s=r[0];e=r[1];}
 else if(p==='3m'){s=monthRange(-2)[0];e=monthRange(0)[1];}
 else if(p==='ano'){s=`${n.getFullYear()}-01-01`;e=`${n.getFullYear()}-12-31`;}
 else if(p==='tudo'){s='';e='';}
 else return;
 $('finDe').value=s;$('finAte').value=e;
}
function setMoney(idv,v,tone){
 const el=$(idv);if(!el)return;el.textContent=signed(v);el.classList.remove('fin-pos','fin-neg');
 if(tone==='sign'&&v!==0)el.classList.add(v>0?'fin-pos':'fin-neg');
}
function syncCats(){
 const cs=cats(),sig=cs.join('|');if(sig===catSig)return;catSig=sig;
 const cur=$('finCat').value,curF=$('finFiltroCat').value;
 $('finCat').innerHTML=cs.map(c=>`<option>${esc(c)}</option>`).join('');
 $('finFiltroCat').innerHTML='<option value="">Todas as categorias</option>'+cs.map(c=>`<option>${esc(c)}</option>`).join('');
 if(cs.includes(cur))$('finCat').value=cur;
 if(cs.includes(curF))$('finFiltroCat').value=curF;
 catHint();renderItems();
}
function catHint(){$('finCatHint').textContent='Exemplos: '+hintOf($('finCat').value);}

function renderSummary(){
 const {s,e}=period(),c=calc(s,e),ab=abertas(s,e),abGeral=abertas();
 $('finPeriodoDesc').textContent=`${s?dayText(s):'Desde o início'} até ${e?dayText(e):'sem limite'} · pagamentos pela data do pagamento; lista pela data do lançamento. O cartão Despesas pendentes considera o vencimento no período; o cartão Vencidas continua mostrando todos os atrasos.`;
 setMoney('finDesp',c.desp);
 setMoney('finPagas',c.pagas);setMoney('finPend',ab.pend);setMoney('finVenc2',abGeral.venc);
 $('finDespNota').textContent=`${c.qtd} pagamento(s) efetuado(s)${c.fab>0?' · inclui '+money(c.fab)+' pagos à fábrica':''}`;

 $('finPendNota').textContent=ab.nPend?`${ab.nPend} em aberto${(s||e)?' com vencimento no período':''} · vencidas ${money(ab.venc)} · a vencer ${money(ab.avencer)}${ab.sem>0?' · sem vencimento '+money(ab.sem):''}`:((s||e)?'Nenhuma despesa em aberto com vencimento no período':'Nenhuma despesa em aberto');
 $('finVencNota').textContent=abGeral.venc>0?`${abGeral.nVenc} não paga(s) com vencimento anterior a hoje, de qualquer mês`:'Nenhuma conta vencida';
 // composição das despesas
 const rows=Object.entries(c.byCat).sort((a,b)=>b[1]-a[1]),tot=rows.reduce((n,x)=>n+x[1],0);
 let acc=0;const stops=rows.map(([k,v])=>{const a=acc/tot*100;acc+=v;return `${colorOf(k)} ${a}% ${acc/tot*100}%`;});
 $('finDonut').style.background=tot?`conic-gradient(${stops.join(',')})`:'#e8edf5';
 $('finDonutTotal').textContent=money(tot);
 $('finLegenda').innerHTML=rows.length?rows.map(([k,v])=>`<li><span class="fin-dot" style="background:${colorOf(k)}"></span><span class="fin-nm">${esc(k)}</span><b>${money(v)}</b><small>${pct(v/tot*100,0)}</small></li>`).join(''):'<li class="fin-empty">Nenhuma despesa neste período.</li>';
}
function renderYear(){
 const items=[];
 for(let i=11;i>=0;i--){
  const [s,e]=monthRange(-i),c=calc(s,e),d=new Date(s+'T12:00:00');
  items.push({label:`${MES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,value:c.desp,color:'#e89b3b'});
 }
 $('finChartAno').innerHTML=barChart(items,'Despesas pagas por mês nos últimos 12 meses');
 const total=r2(items.reduce((n,x)=>n+x.value,0));$('finAnoTotal').textContent=`Total em 12 meses: ${signed(total)}`;
}
function renderGoalAndCompare(){
 const [cs,ce]=monthRange(0),[ps,pe]=monthRange(-1),cur=calc(cs,ce),prev=calc(ps,pe);
 // comparativo
 const var_=(a,b,badUp)=>{
  if(!b)return '<span class="fin-muted">—</span>';
  const p=(a-b)/Math.abs(b)*100,good=badUp?p<=0:p>=0;
  return `<span class="${p===0?'fin-muted':good?'fin-pos':'fin-neg'}">${p>0?'▲':p<0?'▼':''} ${pct(Math.abs(p))}</span>`;
 };
 const line=(n,a,b,badUp)=>`<tr><td>${n}</td><td>${signed(a)}</td><td>${signed(b)}</td><td>${var_(a,b,badUp)}</td></tr>`;
 $('finComparativo').innerHTML=line('Total de pagamentos',cur.desp,prev.desp,true)+line('Pagos à fábrica',cur.fab,prev.fab,true);
 // previsão
 const past=[-1,-2,-3].map(o=>calc(...monthRange(o)).desp).filter(v=>v>0),avg=past.length?r2(past.reduce((a,b)=>a+b,0)/past.length):0;
 const hoje=todayISO(),lim=localDateKey(new Date(Date.now()+30*864e5)),abr=list().filter(x=>x.status!=='pago'&&x.dueDate);
 const sumV=a=>r2(a.reduce((n,x)=>n+Number(x.amount||0),0));
 const vencidas=sumV(abr.filter(x=>x.dueDate<hoje)),prox=sumV(abr.filter(x=>x.dueDate>=hoje&&x.dueDate<=lim));
 $('finPrevisao').innerHTML=`<div><span>Média mensal de despesas (até 3 meses anteriores)</span><strong>${money(avg)}</strong></div><div><span>Já vencidas e não pagas (em atraso)</span><strong>${money(vencidas)}</strong></div><div><span>A vencer nos próximos 30 dias (de hoje até ${dayText(lim)})</span><strong>${money(prox)}</strong></div>`;
}
function filtered(){
 const {s,e}=period(),cat=$('finFiltroCat').value,forma=$('finFiltroForma').value,st=$('finFiltroStatus').value,q=fold($('finBusca').value.trim()),today=todayISO();
 return list().filter(x=>{
  const sit=statusOf(x,today);
  // "Vencidas" mostra todas as não pagas com vencimento passado, de qualquer mês; os demais filtros usam a data do lançamento.
  if(st!=='vencida'&&!inR(x.date,s,e))return false;
  if(cat&&x.category!==cat)return false;
  if(forma&&!payList(x).some(p=>p.method===forma))return false;
  if(st==='pago'&&sit!=='pago')return false;
  if(st==='pendente'&&sit==='pago')return false;
  if(st==='vencida'&&sit!=='vencida')return false;
  if(q&&!fold([x.description,x.category,payList(x).map(p=>formaTxt(p)+' '+accLabel(p.account)).join(' '),x.note].join(' ')).includes(q))return false;
  return true;
 }).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
function payCell(x){
 const ps=payList(x),multi=ps.length>1;
 if(!multi){const p=ps[0];return esc(formaTxt(p)||accLabel(p.account)||'—')+(formaTxt(p)&&p.account?`<small class="fin-sub">${esc(accLabel(p.account))}</small>`:'');}
 return ps.map(p=>`<div>${esc(formaTxt(p)||accLabel(p.account)||'—')} <b>${money(p.amount)}</b>${formaTxt(p)&&p.account?`<small class="fin-sub">${esc(accLabel(p.account))}</small>`:''}</div>`).join('');
}
function renderList(){
 const rows=filtered(),today=todayISO(),total=r2(rows.reduce((n,x)=>n+Number(x.amount||0),0));
 $('finLista').innerHTML=rows.map(x=>{
  const sit=statusOf(x,today),pill=sit==='pago'?`<span class="pill pago">Pago${x.paidDate?' em '+dayText(x.paidDate):''}</span>`:sit==='vencida'?'<span class="pill vencida">Vencida</span>':'<span class="pill pendente">Pendente</span>';
  return `<tr><td>${dayText(x.date)}</td><td><span class="fin-dot" style="background:${colorOf(x.category)}"></span>${esc(x.category||'Outras')}</td><td><span class="product-name">${esc(x.description)}</span>${x.recurring?' <small class="fin-muted">↻ recorrente</small>':''}${x.forecast?' <small class="fin-muted">(PREVISÃO, não é dívida)</small>':''}${x.note?`<small class="fin-sub">${esc(x.note)}</small>`:''}</td><td>${payCell(x)}</td><td>${dayText(x.dueDate)}</td><td>${pill}</td><td><b>${money(x.amount)}</b></td><td class="fin-actions">${x.status==='pago'?'':`<button type="button" class="row-action" data-fin="pay" data-id="${esc(x.id)}">Pagar</button>`}<button type="button" class="row-action" data-fin="edit" data-id="${esc(x.id)}">Editar</button><button type="button" class="row-action" data-fin="repeat" data-id="${esc(x.id)}" title="Lançar de novo no mês seguinte">Repetir</button><button type="button" class="row-action delete" data-fin="del" data-id="${esc(x.id)}">Excluir</button></td></tr>`;
 }).join('');
 $('finVazio').style.display=rows.length?'none':'block';
 $('finListaTotal').textContent=`${rows.length} lançamento(s) · total ${money(total)} · `+($('finFiltroStatus').value==='vencida'?'vencidas em aberto de qualquer mês (sem filtro de período)':'período pela data do lançamento');
}
// contador no menu e alerta na Visão geral (rodam sempre)
function updateBadges(){
 const pend=list().filter(x=>x.status!=='pago'),today=todayISO(),venc=pend.filter(x=>x.dueDate&&x.dueDate<today);
 const b=$('menuDespesasPend');if(b)b.textContent=pend.length;
 const al=$('despAlerta');
 if(al){
  const show=venc.length>0&&hasFullAccess();al.hidden=!show;
  if(show)$('despAlertaTexto').textContent=`${venc.length} despesa(s) vencida(s) somando ${money(venc.reduce((n,x)=>n+Number(x.amount||0),0))}.`;
 }
}
function render(){
 catalog();updateBadges();
 const panel=$('panel-financeiro');if(!panel||!panel.classList.contains('active'))return;
 syncCats();renderSummary();renderYear();renderGoalAndCompare();renderList();
}

// ---------- formulário ----------
function syncForm(){
 $('finPagoBox').hidden=$('finStatus').value!=='pago';
 $('finRepeteBox').hidden=!($('finTipo').value==='rec'&&!editId);
 if(!$('finPagoBox').hidden&&!$('finPago').value)$('finPago').value=$('finData').value||todayISO();
 syncComp();
}
// ----- Descrição = item do catálogo (filtrado pela categoria) -----
function renderItems(selectId){
 const ct=$('finCat').value,cur=selectId!==undefined?selectId:$('finItem').value;
 const items=catalog().filter(i=>i.category===ct&&(i.active!==false||i.id===cur)).sort(byNamePt);
 let h='<option value="">Escolha o item…</option>'+items.map(i=>`<option value="${esc(i.id)}">${esc(i.name)}${i.active===false?' (inativo)':''}</option>`).join('');
 if(legacyText)h+=`<option value="__legacy">Texto livre (lançamento antigo): ${esc(legacyText)}</option>`;
 $('finItem').innerHTML=h;
 $('finItem').value=[...$('finItem').options].some(o=>o.value===cur)?cur:'';
}
const selectedItem=()=>{const v=$('finItem').value;return v&&v!=='__legacy'?itemById(v):null;};
// Mês de competência padrão do item: mês anterior ao pagamento ('ant') ou o próprio mês do pagamento ('pag').
function formBase(){return ($('finStatus').value==='pago'?($('finPago').value||$('finData').value):$('finData').value)||todayISO();}
function compDefault(it){
 if(!it||(it.comp!=='ant'&&it.comp!=='pag'))return '';
 const b=formBase();return (it.comp==='ant'?addMonths(b,-1):b).slice(0,7);
}
function syncComp(){
 const it=selectedItem(),def=compDefault(it);
 if(!compManual)$('finComp').value=def;
 $('finCompHint').textContent=it?(it.comp==='ant'?'Padrão deste item: mês anterior ao pagamento.':'Padrão deste item: mês do pagamento.')+(compManual&&def&&$('finComp').value!==def?' (alterado por você)':''):'Sem item do catálogo: a DRE decide a competência sozinha.';
}
function resetForm(){
 editId=null;$('finForm').reset();$('finData').value=todayISO();$('finPago').value='';
 $('finFormTitulo').textContent='Nova despesa';$('finSalvar').textContent='Salvar despesa';$('finFormBadge').textContent='LANÇAMENTO';
 legacyText='';compManual=false;$('finComp').value='';renderItems('');
 setPays(null);syncForm();catHint();
}
function openForm(){const c=$('finFormCard');c.style.display='';c.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>$('finItem').focus({preventScroll:true}),250);}
function closeForm(){$('finFormCard').style.display='none';resetForm();}
function fillForm(x){
 editId=x.id;syncCats();
 $('finData').value=x.date||todayISO();const it0=itemById(x.itemId);$('finCat').value=it0?it0.category:(x.category||'Outras');$('finDesc').value=x.description||'';legacyText=it0?'':(x.description||'');
 $('finValor').value=Number(x.amount||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 setPays(payList(x).map(p=>({...p})));$('finStatus').value=x.status||'pendente';$('finVenc').value=x.dueDate||'';$('finPago').value=x.paidDate||'';
 $('finTipo').value=x.recurring?'rec':'avulsa';$('finObs').value=x.note||'';
 $('finFormTitulo').textContent='Editar despesa';$('finSalvar').textContent='Salvar alterações';$('finFormBadge').textContent='EDIÇÃO';
 renderItems(it0?it0.id:'__legacy');
 {const def=compDefault(it0);$('finComp').value=x.compMonth||'';compManual=(!!x.compMonth&&x.compMonth!==def)||(!x.compMonth&&!!x.dreComp);}
 syncForm();catHint();openForm();
}
function denied(){if(hasFullAccess())return false;toast('Seu perfil não tem permissão para alterar despesas.',true);return true;}

function save(ev){
 ev.preventDefault();if(denied())return;
 const amount=r2(parseMoneyInput($('finValor').value));
 const it=selectedItem(),selV=$('finItem').value,desc=it?it.name:(selV==='__legacy'?legacyText:'');
 if(!desc){toast('Escolha o item da despesa (use “＋ Novo item” se ele ainda não existe).',true);$('finItem').focus();return;}
 const compMonth=/^\d{4}-\d{2}$/.test($('finComp').value)?$('finComp').value:'';
 if(!(amount>0)){toast('Informe o valor da despesa.',true);$('finValor').focus();return;}
 const date=$('finData').value||todayISO(),status=$('finStatus').value;
 let pays=readPays();
 // Não permita quitar despesas novas sem uma origem financeira explícita.
 // Contas externas de despesas históricas já pagas são preservadas em edições,
 // sem migração para o Conceito Caixa (evita alterar saldos conciliados).
 if(status==='pago'){
  const antigo=editId?list().find(x=>x.id===editId):null;
  const origensAntigas=antigo&&antigo.status==='pago'?payList(antigo).map(p=>p.account):[];
  for(const p of pays){
   if(!p.account){toast('Selecione a conta de origem antes de marcar a despesa como paga.',true);return;}
   if(!CAIXA.some(a=>a[0]===p.account)&&!origensAntigas.includes(p.account)){
    toast('Para novos pagamentos, selecione uma conta do Conceito Caixa. Contas externas antigas são preservadas apenas no histórico.',true);return;
   }
  }
 }

 if(pays.length===1)pays[0].amount=amount;
 else{
  const blank=pays.filter(p=>!(p.amount>0));
  if(blank.length===1)blank[0].amount=r2(amount-pays.reduce((n,p)=>n+p.amount,0));   // uma linha vazia recebe o que falta
  if(pays.some(p=>!(p.amount>0))){toast('Informe o valor de cada conta.',true);return;}
  const soma=r2(pays.reduce((n,p)=>n+p.amount,0));
  if(Math.abs(soma-amount)>0.004){toast(`A soma dos valores por conta (${money(soma)}) precisa ser igual ao valor da despesa (${money(amount)}).`,true);return;}
 }
 const rec={forecast:false,date,category:$('finCat').value||'Outras',description:desc,itemId:it?it.id:'',compMonth,amount,payments:pays,method:[...new Set(pays.map(p=>p.method))].join(' + '),account:pays.length===1?pays[0].account:'',status,
  dueDate:$('finVenc').value||'',paidDate:status==='pago'?($('finPago').value||date):'',recurring:$('finTipo').value==='rec',note:$('finObs').value.trim()};
 const now=new Date().toISOString();let msg='Despesa salva.';
 if(editId){
  const x=list().find(i=>i.id===editId);if(!x){toast('Despesa não encontrada.',true);return;}
  Object.assign(x,rec,{updatedAt:now});msg='Despesa atualizada.';
 }else{
  const group=rec.recurring?id():'';
  list().push({id:id(),...rec,group,createdAt:now});
  const n=0; // recorrência vira modelo mensal: não criar 12/24 dívidas futuras
  for(let i=1;i<=n;i++)list().push({id:id(),...rec,date:addMonths(date,i),dueDate:rec.dueDate?addMonths(rec.dueDate,i):'',status:'pendente',paidDate:'',compMonth:rec.compMonth?addMonths(rec.compMonth+'-01',i).slice(0,7):'',group,createdAt:now});
  if(n)msg=`Despesa salva e repetida por mais ${n} mês(es) como pendente.`;
 }
 if(saveData()){toast(msg);if(editId)closeForm();else resetForm();}
}
function onListClick(ev){
 const b=ev.target.closest('[data-fin]');if(!b||denied())return;
 const x=list().find(i=>i.id===b.dataset.id);if(!x)return;
 const act=b.dataset.fin;
 if(act==='edit'){fillForm(x);return;}
 if(act==='pay'){
  // Abrir o formulário, sem quitar automaticamente: a conta deve ser escolhida
  // conscientemente no momento de registrar a saída.
  fillForm(x);
  $('finStatus').value='pago';
  $('finPago').value=todayISO();
  document.querySelectorAll('#finPagtos .pg-c').forEach(sel=>{sel.value='';});
  syncForm();
  toast('Escolha a conta de origem e clique em Salvar alterações para confirmar o pagamento.');
  return;
 }
 if(act==='repeat'){
  const next=addMonths(x.date,1),nextDue=x.dueDate?addMonths(x.dueDate,1):next;
  if(list().some(y=>y.id!==x.id&&String(y.description||'').trim().toLowerCase()===String(x.description||'').trim().toLowerCase()&&(y.dueDate||y.date||'').slice(0,7)===next.slice(0,7))){toast('Já existe uma despesa equivalente nesse mês. Não foi gerada duplicidade.',true);return;}
  if(!confirm('Criar somente uma despesa do mês seguinte? As demais serão sugeridas no planejamento mensal.'))return;
  const c={...x,id:id(),date:next,dueDate:nextDue,status:'pendente',paidDate:'',compMonth:x.compMonth?addMonths(x.compMonth+'-01',1).slice(0,7):'',recurring:true,createdAt:new Date().toISOString()};
  x.recurring=true;list().push(c);if(saveData())toast(`Lançada de novo em ${dayText(c.date)} (pendente).`);return;
 }
 if(act==='del'){
  if(!confirm(`Excluir a despesa "${x.description}" de ${money(x.amount)}?`))return;
  data.expenses=list().filter(i=>i.id!==x.id);if(saveData()){if(editId===x.id)closeForm();toast('Despesa excluída.');}
 }
}
function exportCsv(){
 const rows=filtered(),cell=v=>{const s=String(v??'');return /[";\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;},today=todayISO();
 const head=['Lançamento','Categoria','Descrição','Forma de pagamento','Conta de origem','Vencimento','Pagamento','Situação','Valor (R$)','Recorrente','Observação'];
 const lines=[head.join(';')].concat(rows.map(x=>[dayText(x.date),x.category,x.description,payList(x).map(p=>formaTxt(p)+(payList(x).length>1?(formaTxt(p)?' ':'')+money(p.amount):'')).join(' + '),payList(x).map(p=>accLabel(p.account)||'—').join(' + '),x.dueDate?dayText(x.dueDate):'',x.paidDate?dayText(x.paidDate):'',statusOf(x,today),Number(x.amount||0).toFixed(2).replace('.',','),x.recurring?'Sim':'Não',x.note].map(cell).join(';')));
 const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
 a.href=URL.createObjectURL(blob);a.download=`despesas-${todayISO()}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 toast('Planilha de despesas exportada.');
}

// ---------- gerenciar itens do catálogo ----------
function closeItems(){const m=document.getElementById('finItemsModal');if(m)m.remove();document.removeEventListener('keydown',itemsEsc);}
function itemsEsc(ev){if(ev.key==='Escape')closeItems();}
const dupItem=(name,category,exceptId)=>catalog().some(i=>i.id!==exceptId&&i.category===category&&fold(i.name)===fold(name));
function lineOptions(sel){
 const L=window.ckrDreLines||[],G=window.ckrDreGroups||[];
 return '<option value="">Escolha a linha da DRE…</option>'+G.map(([g,n])=>`<optgroup label="${esc(n)}">${L.filter(l=>l[2]===g).map(l=>`<option value="${l[0]}"${l[0]===sel?' selected':''}>${esc(l[1])}</option>`).join('')}</optgroup>`).join('');
}
function openItems(fromForm){
 if(denied())return;
 if(!(window.ckrDreLines&&window.ckrDreLines.length)){toast('A DRE não carregou: recarregue a página e tente de novo.',true);return;}
 closeItems();
 const S='padding:8px 10px;border:1px solid #d9dfe9;border-radius:8px;font:inherit;font-size:13px;min-height:40px;box-sizing:border-box';
 const m=document.createElement('div');m.id='finItemsModal';m.className='users-modal';m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');
 m.innerHTML=`<div class="users-card" style="width:min(100%,920px)">
  <div class="users-heading"><div><p class="auth-eyebrow">DESPESAS</p><h2>Itens do catálogo</h2><p>Cada item define a linha da DRE e a competência padrão. Renomear não quebra o histórico; item sem uso é desativado, não apagado.</p></div><button type="button" class="users-close" data-it-close aria-label="Fechar">×</button></div>
  <div id="finItCriar" style="margin-top:14px;padding:12px;border:1px solid #e6eaf1;border-radius:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
   <label style="flex:1 1 180px;display:grid;gap:4px;font-size:12px;font-weight:700;color:#536178">Nome do item<input id="finItNome" maxlength="60" placeholder="Ex.: Salário Maria" style="${S};width:100%"></label>
   <label style="flex:1 1 140px;display:grid;gap:4px;font-size:12px;font-weight:700;color:#536178">Categoria<select id="finItCat" style="${S};width:100%">${cats().map(c=>`<option>${esc(c)}</option>`).join('')}</select></label>
   <label style="flex:1 1 220px;display:grid;gap:4px;font-size:12px;font-weight:700;color:#536178">Linha da DRE (obrigatória)<select id="finItLinha" style="${S};width:100%">${lineOptions('')}</select></label>
   <label style="flex:1 1 150px;display:grid;gap:4px;font-size:12px;font-weight:700;color:#536178">Competência padrão<select id="finItComp" style="${S};width:100%"><option value="pag">Mês do pagamento</option><option value="ant">Mês anterior</option></select></label>
   <button type="button" class="button button-primary" id="finItSalvar">＋ Criar item</button>
  </div>
  <p id="finItErro" class="auth-error" role="alert"></p>
  <div id="finItLista"></div></div>`;
 document.body.appendChild(m);
 const q=id=>m.querySelector('#'+id);
 if($('finCat').value)q('finItCat').value=$('finCat').value;
 function draw(){
  const all=catalog(),cs=cats().filter(c=>all.some(i=>i.category===c));
  q('finItLista').innerHTML=cs.map(c=>`<h4 style="margin:16px 0 4px;font-size:13px">${esc(c)}</h4>`+all.filter(i=>i.category===c).sort(byNamePt).map(i=>`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:7px 0;border-bottom:1px solid #f0f2f6${i.active===false?';opacity:.55':''}"><input data-it="${esc(i.id)}" data-f="name" value="${esc(i.name)}" maxlength="60" style="${S};flex:1 1 200px;min-width:0"><select data-it="${esc(i.id)}" data-f="line" style="${S};flex:1 1 200px;min-width:0">${lineOptions(i.line)}</select><select data-it="${esc(i.id)}" data-f="comp" style="${S};flex:0 1 160px"><option value="pag"${i.comp!=='ant'?' selected':''}>Mês do pagamento</option><option value="ant"${i.comp==='ant'?' selected':''}>Mês anterior</option></select><label style="display:flex;gap:5px;align-items:center;font-size:12px;white-space:nowrap"><input type="checkbox" data-it="${esc(i.id)}" data-f="active"${i.active!==false?' checked':''} style="width:18px;min-height:0;height:18px"> Ativo</label></div>`).join('')).join('');
 }
 draw();
 m.addEventListener('click',ev=>{if(ev.target===m||ev.target.closest('[data-it-close]'))closeItems();});
 m.addEventListener('change',ev=>{
  const el=ev.target,it=itemById(el.dataset.it),f=el.dataset.f;if(!it||!f)return;
  if(denied()){draw();return;}
  if(f==='name'){
   const n=el.value.trim().slice(0,60);
   if(!n){toast('O nome não pode ficar vazio.',true);draw();return;}
   if(dupItem(n,it.category,it.id)){toast('Já existe um item com esse nome nesta categoria.',true);draw();return;}
   if(n!==it.name){it.name=n;list().forEach(x=>{if(x.itemId===it.id)x.description=n;});}   // o histórico acompanha o novo nome
  }else if(f==='line'){
   if(!el.value){toast('Escolha a linha da DRE do item.',true);draw();return;}
   it.line=el.value;
  }else if(f==='comp')it.comp=el.value==='ant'?'ant':'pag';
  else if(f==='active')it.active=el.checked;
  if(saveData()){toast('Item atualizado.');if(m.isConnected)draw();}
 });
 q('finItSalvar').addEventListener('click',()=>{
  if(denied())return;
  const err=t=>{q('finItErro').textContent=t;},name=q('finItNome').value.trim(),category=q('finItCat').value,line=q('finItLinha').value,comp=q('finItComp').value==='ant'?'ant':'pag';
  err('');
  if(!name)return err('Informe o nome do item.');
  if(!category)return err('Escolha a categoria.');
  if(!line)return err('Escolha a linha da DRE: é ela que decide onde a despesa aparece.');
  if(dupItem(name,category,''))return err('Já existe um item com esse nome nesta categoria.');
  const it={id:'it_'+id().replace(/-/g,'').slice(0,12),name,category,line,comp,active:true,createdAt:new Date().toISOString()};
  catalog().push(it);
  if(saveData()){
   toast('Item criado no catálogo.');
   if(fromForm){closeItems();$('finCat').value=category;renderItems(it.id);compManual=false;syncComp();$('finValor').focus();return;}
   q('finItNome').value='';q('finItLinha').value='';draw();
  }
 });
 document.addEventListener('keydown',itemsEsc);
 setTimeout(()=>q('finItNome').focus(),50);
}

// ---------- ligações ----------
function init(){
 if(!$('panel-financeiro'))return;
  $('finFiltroForma').innerHTML='<option value="">Todas as formas</option>'+METHODS.map(m=>`<option>${esc(m)}</option>`).join('');
 bindMoneyMask($('finValor'));
 setPreset('mes');resetForm();
 $('finPreset').addEventListener('change',()=>{setPreset($('finPreset').value);render();});
 ['finDe','finAte'].forEach(k=>$(k).addEventListener('change',()=>{$('finPreset').value='custom';render();}));
 ['finFiltroCat','finFiltroForma','finFiltroStatus'].forEach(k=>$(k).addEventListener('change',renderList));
 $('finBusca').addEventListener('input',renderList);
 $('finNovo').addEventListener('click',()=>{if(denied())return;resetForm();openForm();});
 $('finCancelar').addEventListener('click',closeForm);
 $('finAddPag').addEventListener('click',onAddPay);$('finPagtos').addEventListener('click',onPagClick);$('finPagtos').addEventListener('input',paySum);$('finValor').addEventListener('input',paySum);
 $('finForm').addEventListener('submit',save);$('finNovaConta').style.display='none';
 $('finStatus').addEventListener('change',syncForm);$('finTipo').addEventListener('change',syncForm);
 $('finData').addEventListener('change',syncForm);
 $('finCat').addEventListener('change',()=>{catHint();renderItems();compManual=false;syncComp();});
 $('finItem').addEventListener('change',()=>{compManual=false;syncComp();});
 $('finComp').addEventListener('input',()=>{compManual=true;syncComp();});
 $('finPago').addEventListener('change',syncComp);
 $('finNovoItem').addEventListener('click',()=>openItems(true));
 $('finGerItens').addEventListener('click',()=>openItems(false));
 $('finNovaCat').addEventListener('click',()=>{
  if(denied())return;
  const n=(prompt('Nome da nova categoria:')||'').trim().slice(0,30);if(!n)return;
  const ex=cats().find(c=>fold(c)===fold(n));
  if(ex){$('finCat').value=ex;catHint();return;}
  cfg().expenseCats=[...(cfg().expenseCats||[]),n];
  if(saveData()){syncCats();$('finCat').value=n;catHint();toast('Categoria criada.');}
 });
 $('finLista').addEventListener('click',onListClick);
 $('finCsv').addEventListener('click',exportCsv);
}
init();

// Atualiza junto com o resto do sistema e ao abrir o painel.
const baseRender=window.renderAll;
window.renderAll=function(){baseRender();render();};
const baseGoTo=window.goTo;
window.goTo=function(name){baseGoTo.apply(this,arguments);if(name==='financeiro')render();};
window.ckrAccountOptions=accountOptions;   // usado por Pedidos à fábrica (conta de origem do pagamento)
// Usado pelo extrato do Caixa: abre a despesa para edição.
window.ckrDespesaEdit=function(eid){if(denied())return;const x=list().find(i=>i.id===eid);if(!x){toast('Despesa não encontrada.',true);return;}fillForm(x);};
render();
})();
