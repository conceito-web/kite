'use strict';
(function(){
 const $=id=>document.getElementById(id),p=$('panel-auditoria');if(!p)return;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=v=>typeof v==='number'&&Number.isFinite(v)?money(v):'Indisponível';
 const round=v=>Math.round(v*100)/100;
 const checks=['Vendas, descontos, cancelamentos e devoluções conferidos','Estoque físico e custos de aquisição conferidos','Notas fiscais e apuração tributária conferidas','Despesas, competências e fornecedores conferidos','Boletos antigos, parcelas e promissórias conferidos','Extratos bancários, Agenda BLU e crédito Ortobom conciliados','DRE e DFC revisados; divergências explicadas','Backup integral realizado'];
 const records=()=>data.settings?.auditMonthly||{};
 const month=()=> $('audMonth').value;
 const valid=k=>/^\d{4}-(0[1-9]|1[0-2])$/.test(k);
 let snapshot=null;
 function calculate(){const k=month();if(!valid(k)||!hasFullAccess())return null;const [y,m]=k.split('-').map(Number),end=k+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0'),today=todayISO(),until=end<today?end:today;
 const dre=k>today.slice(0,7)?null:window.ckrDreResumoPeriodo?.(k+'-01',until),dfc=k>today.slice(0,7)?null:window.ckrFluxoResumoPeriodo?.(k+'-01',until),cx=window.ckrCaixaPainelResumo?.();
 const bal=cx?[['Caixa BLU',cx.contas?.blu?.saldo],['Caixa NUBANK',cx.contas?.nubank?.saldo],['Dinheiro CAIXA',cx.contas?.dinheiro?.saldo],['Agenda BLU',cx.agenda],['Crédito com a fábrica',window.ckrCreditoFabricaSaldo?.()]]:[];
 return {k,end,until,dre,dfc,bal,cx};}
 function card(t,v){return `<article class="surface" style="padding:16px"><small>${esc(t)}</small><h2>${esc(v)}</h2></article>`;}
 function render(){if(!hasFullAccess())return;try{snapshot=calculate();if(!snapshot)return;const s=snapshot; $('audStatus').textContent=(s.k<'2026-12'?'Período de testes — referência preliminar. ':'Período operacional oficial — sujeito a conciliação. ')+(s.end>=todayISO()?'Competência ainda não encerrada.':'Competência encerrada no calendário.');
 $('audCards').innerHTML=card('Faturamento DRE',fmt(s.dre?.faturamento))+card('Resultado DRE',fmt(s.dre?.lucro))+card('Saldo final DFC',fmt(s.dfc?.saldoFinal))+card('Consistência interna DFC',s.dfc?.fecha===true?'Confere':s.dfc?.fecha===false?'Divergência':'Indisponível')+card('Vendas sem custo (DRE)',s.dre?.semCusto==null?'Indisponível':String(s.dre.semCusto))+card('Conciliações pendentes da Agenda',s.cx?.agendaPendente==null?'Indisponível':String(s.cx.agendaPendente));
 $('audBalances').innerHTML=s.bal.map(([name,v],i)=>`<tr><td>${esc(name)}</td><td>${fmt(v)}</td><td><input type="text" inputmode="decimal" data-aud-real="${i}" placeholder="Ex.: 1234,56"></td><td data-aud-diff="${i}">—</td></tr>`).join('');
 const rec=records()[s.k];$('audChecks').innerHTML=checks.map((t,i)=>`<label style="display:flex;gap:10px;align-items:center;margin:12px 0"><input type="checkbox" data-aud-check="${i}" ${rec?.checks?.[i]?'checked':''}>${esc(t)}</label>`).join('');$('audNote').value=rec?.note||'';$('audSaved').textContent=rec?`Último registro: ${new Date(rec.at).toLocaleString('pt-BR')} · ${rec.by||'—'} · ${rec.checks.filter(Boolean).length}/${checks.length} itens. Confira novamente após alterações.`:'Nenhuma conferência salva.';
 }catch(e){$('audStatus').textContent='Não foi possível consultar os indicadores: '+e.message;}}
 $('audBalances').addEventListener('input',e=>{const i=e.target.dataset.audReal;if(i===undefined)return;const raw=e.target.value.trim(),v=/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw)?Number(raw.replace(/\./g,'').replace(',','.')):NaN;const b=snapshot?.bal[Number(i)]?.[1];p.querySelector(`[data-aud-diff="${i}"]`).textContent=Number.isFinite(v)&&Number.isFinite(b)?fmt(round(v-b)):'—';});
 $('audSave').addEventListener('click',()=>{if(!hasFullAccess()||!snapshot||snapshot.k!==month())return;const cs=[...p.querySelectorAll('[data-aud-check]')].map(x=>x.checked);const note=$('audNote').value.trim();if(!confirm('Salvar checklist de conferência? Não bloqueia a competência nem altera saldos.'))return;const previous=data.settings.auditMonthly;const old=records()[month()];const record={at:new Date().toISOString(),by:currentUserName(),checks:cs,note,indicators:{dre:snapshot.dre,dfc:snapshot.dfc},history:[...(old?.history||[]),...(old?[{at:old.at,by:old.by,checks:old.checks,note:old.note,indicators:old.indicators}]:[])]};data.settings.auditMonthly={...records(),[month()]:record};if(saveData()){render();toast('Conferência registrada.');}else data.settings.auditMonthly=previous;});
 $('audMonth').value=todayISO().slice(0,7);$('audMonth').addEventListener('change',render);$('audRefresh').addEventListener('click',render);document.querySelector('.nav-link[data-panel="auditoria"]').addEventListener('click',render);
})();
