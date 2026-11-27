'use strict';
// Conceito · Visão Geral Executiva v2 — inicialização segura depois do login
// Somente leitura: utiliza resumos do Caixa, DRE e Fluxo, sem salvar ou criar lançamentos.
(function(){
 const $=key=>document.getElementById(key);
 const r2=v=>Math.round((Number(v)||0)*100)/100;
 const number=v=>Number.isFinite(Number(v))?Number(v):0;
 const signed=v=>(v<-.004?'−':'')+money(Math.abs(r2(v)));
 const fmtPct=v=>v==null?'—':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
 const today=()=>todayISO();
 const newMonth=(key,off=0)=>{const m=/^(\d{4})-(\d{2})$/.exec(key||'');if(!m)return today().slice(0,7);const dt=new Date(+m[1],+m[2]-1+off,1);return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');};
 const bounds=key=>({start:key+'-01',end:localDateKey(new Date(+key.slice(0,4),+key.slice(5,7),0))});
 const labelMonth=key=>{const [y,m]=key.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}).replace('.','');};
 const fullLabel=key=>{const [y,m]=key.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});};
 const fShort=n=>{const v=Math.abs(number(n));return v>=1000000?(v/1000000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mi':v>=1000?(v/1000).toLocaleString('pt-BR',{maximumFractionDigits:0})+' mil':Math.round(v).toLocaleString('pt-BR');};
 const validDay=k=>/^\d{4}-\d{2}-\d{2}$/.test(String(k||''));
 const sum=xs=>r2(xs.reduce((n,v)=>n+number(v),0));
 const statusEl=(id,value,color)=>{const el=$(id);if(!el)return;el.textContent=value;el.classList.remove('exec-amount-positive','exec-amount-negative');if(color){const v=number(color);if(v<-.005)el.classList.add('exec-amount-negative');else if(v>.005)el.classList.add('exec-amount-positive');}};
 const getDre=(start,end)=>typeof window.ckrDreResumoPeriodo==='function'?window.ckrDreResumoPeriodo(start,end):null;
 const getDfc=(start,end)=>typeof window.ckrFluxoResumoPeriodo==='function'?window.ckrFluxoResumoPeriodo(start,end):null;
 const getCaixa=()=>typeof window.ckrCaixaPainelResumo==='function'?window.ckrCaixaPainelResumo():null;
 function obligations(){
  const now=today(),tomorrow=localDateKey(new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()+1)),future=localDateKey(new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()+30));
  const exps=(Array.isArray(data.expenses)?data.expenses:[]).filter(x=>x&&x.status!=='pago'&&x.forecast!==true);
  const fac=(Array.isArray(data.factoryOrders)?data.factoryOrders:[]).flatMap(o=>Array.isArray(o.installments)?o.installments.filter(p=>p&&!p.paid):[]);
  const prom=(Array.isArray(data.receivables)?data.receivables:[]).filter(r=>r&&!r.canceled&&!r.paid);
  const promRem=r=>Math.max(0,r2(number(r.amount)-number(r.received)));
  const openProm=prom.filter(r=>promRem(r)>.004);
  const expensesValue=sum(exps.map(x=>x.amount));
  const factoryValue=sum(fac.map(x=>x.amount));
  const promValue=sum(openProm.map(promRem));
  const late=a=>validDay(a)&&a<now;
  const soon=a=>validDay(a)&&a>=now&&a<=future;
  const due=a=>({today:a.filter(x=>x.dueDate===now).length,tomorrow:a.filter(x=>x.dueDate===tomorrow).length});
  return {expensesValue,factoryValue,promValue,dueExp:due(exps),dueFab:due(fac),dueProm:due(openProm),
   lateExp:exps.filter(x=>late(x.dueDate)).length,
   lateFab:fac.filter(x=>late(x.dueDate)).length,
   lateProm:openProm.filter(x=>late(x.dueDate)).length,
   soonExp:exps.filter(x=>soon(x.dueDate)).length,
   soonFab:fac.filter(x=>soon(x.dueDate)).length,
   soonProm:openProm.filter(x=>soon(x.dueDate)).length,
   noDue:exps.filter(x=>!validDay(x.dueDate)).length+fac.filter(x=>!validDay(x.dueDate)).length};
 }
 // SVGs são criados com números e rótulos de mês gerados localmente, sem dados de entrada do usuário.
 const svgText=(x,y,t,other='')=>`<text x="${x}" y="${y}" ${other}>${t}</text>`;
 const emptyChart='Nenhum movimento informado para esses meses.';
 function revenueChart(items){
  const d=items.map(x=>x.dre),max=Math.max(0,...d.map(x=>x?Math.max(0,number(x.faturamento)):0));
  if(max<.005&&d.every(x=>!x||x.margem==null))return `<div class="exec-chart-empty">${emptyChart}</div>`;
  const W=720,H=232,left=56,right=42,top=21,bottom=38,base=H-bottom,h=base-top,plot=W-left-right;
  const maxVal=Math.max(100,Math.ceil(max/1000)*1000),grid=[];
  for(let i=0;i<=4;i++){const v=maxVal*i/4,y=base-h*i/4;grid.push(`<line x1="${left}" x2="${W-right}" y1="${y}" y2="${y}" stroke="#e9edf4" stroke-width="1"/>${svgText(left-7,y+4,fShort(v),'font-size="10" fill="#9da9b9" text-anchor="end"')}`);}
  const margins=d.map(x=>x&&x.margem!=null?number(x.margem):null);
  const have=margins.filter(v=>v!==null),lo=Math.min(0,...have),hi=Math.max(10,...have),rng=(hi-lo)||10;
  const marginY=v=>base-(v-lo)/rng*h,step=plot/6;
  const bars=items.map((x,i)=>{const v=x.dre?number(x.dre.faturamento):0,hBar=Math.max(0,(Math.max(0,v)/maxVal)*h),xBar=left+step*(i+.32);return `<rect x="${xBar.toFixed(2)}" y="${(base-hBar).toFixed(2)}" width="${(step*.36).toFixed(2)}" height="${hBar.toFixed(2)}" rx="4" fill="#3972e5"><title>${x.month}: ${money(v)}</title></rect>${svgText(left+step*(i+.5),H-14,labelMonth(x.month),'font-size="10" fill="#8694a6" text-anchor="middle"')}`;}).join('');
  const dots=[],segments=[];let prev=null;
  margins.forEach((v,i)=>{if(v===null){prev=null;return;}const x=left+step*(i+.5),y=marginY(v);dots.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4.4" fill="#d5894b" stroke="white" stroke-width="2"><title>${items[i].month}: margem ${fmtPct(v)}</title></circle>`);if(prev)segments.push(`<line x1="${prev.x.toFixed(2)}" y1="${prev.y.toFixed(2)}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="#d5894b" stroke-width="3" stroke-linecap="round"/>`);prev={x,y};});
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">${grid.join('')}${svgText(left,11,'R$','font-size="10" fill="#99a7b9"')}${svgText(W-6,12,'Margem','font-size="10" fill="#d5894b" text-anchor="end"')}${svgText(W-6,top+4,fmtPct(hi),'font-size="10" fill="#d5894b" text-anchor="end"')}${svgText(W-6,base+3,fmtPct(lo),'font-size="10" fill="#d5894b" text-anchor="end"')}${bars}${segments.join('')}${dots.join('')}</svg>`;
 }
 function cashChart(items){
  const vals=items.map(x=>x.dfc),max=Math.max(0,...vals.flatMap(x=>x?[number(x.entradas),number(x.saidas)]:[0]));
  if(max<.005)return `<div class="exec-chart-empty">${emptyChart}</div>`;
  const W=720,H=232,left=56,right=16,top=21,bottom=38,base=H-bottom,h=base-top,plot=W-left-right,maxVal=Math.max(100,Math.ceil(max/1000)*1000),step=plot/6;
  const grid=[];for(let i=0;i<=4;i++){const v=maxVal*i/4,y=base-h*i/4;grid.push(`<line x1="${left}" x2="${W-right}" y1="${y}" y2="${y}" stroke="#e9edf4" stroke-width="1"/>${svgText(left-7,y+4,fShort(v),'font-size="10" fill="#9da9b9" text-anchor="end"')}`);}
  const bars=items.map((x,i)=>{const v=x.dfc||{entradas:0,saidas:0};const a=Math.max(0,number(v.entradas)),b=Math.max(0,number(v.saidas)),ha=a/maxVal*h,hb=b/maxVal*h,cx=left+step*(i+.5),w=Math.min(28,step*.25);return `<rect x="${(cx-w-2).toFixed(2)}" y="${(base-ha).toFixed(2)}" width="${w}" height="${ha.toFixed(2)}" rx="3" fill="#3972e5"><title>${x.month}: entradas ${money(a)}</title></rect><rect x="${(cx+2).toFixed(2)}" y="${(base-hb).toFixed(2)}" width="${w}" height="${hb.toFixed(2)}" rx="3" fill="#9eb4d0"><title>${x.month}: saídas ${money(b)}</title></rect>${svgText(cx,H-14,labelMonth(x.month),'font-size="10" fill="#8694a6" text-anchor="middle"')}`;}).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">${grid.join('')}${svgText(left,11,'R$','font-size="10" fill="#99a7b9"')}${bars}</svg>`;
 }
 function alertRow(text,sub,value,page,urgent){return `<div class="exec-alert-row${urgent?' urgent':''}"><span class="exec-alert-icon">${urgent?'!':'•'}</span><div><b>${text}</b><small>${sub}</small></div><button type="button" data-exec-go="${page}" aria-label="Abrir ${text}">${value} →</button></div>`;}
 let selected=today().slice(0,7);
 function render(){
  const pane=$('panel-dashboard');if(!pane||!pane.classList.contains('active')||!hasFullAccess())return;
  const actualMonth=today().slice(0,7),el=$('execMes');if(!el)return;
  if(selected>actualMonth)selected=actualMonth;
  el.value=selected;el.max=actualMonth;$('execNext').disabled=selected>=actualMonth;
  const {start,end}=bounds(selected);
  $('execPositionDate').textContent=`Posição financeira em ${dayText(today())} · Desempenho de ${fullLabel(selected)}`;
  try{
   const cx=getCaixa(),dre=getDre(start,end),dfc=getDfc(start,end),obl=obligations();
   if(!cx||!dre||!dfc){
    const missing=[!cx?'Caixa':'',!dre?'DRE':'',!dfc?'DFC':''].filter(Boolean).join(', ');
    throw new Error('Resumo indisponível: '+missing+'. Confirme se caixa.js, dre.js e fluxo.js foram atualizados.');
   }
   const receber=r2(cx.agenda+obl.promValue),pagar=r2(obl.expensesValue+obl.factoryValue);
   statusEl('execDisponivel',signed(cx.disponivel));
   statusEl('execReceber',signed(receber));
   statusEl('execPagar',signed(pagar));
   statusEl('execFaturamento',signed(dre.faturamento));
   statusEl('execLucro',signed(dre.lucro),dre.lucro);
   statusEl('execMargem',fmtPct(dre.margem),dre.margem);
   statusEl('execCaixaLiquido',signed(dfc.liquido),dfc.liquido);
   $('execReceberNota').textContent=`Agenda BLU ${signed(cx.agenda)} + promissórias ${money(obl.promValue)}`;
   $('execPagarNota').textContent=`Obrigações registradas ${money(obl.expensesValue)} + fábrica ${money(obl.factoryValue)} · previsões excluídas`;
   let notes=[];
   if(Math.abs(cx.lancamentosFuturos||0)>.005)notes.push(`Há ${signed(cx.lancamentosFuturos)} em lançamentos monetários com data futura, excluídos do disponível de hoje.`);
   if(cx.agendaPendente)notes.push(`${cx.agendaPendente} conciliação(ões) BLU pendente(s): valores da Agenda ainda sujeitos a ajuste.`);
   if(dre.semCusto)notes.push(`${dre.semCusto} venda(s) sem CMV histórico: lucro pode estar superestimado.`);
   if(!dfc.fecha)notes.push('O Fluxo de Caixa não fechou; confira o módulo DFC.');
   if(!notes.length)notes.push('Números obtidos do Caixa, da DRE e do Fluxo de Caixa. Sem lançamentos criados pelo painel.');
   $('execConferencia').textContent=notes.join(' ');
   const months=Array.from({length:6},(_,i)=>newMonth(selected,i-5));
   const items=months.map(month=>{const b=bounds(month);return {month,dre:getDre(b.start,b.end),dfc:getDfc(b.start,b.end)};});
   $('execRevenueChart').innerHTML=revenueChart(items);
   $('execCashChart').innerHTML=cashChart(items);
   const count=(late,d)=>late+d.today+d.tomorrow,desc=(late,d)=>`${late} vencida(s) · ${d.today} hoje · ${d.tomorrow} amanhã`;
   const urgent=count(obl.lateExp,obl.dueExp)+count(obl.lateFab,obl.dueFab)+count(obl.lateProm,obl.dueProm)+cx.agendaPendente;
   $('execAlertBadge').textContent=urgent?`${urgent} pendência(s) urgentes`:'Sem pendências urgentes';
   $('execAlertRows').innerHTML=[
    alertRow('Despesas — vencimentos',desc(obl.lateExp,obl.dueExp),count(obl.lateExp,obl.dueExp),'financeiro',count(obl.lateExp,obl.dueExp)>0),
    alertRow('Promissórias — vencimentos',desc(obl.lateProm,obl.dueProm),count(obl.lateProm,obl.dueProm),'promissorias',count(obl.lateProm,obl.dueProm)>0),
    alertRow('Parcelas da fábrica — vencimentos',desc(obl.lateFab,obl.dueFab),count(obl.lateFab,obl.dueFab),'pedidos',count(obl.lateFab,obl.dueFab)>0),
    alertRow('Agenda BLU — conciliar',`${money(cx.agendaComprometida)} aguardando identificação`,cx.agendaPendente,'financeiro',cx.agendaPendente>0)
   ].join('');
  }catch(err){
   console.error('Conceito · Visão Geral',err);
   $('execConferencia').textContent='Indicadores indisponíveis: '+(err&&err.message?err.message:'confira os arquivos financeiros atualizados')+'. Nenhum dado foi alterado.';
   ['execDisponivel','execReceber','execPagar','execFaturamento','execLucro','execMargem','execCaixaLiquido'].forEach(k=>statusEl(k,'—'));
   ['execRevenueChart','execCashChart'].forEach(k=>$(k).innerHTML='<div class="exec-chart-empty">Indicador indisponível. Consulte os módulos originais.</div>');
   $('execAlertRows').textContent='Alertas indisponíveis. Consulte os painéis de despesas e recebíveis.';
  }
 }
 // Permite que login, troca de aba e usuário solicitem atualização de maneira explícita.
 // Não registra nem modifica movimentações financeiras.
 window.ckrAtualizarDashboard=render;
 const monthControl=$('execMes');
 if(!monthControl)return;
 monthControl.value=selected;
 monthControl.addEventListener('change',()=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(monthControl.value))selected=monthControl.value;render();});
 $('execPrev').addEventListener('click',()=>{selected=newMonth(selected,-1);render();});
 $('execNext').addEventListener('click',()=>{selected=newMonth(selected,1);render();});
 $('execAlertRows').addEventListener('click',ev=>{const btn=ev.target.closest('[data-exec-go]');if(btn&&typeof window.goTo==='function')window.goTo(btn.dataset.execGo);});
 const refreshButton=$('execRefresh');if(refreshButton)refreshButton.addEventListener('click',render);
 // Em primeiro acesso, a autenticação pode liberar o painel sem disparar renderAll/goTo.
 // Após o submit (tratado pelo app.js), atualiza somente a leitura do dashboard.
 ['ckrLoginForm','ckrSetupForm'].forEach(id=>{const form=$(id);if(form)form.addEventListener('submit',()=>Promise.resolve().then(render));});
 // O app.js pode restaurar uma sessão ou abrir a Visão Geral em momentos distintos.
 // O painel anterior só tentava renderizar na carga inicial e em alguns eventos.
 // Observamos APENAS mudanças de autorização e visibilidade da aba, não os dados.
 if(typeof MutationObserver==='function'){
  const roleObserver=new MutationObserver(()=>render());
  roleObserver.observe(document.body,{attributes:true,attributeFilter:['data-ckr-role']});
  const panel=$('panel-dashboard');
  if(panel){const tabObserver=new MutationObserver(()=>render());tabObserver.observe(panel,{attributes:true,attributeFilter:['class']});}
 }
 if(typeof window.addEventListener==='function'){
  window.addEventListener('pageshow',render);
  window.addEventListener('focus',render);
 }
 const baseRender=window.renderAll;
 window.renderAll=function(){if(typeof baseRender==='function')baseRender.apply(this,arguments);render();};
 const baseGoTo=window.goTo;
 window.goTo=function(name){if(typeof baseGoTo==='function')baseGoTo.apply(this,arguments);if(name==='dashboard')render();};
 setInterval(render,600000);
 render();
})();
