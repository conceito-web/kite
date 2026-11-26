'use strict';
// Conceito · planejamento de recorrências; não altera o caixa e exige confirmação para revisão.
(function(){
 const $=id=>document.getElementById(id), r2=v=>Math.round(Number(v||0)*100)/100;
 const personal=new Set(['cagece casa','enel casa','internet casa vivo','internet tim celia 97339746']);
 const normalize=s=>String(s||'').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
 const expenseDate=e=>String(e.date||e.dueDate||'').slice(0,10);
 const base='2026-12-01'; // NÃO toca em lançamentos de novembro nem anteriores
 const matches=e=>e&&e.recurring===true&&e.status!=='pago'&&expenseDate(e)>=base&&!e.paidDate;
 const isPersonal=e=>personal.has(normalize(e.description));
 const key=e=>String(e.group||'')||normalize(e.description);
 const future=()=>Array.isArray(data.expenses)?data.expenses.filter(matches):[];
 const revised=()=>Array.isArray(data.expenseTemplates)&&data.expensePlanningReviewed===true;
 const validMonth=v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
 function label(e){return e.description||'Despesa sem descrição';}
 function esc(t){return String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function saveCopy(){
  const j=JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2),u=URL.createObjectURL(new Blob([j],{type:'application/json'}));
  const a=document.createElement('a');a.href=u;a.download='conceito-pre-revisao-recorrencias-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),20000);
 }
 function listModels(rows){
  const groups=new Map();for(const e of rows){const k=key(e);const prev=groups.get(k);if(!prev||expenseDate(e)<expenseDate(prev))groups.set(k,e);}
  return [...groups.values()].map(e=>({group:key(e),name:String(e.description||''),amount:r2(e.amount),category:e.category||'Outras',itemId:e.itemId||'',method:e.method||'',dueDay:Number(String(e.dueDate||e.date||'').slice(8,10))||10,compMonth:e.compMonth||'',note:e.note||'',active:true})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 }
 function banner(){
  if(!$('planejResumo'))return;
  const all=future(),p=all.filter(isPersonal),business=all.filter(e=>!isPersonal(e));
  if(revised())$('planejResumo').textContent=`Revisão realizada. ${data.expenseTemplates.length} modelos mensais de despesas da loja. Nenhuma projeção será criada automaticamente.`;
  else $('planejResumo').textContent=`Revisão inicial pendente: ${p.length} projeções claramente pessoais (${money(r2(p.reduce((n,e)=>n+Number(e.amount||0),0)))}) e ${business.length} projeções de outras despesas que podem ser convertidas em modelos mensais. Nenhum dado será alterado antes da confirmação.`;
 }
 function review(){
  if(!hasFullAccess()){toast('Somente usuário autorizado pode revisar despesas.',true);return;}
  if(revised()){
   if(!confirm('A revisão inicial já foi aplicada. Deseja revisar novamente? Nenhum dado será removido nesta etapa.'))return;
   banner();return;
  }
  const all=future(),people=all.filter(isPersonal),store=all.filter(e=>!isPersonal(e));
  const total=rows=>money(r2(rows.reduce((n,e)=>n+Number(e.amount||0),0)));
  const names=[...new Set(people.map(e=>e.description))].sort();
  const groups=listModels(store);
  const duplicates=groups.filter(e=>/sal[aá]rio|contador/i.test(e.name)).map(e=>e.name);
  const message=`REVISÃO DE RECORRÊNCIAS FUTURAS (somente ambiente atual)\n\n`+
   `${people.length} projeções pessoais futuras serão excluídas: ${total(people)}.\n`+
   `Identificadas: ${names.join(', ')}.\n\n`+
   `${store.length} previsões empresariais futuras (${total(store)}) serão retiradas de Contas a Pagar e convertidas em ${groups.length} modelos para confirmação mensal.\n`+
   `Itens que exigem atenção ao aprovar mensalmente: ${duplicates.join('; ')||'nenhum'}.\n\n`+
   `Pagamentos realizados, despesas anteriores a dezembro, despesas não recorrentes, Caixa, fábrica e DRE histórica NÃO serão alterados.\n\n`+
   `O programa baixará primeiro um JSON de segurança. Confira o download e confirme na próxima janela. Continuar?`;
  if(!confirm(message))return;
  saveCopy();
  if(!confirm('A cópia de segurança ANTERIOR à revisão foi baixada? Confirme somente depois de verificar o arquivo em Downloads.'))return;
  const previous=JSON.stringify(data);
  try{
   const ids=new Set(all.map(e=>e.id));
   data.expensePlanningArchive=all.map(e=>({...e,archivedForPlanningAt:new Date().toISOString(),reason:isPersonal(e)?'projeção pessoal futura excluída':'projeção empresarial futura transformada em modelo mensal'}));
   data.expenses=data.expenses.filter(e=>!ids.has(e.id));
   data.expenseTemplates=groups;
   data.expensePlanningReviewed=true;
   data.expensePlanningAudit={at:new Date().toISOString(),removedPersonal:people.length,removedPersonalValue:r2(people.reduce((n,e)=>n+Number(e.amount||0),0)),convertedForecast:store.length,convertedValue:r2(store.reduce((n,e)=>n+Number(e.amount||0),0)),source:'Revisão manual com confirmação'};
   if(!saveData())throw Error('Falha ao salvar os registros revisados.');
   banner();showMonth();toast('Revisão concluída. Consulte as sugestões de cada mês.');
  }catch(err){data=JSON.parse(previous);try{saveData();}catch(_){}alert('A revisão falhou; os dados anteriores foram preservados. '+err.message);}
 }
 function monthDue(month,day){const [y,m]=month.split('-').map(Number),last=new Date(y,m,0).getDate();return month+'-'+String(Math.min(day,last)).padStart(2,'0');}
 function showMonth(){
  const panel=$('planejLista'),month=$('planejMes').value;
  if(!validMonth(month)){panel.hidden=false;panel.textContent='Escolha um mês válido.';return;}
  if(!revised()){panel.hidden=false;panel.textContent='Primeiro revise as projeções futuras para criar os modelos mensais.';return;}
  const models=data.expenseTemplates||[];
  const existing=new Set((data.expenses||[]).filter(e=>(e.dueDate||e.date||'').slice(0,7)===month).map(e=>normalize(e.description)));
  panel.hidden=false;
  panel.innerHTML=`<p class="fin-meta-text" style="margin:6px 0">Sugestões para ${esc(month)}. Marque apenas obrigações reais da CKR; os valores e vencimentos são editáveis. Desmarcadas não serão criadas.</p>`+
   `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th>Aprovar</th><th>Despesa</th><th>Valor (R$)</th><th>Vencimento</th></tr></thead><tbody>`+
   models.map((m,i)=>{const dup=existing.has(normalize(m.name));return `<tr><td><input type="checkbox" data-plan-check="${i}" ${dup?'disabled':''}></td><td>${esc(m.name)}${dup?' <small>(já cadastrada neste mês)</small>':''}${/sal[aá]rio|contador/i.test(m.name)?' <small>(confira possíveis duplicidades)</small>':''}</td><td><input type="number" min="0.01" step="0.01" value="${Number(m.amount).toFixed(2)}" data-plan-value="${i}" style="width:115px"></td><td><input type="date" value="${monthDue(month,m.dueDay)}" data-plan-date="${i}"></td></tr>`;}).join('')+`</tbody></table></div><div style="margin-top:12px"><button class="button button-primary" type="button" id="planejConfirmar">Criar despesas selecionadas</button></div>`;
  $('planejConfirmar').addEventListener('click',()=>approve(month));
 }
 function approve(month){
  if(!hasFullAccess())return toast('Sem permissão para lançar despesas.',true);
  if(!validMonth(month))return;
  const models=data.expenseTemplates||[],chosen=[];
  for(const checkbox of $('planejLista').querySelectorAll('[data-plan-check]')){
   if(!checkbox.checked||checkbox.disabled)continue;
   const i=+checkbox.dataset.planCheck,m=models[i],value=Number($('planejLista').querySelector(`[data-plan-value="${i}"]`).value),due=$('planejLista').querySelector(`[data-plan-date="${i}"]`).value;
   if(!Number.isFinite(value)||value<=0||!/^\d{4}-\d{2}-\d{2}$/.test(due)||due.slice(0,7)!==month)return alert('Confira os valores e os vencimentos; todos devem pertencer ao mês selecionado.');
   if((data.expenses||[]).some(e=>normalize(e.description)===normalize(m.name)&&(e.dueDate||e.date||'').slice(0,7)===month))return alert(`Já existe despesa deste mês com a descrição ${m.name}.`);
   chosen.push({m,value:r2(value),due});
  }
  if(!chosen.length)return toast('Marque ao menos uma sugestão ainda não cadastrada.',true);
  if(!confirm(`Criar ${chosen.length} despesa(s) pendente(s) no mês ${month}? Elas passarão a integrar Contas a Pagar e a DRE segundo as regras atuais.`))return;
  const snapshot=JSON.stringify(data);
  try{
   const stamp=new Date().toISOString();
   for(const {m,value,due} of chosen){data.expenses.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random(),date:due,category:m.category,description:m.name,itemId:m.itemId,amount:value,method:'Não informada',account:'',status:'pendente',dueDate:due,paidDate:'',recurring:true,note:m.note,createdAt:stamp,planningSource:'monthly-confirmation'});}
   if(!saveData())throw Error('Falha ao gravar despesas');
   showMonth();banner();toast(`${chosen.length} despesa(s) criada(s) para ${month}.`);
  }catch(err){data=JSON.parse(snapshot);try{saveData();}catch(_){}alert('Não foi possível salvar. Nenhuma criação foi mantida.');}
 }
 function init(){if(!$('planejMes'))return;$('planejMes').value=(todayISO().slice(0,7)<'2026-12'?'2026-12':todayISO().slice(0,7));$('planejRevisao').addEventListener('click',review);$('planejAbrir').addEventListener('click',showMonth);banner();window.ckrPlanejamentoCarregado=true;}
 try{init();}catch(err){console.error('Conceito: erro no planejamento mensal',err);const el=document.getElementById('planejResumo');if(el)el.textContent='Falha ao iniciar o planejamento mensal. Nenhum dado foi alterado. Detalhe: '+(err&&err.message||err);}
})();
