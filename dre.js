'use strict';
// Conceito: DRE — Demonstração do Resultado do Exercício, por período (De / Para).
// Competência: despesas pagas no mês seguinte entram no mês anterior (ver DEFER).
// Fontes: vendas (movimentos 'venda' ativos), Simples Nacional (painel Impostos) e despesas (painel Despesas).
// Usa as funções e dados do app.js (data, money, saveData, localDateKey, todayISO, esc, fold, toast, PM, ...).
(function(){
const $=x=>document.getElementById(x), r2=n=>Math.round(Number(n||0)*100)/100;
const exps=()=>data.expenses||(data.expenses=[]);
const inR=(k,s,e)=>!!k&&(!s||k>=s)&&(!e||k<=e);
const signed=v=>(v<0?'−':'')+money(Math.abs(v));
const pct=(v,d=1)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})+'%';
const numN=v=>(v===undefined||v===null||v==='')?NaN:Number(v);

// ---------- linhas da DRE que recebem despesas lançadas ----------
// [chave, rótulo, grupo]. O grupo define em qual bloco da DRE a linha aparece.
const LINES=[
 ['devolucoes','Devoluções','ded'],
 ['comissao','Comissão','vend'],['salariosOp','Salários (OP)','vend'],['frete','Frete','vend'],['fgtsOp','FGTS (OP)','vend'],
 ['agua','Água e Esgoto','fixa'],['aluguel','Aluguel','fixa'],['contabeis','Serviços Contábeis','fixa'],['fgtsF','FGTS (F)','fixa'],
 ['energia','Energia','fixa'],['telefone','Telefone e Internet','fixa'],['propaganda','Propaganda e Publicidade','fixa'],['gps','GPS','fixa'],
 ['nfce','Solução NF-CE','fixa'],['iptu','IPTU/TMRSD','fixa'],['material','Material de consumo','fixa'],['salariosF','Salários (F)','fixa'],
 ['servprof','Serviços Profissionais Contra.','fixa'],['outras','Outras despesas operacionais','fixa'],
 ['rendimentos','Rendimentos de Aplicação Fin.','div'],['jurosAtivos','Juros Ativos','div'],['despBancarias','Despesas Bancárias','div'],
 ['jurosPassivos','Juros Passivos','div'],['descontosConc','Descontos Concedidos','div'],
 ['ignorar','Não entra na DRE (já contado em outra linha)','x']
];
const LBL=Object.fromEntries(LINES.map(l=>[l[0],l[1]]));
const GROUPS=[['ded','Deduções'],['vend','Despesas de vendas'],['fixa','Despesas operacionais (fixas)'],['div','Receitas/Despesas diversas'],['x','Outros']];
// Classificação automática pela categoria + descrição (a ordem importa: o primeiro que casar vale).
const RULES=[
 ['ignorar',/\bsimples\b|\bdas\b/],
 ['devolucoes',/devolu/],
 ['descontosConc',/desconto.*conced|conced.*desconto/],
 ['rendimentos',/rendimento|aplicacao|\bcdb\b|renda fixa/],
 ['jurosAtivos',/juros (ativo|recebido)|juros a receber/],
 ['jurosPassivos',/juros|multa|\bmora\b|emprestimo|financiamento/],
 ['despBancarias',/tarifa|bancari|\bted\b|\bdoc\b|anuidade|manutencao de conta/],
 ['comissao',/comiss/],
 ['fgtsOp',/fgts.*(\(op\)|\bop\b|vend)/],
 ['fgtsF',/fgts/],
 ['salariosOp',/(salar|folha|ordenado).*(\(op\)|\bop\b)|vendedor/],
 ['salariosF',/salar|folha|pro.?labore|\b13o\b|ferias|decimo/],
 ['frete',/frete|entrega|motoboy|transportad/],
 ['agua',/agua|esgoto|cagece|saneamento/],
 ['aluguel',/alugue|locacao/],
 ['contabeis',/contab|contador/],
 ['energia',/energia|\bluz\b|\benel\b|coelce/],
 ['telefone',/telefon|internet|celular|\bvivo\b|\bclaro\b|\btim\b|\boi\b|wi.?fi/],
 ['propaganda',/propaganda|publicidade|anuncio|marketing|instagram|facebook|google ads|divulg/],
 ['gps',/\bgps\b|\binss\b|previdenc/],
 ['nfce',/nf.?c.?e|\bnfe\b|nota fiscal|emissor|solucao nf/],
 ['iptu',/iptu|tmrsd|taxa de lixo|alvara/],
 ['servprof',/servico.*(profission|contrat|terceir)|profission|contratad|terceiriz|consultoria|assessoria|freela/],
 ['material',/material|limpeza|escritorio|papelaria|consumo/]
];
function autoLine(x){
 const t=fold([x.category,x.description].join(' '));
 for(const [k,re] of RULES)if(re.test(t))return k;
 return 'outras';
}
const lineOf=x=>(x.dre&&LBL[x.dre])?x.dre:autoLine(x);

// ---------- competência ----------
// Despesas lançadas pela data do PAGAMENTO, mas que se referem ao mês anterior (conta de luz, contador, internet...),
// entram na DRE do mês anterior. Para mudar quais linhas fazem isso, edite a lista abaixo.
// Em cada despesa dá para escolher manualmente: "Mês do pagamento" ou "Mês anterior".
const DEFER=['contabeis','telefone','energia','agua','gps','fgtsF','fgtsOp'];
function prevMonthDate(iso){
 const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso||''));if(!m)return iso;
 let y=+m[1],mo=+m[2]-1;const dia=+m[3];
 if(mo<1){mo=12;y--;}
 const ult=new Date(y,mo,0).getDate();
 return `${y}-${String(mo).padStart(2,'0')}-${String(Math.min(dia,ult)).padStart(2,'0')}`;
}
const compAuto=x=>DEFER.includes(lineOf(x))?'ant':'pag';
const compMode=x=>(x.dreComp==='ant'||x.dreComp==='pag')?x.dreComp:compAuto(x);
const compDate=x=>compMode(x)==='ant'?prevMonthDate(x.date):x.date;
const COMP_LBL={pag:'Mês do pagamento',ant:'Mês anterior'};

// ---------- cálculo ----------
function compute(s,e){
 const C={gross:0,desc:0,cmv:0,cmvCredito:0,fee:0,sem:0,vendasQtd:0};
 // parte da venda paga no cartão da fábrica (o custo dessa parte não é descontado de novo: vira crédito com a fábrica)
 const bySale=new Map();
 data.movements.forEach(m=>{
  if(m.type!=='venda'||m.canceled)return;
  const k=m.saleId||m.id,o=bySale.get(k)||{total:0,fab:0,seen:false};
  o.total+=Number(m.total||0);
  if(!o.seen){o.seen=true;o.fab=(Array.isArray(m.payments)?m.payments:[]).filter(p=>(p.method===PM.CREDIT||p.method===PM.BLU||p.method===PM.DEBIT)&&p.responsible==='fabrica').reduce((n,p)=>n+Number(p.amount||0),0);}
  bySale.set(k,o);
 });
 const vendas=new Set();
 data.movements.forEach(m=>{
  if(m.type!=='venda'||m.canceled||!inR(localDateKey(m.date),s,e))return;
  const k=m.saleId||m.id,sale=bySale.get(k)||{total:0,fab:0},f=sale.total>0?Math.min(1,sale.fab/sale.total):0;
  const t=Number(m.total||0),qty=Number(m.quantity||0),unit=numN(m.unitPrice);
  let gross=Number.isFinite(unit)?r2(unit*qty):t;if(gross<t)gross=t;
  C.gross+=gross;C.desc+=gross-t;vendas.add(k);
  C.fee+=Number(m.fee||0);
  const c=numN(m.costTotal);
  if(Number.isFinite(c)){C.cmv+=c*(1-f);C.cmvCredito+=Number(m.factoryCredit||0);}else C.sem++;
 });
 C.vendasQtd=vendas.size;
 // receitas de serviços (janela "Serviço"): entram como receita; a taxa do cartão vai para a despesa com taxa de cartão
 C.servico=0;
 (typeof window.ckrServicos==='function'?window.ckrServicos():[]).forEach(sv=>{if(!inR(localDateKey(sv.date),s,e))return;C.servico+=Number(sv.amount||0);C.fee+=Number((sv.payment||{}).fee||0);});   // serviço não tem CMV: mesmo pago pela fábrica, o crédito com a fábrica não entra no CMV
 // despesas lançadas (pela data de competência: a do pagamento, ou a do mês anterior para contas pagas no mês seguinte)
 const L={};LINES.forEach(l=>L[l[0]]=0);const itens=[];
 exps().forEach(x=>{
  const cd=compDate(x);
  if(!inR(cd,s,e))return;
  const k=lineOf(x),v=Number(x.amount||0);L[k]+=v;itens.push({x,k,v,cd});
 });
 // Simples Nacional (mesmo cálculo do painel Impostos)
 const sn=typeof window.ckrSimplesPeriodo==='function'?window.ckrSimplesPeriodo(s,e):{total:0,meses:[]};
 const R={};
 R.gross=r2(C.gross);R.servico=r2(C.servico);R.rec=r2(R.gross+R.servico);
 R.dev=r2(L.devolucoes);R.simples=r2(sn.total);R.desc=r2(C.desc);R.ded=r2(R.dev+R.simples+R.desc);
 R.liq=r2(R.rec-R.ded);
 R.cmv=r2(C.cmv+C.cmvCredito);R.cmvCredito=r2(C.cmvCredito);
 R.bruto=r2(R.liq-R.cmv);
 R.taxa=r2(C.fee);
 R.vend=r2(L.comissao+L.salariosOp+L.frete+L.fgtsOp+R.taxa);
 const fixas=LINES.filter(l=>l[2]==='fixa').map(l=>l[0]);
 R.fixas=r2(fixas.reduce((n,k)=>n+L[k],0));
 R.oper=r2(R.bruto-R.vend-R.fixas);
 R.divers=r2(L.rendimentos+L.jurosAtivos-L.despBancarias-L.jurosPassivos-L.descontosConc);
 R.res=r2(R.oper+R.divers);
 R.L=L;R.itens=itens;R.sem=C.sem;R.vendasQtd=C.vendasQtd;R.meses=sn.meses;R.ignorado=r2(L.ignorar);
 return R;
}

// ---------- montagem da tabela ----------
function rows(R){
 const L=R.L,out=[];
 const head=(label,val)=>out.push({t:'head',label,val});
 const sub=(label,val,key)=>out.push({t:'sub',label,val,key});
 const tot=(label,val)=>out.push({t:'total',label,val});
 head('(+) Receita de vendas',R.rec);
 sub('Receita com vendas',R.gross);sub('Venda de serviço',R.servico);
 head('(−) Deduções',R.ded);
 sub('Devoluções',R.dev);sub('Simples Nacional',R.simples);sub('Descontos e Abatimentos',R.desc);
 tot('(=) Receita Líquida',R.liq);
 head('(−) CMV',R.cmv);
 tot('(=) Lucro Bruto',R.bruto);
 head('(−) Despesa de Vendas',R.vend);
 ['comissao','salariosOp','frete','fgtsOp'].forEach(k=>sub(LBL[k],L[k]));
 sub('Despesa com taxa de cartão',R.taxa);
 head('(−) Despesas Operacionais (fixas)',R.fixas);
 LINES.filter(l=>l[2]==='fixa').forEach(l=>sub(l[1],L[l[0]]));
 tot('(=) Lucro Operacional',R.oper);
 head('(+/−) Receitas/Despesas Diversas',R.divers);
 sub('(+) '+LBL.rendimentos,L.rendimentos);sub('(+) '+LBL.jurosAtivos,L.jurosAtivos);
 sub('(−) '+LBL.despBancarias,L.despBancarias);sub('(−) '+LBL.jurosPassivos,L.jurosPassivos);sub('(−) '+LBL.descontosConc,L.descontosConc);
 tot('(=) Lucro/Prejuízo',R.res);
 return out;
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
 $('dreDe').value=s;$('dreAte').value=e;
}
const period=()=>({s:$('dreDe').value,e:$('dreAte').value});
function tone(el,v){el.classList.remove('fin-pos','fin-neg');if(v>0)el.classList.add('fin-pos');else if(v<0)el.classList.add('fin-neg');}

function renderTable(R){
 const base=R.rec;
 $('dreCorpo').innerHTML=rows(R).map(r=>{
  const cls=r.t==='head'?'dre-head':r.t==='total'?'dre-total':'dre-sub'+(Math.abs(r.val)<0.005?' dre-zero':'');
  const p=base>0?pct(r.val/base*100):'—';
  const neg=r.t==='total'&&r.val<0?' fin-neg':(r.t==='total'&&r.val>0?' fin-pos':'');
  return `<tr class="${cls}"><td>${esc(r.label)}</td><td class="dre-num${neg}">${signed(r.val)}</td><td class="dre-pct">${p}</td></tr>`;
 }).join('');
}
function renderCards(R){
 $('dreRec').textContent=money(R.rec);
 $('dreRecNota').textContent=`${R.vendasQtd} venda(s) no período`;
 $('dreBruto').textContent=signed(R.bruto);tone($('dreBruto'),R.bruto);
 $('dreBrutoNota').textContent=R.rec>0?`Margem bruta: ${pct(R.bruto/R.rec*100)}`:'Sem vendas no período';
 $('dreOper').textContent=signed(R.oper);tone($('dreOper'),R.oper);
 $('dreOperNota').textContent=R.rec>0?`Margem operacional: ${pct(R.oper/R.rec*100)}`:'';
 $('dreRes').textContent=signed(R.res);tone($('dreRes'),R.res);
 $('dreResNota').textContent=R.rec>0?`Margem líquida: ${pct(R.res/R.rec*100)}`:'';
}
function renderAvisos(R,s,e){
 const av=[];
 if(R.sem)av.push(`${R.sem} lançamento(s) de venda antigos não têm custo registrado: o CMV deles não foi considerado.`);
 if(R.cmvCredito>0)av.push(`O CMV inclui ${money(R.cmvCredito)} de crédito retido com a fábrica (vendas no cartão da fábrica), igual ao que o sistema já usa no lucro das vendas.`);
 if(R.rec>0&&R.simples===0)av.push('Nenhum Simples Nacional apurado neste período. Ele vem das notas registradas em Impostos; sem notas no período, a linha fica zerada.');
 else if(R.simples>0)av.push(`Simples Nacional calculado pelo painel Impostos: ${R.meses.map(m=>`${m.mes.slice(5)}/${m.mes.slice(0,4)} ${money(m.valor)}${m.parcial?' (parcial)':''}${m.ajustado?' (ajustado)':''}`).join(' · ')}.`);
 if(R.ignorado>0)av.push(`${money(R.ignorado)} em despesas marcadas como “Não entra na DRE” (ex.: DAS/Simples lançado como despesa, para não descontar duas vezes).`);
 av.push('Contas pagas no mês seguinte (contador, internet, luz, água, GPS, FGTS) entram no mês anterior; dá para ajustar em cada despesa na lista abaixo. Por isso o mês atual pode mostrar essas contas zeradas até o pagamento ser lançado.');
 av.push('Devoluções, comissões, frete, salários, FGTS e as demais linhas vêm das despesas lançadas. Confira na lista abaixo em qual linha cada despesa caiu.');
 $('dreAvisos').innerHTML=av.map(t=>`<p>${esc(t)}</p>`).join('');
 $('drePeriodoDesc').textContent=`${s?dayText(s):'Desde o início'} até ${e?dayText(e):'hoje'} · vendas e Simples pelo mês da venda/nota (competência); despesas pelo mês a que se referem.`;
}
function groupedOptions(){
 return GROUPS.map(([g,n])=>`<optgroup label="${esc(n)}">${LINES.filter(l=>l[2]===g).map(l=>`<option value="${l[0]}">${esc(l[1])}</option>`).join('')}</optgroup>`).join('');
}
function renderClassif(R){
 const opts=groupedOptions();
 const itens=R.itens.slice().sort((a,b)=>String(b.cd).localeCompare(String(a.cd)));
 $('dreDespLista').innerHTML=itens.map(({x,k,v,cd})=>{
  const manual=!!(x.dre&&LBL[x.dre]);
  const comp=`${cd.slice(5,7)}/${cd.slice(0,4)}`;
  return `<tr><td>${dayText(x.date)}<small class="fin-sub">Competência ${comp}</small></td><td>${esc(x.description||'')}<small class="fin-sub">${esc(x.category||'Outras')}</small></td><td><b>${money(v)}</b></td><td><select class="dre-sel" data-dre-id="${esc(x.id)}"><option value="">Automático: ${esc(LBL[autoLine(x)])}</option>${opts}</select><select class="dre-sel dre-comp" data-dre-id="${esc(x.id)}" title="Em qual mês a despesa entra na DRE"><option value="">Competência automática: ${COMP_LBL[compAuto(x)]}</option><option value="pag">${COMP_LBL.pag}</option><option value="ant">${COMP_LBL.ant}</option></select></td></tr>`;
 }).join('')||'<tr><td colspan="4" class="cart-empty">Nenhuma despesa lançada neste período.</td></tr>';
 $('dreDespLista').querySelectorAll('select.dre-sel').forEach(sel=>{
  const x=exps().find(i=>i.id===sel.dataset.dreId);
  if(sel.classList.contains('dre-comp'))sel.value=x&&(x.dreComp==='ant'||x.dreComp==='pag')?x.dreComp:'';
  else sel.value=x&&x.dre&&LBL[x.dre]?x.dre:'';
 });
 $('dreDespResumo').textContent=`${itens.length} despesa(s) no período · total ${money(itens.reduce((n,i)=>n+i.v,0))}`;
}
function render(){
 const panel=$('panel-dre');if(!panel||!panel.classList.contains('active'))return;
 if(!hasFullAccess())return;
 const {s,e}=period(),R=compute(s,e);
 renderCards(R);renderTable(R);renderAvisos(R,s,e);
 // não redesenha a lista enquanto o usuário escolhe uma linha (evita perder o foco)
 if(!(document.activeElement&&document.activeElement.classList&&document.activeElement.classList.contains('dre-sel')))renderClassif(R);
}

function exportCsv(){
 const {s,e}=period(),R=compute(s,e),cell=v=>{const t=String(v??'');return /[";\n\r]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;};
 const lines=[['DRE',`${s?dayText(s):'Início'} a ${e?dayText(e):'hoje'}`].join(';'),['Descrição','Valor (R$)','% da receita'].join(';')];
 rows(R).forEach(r=>lines.push([r.label,r.val.toFixed(2).replace('.',','),R.rec>0?(r.val/R.rec*100).toFixed(1).replace('.',','):''].map(cell).join(';')));
 const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
 a.href=URL.createObjectURL(blob);a.download=`dre-${s||'inicio'}_a_${e||todayISO()}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 toast('DRE exportada.');
}

function init(){
 if(!$('panel-dre'))return;
 setPreset('mes');
 $('drePreset').addEventListener('change',()=>{setPreset($('drePreset').value);render();});
 ['dreDe','dreAte'].forEach(k=>$(k).addEventListener('change',()=>{$('drePreset').value='custom';render();}));
 $('dreCsv').addEventListener('click',exportCsv);
 $('dreDespLista').addEventListener('change',ev=>{
  const sel=ev.target.closest('select.dre-sel');if(!sel||!hasFullAccess())return;
  const x=exps().find(i=>i.id===sel.dataset.dreId);if(!x)return;
  const comp=sel.classList.contains('dre-comp');
  if(comp){if(sel.value)x.dreComp=sel.value;else delete x.dreComp;}
  else{if(sel.value)x.dre=sel.value;else delete x.dre;}
  sel.blur();
  if(saveData())toast(comp?'Competência da despesa atualizada.':'Linha da DRE atualizada.');
 });
}
init();

// Atualiza junto com o resto do sistema e ao abrir o painel.
const baseRender=window.renderAll;
window.renderAll=function(){baseRender();render();};
const baseGoTo=window.goTo;
window.goTo=function(name){baseGoTo.apply(this,arguments);if(name==='dre')render();};
})();
// Carrega o módulo de receitas de serviços (servicos.js) sem precisar mexer no index.html.
(function(){const s=document.createElement('script');s.src='servicos.js?v=4';document.body.appendChild(s);})();
