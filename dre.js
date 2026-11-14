'use strict';
// Conceito: DRE — Demonstração do Resultado do Exercício, por período (De / Para).
// Competência: despesas pagas no mês seguinte entram no mês anterior (ver DEFER).
// Fontes: vendas (movimentos 'venda' ativos), serviços e despesas (painel Despesas).
// CMV = sempre o custo real gravado na venda (o crédito retido com a fábrica é ativo: aparece só como linha informativa).
// Simples Nacional = DAS efetivamente PAGO (despesas do item Simples Nacional), por mês de competência; a estimativa pelas notas (painel Impostos) só aparece como aviso.
// Cada despesa pode ter um item do catálogo (x.itemId): o item define a linha da DRE e a competência padrão. As palavras-chave ficam só como reserva.
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
 ['simples','Simples Nacional (DAS pago)','ded'],
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
window.ckrDreLines=LINES;window.ckrDreGroups=GROUPS;   // usados pelo catálogo de itens (despesas.js)
// Classificação automática pela categoria + descrição (a ordem importa: o primeiro que casar vale).
const RULES=[
 ['ignorar',/parcelamento.*(imposto|tribut|simples|refis)|\brefis\b/],
 ['devolucoes',/devolu/],
 ['descontosConc',/desconto.*conced|conced.*desconto/],
 ['rendimentos',/rendimento|aplicacao|\bcdb\b|renda fixa/],
 ['jurosAtivos',/juros (ativo|recebido)|juros a receber/],
 ['jurosPassivos',/juros|multa|\bmora\b|emprestimo|financiamento/],
 ['simples',/simples nacional/],
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
// Catálogo de itens de despesa (criado em despesas.js): cada item define a linha da DRE e a competência padrão.
const cat=()=>Array.isArray(data.expenseCatalog)?data.expenseCatalog:[];
const itemOf=x=>(x&&x.itemId)?(cat().find(i=>i.id===x.itemId)||null):null;
// Linha automática: a do item do catálogo; sem item, as palavras-chave (reserva para despesas antigas).
const autoLineOf=x=>{const it=itemOf(x);return(it&&LBL[it.line])?it.line:autoLine(x);};
// Prioridade: 1) escolha manual na DRE, 2) item do catálogo, 3) palavras-chave.
const lineOf=x=>(x.dre&&LBL[x.dre])?x.dre:autoLineOf(x);

// ---------- competência ----------
// Despesas lançadas pela data do PAGAMENTO, mas que se referem ao mês anterior (conta de luz, contador, internet...),
// entram na DRE do mês anterior. Para mudar quais linhas fazem isso, edite a lista abaixo.
// Em cada despesa dá para escolher manualmente: "Mês do pagamento" ou "Mês anterior".
const DEFER=['contabeis','telefone','energia','agua','gps','fgtsF','fgtsOp','simples'];   // só vale para despesas SEM item do catálogo (o item traz a sua competência padrão)
function prevMonthDate(iso){
 const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso||''));if(!m)return iso;
 let y=+m[1],mo=+m[2]-1;const dia=+m[3];
 if(mo<1){mo=12;y--;}
 const ult=new Date(y,mo,0).getDate();
 return `${y}-${String(mo).padStart(2,'0')}-${String(Math.min(dia,ult)).padStart(2,'0')}`;
}
// Data-base da competência: data do pagamento (quando a despesa já está paga) ou data da despesa.
const baseDate=x=>(x.status==='pago'&&x.paidDate)?x.paidDate:x.date;
const compAuto=x=>{const it=itemOf(x);if(it&&(it.comp==='ant'||it.comp==='pag'))return it.comp;return DEFER.includes(lineOf(x))?'ant':'pag';};
const compMode=x=>(x.dreComp==='ant'||x.dreComp==='pag')?x.dreComp:compAuto(x);
// 1º: o mês de competência gravado na despesa (campo editável); 2º: escolha antiga "mês do pagamento / mês anterior"; 3º: padrão do item.
function compDate(x){
 const base=baseDate(x);
 if(/^\d{4}-\d{2}$/.test(x.compMonth||'')){
  const y=+x.compMonth.slice(0,4),m=+x.compMonth.slice(5,7),d=+String(base||'').slice(8,10)||1,last=new Date(y,m,0).getDate();
  return `${x.compMonth}-${String(Math.min(d,last)).padStart(2,'0')}`;
 }
 return compMode(x)==='ant'?prevMonthDate(base):base;
}
const COMP_LBL={pag:'Mês do pagamento',ant:'Mês anterior'};

// ---------- cálculo ----------
// O DAS de um mês só entra se o período escolhido cobrir o mês inteiro.
function mesInteiro(mes,s,e){
 const y=+mes.slice(0,4),m=+mes.slice(5,7),ini=`${mes}-01`,fim=localDateKey(new Date(y,m,0));
 return (!s||s<=ini)&&(!e||e>=fim);
}
function compute(s,e){
 const C={gross:0,desc:0,cmv:0,credFab:0,fee:0,sem:0,vendasQtd:0};
 const vendas=new Set();
 data.movements.forEach(m=>{
  if(m.type!=='venda'||m.canceled||!inR(localDateKey(m.date),s,e))return;
  const k=m.saleId||m.id,t=Number(m.total||0),qty=Number(m.quantity||0),unit=numN(m.unitPrice);
  let gross=Number.isFinite(unit)?r2(unit*qty):t;if(gross<t)gross=t;
  C.gross+=gross;C.desc+=gross-t;vendas.add(k);
  C.fee+=Number(m.fee||0);
  C.credFab+=Number(m.factoryCredit||0);   // só informativo (ativo): não entra no CMV nem no resultado
  const c=numN(m.costTotal);
  if(Number.isFinite(c))C.cmv+=c;else C.sem++;   // CMV = custo real do produto (PEPS) gravado na venda
 });
 C.vendasQtd=vendas.size;
 // receitas de serviços (janela "Serviço"): entram como receita; a taxa do cartão vai para a despesa com taxa de cartão
 C.servico=0;
 (typeof window.ckrServicos==='function'?window.ckrServicos():[]).forEach(sv=>{if(!inR(localDateKey(sv.date),s,e))return;C.servico+=Number(sv.amount||0);C.fee+=Number((sv.payment||{}).fee||0);C.credFab+=Number((sv.payment||{}).factoryCredit||0);});   // serviço não tem CMV; o crédito da fábrica do serviço também é só informativo
 // despesas lançadas (pela data de competência)
 const L={};LINES.forEach(l=>L[l[0]]=0);const itens=[],dasPend=[],dasParc={},dasPago={};
 exps().forEach(x=>{
  const cd=compDate(x);
  if(!inR(cd,s,e))return;
  const k=lineOf(x),v=Number(x.amount||0);
  if(k==='simples'){   // Simples Nacional = só o DAS efetivamente PAGO, por competência
   const mes=cd.slice(0,7);
   if(x.status!=='pago'){dasPend.push(v);itens.push({x,k,v,cd,fora:'pendente: só entra depois de paga'});return;}
   if(!mesInteiro(mes,s,e)){dasParc[mes]=r2((dasParc[mes]||0)+v);itens.push({x,k,v,cd,fora:'o período não cobre o mês inteiro'});return;}
   dasPago[mes]=r2((dasPago[mes]||0)+v);
  }
  L[k]+=v;itens.push({x,k,v,cd});
 });
 // Estimativa do Simples pelas notas (painel Impostos): NÃO entra no resultado, só alimenta os avisos
 const sn=typeof window.ckrSimplesPeriodo==='function'?window.ckrSimplesPeriodo(s,e):{total:0,meses:[]};
 const R={};
 R.gross=r2(C.gross);R.servico=r2(C.servico);R.rec=r2(R.gross+R.servico);
 R.dev=r2(L.devolucoes);R.simples=r2(L.simples);R.desc=r2(C.desc);R.ded=r2(R.dev+R.simples+R.desc);
 R.liq=r2(R.rec-R.ded);
 R.cmv=r2(C.cmv);R.credFab=r2(C.credFab);
 R.bruto=r2(R.liq-R.cmv);
 R.taxa=r2(C.fee);
 R.vend=r2(L.comissao+L.salariosOp+L.frete+L.fgtsOp+R.taxa);
 const fixas=LINES.filter(l=>l[2]==='fixa').map(l=>l[0]);
 R.fixas=r2(fixas.reduce((n,k)=>n+L[k],0));
 R.oper=r2(R.bruto-R.vend-R.fixas);
 R.divers=r2(L.rendimentos+L.jurosAtivos-L.despBancarias-L.jurosPassivos-L.descontosConc);
 R.res=r2(R.oper+R.divers);
 R.L=L;R.itens=itens;R.sem=C.sem;R.vendasQtd=C.vendasQtd;R.meses=sn.meses;R.ignorado=r2(L.ignorar);
 R.dasPago=dasPago;R.dasParc=dasParc;R.dasPend=dasPend;
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
 out.push({t:'info',label:'Informativo: crédito retido com a fábrica no período (ativo, fora do resultado)',val:R.credFab});
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
  if(r.t==='info')return `<tr class="dre-sub dre-info" style="font-style:italic"><td>${esc(r.label)}</td><td class="dre-num">${signed(r.val)}</td><td class="dre-pct">—</td></tr>`;
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
 if(R.credFab>0.004)av.push(`Crédito retido com a fábrica no período: ${money(R.credFab)}. É um ativo (valor a usar em compras na fábrica), não custo: o CMV usa sempre o custo real do produto. A divisão dinheiro/crédito aparece no Caixa (DFC), não na DRE.`);
 {
  const mm=k=>k.slice(5)+'/'+k.slice(0,4),estM={};R.meses.forEach(m=>{estM[m.mes]=m;});
  [...new Set([...Object.keys(R.dasPago),...R.meses.map(m=>m.mes)])].sort().forEach(k=>{
   const est=estM[k],pago=R.dasPago[k]||0;
   if(est&&est.parcial){av.push(`Simples ${mm(k)}: o período não cobre o mês inteiro, então o DAS desse mês não foi considerado.`);return;}
   if(pago>0.004){
    if(!est)av.push(`Simples ${mm(k)}: DAS pago de ${money(pago)}, mas não há notas registradas em Impostos para conferir o valor.`);
    else if(Math.abs(pago-est.valor)>0.01)av.push(`Simples ${mm(k)}: o DAS pago (${money(pago)}) difere do calculado pelas notas (${money(est.valor)}${est.ajustado?', já com seu ajuste':''}). Diferença de ${money(Math.abs(pago-est.valor))}.`);
   }else if(est&&est.valor>0.004)av.push(`Simples ${mm(k)}: ainda não há DAS pago. Estimativa pelas notas: ${money(est.valor)} (não somada no resultado). Lance a despesa no item Simples Nacional quando pagar.`);
  });
  Object.keys(R.dasParc).sort().forEach(k=>{if(estM[k]&&estM[k].parcial)return;av.push(`Simples ${mm(k)}: DAS pago de ${money(R.dasParc[k])} não entrou, pois o período não cobre o mês inteiro.`);});
  if(R.dasPend.length)av.push(`${R.dasPend.length} despesa(s) do item Simples Nacional ainda pendente(s), somando ${money(r2(R.dasPend.reduce((n,v)=>n+v,0)))}: só entram na DRE depois de pagas.`);
 }
 {const sem=R.itens.filter(o=>!itemOf(o.x)).length;if(sem)av.push(`${sem} despesa(s) do período ainda sem item do catálogo (classificadas pelas palavras-chave). Veja a lista “Despesas sem item do catálogo” abaixo para reclassificar.`);}
 if(R.ignorado>0)av.push(`${money(R.ignorado)} em despesas marcadas como “Não entra na DRE” (ex.: parcelamento de impostos, que não é despesa do período).`);
 av.push('Contas pagas no mês seguinte (contador, internet, luz, água, GPS, FGTS, Simples) entram no mês anterior; o mês de competência de cada despesa pode ser ajustado ao lançá-la em Despesas e lucro. Por isso o mês atual pode mostrar essas contas zeradas até o pagamento ser lançado.');
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
 $('dreDespLista').innerHTML=itens.map(({x,k,v,cd,fora})=>{
  const manual=!!(x.dre&&LBL[x.dre]);
  const comp=`${cd.slice(5,7)}/${cd.slice(0,4)}`;
  return `<tr><td>${dayText(x.date)}<small class="fin-sub">Competência ${comp}${fora?' · fora do resultado ('+esc(fora)+')':''}</small></td><td>${esc(x.description||'')}<small class="fin-sub">${esc(x.category||'Outras')}</small></td><td><b>${money(v)}</b></td><td><select class="dre-sel" data-dre-id="${esc(x.id)}"><option value="">Automático: ${esc(LBL[autoLineOf(x)])}</option>${opts}</select><select class="dre-sel dre-comp" data-dre-id="${esc(x.id)}" title="Em qual mês a despesa entra na DRE"><option value="">Competência automática: ${COMP_LBL[compAuto(x)]}</option><option value="pag">${COMP_LBL.pag}</option><option value="ant">${COMP_LBL.ant}</option></select></td></tr>`;
 }).join('')||'<tr><td colspan="4" class="cart-empty">Nenhuma despesa lançada neste período.</td></tr>';
 $('dreDespLista').querySelectorAll('select.dre-sel').forEach(sel=>{
  const x=exps().find(i=>i.id===sel.dataset.dreId);
  if(sel.classList.contains('dre-comp'))sel.value=x&&(x.dreComp==='ant'||x.dreComp==='pag')?x.dreComp:'';
  else sel.value=x&&x.dre&&LBL[x.dre]?x.dre:'';
 });
 $('dreDespResumo').textContent=`${itens.length} despesa(s) no período · total ${money(itens.reduce((n,i)=>n+i.v,0))}`;
}
function itemOptions(){
 const items=cat().filter(i=>i.active!==false),cs=[...new Set(items.map(i=>i.category))];
 return '<option value="">— escolher item —</option>'+cs.map(c=>`<optgroup label="${esc(c)}">${items.filter(i=>i.category===c).map(i=>`<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}</optgroup>`).join('');
}
// Despesas antigas (texto livre) sem item do catálogo: o usuário escolhe o item e a DRE passa a seguir a linha e a competência dele.
function renderSemItem(R){
 const el=$('dreSemItemLista');if(!el)return;
 const list=R.itens.filter(o=>!itemOf(o.x)).sort((a,b)=>String(b.cd).localeCompare(String(a.cd))),opts=itemOptions();
 el.innerHTML=list.map(({x,v})=>`<tr><td>${dayText(x.date)}</td><td>${esc(x.description||'')}<small class="fin-sub">${esc(x.category||'Outras')} · hoje cai em: ${esc(LBL[lineOf(x)])}</small></td><td><b>${money(v)}</b></td><td><select class="dre-sel dre-item" data-dre-id="${esc(x.id)}">${opts}</select></td></tr>`).join('')||'<tr><td colspan="4" class="cart-empty">Todas as despesas do período já têm item do catálogo.</td></tr>';
 $('dreSemItemResumo').textContent=`${list.length} despesa(s) do período sem item · total ${money(r2(list.reduce((n,o)=>n+o.v,0)))}`;
}
function render(){
 const panel=$('panel-dre');if(!panel||!panel.classList.contains('active'))return;
 if(!hasFullAccess())return;
 const {s,e}=period(),R=compute(s,e);
 renderCards(R);renderTable(R);renderAvisos(R,s,e);
 // não redesenha a lista enquanto o usuário escolhe uma linha (evita perder o foco)
 if(!(document.activeElement&&document.activeElement.classList&&document.activeElement.classList.contains('dre-sel'))){renderClassif(R);renderSemItem(R);}
}

function exportCsv(){
 const {s,e}=period(),R=compute(s,e),cell=v=>{const t=String(v??'');return /[";\n\r]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;};
 const lines=[['DRE',`${s?dayText(s):'Início'} a ${e?dayText(e):'hoje'}`].join(';'),['Descrição','Valor (R$)','% da receita'].join(';')];
 rows(R).forEach(r=>lines.push([r.label,r.val.toFixed(2).replace('.',','),(R.rec>0&&r.t!=='info')?(r.val/R.rec*100).toFixed(1).replace('.',','):''].map(cell).join(';')));
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
 // vincular despesa antiga (texto livre) a um item do catálogo
 if($('dreSemItemLista'))$('dreSemItemLista').addEventListener('change',ev=>{
  const sel=ev.target.closest('select.dre-item');if(!sel||!hasFullAccess()||!sel.value)return;
  const x=exps().find(i=>i.id===sel.dataset.dreId);if(!x)return;
  x.itemId=sel.value;sel.blur();
  if(saveData())toast('Item do catálogo vinculado à despesa.');
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
(function(){const s=document.createElement('script');s.src='servicos.js?v=2';document.body.appendChild(s);})();
