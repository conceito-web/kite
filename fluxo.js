'use strict';
// Conceito: FLUXO DE CAIXA (DFC) — Saldo inicial, recebimentos, pagamentos, ajustes, transferências entre contas e saldo final, por período (De / Até).
// Fonte única: as linhas do extrato do Conceito Caixa (window.ckrCaixaLinhas, em caixa.js). Nada é recalculado por fora e nada é gravado.
// Contas consideradas: Caixa BLU, Caixa NUBANK e Dinheiro CAIXA. A Caixa AGENDA BLU e o crédito com a fábrica ficam de fora.
// Saldo inicial = tudo o que foi lançado nessas contas ATÉ O DIA ANTERIOR à data inicial (sem data inicial, não há saldo anterior).
// Saldo final   = tudo o que foi lançado ATÉ A DATA FINAL, limitada à data de hoje.
// Recebimentos/pagamentos = vendas, encomendas, serviços, despesas e pedidos à fábrica pagos, entradas e saídas manuais.
// Transferências ENTRE as três contas não são recebimento nem pagamento: aparecem numa linha própria, por conta, e somam zero no total.
// Transferência com a Agenda BLU entra em recebimentos/pagamentos, pois muda o total disponível.
// Ajustes de saldo ("Editar saldo da conta") aparecem à parte.
// Saldo inicial + recebimentos − pagamentos + ajustes ± transferências entre contas = saldo final (conferido conta por conta).
// A data de corte do Caixa (conf.start) é respeitada: nada é estimado antes do histórico existente.
(function(){
const $=x=>document.getElementById(x), r2=n=>Math.round(Number(n||0)*100)/100;
const AV=['blu','nubank','dinheiro'];
const NOME={blu:'Caixa BLU',nubank:'Caixa NUBANK',dinheiro:'Dinheiro CAIXA'};
const signed=v=>(v<0?'−':'')+money(Math.abs(v));
const dk=d=>{const t=String(d||'');return /^\d{4}-\d{2}-\d{2}$/.test(t)?t:localDateKey(t);};   // data pura fica como está; ISO com hora vira dia LOCAL (Fortaleza), não UTC
const zero=()=>({blu:0,nubank:0,dinheiro:0,total:0});
const somaPor=(rows)=>{const o=zero();rows.forEach(r=>{o[r.acc]=r2(o[r.acc]+r.amount);});o.total=r2(o.blu+o.nubank+o.dinheiro);return o;};
const FORA='Transferências com a Agenda BLU (conta fora do grupo)';

// Tipo do lançamento no fluxo: 'aj' ajuste de saldo | 'int' transferência entre contas disponíveis | 'rec' recebimento | 'pag' pagamento
function tipo(r){
 if(r.flow==='ajuste')return 'aj';
 if(r.flow==='transf'&&AV.indexOf(r.pairAcc)>=0)return 'int';
 return r.amount>=0?'rec':'pag';
}
function grupo(r){
 if(r.flow==='transf')return FORA;
 if(!r.auto&&r.cat==='Entrada')return 'Entradas manuais';
 if(!r.auto&&r.cat==='Saída')return 'Saídas manuais';
 return r.cat||'Outros';
}

function compute(s,e){
 if(typeof window.ckrCaixaLinhas!=='function')return null;
 const hoje=todayISO(),L=window.ckrCaixaLinhas();
 const rows=L.rows.filter(r=>AV.indexOf(r.acc)>=0).map(r=>Object.assign({},r,{dk:dk(r.date)})).filter(r=>r.dk);
 const fim=(e&&e<hoje)?e:hoje;                 // saldo final nunca passa da data de hoje
 const futuro=!!s&&s>hoje;                      // período inteiro no futuro: não há movimento realizado
 let ini,mov;
 if(!s){ini=zero();mov=rows.filter(r=>r.dk<=fim);}
 else if(futuro){ini=somaPor(rows.filter(r=>r.dk<=hoje));mov=[];}
 else{ini=somaPor(rows.filter(r=>r.dk<s));mov=rows.filter(r=>r.dk>=s&&r.dk<=fim);}
 const por={rec:[],pag:[],aj:[],int:[]};
 mov.forEach(r=>por[tipo(r)].push(r));
 const grp=(lista)=>{const m=new Map();lista.forEach(r=>{const g=grupo(r);const o=m.get(g)||[];o.push(r);m.set(g,o);});
  return [...m.entries()].map(([nome,rs])=>({nome,v:somaPor(rs)})).sort((a,b)=>Math.abs(b.v.total)-Math.abs(a.v.total));};
 const rec=somaPor(por.rec),pag=somaPor(por.pag),aj=somaPor(por.aj),itn=somaPor(por.int),interno=r2(por.int.filter(r=>r.amount>0).reduce((n,r)=>n+r.amount,0));
 const fin=zero();AV.forEach(k=>{fin[k]=r2(ini[k]+rec[k]+pag[k]+aj[k]+itn[k]);});fin.total=r2(fin.blu+fin.nubank+fin.dinheiro);
 // contra-prova: saldo acumulado até a data final, direto das linhas (tem de ser igual à fórmula)
 const direto=futuro?ini:somaPor(rows.filter(r=>r.dk<=fim));
 const fecha=Math.abs(direto.total-fin.total)<0.005&&AV.every(k=>Math.abs(direto[k]-fin[k])<0.005);   // confere conta por conta, não só o total
 // conferência com o saldo atual do Conceito Caixa (só quando o período termina hoje ou depois)
 let conf=null;
 if(!futuro&&(!e||e>=hoje)){
  const atual=r2(AV.reduce((n,k)=>n+Number(L.saldos[k]||0),0)),dif=r2(atual-fin.total);
  const fut=rows.filter(r=>r.dk>hoje);
  conf={atual,dif,futQtd:fut.length,futVal:r2(fut.reduce((n,r)=>n+r.amount,0))};
 }
 return {s,e,fim,hoje,futuro,ini,rec,pag,aj,itn,fin,interno,fecha,conf,inicio:L.inicio,
  gRec:grp(por.rec),gPag:grp(por.pag),gAj:grp(por.aj),mov:mov.map(r=>Object.assign({},r,{t:tipo(r)}))};
}

// ---------- tela ----------
function monthRange(off){
 const n=new Date(),a=new Date(n.getFullYear(),n.getMonth()+off,1),b=new Date(a.getFullYear(),a.getMonth()+1,0);
 return [localDateKey(a),localDateKey(b)];
}
function setPreset(p){
 const n=new Date();let s='',e='';
 if(p==='mes'){[s,e]=monthRange(0);}
 else if(p==='anterior'){[s,e]=monthRange(-1);}
 else if(p==='3m'){s=monthRange(-2)[0];e=monthRange(0)[1];}
 else if(p==='ano'){s=`${n.getFullYear()}-01-01`;e=`${n.getFullYear()}-12-31`;}
 else if(p==='tudo'){s='';e='';}
 else return;
 $('fcDe').value=s;$('fcAte').value=e;
}
const period=()=>({s:$('fcDe').value,e:$('fcAte').value});
const cell=(v,cls)=>`<td class="dre-num ${cls||''}${v<-0.004?' fin-neg':''}">${signed(v)}</td>`;
const linha=(label,v,kind)=>`<tr class="${kind==='head'?'dre-head':kind==='total'?'dre-total':'dre-sub'+(Math.abs(v.total)<0.005?' dre-zero':'')}"><td>${esc(label)}</td>${AV.map(k=>cell(v[k])).join('')}${cell(v.total)}</tr>`;

function render(){
 const panel=$('panel-fluxo');if(!panel||!panel.classList.contains('active'))return;
 const {s,e}=period();
 if(s&&e&&e<s){
  $('fcPeriodoDesc').textContent='Período inválido.';
  $('fcCorpo').innerHTML='';$('fcLinhas').innerHTML='';$('fcResumoLista').textContent='';$('fcVazio').style.display='block';
  $('fcAvisos').innerHTML='<p><b>Período inválido:</b> a data final é anterior à data inicial. Corrija as datas de De / Até.</p>';
  return;
 }
 const R=compute(s,e);if(!R)return;
 $('fcPeriodoDesc').textContent=`${s?dayText(s):'Desde o início'} até ${dayText(R.fim)}${e&&e>R.hoje?' (limitado a hoje)':''} · Caixa BLU + Caixa NUBANK + Dinheiro CAIXA, sem a Agenda BLU e sem crédito com a fábrica.`;
 $('fcIni').textContent=signed(R.ini.total);
 $('fcIniNota').textContent=s?(R.futuro?'Posição de hoje (período futuro)':`Posição ao fim de ${dayText(dayBefore(s))}`):'Sem data inicial: não há saldo anterior';
 $('fcRec').textContent=money(R.rec.total);
 $('fcPag').textContent=money(Math.abs(R.pag.total));
 $('fcAj').textContent=signed(R.aj.total);
 $('fcFin').textContent=signed(R.fin.total);
 $('fcFinNota').textContent=R.futuro?'Período ainda não começou':`Posição ao fim de ${dayText(R.fim)}`;
 [['fcFin',R.fin.total],['fcAj',R.aj.total]].forEach(([id,v])=>{const el=$(id);el.classList.remove('fin-pos','fin-neg');if(v>0.004)el.classList.add('fin-pos');else if(v<-0.004)el.classList.add('fin-neg');});

 let body=linha('Saldo inicial',R.ini,'total');
 body+=linha('(+) Recebimentos',R.rec,'head')+R.gRec.map(g=>linha(g.nome,g.v)).join('');
 body+=linha('(−) Pagamentos',R.pag,'head')+R.gPag.map(g=>linha(g.nome,g.v)).join('');
 body+=linha('(±) Ajustes de saldo',R.aj,'head')+R.gAj.map(g=>linha(g.nome,g.v)).join('');
 if(AV.some(k=>Math.abs(R.itn[k])>0.004))body+=linha('(±) Transferências entre contas',R.itn,'head');
 body+=linha('= Saldo final',R.fin,'total');
 $('fcCorpo').innerHTML=body;

 const av=[];
 if(!R.fecha)av.push(`<p><b>Atenção:</b> a fórmula não fechou com o saldo acumulado das linhas do Caixa. Avise o suporte.</p>`);
 else av.push(`<p><b>Fecha (total e cada conta):</b> ${signed(R.ini.total)} + ${money(R.rec.total)} − ${money(Math.abs(R.pag.total))} ${R.aj.total<0?'−':'+'} ${money(Math.abs(R.aj.total))} = <b>${signed(R.fin.total)}</b>.</p>`);
 if(Math.abs(R.aj.total)>0.004||AV.some(k=>Math.abs(R.aj[k])>0.004))av.push(`<p><b>Ajustes de saldo:</b> ${signed(R.aj.total)} no período. Ajuste é diferença sem origem registrada (ou saldo inicial lançado na implantação); confira se algum deles esconde uma entrada ou saída que deveria ter sido lançada.</p>`);
 av.push(`<p>Cartão da loja entra no Caixa já líquido da taxa, por isso a taxa do cartão (que o DRE mostra como despesa) não aparece como pagamento aqui.</p>`);
 if(R.interno>0.004)av.push(`<p>Transferências entre as três contas no período: ${money(R.interno)}. Não entram como recebimento nem como pagamento: movem o saldo entre as contas e somam zero no total.</p>`);
 if(R.conf){
  if(Math.abs(R.conf.dif)<0.005)av.push(`<p><b>Confere com o Conceito Caixa:</b> o saldo final é igual à soma das três contas hoje (${signed(R.conf.atual)}).</p>`);
  else av.push(`<p><b>Diferença de ${signed(R.conf.dif)} para o Conceito Caixa</b> (soma das três contas hoje: ${signed(R.conf.atual)}). ${R.conf.futQtd?`Há ${R.conf.futQtd} lançamento(s) com data futura somando ${signed(R.conf.futVal)}: o Caixa já os soma ao saldo, mas o fluxo respeita a data e só os conta quando chegar o dia.`:'Nenhum lançamento com data futura explica a diferença; confira o extrato do Caixa.'}</p>`);
 }
 if(R.inicio&&(!s||s<R.inicio))av.push(`<p><b>Data de corte do Caixa:</b> as vendas, serviços e despesas só contam a partir de ${dayText(R.inicio)}. Antes disso o saldo inicial reflete apenas os lançamentos manuais e ajustes que existem no Caixa; nenhum saldo foi estimado.</p>`);
 if(R.futuro)av.push(`<p>A data inicial é posterior a hoje: não há movimento realizado neste período.</p>`);
 $('fcAvisos').innerHTML=av.join('');

 const ord=R.mov.slice().sort((a,b)=>b.dk.localeCompare(a.dk)||String(b.ts||'').localeCompare(String(a.ts||'')));
 const NT={rec:'Recebimento',pag:'Pagamento',aj:'Ajuste de saldo',int:'Transf. interna'};
 $('fcResumoLista').textContent=`${ord.length} lançamento(s) nas três contas dentro do período.`;
 $('fcLinhas').innerHTML=ord.slice(0,300).map(r=>`<tr><td>${dayText(r.dk)}</td><td>${esc(NOME[r.acc])}</td><td><span class="product-name">${esc(r.desc)}</span>${r.sub?`<small class="fin-sub">${esc(r.sub)}</small>`:''}</td><td><span class="pill ${r.t==='aj'?'cxman':'cxauto'}">${NT[r.t]}</span></td><td><b class="${r.amount<0?'cx-neg':'cx-pos'}">${signed(r.amount)}</b></td></tr>`).join('')
  +(ord.length>300?`<tr><td colspan="5" class="fin-meta-text">Mostrando os 300 mais recentes. Os totais acima consideram todos.</td></tr>`:'');
 $('fcVazio').style.display=ord.length?'none':'block';
}
function dayBefore(k){const p=k.split('-').map(Number);return localDateKey(new Date(p[0],p[1]-1,p[2]-1));}

function exportCsv(){
 const {s,e}=period();
 if(s&&e&&e<s){toast('Período inválido: a data final é anterior à inicial.',true);return;}
 const R=compute(s,e);if(!R)return;
 const c=v=>{const t=String(v??'');return /[";\n\r]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;},n=v=>v.toFixed(2).replace('.',',');
 const out=[['Fluxo de Caixa',`${s?dayText(s):'Início'} a ${dayText(R.fim)}`].join(';'),['Descrição',...AV.map(k=>NOME[k]),'Total'].join(';')];
 const add=(l,v)=>out.push([l,...AV.map(k=>n(v[k])),n(v.total)].map(c).join(';'));
 add('Saldo inicial',R.ini);add('(+) Recebimentos',R.rec);R.gRec.forEach(g=>add('  '+g.nome,g.v));
 add('(−) Pagamentos',R.pag);R.gPag.forEach(g=>add('  '+g.nome,g.v));
 add('(±) Ajustes de saldo',R.aj);R.gAj.forEach(g=>add('  '+g.nome,g.v));
 if(AV.some(k=>Math.abs(R.itn[k])>0.004))add('(±) Transferências entre contas',R.itn);
 add('= Saldo final',R.fin);
 const blob=new Blob(['\ufeff'+out.join('\r\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
 a.href=URL.createObjectURL(blob);a.download=`fluxo-de-caixa-${s||'inicio'}_a_${R.fim}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 toast('Fluxo de caixa exportado.');
}

function init(){
 if(!$('panel-fluxo'))return;
 setPreset('mes');
 $('fcPreset').addEventListener('change',()=>{setPreset($('fcPreset').value);render();});
 ['fcDe','fcAte'].forEach(k=>$(k).addEventListener('change',()=>{$('fcPreset').value='custom';render();}));
 $('fcCsv').addEventListener('click',exportCsv);
}
init();

const baseRender=window.renderAll;
window.renderAll=function(){baseRender();render();};
const baseGoTo=window.goTo;
window.goTo=function(name){baseGoTo.apply(this,arguments);if(name==='fluxo')render();};
})();
