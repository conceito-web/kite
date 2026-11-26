'use strict';
/* Conceito v116 — Controladoria / margem de contribuição.
   Consulta SOMENTE LEITURA de vendas e notas; não grava ou altera lançamentos.
   Fonte: movimentos de venda ativos, custo PEPS guardado e taxas registradas na venda.
   Simples mensal: rateio gerencial da apuração vigente do módulo Impostos, quando disponível.
*/
(function(){
  const $ = id => document.getElementById(id);
  const panel=$('panel-contribuicao');
  if(!panel)return;
  const n2=n=>Math.round((Number(n)||0)*100)/100;
  const hasNum=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
  const brMoney=x=>Number(x).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const pct=x=>Number(x).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
  const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const monthOf=date=>{try{return (typeof localDateKey==='function'?localDateKey(date):String(date).slice(0,10)).slice(0,7);}catch(_){return String(date||'').slice(0,7);}};
  const dateBR=s=>{const k=typeof localDateKey==='function'?localDateKey(s):String(s||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(k)?`${k.slice(8,10)}/${k.slice(5,7)}/${k.slice(0,4)}`:'—';};
  const monthEnd=k=>{const [y,m]=k.split('-').map(Number);return `${k}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`;};
  const monetaryInput=s=>{const v=String(s??'').trim().replace(/R\$|\s/g,'');if(!v)return NaN;const normalized=v.includes(',')?v.replace(/\./g,'').replace(',','.'):v;return Number(normalized);};
  const percentInput=s=>{const v=String(s??'').trim();return v===''?NaN:Number(v.replace('%','').replace(',','.'));};
  const payCard=p=>['Cartão de crédito','Cartão de débito','Link BLU'].includes(String(p.method||''))||/cart[aã]o|blu/i.test(String(p.method||''));
  const payOwn=p=>payCard(p)&&p.responsible!=='fabrica';
  const ownCardWithoutFee=p=>payOwn(p)&&Number(p.fee||0)===0&&Number(p.feeRate||0)===0;
  const allNotes=()=>Array.isArray(data.taxNotes)?data.taxNotes:[];
  const activeNotes=()=>allNotes().filter(n=>n.fiscalStatus!=='cancelada');
  const monthCache={};
  function taxRate(k){
    if(Object.prototype.hasOwnProperty.call(monthCache,k))return monthCache[k];
    const notes=activeNotes().filter(n=>String(n.date||'').slice(0,7)===k);
    const base=notes.reduce((s,n)=>s+Number(n.value||0),0);
    if(!(base>0)||typeof window.ckrSimplesPeriodo!=='function')return monthCache[k]={rate:null,source:'Sem base de notas vigentes ou apuração do Simples no mês'};
    try{
      const ap=window.ckrSimplesPeriodo(`${k}-01`,monthEnd(k));
      const real=Number(ap&&ap.total);
      if(!Number.isFinite(real)||real<0)return monthCache[k]={rate:null,source:'Apuração fiscal indisponível'};
      return monthCache[k]={rate:real/base,source:'Alíquota média estimada a partir do Simples do mês e das notas vigentes',adjusted:!!((ap.meses||[]).some(a=>a.ajustado))};
    }catch(e){return monthCache[k]={rate:null,source:'Falha ao consultar o Simples do período'};}
  }
  function allSales(){
    const map=new Map();
    (Array.isArray(data.movements)?data.movements:[]).forEach(m=>{
      if(m.type!=='venda'||m.canceled)return;
      const id=String(m.saleId||m.id||'');if(!id)return;
      let s=map.get(id);if(!s){s={id,client:m.client||'',date:m.date,lines:[],payments:Array.isArray(m.payments)?m.payments:[],taxNoteId:m.taxNoteId||''};map.set(id,s);}
      s.lines.push(m);if(!s.client&&m.client)s.client=m.client;
      if(m.taxNoteId)s.taxNoteId=m.taxNoteId;
    });
    return Array.from(map.values()).map(s=>{
      s.month=monthOf(s.date);
      s.revenue=n2(s.lines.reduce((a,m)=>a+Number(m.total||0),0));
      const noCost=s.lines.some(m=>!hasNum(m.costTotal)||Number(m.costTotal)<0||Number(m.quantity||0)>0&&Number(m.costTotal)===0);
      s.cmv=noCost?null:n2(s.lines.reduce((a,m)=>a+Number(m.costTotal||0),0));
      const feeMissing=s.lines.some(m=>!hasNum(m.fee));
      if(!feeMissing)s.fees=n2(s.lines.reduce((a,m)=>a+Number(m.fee||0),0));
      else if(s.lines.every(m=>!hasNum(m.fee))&&s.payments.length>0&&!s.payments.some(payOwn))s.fees=0;
      else s.fees=null;
      const tx=taxRate(s.month);s.taxRate=tx.rate;
      s.tax=tx.rate===null?null:n2(s.revenue*tx.rate);
      s.note=s.taxNoteId?allNotes().find(n=>n.id===s.taxNoteId):null;
      s.noteIssue=!!(s.note&&s.note.fiscalStatus==='cancelada');
      s.invoiceDiff=s.note&&hasNum(s.note.value)&&Math.abs(Number(s.note.value)-s.revenue)>0.025 ? n2(Number(s.note.value)-s.revenue):null;
      s.remarks=[];
      if(!s.taxNoteId)s.remarks.push('Nota fiscal não vinculada ao registro comercial');
      else if(!s.note)s.remarks.push('Referência da nota não localizada no módulo Impostos');
      if(s.invoiceDiff!==null)s.remarks.push('Valor da nota vinculada difere da venda comercial; verificar se houve emissão parcial, serviços ou devolução');
      if(s.payments.length&&Math.abs(s.payments.reduce((v,p)=>v+Number(p.amount||0),0)-s.revenue)>0.03)s.remarks.push('Total das modalidades de pagamento difere do valor comercial; conferir forma de recebimento');
      // Não presumir uma taxa zero em cartão da maquininha própria: pode ser falta de lançamento.
      // O crédito comercial da Ortobom (responsible=fabrica) não é uma despesa variável.
      if(s.payments.some(ownCardWithoutFee)&&s.fees===0)s.remarks.push('Cartão próprio ou link BLU sem tarifa documentada; revisar a taxa efetiva');
      // Só conta frete quando a despesa estiver explicitamente vinculada à venda.
      s.freight=n2((Array.isArray(data.expenses)?data.expenses:[]).filter(x=>String(x.saleId||'')===s.id&&!x.forecast&&!x.canceled&&(x.dre==='frete'||/frete|entrega|transporte/i.test(String(x.category||'')+' '+String(x.description||'')))).reduce((a,x)=>a+Number(x.amount||0),0));
      s.issues=[];
      if(s.cmv===null)s.issues.push('CMV PEPS ausente ou zerado');
      if(s.fees===null)s.issues.push('Taxa da forma de pagamento não registrada');
      if(s.payments.some(ownCardWithoutFee)&&s.fees===0)s.issues.push('Tarifa de cartão próprio igual a zero sem comprovação');
      if(s.tax===null)s.issues.push('Imposto estimado indisponível');
      if(s.noteIssue)s.issues.push('Nota vinculada consta como cancelada fiscalmente');
      if(!(s.revenue>0))s.issues.push('Valor da venda inválido');
      s.complete=!s.issues.length;
      s.review=!!s.remarks.length;
      s.mc=s.complete?n2(s.revenue-s.cmv-s.fees-s.tax-s.freight):null;
      s.margin=s.complete?n2(100*s.mc/s.revenue):null;
      return s;
    }).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  }
  function model(month){
    Object.keys(monthCache).forEach(k=>delete monthCache[k]);
    const all=allSales().filter(s=>s.month===month);
    const ok=all.filter(s=>s.complete);
    const revenue=n2(ok.reduce((v,s)=>v+s.revenue,0));
    const cmv=n2(ok.reduce((v,s)=>v+s.cmv,0));
    const tax=n2(ok.reduce((v,s)=>v+s.tax,0));
    const fees=n2(ok.reduce((v,s)=>v+s.fees,0));
    const freights=n2(ok.reduce((v,s)=>v+s.freight,0));
    const mc=n2(ok.reduce((v,s)=>v+s.mc,0));
    const totalRevenue=n2(all.reduce((v,s)=>v+s.revenue,0));
    const incomplete=all.filter(s=>!s.complete);const reviewed=all.filter(s=>s.review);
    return {all,ok,incomplete,reviewed,revenue,cmv,tax,fees,freights,mc,percent:revenue>0?100*mc/revenue:null,totalRevenue,excluded:n2(totalRevenue-revenue),coverage:totalRevenue>0?100*revenue/totalRevenue:0};
  }
  let current=null;
  function render(){
    if(!panel.classList.contains('active'))return;
    const k=$('mcMonth').value;
    if(!/^\d{4}-\d{2}$/.test(k))return;
    current=model(k);const r=current;
    $('mcVal').textContent=r.ok.length?brMoney(r.mc):'—';
    $('mcPct').textContent=r.percent===null?'—':pct(r.percent);
    $('mcRevenue').textContent=r.ok.length?brMoney(r.revenue):'—';
    $('mcCosts').textContent=r.ok.length?brMoney(r.cmv+r.fees+r.tax+r.freights):'—';
    $('mcCoverage').textContent=`${r.ok.length} de ${r.all.length} venda(s) calculáveis`;
    $('mcSummary').textContent=r.all.length===0?'Nenhuma venda comercial ativa neste período.':r.ok.length===0?'Nenhuma venda possui informações suficientes para calcular a margem.':r.ok.length!==r.all.length?'ATENÇÃO — Margem PARCIAL: parte do faturamento não entrou no indicador.':'Margem de contribuição gerencial ESTIMADA sobre as vendas analisáveis.';
    $('mcTaxInfo').textContent='A distribuição do Simples entre vendas é estimativa gerencial, não apuração por documento. Os efeitos fiscais de cancelamentos e devoluções requerem conferência separada. Serviços não incluídos.';
    $('mcCoveragePct').textContent=r.all.length?pct(r.coverage):'—';
    $('mcCoverageMoney').textContent=`${brMoney(r.revenue)} analisáveis de ${brMoney(r.totalRevenue)} em vendas ativas`;
    $('mcCoverageBar').setAttribute('aria-valuenow',String(Math.round(r.coverage)));
    $('mcQualityProgress').style.width=Math.max(0,Math.min(100,r.coverage))+'%';
    $('mcReviewCount').textContent=String(new Set([...r.incomplete,...r.reviewed].map(s=>s.id)).size)+' venda(s)';
    $('mcReviewSummary').textContent=`${r.incomplete.length} incompleta(s); ${r.reviewed.length} com observações de conferência`;
    const reasons=new Map();
    r.all.forEach(s=>[...s.issues,...s.remarks].forEach(i=>reasons.set(i,(reasons.get(i)||0)+1)));
    $('mcReviewReasons').textContent=reasons.size?[...reasons].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([m,n])=>`${n}× ${m}`).join(' · '):'Nenhuma ressalva adicional identificada.';
    const totals={mcAllRevenue:r.totalRevenue,mcExcluded:r.excluded,mcAnalysed:r.revenue,mcTotalCmv:r.cmv,mcTotalTax:r.tax,mcTotalFees:r.fees,mcTotalFreights:r.freights,mcTotalResult:r.mc};
    Object.keys(totals).forEach(id=>$(id).textContent=brMoney(totals[id]));
    const meta=taxRate(k);
    $('mcTaxOrigin').textContent='TRATAMENTO FISCAL: '+(meta.source||'Estimativa não disponível')+'. '+(meta.rate!==null?'Alíquota gerencial alocada: '+pct(meta.rate*100)+'. ':'')+'A DRE e o DAS oficial podem divergir deste recorte; não usar como apuração fiscal definitiva.';
    const search=String($('mcSearch').value||'').trim().toLowerCase();
    const list=r.all.filter(s=>!search||(s.id+' '+s.client+' '+s.lines.map(m=>m.productName||'').join(' ')).toLowerCase().includes(search));
    $('mcCount').textContent=`${list.length} venda(s) encontrada(s)${list.length>100?' · exibindo 100 · CSV inclui todas':''}`;
    $('mcRows').innerHTML=list.length?list.slice(0,100).map(s=>`<tr><td>${escapeHtml(dateBR(s.date))}</td><td><strong>${escapeHtml(s.id)}</strong><small class="mc-smaller">${escapeHtml(s.client||'Cliente não identificado')}</small></td><td>${brMoney(s.revenue)}</td><td>${s.cmv===null?'—':brMoney(s.cmv)}</td><td>${s.tax===null?'—':brMoney(s.tax)}</td><td>${s.fees===null?'—':brMoney(s.fees)}</td><td><strong>${s.mc===null?'—':brMoney(s.mc)}</strong></td><td>${s.margin===null?'—':pct(s.margin)}</td><td><span title="${escapeHtml([...s.issues,...s.remarks].join('; ')||'Taxação rateada pela apuração mensal')}" class="mc-status ${s.complete?'mc-estimate':'mc-incomplete'}">${s.complete?(s.review?'Estimada · revisar':'Estimada'):'Incompleta'}</span></td><td><div class="mc-actions"><button type="button" class="button button-light mc-use" data-mc-detail="${escapeHtml(s.id)}">Detalhar</button><button type="button" class="button button-light mc-use" data-mc-sale="${escapeHtml(s.id)}">Simular</button></div></td></tr>`).join(''):'<tr><td colspan="10" class="mc-empty">Nenhuma venda encontrada para o filtro escolhido.</td></tr>';
    const select=$('mcSale');const prev=select.value;
    select.innerHTML='<option value="">Preencher manualmente</option>'+r.all.map(s=>`<option value="${escapeHtml(s.id)}">${escapeHtml(s.id)} · ${escapeHtml(s.client||'Sem cliente')} · ${escapeHtml(brMoney(s.revenue))}</option>`).join('');
    select.value=r.all.some(s=>s.id===prev)?prev:'';
    $('mcRows').querySelectorAll('[data-mc-sale]').forEach(b=>b.addEventListener('click',()=>{select.value=b.dataset.mcSale;fillSale();$('mcSimulation').scrollIntoView({behavior:'smooth',block:'start'});}));
    $('mcRows').querySelectorAll('[data-mc-detail]').forEach(b=>b.addEventListener('click',()=>showDetail(b.dataset.mcDetail)));
    $('mcDetail').hidden=true;
  }
  function showDetail(id){
    const s=current&&current.all.find(s=>s.id===id);if(!s)return;
    const issues=[...s.issues,...s.remarks];
    const txText=s.taxRate===null?'Imposto não estimável':`${pct(s.taxRate*100)} (alíquota efetiva média estimada, não do cupom)`;
    const pairs=[['Receita após descontos',brMoney(s.revenue)],['CMV PEPS',s.cmv===null?'Indisponível':brMoney(s.cmv)],['Simples Nacional',s.tax===null?'Indisponível':brMoney(s.tax)],['Taxas de pagamento',s.fees===null?'Indisponível':brMoney(s.fees)],['Entregas vinculadas',brMoney(s.freight)],['Margem de contribuição',s.mc===null?'Não calculada':brMoney(s.mc)],['Margem (%)',s.margin===null?'—':pct(s.margin)]];
    const el=$('mcDetail');el.hidden=false;
    el.innerHTML=`<h3>Composição da venda ${escapeHtml(s.id)}</h3><p>${escapeHtml(dateBR(s.date))} · ${escapeHtml(s.client||'Cliente não identificado')} · ${s.lines.length} item(ns) · ${escapeHtml(s.taxNoteId?'Nota vinculada: '+(s.note?.number||s.taxNoteId):'Sem nota vinculada no registro')}</p><p>Taxação utilizada: ${escapeHtml(txText)}. Os pagamentos vinculados não são receitas adicionais.</p><table><tbody>${pairs.map(([l,v])=>`<tr><td>${escapeHtml(l)}</td><td>${escapeHtml(v)}</td></tr>`).join('')}</tbody></table><div class="mc-detail-items"><b>Itens e custos registrados (PEPS):</b><ul>${s.lines.map(m=>`<li>${escapeHtml(m.productName||'Produto não identificado')} · ${escapeHtml(String(m.quantity||0))} un. · Receita ${brMoney(Number(m.total||0))} · Custo ${hasNum(m.costTotal)?brMoney(Number(m.costTotal)):'não disponível'}</li>`).join('')}</ul></div>${issues.length?`<div class="mc-detail-warnings"><b>Verificações necessárias</b>${issues.map(i=>`<p>• ${escapeHtml(i)}</p>`).join('')}</div>`:'<p>Sem ressalvas adicionais identificadas nos campos disponíveis. A tributação permanece estimada.</p>'}<button type="button" id="mcCloseDetail" class="button button-light button-small">Fechar detalhamento</button>`;
    $('mcCloseDetail').addEventListener('click',()=>{el.hidden=true;});
    el.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function exportAudit(){
    if(!current)return;
    const format=n=>n===null||n===undefined?'':String(Number(n).toFixed(2)).replace('.',',');
    const csv=(v)=>{let t=String(v??'');if(/^[=+@\-\t\r]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';};
    const header=['Data','Venda','Cliente','Produtos','Receita','CMV','Simples estimado','Taxas','Entrega','Margem R$','Margem %','Situação','Pendências','Observações'];
    const rows=current.all.map(s=>[dateBR(s.date),s.id,s.client,s.lines.map(m=>m.productName||'').join(' | '),format(s.revenue),format(s.cmv),format(s.tax),format(s.fees),format(s.freight),format(s.mc),format(s.margin),s.complete?'Estimada':'Incompleta',s.issues.join(' | '),s.remarks.join(' | ')]);
    const body='\ufeff'+[header,...rows].map(row=>row.map(csv).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([body],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`conceito-margem-auditoria-${$('mcMonth').value}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  const setInput=(id,val)=>{$(id).value=val===null||val===undefined?'':Number(val).toFixed(2).replace('.',',');};
  function fillSale(){
    const id=$('mcSale').value;
    const sale=current&&current.all.find(s=>s.id===id);
    if(!sale){['mcPrice','mcCost','mcTaxRate','mcFeeRate','mcDelivery','mcExtra'].forEach(id=>$(id).value='');$('mcDiscount').value='0';calcSimulation();return;}
    setInput('mcPrice',sale.revenue);setInput('mcCost',sale.cmv);setInput('mcTaxRate',sale.taxRate===null?null:sale.taxRate*100);
    setInput('mcFeeRate',sale.fees===null?null:sale.revenue>0?sale.fees/sale.revenue*100:0);
    setInput('mcDelivery',sale.freight);setInput('mcExtra',0);$('mcDiscount').value='0';calcSimulation();
  }
  function calcSimulation(){
    const price=monetaryInput($('mcPrice').value),cost=monetaryInput($('mcCost').value),taxRate=percentInput($('mcTaxRate').value),feeRate=percentInput($('mcFeeRate').value);
    const discount=Number($('mcDiscount').value)||0;
    $('mcDiscountVal').textContent=pct(discount);
    const delivery=$('mcDelivery').value.trim()?monetaryInput($('mcDelivery').value):0;
    const extra=$('mcExtra').value.trim()?monetaryInput($('mcExtra').value):0;
    const valid=[price,cost,taxRate,feeRate,delivery,extra].every(v=>Number.isFinite(v)&&v>=0)&&price>0&&taxRate<=100&&feeRate<=100;
    $('mcSimWarning').textContent=valid?'Simulação gerencial. O desconto é adicional sobre o valor informado. Nenhum registro será alterado.':'Informe preço, CMV, imposto (%) e taxa (%). Use 0 quando comprovadamente não houver taxa. Valores incompletos não são tratados como zero.';
    if(!valid){$('mcSimValue').textContent='—';$('mcSimPercent').textContent='—';$('mcSimSaleValue').textContent='—';return;}
    const revenue=n2(price*(1-discount/100));
    const mc=n2(revenue-cost-revenue*taxRate/100-revenue*feeRate/100-delivery-extra);
    $('mcSimSaleValue').textContent=brMoney(revenue);$('mcSimValue').textContent=brMoney(mc);$('mcSimPercent').textContent=revenue>0?pct(100*mc/revenue):'—';
    $('mcSimValue').classList.toggle('mc-negative',mc<0);
  }
  function init(){
    const d=new Date();$('mcMonth').value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    $('mcMonth').addEventListener('change',render);
    $('mcExport').addEventListener('click',exportAudit);
    $('mcSearch').addEventListener('input',render);
    $('mcSale').addEventListener('change',fillSale);
    ['mcPrice','mcCost','mcTaxRate','mcFeeRate','mcDelivery','mcExtra','mcDiscount'].forEach(id=>$(id).addEventListener('input',calcSimulation));
    const prev=window.goTo;
    if(typeof prev==='function')window.goTo=function(name){const result=prev.apply(this,arguments);if(name==='contribuicao'&&panel.classList.contains('active'))render();return result;};
    // Também funciona com ouvintes que guardaram uma referência anterior de goTo.
    const nav=document.querySelector('.nav-link[data-panel="contribuicao"]');
    if(nav)nav.addEventListener('click',()=>{if(panel.classList.contains('active'))render();});
    const prevRender=window.renderAll;
    if(typeof prevRender==='function')window.renderAll=function(){const result=prevRender.apply(this,arguments);if(panel.classList.contains('active'))render();return result;};
    calcSimulation();
    window.ckrContribuicaoAnalise=model; // interface de leitura para verificação de qualidade.
  }
  try{init();}catch(error){console.error('Controladoria: falha ao iniciar módulo de margem',error);const el=$('mcSummary');if(el)el.textContent='Não foi possível abrir a margem de contribuição: '+(error&&error.message||'erro de inicialização');}
})();
