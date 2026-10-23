'use strict';
// Conceito: Despesas, lucro líquido, gráficos financeiros, previsão de gastos.
// Usa as funções e dados do app.js (data, money, saveData, localDateKey, shortMoney, ...).
// Lucro líquido = lucro bruto das vendas (já com custo PEPS e taxas de cartão/crédito) − despesas.
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
const METHODS=['Dinheiro','Pix','Cartão de débito','Cartão de crédito','Boleto','Transferência','Débito automático','Outro'];
const DEFAULT_ACCOUNTS=[
 ['Nubank',['Poupança','Jurídica']],
 ['Itaú',['Poupança CA*','Poupança CA','Poupança CE','Poupança AN']]
];
const SEP=' — ';
// Contas do Conceito caixa (value 'caixa:<chave>'): despesa PAGA com uma delas sai do saldo da conta.
const CAIXA=[['caixa:blu','Caixa BLU'],['caixa:nubank','Caixa NUBANK'],['caixa:dinheiro','Dinheiro CAIXA'],['caixa:agenda','Caixa AGENDA BLU']];
const isCaixa=a=>String(a||'').indexOf('caixa:')===0;
const PALETTE=['#3468f5','#1b9b6b','#e89b3b','#8c6be8','#d74b55','#14a3b8','#c2569e','#7a8699','#9bb23a','#e5733d'];
const MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const list=()=>data.expenses||(data.expenses=[]);
const cfg=()=>data.settings||(data.settings={});
let editId=null,catSig='';

// ---------- utilidades ----------
function cats(){
 const base=DEFAULT_CATS.map(c=>c[0]),extra=cfg().expenseCats||[],used=list().map(e=>e.category).filter(Boolean);
 return [...new Set([...base,...extra,...used])];
}
// ---------- contas de origem do dinheiro ----------
function accountList(){
 const map=new Map();
 DEFAULT_ACCOUNTS.forEach(([b,cs])=>map.set(b,[...cs]));
 const add=v=>{const i=String(v||'').indexOf(SEP);if(i<1)return;const b=v.slice(0,i),c=v.slice(i+SEP.length);if(!map.has(b))map.set(b,[]);if(!map.get(b).includes(c))map.get(b).push(c);};
 (cfg().expenseAccounts||[]).forEach(add);list().forEach(x=>add(x.account));
 return map;
}
function syncAccounts(){
 const sel=$('finConta'),cur=sel.value;
 sel.innerHTML='<option value="">Não informar</option><optgroup label="Conceito caixa (desconta do saldo)">'+CAIXA.map(([v,n])=>`<option value="${v}">${esc(n)}</option>`).join('')+'</optgroup>'+[...accountList()].map(([b,cs])=>`<optgroup label="${esc(b)}">${cs.map(c=>`<option value="${esc(b+SEP+c)}">${esc(b)}: ${esc(c)}</option>`).join('')}</optgroup>`).join('');
 if([...sel.options].some(o=>o.value===cur))sel.value=cur;
}
function newAccount(){
 if(denied())return;
 const v=(prompt('Nova conta. Escreva Banco: Conta\nEx.: Inter: Jurídica')||'').trim();if(!v)return;
 const i=v.indexOf(':');if(i<1||!v.slice(i+1).trim()){toast('Use o formato Banco: Conta (ex.: Inter: Jurídica).',true);return;}
 const val=v.slice(0,i).trim()+SEP+v.slice(i+1).trim();
 const ex=cfg().expenseAccounts||(cfg().expenseAccounts=[]);
 if(!ex.includes(val))ex.push(val);
 syncAccounts();$('finConta').value=val;saveData();
}
const accLabel=a=>isCaixa(a)?((CAIXA.find(c=>c[0]===a)||[])[1]||a):(a?a.replace(SEP,': '):'');
const hintOf=c=>(DEFAULT_CATS.find(x=>x[0]===c)||[])[1]||'Categoria criada por você.';
const colorOf=c=>PALETTE[Math.max(0,cats().indexOf(c))%PALETTE.length];
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
 let vendas=0,bruto=0,rec=0,sem=0;const sales=new Set();
 data.movements.forEach(m=>{
  if(m.type!=='venda'||m.canceled||!inR(localDateKey(m.date),s,e))return;
  const t=Number(m.total||0);vendas+=t;sales.add(m.saleId||m.id);
  const p=profitOf(m);if(Number.isFinite(p)){bruto+=p;rec+=t;}else sem++;
 });
 let desp=0,pagas=0,pend=0,venc=0,qtd=0;const byCat={},today=todayISO();
 list().forEach(x=>{
  if(!inR(x.date,s,e))return;
  const v=Number(x.amount||0);desp+=v;qtd++;
  if(x.status==='pago')pagas+=v;else{pend+=v;if(x.dueDate&&x.dueDate<today)venc+=v;}
  const c=x.category||'Outras';byCat[c]=(byCat[c]||0)+v;
 });
 bruto=r2(bruto);desp=r2(desp);
 return {vendas:r2(vendas),bruto,rec:r2(rec),sem,vendasQtd:sales.size,desp,pagas:r2(pagas),pend:r2(pend),venc:r2(venc),qtd,byCat,
  liquido:r2(bruto-desp),liquidoPagas:r2(bruto-pagas),margem:rec>0?(bruto-desp)/rec*100:null,margemBruta:rec>0?bruto/rec*100:null};
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
  bars+=`<text x="${cx}" y="${H-15}" text-anchor="middle" fill="#74839a" font-size="${items.length>6?10:12}">${esc(it.label)}</text>`;
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
 catHint();
}
function catHint(){$('finCatHint').textContent='Exemplos: '+hintOf($('finCat').value);}

function renderSummary(){
 const {s,e}=period(),c=calc(s,e);
 $('finPeriodoDesc').textContent=`${s?dayText(s):'Desde o início'} até ${e?dayText(e):'hoje'} · valores de vendas e despesas dentro deste período.`;
 setMoney('finVendas',c.vendas);setMoney('finBruto',c.bruto);setMoney('finDesp',c.desp);setMoney('finLiquido',c.liquido,'sign');
 setMoney('finPagas',c.pagas);setMoney('finPend',c.pend);setMoney('finVenc2',c.venc);
 $('finVendasNota').textContent=`${c.vendasQtd} venda(s) registrada(s)`;
 $('finBrutoNota').textContent=(c.margemBruta==null?'Sem vendas com custo no período':`Margem bruta: ${pct(c.margemBruta)}`)+(c.sem?` · ${c.sem} item(ns) sem custo histórico fora do cálculo`:'');
 $('finDespNota').textContent=`${c.qtd} lançamento(s) · ${c.vendas>0?pct(c.desp/c.vendas*100)+' do faturamento':'sem vendas no período'}`;
 $('finLiquidoNota').textContent=`Se contar só as despesas pagas: ${signed(c.liquidoPagas)}`;
 const mg=$('finMargem');mg.textContent=c.margem==null?'—':pct(c.margem);mg.classList.remove('fin-pos','fin-neg');if(c.margem!=null&&c.margem!==0)mg.classList.add(c.margem>0?'fin-pos':'fin-neg');
 $('finVencNota').textContent=c.venc>0?'Pendentes com vencimento já passado':'Nenhuma conta vencida';
 // gráfico: resultado do período
 $('finChartResultado').innerHTML=barChart([
  {label:'Vendas',value:c.vendas,color:'#3468f5'},
  {label:'Lucro bruto',value:c.bruto,color:'#1b9b6b',negColor:'#d74b55'},
  {label:'Despesas',value:c.desp,color:'#e89b3b'},
  {label:'Lucro líquido',value:c.liquido,color:'#8c6be8',negColor:'#d74b55'}
 ],'Vendas, lucro bruto, despesas e lucro líquido do período');
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
  items.push({label:`${MES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,value:c.liquido,color:'#1b9b6b',negColor:'#d74b55'});
 }
 $('finChartAno').innerHTML=barChart(items,'Lucro líquido dos últimos 12 meses');
 const total=r2(items.reduce((n,x)=>n+x.value,0));$('finAnoTotal').textContent=`Acumulado: ${signed(total)}`;
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
 $('finComparativo').innerHTML=line('Vendas',cur.vendas,prev.vendas,false)+line('Lucro bruto',cur.bruto,prev.bruto,false)+line('Despesas',cur.desp,prev.desp,true)+line('Lucro líquido',cur.liquido,prev.liquido,false);
 // previsão
 const past=[-1,-2,-3].map(o=>calc(...monthRange(o)).desp).filter(v=>v>0),avg=past.length?r2(past.reduce((a,b)=>a+b,0)/past.length):0;
 const lim=localDateKey(new Date(Date.now()+30*864e5));
 const prox=r2(list().filter(x=>x.status!=='pago'&&x.dueDate&&x.dueDate<=lim).reduce((n,x)=>n+Number(x.amount||0),0));
 $('finPrevisao').innerHTML=`<div><span>Média mensal de despesas (até 3 meses anteriores)</span><strong>${money(avg)}</strong></div><div><span>A pagar nos próximos 30 dias (inclui vencidas)</span><strong>${money(prox)}</strong></div>`;
}
function filtered(){
 const {s,e}=period(),cat=$('finFiltroCat').value,forma=$('finFiltroForma').value,st=$('finFiltroStatus').value,q=fold($('finBusca').value.trim()),today=todayISO();
 return list().filter(x=>{
  if(!inR(x.date,s,e))return false;
  if(cat&&x.category!==cat)return false;
  if(forma&&x.method!==forma)return false;
  const sit=statusOf(x,today);
  if(st==='pago'&&sit!=='pago')return false;
  if(st==='pendente'&&sit==='pago')return false;
  if(st==='vencida'&&sit!=='vencida')return false;
  if(q&&!fold([x.description,x.category,x.method,x.account,x.note].join(' ')).includes(q))return false;
  return true;
 }).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
function renderList(){
 const rows=filtered(),today=todayISO(),total=r2(rows.reduce((n,x)=>n+Number(x.amount||0),0));
 $('finLista').innerHTML=rows.map(x=>{
  const sit=statusOf(x,today),pill=sit==='pago'?`<span class="pill pago">Pago${x.paidDate?' em '+dayText(x.paidDate):''}</span>`:sit==='vencida'?'<span class="pill vencida">Vencida</span>':'<span class="pill pendente">Pendente</span>';
  return `<tr><td>${dayText(x.date)}</td><td><span class="fin-dot" style="background:${colorOf(x.category)}"></span>${esc(x.category||'Outras')}</td><td><span class="product-name">${esc(x.description)}</span>${x.recurring?' <small class="fin-muted">↻ recorrente</small>':''}${x.note?`<small class="fin-sub">${esc(x.note)}</small>`:''}</td><td>${esc(x.method||'—')}${x.account?`<small class="fin-sub">${esc(accLabel(x.account))}</small>`:''}</td><td>${dayText(x.dueDate)}</td><td>${pill}</td><td><b>${money(x.amount)}</b></td><td class="fin-actions">${x.status==='pago'?'':`<button type="button" class="row-action" data-fin="pay" data-id="${esc(x.id)}">Pagar</button>`}<button type="button" class="row-action" data-fin="edit" data-id="${esc(x.id)}">Editar</button><button type="button" class="row-action" data-fin="repeat" data-id="${esc(x.id)}" title="Lançar de novo no mês seguinte">Repetir</button><button type="button" class="row-action delete" data-fin="del" data-id="${esc(x.id)}">Excluir</button></td></tr>`;
 }).join('');
 $('finVazio').style.display=rows.length?'none':'block';
 $('finListaTotal').textContent=`${rows.length} lançamento(s) · total ${money(total)}`;
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
 updateBadges();
 const panel=$('panel-financeiro');if(!panel||!panel.classList.contains('active'))return;
 syncCats();renderSummary();renderYear();renderGoalAndCompare();renderList();
}

// ---------- formulário ----------
function syncForm(){
 $('finPagoBox').hidden=$('finStatus').value!=='pago';
 $('finRepeteBox').hidden=!($('finTipo').value==='rec'&&!editId);
 if(!$('finPagoBox').hidden&&!$('finPago').value)$('finPago').value=$('finData').value||todayISO();
}
function resetForm(){
 editId=null;$('finForm').reset();$('finData').value=todayISO();$('finPago').value='';
 $('finFormTitulo').textContent='Nova despesa';$('finSalvar').textContent='Salvar despesa';$('finFormBadge').textContent='LANÇAMENTO';
 syncAccounts();syncForm();catHint();
}
function openForm(){const c=$('finFormCard');c.style.display='';c.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>$('finDesc').focus({preventScroll:true}),250);}
function closeForm(){$('finFormCard').style.display='none';resetForm();}
function fillForm(x){
 editId=x.id;syncCats();
 $('finData').value=x.date||todayISO();$('finCat').value=x.category||'Outras';$('finDesc').value=x.description||'';
 $('finValor').value=Number(x.amount||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 $('finForma').value=x.method||METHODS[0];syncAccounts();$('finConta').value=x.account||'';$('finStatus').value=x.status||'pendente';$('finVenc').value=x.dueDate||'';$('finPago').value=x.paidDate||'';
 $('finTipo').value=x.recurring?'rec':'avulsa';$('finObs').value=x.note||'';
 $('finFormTitulo').textContent='Editar despesa';$('finSalvar').textContent='Salvar alterações';$('finFormBadge').textContent='EDIÇÃO';
 syncForm();catHint();openForm();
}
function denied(){if(hasFullAccess())return false;toast('Seu perfil não tem permissão para alterar despesas.',true);return true;}

function save(ev){
 ev.preventDefault();if(denied())return;
 const amount=r2(parseMoneyInput($('finValor').value)),desc=$('finDesc').value.trim();
 if(!desc){toast('Informe a descrição da despesa.',true);$('finDesc').focus();return;}
 if(!(amount>0)){toast('Informe o valor da despesa.',true);$('finValor').focus();return;}
 const date=$('finData').value||todayISO(),status=$('finStatus').value;
 const rec={date,category:$('finCat').value||'Outras',description:desc,amount,method:$('finForma').value,account:$('finConta').value,status,
  dueDate:$('finVenc').value||'',paidDate:status==='pago'?($('finPago').value||date):'',recurring:$('finTipo').value==='rec',note:$('finObs').value.trim()};
 const now=new Date().toISOString();let msg='Despesa salva.';
 if(editId){
  const x=list().find(i=>i.id===editId);if(!x){toast('Despesa não encontrada.',true);return;}
  Object.assign(x,rec,{updatedAt:now});msg='Despesa atualizada.';
 }else{
  const group=rec.recurring?id():'';
  list().push({id:id(),...rec,group,createdAt:now});
  const n=rec.recurring?Math.max(0,Math.min(24,parseInt($('finRepete').value,10)||0)):0;
  for(let i=1;i<=n;i++)list().push({id:id(),...rec,date:addMonths(date,i),dueDate:rec.dueDate?addMonths(rec.dueDate,i):'',status:'pendente',paidDate:'',group,createdAt:now});
  if(n)msg=`Despesa salva e repetida por mais ${n} mês(es) como pendente.`;
 }
 if(saveData()){toast(msg);if(editId)closeForm();else resetForm();}
}
function onListClick(ev){
 const b=ev.target.closest('[data-fin]');if(!b||denied())return;
 const x=list().find(i=>i.id===b.dataset.id);if(!x)return;
 const act=b.dataset.fin;
 if(act==='edit'){fillForm(x);return;}
 if(act==='pay'){x.status='pago';x.paidDate=todayISO();if(saveData())toast(x.account?'Despesa marcada como paga.':'Despesa marcada como paga. Em Editar, escolha de qual conta saiu para descontar do caixa.');return;}
 if(act==='repeat'){
  const c={...x,id:id(),date:addMonths(x.date,1),dueDate:x.dueDate?addMonths(x.dueDate,1):'',status:'pendente',paidDate:'',recurring:true,createdAt:new Date().toISOString()};
  x.recurring=true;list().push(c);if(saveData())toast(`Lançada de novo em ${dayText(c.date)} (pendente).`);return;
 }
 if(act==='del'){
  if(!confirm(`Excluir a despesa "${x.description}" de ${money(x.amount)}?`))return;
  data.expenses=list().filter(i=>i.id!==x.id);if(saveData()){if(editId===x.id)closeForm();toast('Despesa excluída.');}
 }
}
function exportCsv(){
 const rows=filtered(),cell=v=>{const s=String(v??'');return /[";\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;},today=todayISO();
 const head=['Data','Categoria','Descrição','Forma de pagamento','Conta de origem','Vencimento','Pagamento','Situação','Valor (R$)','Recorrente','Observação'];
 const lines=[head.join(';')].concat(rows.map(x=>[dayText(x.date),x.category,x.description,x.method,accLabel(x.account),x.dueDate?dayText(x.dueDate):'',x.paidDate?dayText(x.paidDate):'',statusOf(x,today),Number(x.amount||0).toFixed(2).replace('.',','),x.recurring?'Sim':'Não',x.note].map(cell).join(';')));
 const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
 a.href=URL.createObjectURL(blob);a.download=`despesas-${todayISO()}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 toast('Planilha de despesas exportada.');
}

// ---------- ligações ----------
function init(){
 if(!$('panel-financeiro'))return;
 $('finForma').innerHTML=METHODS.map(m=>`<option>${esc(m)}</option>`).join('');
 $('finFiltroForma').innerHTML='<option value="">Todas as formas</option>'+METHODS.map(m=>`<option>${esc(m)}</option>`).join('');
 syncAccounts();bindMoneyMask($('finValor'));
 setPreset('mes');resetForm();
 $('finPreset').addEventListener('change',()=>{setPreset($('finPreset').value);render();});
 ['finDe','finAte'].forEach(k=>$(k).addEventListener('change',()=>{$('finPreset').value='custom';render();}));
 ['finFiltroCat','finFiltroForma','finFiltroStatus'].forEach(k=>$(k).addEventListener('change',renderList));
 $('finBusca').addEventListener('input',renderList);
 $('finNovo').addEventListener('click',()=>{if(denied())return;resetForm();openForm();});
 $('finCancelar').addEventListener('click',closeForm);
 $('finForm').addEventListener('submit',save);$('finNovaConta').addEventListener('click',newAccount);
 $('finStatus').addEventListener('change',syncForm);$('finTipo').addEventListener('change',syncForm);
 $('finData').addEventListener('change',syncForm);
 $('finCat').addEventListener('change',catHint);
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
render();
})();
