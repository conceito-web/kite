'use strict';
(function(){
const $=id=>document.getElementById(id),panel=$('panel-comparativo');if(!panel)return;
const n=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
const sum=(a,k)=>a.reduce((v,x)=>v+Number(x[k]||0),0);
const div=(a,b)=>n(a)!==null&&n(b)!==null&&b>0?a/b:null;
const fmt=(v,t='money')=>n(v)===null?'—':t==='money'?money(v):Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2,minimumFractionDigits:t==='pct'?2:0})+(t==='pct'?'%':'');
const end=m=>new Date(+m.slice(0,4),+m.slice(5),0).getDate();
const day=(m,d)=>m+'-'+String(d).padStart(2,'0');
const shift=(m,k)=>{let d=new Date(+m.slice(0,4),+m.slice(5)-1+k,1);return localDateKey(d).slice(0,7);};
const validMonth=m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const dateOK=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&localDateKey(new Date(d+'T12:00:00'))===d;
const duration=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/86400000)+1;
const defs=[
  ['revenue','Faturamento comercial líquido','money'],
  ['gross','Vendas antes de devoluções','money'],
  ['returns','Devoluções comerciais','money'],
  ['units','Unidades vendidas (brutas)','num'],
  ['count','Número de vendas','num'],
  ['ticket','Ticket médio antes de devoluções','money'],
  ['discount','Desconto médio ponderado estimado','pct'],
  ['cost','CMV das vendas antes de devoluções','money'],
  ['margin','Margem bruta comercial','pct'],
  ['mc','Margem de contribuição observada','pct'],
  ['coverage','Cobertura da margem','pct'],
  ['oper','Despesas operacionais (DRE)','money'],
  ['selling','Despesas de vendas (DRE)','money'],
  ['profit','Resultado líquido (DRE)','money'],
  ['netMargin','Margem líquida sobre faturamento DRE','pct'],
  ['inflow','Recebimentos (DFC)','money'],
  ['outflow','Pagamentos (DFC)','money'],
  ['dfc','Fluxo líquido (DFC)','money'],
  ['balance','Saldo final disponível (DFC)','money']
];
const diff=(a,b)=>n(a)!==null&&n(b)!==null?a-b:null;
const rel=(a,b)=>n(a)!==null&&n(b)!==null&&b>0?100*(a-b)/b:null;
const pps=(a,b)=>n(a)!==null&&n(b)!==null?a-b:null;

function commercial(a,b){
  const rows=(data.movements||[]).filter(x=>!x.canceled&&['venda','devolucao'].includes(x.type)&&localDateKey(x.date)>=a&&localDateKey(x.date)<=b);
  const sales=rows.filter(x=>x.type==='venda');
  const returns=rows.filter(x=>x.type==='devolucao');
  const gross=sum(sales,'total'),ret=sum(returns,'total');
  const count=new Set(sales.map(x=>x.saleId||x.id)).size;
  const known=sales.length>0&&sales.every(x=>x.costTotal!=null&&x.costTotal!==''&&Number.isFinite(Number(x.costTotal))&&Number(x.costTotal)>0);
  const cost=known?sum(sales,'costTotal'):null;
  const priceKnown=sales.length>0&&sales.every(x=>Number(x.unitPrice)>0&&Number(x.quantity)>0);
  const table=priceKnown?sales.reduce((v,x)=>v+Number(x.unitPrice)*Number(x.quantity),0):null;
  return {
    has:rows.length>0,
    revenue:rows.length?gross-ret:null,
    gross:sales.length?gross:null,
    returns:rows.length?ret:null,
    units:sales.length?sum(sales,'quantity'):null,
    count:sales.length?count:null,
    ticket:div(gross,count),
    discount:table>0?100*(table-gross)/table:null,
    cost,
    margin:cost!==null&&gross>0?100*(gross-cost)/gross:null
  };
}

function period(a,b){
  const c=commercial(a,b);
  let mc=null,coverage=null,d=null,f=null;
  try{
    let rev=0,con=0,all=0;
    for(let m=a.slice(0,7),i=0;m<=b.slice(0,7)&&i<120;m=shift(m,1),i++){
      const z=window.ckrContribuicaoAnalise?.(m);
      if(!z)continue;
      for(const x of z.all){
        const k=localDateKey(x.date);
        if(k<a||k>b)continue;
        all+=x.revenue;
        if(x.complete){rev+=x.revenue;con+=x.mc;}
      }
    }
    if(rev>0)mc=100*con/rev;
    if(all>0)coverage=100*rev/all;
  }catch(e){console.warn(e);}
  try{d=window.ckrDreResumoPeriodo?.(a,b);}catch(e){console.warn(e);}
  try{
    const cut=data.cashConfig?.start;
    if(cut&&a>=cut)f=window.ckrFluxoResumoPeriodo?.(a,b);
  }catch(e){console.warn(e);}
  const hasDre=c.has||(data.expenses||[]).some(x=>{const k=String(x.compMonth||x.date||'');return k.slice(0,7)>=a.slice(0,7)&&k.slice(0,7)<=b.slice(0,7);});
  return {
    ...c,
    mc,
    coverage,
    oper:hasDre?n(d?.despesasOperacionais):null,
    selling:hasDre?n(d?.despesasVendas):null,
    profit:hasDre?n(d?.lucro):null,
    netMargin:hasDre&&d?.faturamento>0?100*d.lucro/d.faturamento:null,
    dfc:n(f?.liquido),
    inflow:n(f?.entradas),
    outflow:n(f?.saidas),
    balance:n(f?.saldoFinal)
  };
}

function classPeriod(a,b){
  return b<'2026-09-01'?'Histórico anterior à implantação':a>='2026-12-01'?'Operação oficial':'Implantação e testes';
}

function toneByMetric(key,a,b){
  const d=diff(a,b);
  if(d===null)return 'neutral';
  if(key==='oper'||key==='selling') return d>0?'down':d<0?'up':'neutral';
  return d>0?'up':d<0?'down':'neutral';
}

function toneByOpinion(kind,good){
  if(good===null)return 'neutral';
  return good?kind==='warn'?'warn':'up':'down';
}

function deltaLabel(key,type,a,b){
  if(type==='pct'){
    const d=pps(a,b);
    return d===null?'Sem base %':`${d>=0?'+':''}${fmt(d,'num')} p.p.`;
  }
  const r=rel(a,b);
  return r===null?'Sem base %':`${r>=0?'+':''}${fmt(r,'pct')}`;
}

function cardHTML(key,label,type,a,b){
  const tone=toneByMetric(key,a,b),d=diff(a,b);
  const symbol=tone==='up'?'▲':tone==='down'?'▼':'•';
  const refText=`Referência: ${fmt(b,type)}`;
  const delta=deltaLabel(key,type,a,b);
  const absText=type!=='pct'&&d!==null?fmt(d,type):'—';
  return `<article class="cmp-card cmp-${tone}"><div class="cmp-card__top"><div class="cmp-card__label">${esc(label)}</div><b class="cmp-chip cmp-${tone}">${symbol} ${esc(delta)}</b></div><strong>${esc(fmt(a,type))}</strong><div class="cmp-card__meta"><div class="cmp-card__line"><span>Referência</span><b>${esc(fmt(b,type))}</b></div>${type!=='pct'?`<div class="cmp-card__line"><span>Variação</span><b>${esc(absText)}</b></div>`:''}</div></article>`;
}

function opinionHTML(title,text,tone='neutral'){
  return `<article class="cmp-opinion cmp-${tone}"><strong>${esc(title)}</strong><p>${esc(text)}</p></article>`;
}

function renderTrend(last,b){
  const trend=Array.from({length:12},(_,i)=>{
    const k=shift(last,i-11),r=shift(k,-12),days=k===last?+b.slice(8,10):end(k);
    return [k,commercial(day(k,1),day(k,days)).revenue,commercial(day(r,1),day(r,k===last?Math.min(days,end(r)):end(r))).revenue];
  });
  const max=Math.max(1,...trend.flatMap(x=>x.slice(1).filter(v=>v!==null).map(v=>Math.abs(v))));
  return `<div class="cmp-trend">${trend.map(([m,cur,prev])=>{
    const curW=cur===null?0:Math.abs(cur)/max*100;
    const prevW=prev===null?0:Math.abs(prev)/max*100;
    return `<div class="cmp-trend__row"><div class="cmp-trend__label">${esc(m)}</div><div class="cmp-trend__values"><div><span>Ano anterior</span><strong>${esc(fmt(prev))}</strong><div class="cmp-bar cmp-bar--ghost"><i style="width:${prevW}%"></i></div></div><div><span>Período analisado</span><strong>${esc(fmt(cur))}</strong><div class="cmp-bar"><i style="width:${curW}%"></i></div></div></div></div>`;
  }).join('')}</div>`;
}

function render(){
  if(!hasFullAccess()||!panel.classList.contains('active'))return;
  const mode=$('cmpMode').value,m=$('cmpMonth').value,today=todayISO();
  $('cmpDates').hidden=mode!=='custom';
  let a,b,c,d;
  if(mode==='custom'){
    [a,b,c,d]=['cmpA0','cmpA1','cmpB0','cmpB1'].map(k=>$(k).value);
  }else if(validMonth(m)){
    a=day(m,1); b=day(m,end(m)); if(b>today)b=today;
    const ref=shift(m,mode==='year'?-12:-1);
    c=day(ref,1);
    d=day(ref,$('cmpEqual').checked?Math.min(end(ref),Number(b.slice(8,10))):end(ref));
  }
  if(![a,b,c,d].every(dateOK)||a>b||c>d||b>today||d>today||duration(a,b)>3653||duration(c,d)>3653){
    $('cmpPeriod').textContent='Selecione períodos válidos, não futuros, de até dez anos.';
    for(const id of ['cmpCards','cmpRows','cmpOpinion','cmpTrend','cmpWarning']) $(id).innerHTML='';
    return;
  }
  const A=period(a,b),B=period(c,d);
  const classA=classPeriod(a,b),classB=classPeriod(c,d);
  $('cmpPeriod').textContent=`Analisado: ${a} a ${b} (${duration(a,b)} dias) · Referência: ${c} a ${d} (${duration(c,d)} dias)`;
  const warnings=[];
  warnings.push(`${classA} × ${classB}.`);
  if(duration(a,b)!==duration(c,d)) warnings.push('Períodos com durações diferentes.');
  warnings.push('Resultados históricos dependem da qualidade dos registros.');
  warnings.push('DFC só aparece após a data de corte cadastrada.');
  warnings.push('Não há ajuste pela inflação.');
  $('cmpWarning').innerHTML=`<div class="cmp-warning">${warnings.map(w=>`<span>${esc(w)}</span>`).join('')}</div>`;

  $('cmpCards').innerHTML=[
    cardHTML('revenue','Faturamento líquido','money',A.revenue,B.revenue),
    cardHTML('mc','Margem de contribuição','pct',A.mc,B.mc),
    cardHTML('oper','Despesas operacionais','money',A.oper,B.oper),
    cardHTML('profit','Resultado líquido','money',A.profit,B.profit)
  ].join('');

  const rv=diff(A.revenue,B.revenue),pr=diff(A.profit,B.profit),mg=diff(A.mc,B.mc),op=rel(A.oper,B.oper),gr=rel(A.revenue,B.revenue);
  const econText = rv===null||pr===null
    ? 'Dados insuficientes para avaliar conjuntamente receita e resultado.'
    : rv>0&&pr>0
      ? 'Receita e resultado cresceram no período analisado.'
      : rv>0&&pr<0
        ? 'Receita cresceu, mas o resultado piorou. Investigue custos, despesas e mix de vendas.'
        : rv<0&&pr>0
          ? 'Receita diminuiu, mas o resultado melhorou. Houve ganho de eficiência econômica.'
          : rv<0&&pr<0
            ? 'Receita e resultado diminuíram.'
            : 'Receita e resultado permaneceram praticamente estáveis.';
  const econTone = rv===null||pr===null ? 'neutral' : (rv>0&&pr>0 ? 'up' : rv<0&&pr<0 ? 'down' : 'warn');

  const rentText = mg===null
    ? 'Margem comparável indisponível para os dois períodos.'
    : `Variação de ${fmt(mg,'num')} p.p.; cobertura ${fmt(A.coverage,'pct')} no analisado contra ${fmt(B.coverage,'pct')} na referência.`;
  const rentTone = mg===null ? 'neutral' : mg>=0 ? 'up' : 'down';

  const spendText = op===null||gr===null
    ? 'Base insuficiente para comparar a estrutura de gastos com a receita.'
    : op>gr
      ? 'As despesas operacionais cresceram proporcionalmente mais do que a receita, ou recuaram menos.'
      : 'A estrutura de gastos ficou melhor comportada do que a variação da receita.';
  const spendTone = op===null||gr===null ? 'neutral' : op>gr ? 'down' : 'up';

  const historicalGap = classB==='Histórico anterior à implantação' && (B.oper===0 || B.oper===null);
  const reliabilityText = historicalGap
    ? 'A comparação com o período histórico deve ser lida com cautela: despesas anteriores podem estar incompletas ou não conciliadas.'
    : classA!=='Operação oficial' || classB!=='Operação oficial'
      ? 'Ao menos um dos períodos pertence à fase de implantação e testes. Use o comparativo como referência gerencial, não como verdade definitiva.'
      : 'Os dois períodos pertencem à base operacional do sistema, sem prejuízo das conferências mensais.';
  const reliabilityTone = historicalGap ? 'warn' : (classA==='Operação oficial' && classB==='Operação oficial' ? 'up' : 'neutral');

  $('cmpOpinion').innerHTML=[
    opinionHTML('Evolução econômica',econText,econTone),
    opinionHTML('Rentabilidade',rentText,rentTone),
    opinionHTML('Estrutura de gastos',spendText,spendTone),
    opinionHTML('Confiabilidade da comparação',reliabilityText,reliabilityTone)
  ].join('');

  $('cmpRows').innerHTML=defs.map(([k,label,t])=>{
    const abs=t==='pct' ? (pps(A[k],B[k])===null?'—':fmt(pps(A[k],B[k]),'num')+' p.p.') : fmt(diff(A[k],B[k]),t);
    const vr=t==='pct' ? '—' : fmt(rel(A[k],B[k]),'pct');
    return `<tr><td>${esc(label)}</td><td>${esc(fmt(B[k],t))}</td><td>${esc(fmt(A[k],t))}</td><td>${esc(abs)}</td><td>${esc(vr)}</td></tr>`;
  }).join('');

  $('cmpTrend').innerHTML=renderTrend(b.slice(0,7),b);
}

$('cmpMonth').value=todayISO().slice(0,7);
for(const k of ['cmpMode','cmpMonth','cmpEqual','cmpA0','cmpA1','cmpB0','cmpB1']) $(k).addEventListener('change',render);
$('cmpRefresh').addEventListener('click',render);
document.querySelector('[data-panel="comparativo"]').addEventListener('click',render);
window.ckrComparativoRender=render;
})();
