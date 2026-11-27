'use strict';
(function(){
 const $=id=>document.getElementById(id),panel=$('panel-blu');if(!panel)return;
 const sum=(xs,key='amount')=>xs.reduce((s,x)=>s+Number(x[key]||0),0),fmt=x=>Number.isFinite(x)?money(x):'—',pct=x=>Number.isFinite(x)?x.toLocaleString('pt-BR',{maximumFractionDigits:2,minimumFractionDigits:2})+'%':'—';
 const add=(d,n)=>{const [y,m,k]=d.split('-').map(Number);return localDateKey(new Date(y,m-1,k+n));};
 const br=d=>String(d||'').split('-').reverse().join('/');
 const card=(label,value,sub='')=>`<article class="bl-kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(sub)}</small></article>`;
 const tr=(...cells)=>'<tr>'+cells.map(x=>`<td>${esc(String(x))}</td>`).join('')+'</tr>';
 function render(){
  if(!hasFullAccess()||!panel.classList.contains('active'))return;
  const z=window.ckrBLUAnalise?.();if(!z){$('blStatus').textContent='Dados do Caixa indisponíveis.';return;}
  const {today,start}=z,month=$('blMonth').value;
  $('blStatus').textContent=`Posição atual em ${br(today)} · valores registrados no Conceito, sujeitos à conferência com extratos da BLU e da fábrica.`;
  $('blCards').innerHTML=card('Caixa BLU disponível',fmt(z.cash),'Entradas e saídas registradas até hoje')+card('Agenda BLU disponível',fmt(z.agenda),'Recebíveis futuros líquidos; não são caixa')+card('Crédito com a fábrica',fmt(z.credit),'Vinculado a compras; não é dinheiro livre')+card('Agenda a conciliar',fmt(z.committed),`${z.pendingCount} pagamento(s) aguardando conciliação`);
  const future=z.parcels.slice().sort((a,b)=>a.date.localeCompare(b.date)),scheduled=sum(future),buckets=[[1,7],[8,30],[31,60],[61,90],[91,null]];
  $('blAgendaSummary').textContent=`Parcelas futuras identificadas: ${fmt(scheduled)} · ${future.length} parcela(s). Comprometido pendente e ajustes manuais podem explicar diferenças em relação ao saldo da Agenda.`;
  $('blBuckets').innerHTML=buckets.map(([lo,hi])=>{const xs=future.filter(x=>x.date>=add(today,lo)&&(hi===null||x.date<=add(today,hi)));return tr(hi===null?'Acima de 90 dias':`${lo} a ${hi} dias`,xs.length,fmt(sum(xs)));}).join('');
  const months=new Map();future.forEach(x=>{const m=x.date.slice(0,7),r=months.get(m)||{n:0,v:0};r.n++;r.v+=x.amount;months.set(m,r);});const max=Math.max(1,...Array.from(months.values(),x=>x.v));
  $('blTrend').innerHTML=months.size?[...months].map(([m,x])=>`<div class="bl-bar-row"><span>${esc(m.slice(5)+'/'+m.slice(0,4))}</span><div class="bl-track"><i style="width:${Math.max(0,x.v/max*100)}%"></i></div><b>${esc(fmt(x.v))}</b></div>`).join(''):'<p class="bl-note">Nenhuma parcela futura identificada.</p>';
  $('blParcels').innerHTML=future.slice(0,300).map(x=>tr(br(x.date),x.method,`${x.i}/${x.n}`,fmt(x.amount),fmt(x.used))).join('')||tr('Sem parcelas','—','—','—','—');$('blParcelNote').textContent=future.length>300?'Mostrando as 300 primeiras parcelas; totais consideram todas.':'';
  $('blRecon').innerHTML=tr('Saldo bruto da Agenda',fmt(z.agendaGross))+tr('Comprometido a conciliar',fmt(z.committed))+tr('Valores bloqueados',fmt(z.blocked))+tr('Saldo disponível',fmt(z.agenda))+tr('Parcelas futuras identificadas',fmt(scheduled));
  const alerts=[];if(z.pendingCount>0)alerts.push(['warn','Conciliação pendente',`${z.pendingCount} pagamento(s) com a Agenda aguardam identificação dos recebíveis. Confira no Conceito Caixa.`]);else alerts.push(['ok','Conciliação','Não há pagamentos marcados como pendentes de conciliação. Isso não substitui a conferência do extrato.']);
  if(z.cash<0||z.agenda<0||z.credit<0)alerts.push(['warn','Saldo negativo','Há saldo negativo registrado em uma das contas. Investigue as origens e concilie com os extratos.']);
  if(z.missing.length)alerts.push(['warn','Registros incompletos',`${z.missing.length} pagamento(s) desde o corte do Caixa não têm crédito ou taxa gravados. Os saldos seguem as regras atuais do Conceito; confira extratos antes de usar os valores.`]);
  const gap=z.agenda-scheduled;if(Math.abs(gap)>=0.01)alerts.push(['warn','Agenda × parcelas identificadas',`Diferença de ${fmt(gap)} entre saldo disponível e parcelas futuras. Verifique ajustes, compromissos e extrato da BLU; não some os dois valores.`]);
  alerts.push(['neutral','Liquidez','Não some crédito da fábrica e Agenda ao dinheiro disponível para pagar despesas gerais.']);
  $('blOpinion').innerHTML=alerts.map(([cl,t,v])=>`<article class="bl-opinion ${cl}"><strong>${esc(t)}</strong><p>${esc(v)}</p></article>`).join('');
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month>today.slice(0,7)){$('blPeriod').textContent='Selecione um mês até o atual.';$('blFlow').innerHTML='';$('blCredit').innerHTML='';$('blSplit').innerHTML='';return;}
  const [y,m]=month.split('-').map(Number),a=month+'-01',end=month+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0'),b=end>today?today:end, inR=x=>x.date&&x.date>=a&&x.date<=b;
  const full=!!start&&a>=start,partial=!!start&&b>=start&&!full;
  $('blPeriod').textContent=`${br(a)} a ${br(b)} · ${b<'2026-09-01'?'Histórico anterior à implantação':a<'2026-12-01'?'Implantação e testes':'Operação oficial, sujeita à conciliação'}. ${full?'Base do Caixa cobre o período.':partial?'Caixa com cobertura parcial desde '+br(start)+'.':'Caixa sem cobertura confirmada para o período.'}`;
  const rows=z.rows.filter(x=>x.acc==='blu'&&inR(x)),inflow=sum(rows.filter(x=>x.amount>0)),outflow=-sum(rows.filter(x=>x.amount<0)),factory=sum(rows.filter(x=>x.flow==='auto'&&x.cat.startsWith('Cartão fábrica'))),own=sum(rows.filter(x=>x.flow==='auto'&&x.cat.startsWith('Parcelas do cartão loja')));
  $('blFlow').innerHTML=card('Entradas no Caixa BLU',fmt(full?inflow:NaN),'Inclui transferências e ajustes')+card('Saídas do Caixa BLU',fmt(full?outflow:NaN),'Inclui transferências e ajustes')+card('Fluxo líquido',fmt(full?inflow-outflow:NaN),'Entradas menos saídas')+card('Cartão fábrica · parte em caixa',fmt(full?factory:NaN),'Data prevista pelo Caixa')+card('Cartão loja · parcelas liquidadas pelo sistema',fmt(full?own:NaN),'Líquidas de taxas e consumos registrados');
  const cs=z.creditRows.filter(inR),generated=sum(cs.filter(x=>['Venda','Serviço','Encomenda aberta'].includes(x.kind))),manual=sum(cs.filter(x=>x.kind==='Crédito manual')),adjust=sum(cs.filter(x=>x.kind==='Ajuste de saldo')),used=-sum(cs.filter(x=>x.kind==='Utilização'));
  $('blCredit').innerHTML=card('Crédito gerado registrado',fmt(generated),'Vendas, serviços e encomendas abertas')+card('Crédito utilizado',fmt(used),'Baixas registradas')+card('Créditos manuais',fmt(manual))+card('Ajustes conciliatórios',fmt(adjust),'Não constituem receita')+card('Variação registrada',fmt(sum(cs)),'Não representa saldo histórico conciliado');
  const incomplete=z.missing.filter(x=>x.kind==='crédito fábrica'&&inR(x)),releases=z.releases.filter(inR),releasedCash=sum(releases,'cash'),releasedCredit=sum(releases,'credit'),total=releasedCash+releasedCredit,share=total>0?100*releasedCash/total:NaN;
  $('blSplit').innerHTML=card('Cartão fábrica · total identificado',fmt(full?total:NaN),'Somente pagamentos com crédito gravado')+card('Parte em dinheiro',fmt(full?releasedCash:NaN),full&&total>0?pct(share)+' do total':'—')+card('Parte vinculada à fábrica',fmt(full?releasedCredit:NaN),full&&total>0?pct(100-share)+' do total':'—')+card('Cartão fábrica sem crédito gravado',fmt(full?sum(incomplete):NaN),full?`${incomplete.length} pagamento(s) excluído(s) da divisão`:'Cobertura insuficiente');
 }
 $('blMonth').value=todayISO().slice(0,7);$('blMonth').addEventListener('change',render);$('blRefresh').addEventListener('click',render);document.querySelector('[data-panel="blu"]').addEventListener('click',render);window.ckrBLURender=render;
})();
