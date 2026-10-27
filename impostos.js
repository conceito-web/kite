'use strict';
// Conceito: Impostos — registro solto de notas (DATA, VALOR DA NOTA, N° DA NOTA).
// Os botões "Informações de imposto" em Registrar venda e PDV abrem o formulário.
// Se a venda atual já tem informações registradas, o sistema avisa e pergunta se quer modificar.
// O painel filtra por mês (padrão = mês atual): RBT12 = 12 meses anteriores; imposto = faturamento do mês × alíquota efetiva.
// Por enquanto a nota NÃO é vinculada à venda no recibo/histórico; fica no painel Impostos (somente admin/master).
// Usa as funções e dados do app.js (data, money, saveData, toast, esc, parseMoneyInput, bindMoneyMask, todayISO).
(function(){
const $=x=>document.getElementById(x);
const notes=()=>data.taxNotes||(data.taxNotes=[]);
const ORIGENS={venda:'Registrar venda',pdv:'PDV',painel:'Painel Impostos'};
const dateBR=iso=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');return m?`${m[3]}/${m[2]}/${m[1]}`:'—';};
let origem='painel';        // de onde o formulário foi aberto
let editandoId=null;        // id da nota em edição (null = nota nova)
let pendente=null;        // venda (antiga) que vai receber a nota nova que está sendo digitada
const atual={venda:null,pdv:null}; // nota já registrada para a venda em andamento em cada tela

// Usado por Registrar venda / PDV / edição de venda para ligar a nota à venda gravada.
window.ckrTaxNoteAtual=o=>{const id=atual[o];return id&&notes().some(x=>x.id===id)?id:'';};
window.ckrTaxNoteSet=(o,id)=>{atual[o]=id||null;};

function abrir(o,id){
  origem=o;editandoId=id||null;pendente=null;
  const n=id?notes().find(x=>x.id===id):null;
  $('impTitulo').textContent=n?'Modificar informações de imposto':'Informações de imposto';
  $('impData').value=n?n.date:todayISO();
  $('impValor').value=n?Number(n.value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'';
  $('impNumero').value=n?n.number:'';
  $('impErro').textContent='';
  $('impostoModal').hidden=false;
  setTimeout(()=>$('impValor').focus(),50);
}
function fechar(){$('impostoModal').hidden=true;editandoId=null;pendente=null;}

// Pergunta antes de modificar uma nota que já foi registrada.
function confirmarModificar(n){
  return confirm(`Já foram registradas informações de imposto:\n\nData: ${dateBR(n.date)}\nN° da nota: ${n.number}\nValor da nota: ${money(n.value)}\n\nDeseja realmente modificar?`);
}
// Clique nos botões de Registrar venda / PDV.
function clicarBotao(o){
  const n=atual[o]&&notes().find(x=>x.id===atual[o]);
  if(!n){atual[o]=null;abrir(o);return;}
  if(confirmarModificar(n))abrir(o,n.id);
}

function salvar(e){
  e.preventDefault();
  const date=$('impData').value;
  const value=parseMoneyInput($('impValor').value);
  const number=$('impNumero').value.trim();
  if(!date){$('impErro').textContent='Informe a data.';return;}
  if(!(value>0)){$('impErro').textContent='Informe o valor da nota.';return;}
  if(!number){$('impErro').textContent='Informe o número da nota.';return;}
  const old=editandoId&&notes().find(x=>x.id===editandoId);
  const pend=!old?pendente:null;
  if(old){
    Object.assign(old,{date,value:Math.round(value*100)/100,number,updatedAt:new Date().toISOString()});
  }else{
    const id='imp_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    notes().push({id,date,value:Math.round(value*100)/100,number,origin:origem,createdAt:new Date().toISOString()});
    if(origem==='venda'||origem==='pdv')atual[origem]=id;
    if(pend)ligar(pend,id);
  }
  if(saveData()){fechar();toast(old?'Informações de imposto atualizadas.':pend?`Nota salva e vinculada à venda ${pend}.`:'Informações de imposto salvas no painel Impostos.');}
}

// ===== Vincular nota a uma venda já existente (Movimentações) =====
function ligar(saleId,noteId){
  data.movements.forEach(m=>{if(m.type==='venda'&&(m.saleId||m.id)===saleId){if(noteId)m.taxNoteId=noteId;else delete m.taxNoteId;}});
}
let vincVenda=null;
function abrirVinculo(saleId){
  const s=getSales().find(x=>x.id===saleId);if(!s||s.canceled)return;
  vincVenda=saleId;
  // notas que já estão ligadas a OUTRA venda ativa não aparecem
  const usadas=new Set();
  data.movements.forEach(m=>{if(m.type==='venda'&&!m.canceled&&m.taxNoteId&&(m.saleId||m.id)!==saleId)usadas.add(m.taxNoteId);});
  const livres=notes().filter(n=>!usadas.has(n.id)).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt).localeCompare(String(a.createdAt)));
  $('vincVenda').textContent=`Venda ${s.id}${s.client?' — '+s.client:''} · ${money(s.total)}`;
  $('vincSelect').innerHTML='<option value="">— Escolha uma nota já registrada —</option>'+livres.map(n=>`<option value="${esc(n.id)}"${n.id===s.taxNoteId?' selected':''}>Nota ${esc(n.number)} · ${esc(dateBR(n.date))} · ${esc(money(n.value))}</option>`).join('');
  $('vincRemover').hidden=!s.taxNote;
  $('vincErro').textContent=livres.length?'':'Não há notas livres. Use "Registrar nova nota para esta venda".';
  $('vincNotaModal').hidden=false;
}
function fecharVinculo(){$('vincNotaModal').hidden=true;vincVenda=null;}
window.ckrVincularNota=abrirVinculo;

// ===== Cálculo do imposto (Simples Nacional) =====
// Alíquota efetiva: AE = (RBT12 × alíquota nominal − PD) ÷ RBT12
// Imposto = faturamento do mês × AE. Vencimento: dia 20 do mês seguinte (ex.: mês 10/2026, RBT12 01/10/2025 a 30/09/2026 → 20/11/2026).
const ANEXO1=[[180000,4,0],[360000,7.3,5940],[720000,9.5,13860],[1800000,10.7,22500],[3600000,14.3,87300],[4800000,19,378000]]; // [limite RBT12, alíq. %, PD]
const faixa=r=>ANEXO1.find(f=>r<=f[0])||ANEXO1[ANEXO1.length-1];
const DIAS=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const pad=n=>String(n).padStart(2,'0');
const iso=(y,m,d)=>`${y}-${pad(m)}-${pad(d)}`;
const pdate=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');return m?{y:+m[1],m:+m[2],d:+m[3]}:null;};
const fmt2=n=>Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const round2=n=>Math.round(n*100)/100;
const man={rbt:false,aliq:false,pd:false,pay:false,venc:false}; // true = o usuário digitou; não sobrescrever
let ultimo={calc:0,key:''};

function mesAtual(){const d=new Date();$('impMes').value=`${d.getFullYear()}-${pad(d.getMonth()+1)}`;}
function limparManual(){Object.keys(man).forEach(k=>man[k]=false);}

function calcular(list){
  const mes=$('impMes').value;
  const m=/^(\d{4})-(\d{2})$/.exec(mes||'');
  const y=m?+m[1]:0,mo=m?+m[2]:0;
  const key=mes;
  const info=[];
  // faturamento do mês escolhido
  const total=list.reduce((t,n)=>t+Number(n.value||0),0);
  // RBT12 automático = notas dos 12 meses ANTERIORES ao mês escolhido
  let rbtAuto=0;
  if(m){
    const t=y*12+(mo-1);
    const s=t-12,e=t-1;
    const ini=iso(Math.floor(s/12),s%12+1,1);
    const fim=iso(Math.floor(e/12),e%12+1,new Date(Math.floor(e/12),e%12+1,0).getDate());
    rbtAuto=round2(notes().filter(n=>n.date>=ini&&n.date<=fim).reduce((x,n)=>x+Number(n.value||0),0));
    $('impMesInfo').textContent=`RBT12: ${dateBR(ini)} a ${dateBR(fim)}`;
    $('impRbtInfo').textContent=`Notas de ${dateBR(ini)} a ${dateBR(fim)}`;
  }else{$('impMesInfo').textContent='';$('impRbtInfo').textContent='Escolha o mês.';}
  if(!man.rbt)$('impRbt').value=fmt2(rbtAuto);
  const rbt=parseMoneyInput($('impRbt').value);
  // alíquota e PD
  if($('impAnexo').value==='1'){
    const f=faixa(rbt);
    if(!man.aliq)$('impAliq').value=fmt2(f[1]);
    if(!man.pd)$('impPd').value=fmt2(f[2]);
  }
  const aliq=parseMoneyInput($('impAliq').value),pd=parseMoneyInput($('impPd').value);
  const ef=rbt>0?Math.max(0,(rbt*aliq/100-pd)/rbt):aliq/100;
  const calc=round2(total*ef);
  $('impAE').textContent=(ef*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4})+'%';
  // imposto a pagar: automático, ou o valor ajustado salvo para este período
  const adj=(data.taxAdj||{})[key];
  if(adj!=null&&!man.pay){man.pay=true;$('impPagar').value=fmt2(adj);}
  if(!man.pay)$('impPagar').value=fmt2(calc);
  ultimo={calc,key};
  dicas();
  // vencimento: dia 20 do mês seguinte ao mês de apuração
  if(m){
    const t=y*12+(mo-1)+1;
    if(!man.venc)$('impVenc').value=iso(Math.floor(t/12),t%12+1,20);
  }else if(!man.venc)$('impVenc').value='';
  vencDica();
  if(!m)info.push('Escolha o mês para o cálculo e o vencimento.');
  if(rbt>4800000)info.push('RBT12 acima de R$ 4.800.000,00 (limite do Simples Nacional).');
  info.push('O RBT12 soma só as notas registradas aqui. Se houve faturamento antes de usar o sistema, digite o RBT12 correto. Confirme valores com seu contador.');
  $('impInfo').innerHTML=info.map(esc).join('<br>');
}
function dicas(){
  const v=parseMoneyInput($('impPagar').value);
  const diff=round2(v-ultimo.calc);
  $('impPagarInfo').textContent=man.pay&&Math.abs(diff)>=0.005
    ?`Calculado: ${money(ultimo.calc)} (ajuste de ${diff>0?'+':'−'}${money(Math.abs(diff))})`
    :`Calculado: ${money(ultimo.calc)}`;
  $('impPagarCard').textContent=money(v);
}
function vencDica(){
  const p=pdate($('impVenc').value);
  if(!p){$('impVencInfo').textContent='';return;}
  const w=new Date(p.y,p.m-1,p.d).getDay();
  $('impVencInfo').textContent=DIAS[w]+((w===0||w===6)?' — pague no próximo dia útil':'');
}

function render(){
  const mes=$('impMes').value;
  const cfg=data.taxCfg&&data.taxCfg.anexo;
  if(cfg&&$('impAnexo').value!==cfg)$('impAnexo').value=cfg;
  const all=notes().slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt).localeCompare(String(a.createdAt)));
  const list=all.filter(n=>!mes||String(n.date).startsWith(mes));
  $('impQtd').textContent=list.length;
  $('impTotal').textContent=money(list.reduce((t,n)=>t+Number(n.value||0),0));
  $('menuImpostos').textContent=all.length;
  $('impLista').innerHTML=list.map(n=>`<tr><td>${esc(dateBR(n.date))}</td><td>${esc(n.number)}</td><td>${money(n.value)}</td><td>${esc(ORIGENS[n.origin]||'—')}</td><td><button class="button button-light button-small" type="button" data-imp-edit="${esc(n.id)}">Modificar</button> <button class="button button-danger-light button-small" type="button" data-imp-del="${esc(n.id)}">Excluir</button></td></tr>`).join('')
    ||'<tr><td colspan="5" class="cart-empty">Nenhuma nota registrada neste período.</td></tr>';
  $('impListaTotal').innerHTML=list.length?`<tr class="imp-total-row"><td colspan="2"><b>TOTAL${mes?' DO MÊS':''} · ${list.length} ${list.length===1?'nota':'notas'}</b></td><td><b>${money(list.reduce((t,n)=>t+Number(n.value||0),0))}</b></td><td colspan="2"></td></tr>`:'';
  calcular(list);
}

// Salva (ou apaga) o valor ajustado do imposto para o período atual.
function gravarAjuste(){
  const v=round2(parseMoneyInput($('impPagar').value));
  const adj=data.taxAdj||(data.taxAdj={});
  if(!$('impPagar').value.trim()||Math.abs(v-ultimo.calc)<0.005){delete adj[ultimo.key];man.pay=false;}
  else adj[ultimo.key]=v;
  saveData();
}
function restaurarAuto(){
  const adj=data.taxAdj||(data.taxAdj={});
  delete adj[ultimo.key];limparManual();saveData();toast('Cálculo automático restaurado.');
}

// A venda terminou (ou virou orçamento): a próxima venda começa sem nota registrada.
function observarFim(id,o){
  const el=$(id);if(!el)return;
  new MutationObserver(()=>{if(!el.hidden)atual[o]=null;}).observe(el,{attributes:true,attributeFilter:['hidden']});
}

function init(){
  bindMoneyMask($('impValor'));
  $('vendaImposto').addEventListener('click',()=>clicarBotao('venda'));
  $('pdvImposto').addEventListener('click',()=>clicarBotao('pdv'));
  $('impNova').addEventListener('click',()=>abrir('painel'));
  $('impFechar').addEventListener('click',fechar);
  $('impostoModal').addEventListener('click',e=>{if(e.target===$('impostoModal'))fechar();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('impostoModal').hidden)fechar();});
  $('impostoForm').addEventListener('submit',salvar);
  $('vincFechar').addEventListener('click',fecharVinculo);
  $('vincNotaModal').addEventListener('click',e=>{if(e.target===$('vincNotaModal'))fecharVinculo();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('vincNotaModal').hidden)fecharVinculo();});
  $('vincForm').addEventListener('submit',e=>{
    e.preventDefault();
    const nid=$('vincSelect').value;
    if(!nid){$('vincErro').textContent='Escolha uma nota.';return;}
    const sid=vincVenda;ligar(sid,nid);fecharVinculo();
    if(saveData())toast(`Nota vinculada à venda ${sid}.`);
  });
  $('vincRemover').addEventListener('click',()=>{
    if(!confirm('Remover o vínculo desta nota com a venda? A nota continua registrada no painel Impostos.'))return;
    const sid=vincVenda;ligar(sid,null);fecharVinculo();
    if(saveData())toast(`Vínculo removido. A venda ${sid} está sem nota.`);
  });
  $('vincNova').addEventListener('click',()=>{const sid=vincVenda;fecharVinculo();abrir('painel');pendente=sid;});
  bindMoneyMask($('impRbt'));bindMoneyMask($('impAliq'),{percent:true});bindMoneyMask($('impPd'));bindMoneyMask($('impPagar'));
  mesAtual();
  const filtro=()=>{limparManual();render();};
  $('impMes').addEventListener('change',filtro);
  $('impMesAtual').addEventListener('click',()=>{mesAtual();filtro();});
  $('impAnexo').addEventListener('change',()=>{man.aliq=false;man.pd=false;(data.taxCfg||(data.taxCfg={})).anexo=$('impAnexo').value;saveData();});
  [['impRbt','rbt'],['impAliq','aliq'],['impPd','pd']].forEach(([id,k])=>$(id).addEventListener('money-mask-updated',()=>{man[k]=!!$(id).value.trim();render();}));
  $('impPagar').addEventListener('money-mask-updated',()=>{man.pay=true;dicas();});
  $('impPagar').addEventListener('change',gravarAjuste);
  $('impVenc').addEventListener('change',()=>{man.venc=!!$('impVenc').value;render();});
  $('impRecalc').addEventListener('click',restaurarAuto);
  $('impLista').addEventListener('click',e=>{
    const ed=e.target.closest('[data-imp-edit]');
    if(ed){const n=notes().find(x=>x.id===ed.dataset.impEdit);if(n&&confirmarModificar(n))abrir(n.origin||'painel',n.id);return;}
    const b=e.target.closest('[data-imp-del]');if(!b)return;
    const n=notes().find(x=>x.id===b.dataset.impDel);if(!n)return;
    if(confirm(`Excluir a nota ${n.number}?`)){
      data.taxNotes=notes().filter(x=>x.id!==n.id);
      ['venda','pdv'].forEach(o=>{if(atual[o]===n.id)atual[o]=null;});
      if(saveData())toast('Nota excluída.');
    }
  });
  // Nova venda = nova nota: zera ao concluir a venda ou ao salvá-la como orçamento.
  observarFim('reciboAcoes','venda');
  observarFim('pdvPos','pdv');
  $('salvarOrcamentoVenda').addEventListener('click',()=>setTimeout(()=>{if(!saleCart.length)atual.venda=null;},300));
  $('pdvOrcamento').addEventListener('click',()=>setTimeout(()=>{if(/^R\$\s?0,00$/.test($('pdvTotal').textContent.trim()))atual.pdv=null;},300));
}
init();

// Atualiza junto com o resto do sistema e ao abrir o painel.
const baseRender=window.renderAll;
window.renderAll=function(){baseRender();render();};
const baseGoTo=window.goTo;
window.goTo=function(name){baseGoTo.apply(this,arguments);if(name==='impostos')render();};

// ===== Lucro (%) das telas de venda, já descontando o imposto =====
// Só muda o que aparece no rótulo "Lucro (%)" de Registrar venda e PDV.
// Lucro após imposto (%) = lucro (%) − alíquota efetiva (%). Equivale a descontar (preço × AE) de cada produto.
// Não altera preço de produto, venda gravada, histórico, relatórios nem financeiro.
// A AE usa o mês da "Data da venda" (RBT12 = notas dos 12 meses anteriores) e o Anexo escolhido no painel Impostos.
function aeDoMes(mes){
  const m=/^(\d{4})-(\d{2})$/.exec(mes||'');
  const d=new Date();
  const t=(m?+m[1]:d.getFullYear())*12+((m?+m[2]:d.getMonth()+1)-1);
  const s=t-12,e=t-1;
  const ini=iso(Math.floor(s/12),s%12+1,1);
  const fim=iso(Math.floor(e/12),e%12+1,new Date(Math.floor(e/12),e%12+1,0).getDate());
  const rbt=notes().filter(n=>n.date>=ini&&n.date<=fim).reduce((x,n)=>x+Number(n.value||0),0);
  let aliq,pd;
  if((data.taxCfg&&data.taxCfg.anexo)==='m'){aliq=parseMoneyInput($('impAliq').value);pd=parseMoneyInput($('impPd').value);}
  else{const f=faixa(rbt);aliq=f[1];pd=f[2];}
  return rbt>0?Math.max(0,(rbt*aliq/100-pd)/rbt)*100:aliq; // em %
}
const baseShowProfit=window.showProfitPct;
// "?" ao lado do Lucro (%): mostra de onde vem o número (custo, imposto, taxa da maquininha).
const detalhe={};            // por tela: última composição calculada {total,cost,fee,profit,ae}
const botoes={};
let ajudaId=null;            // tela cuja ajuda está aberta
let pop=null;
const pct1=v=>v.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
function criarPop(){
  if(pop)return pop;
  const st=document.createElement('style');
  st.textContent='.imp-q{width:20px;height:20px;margin-left:8px;border-radius:50%;border:1px solid #c9d3e6;background:#f3f6fd;color:#4a62a8;font:800 12px "DM Sans",sans-serif;line-height:1;padding:0;cursor:pointer;flex:none}.imp-q:hover{background:#e6edff}'
   +'.imp-pop{position:fixed;z-index:200;width:290px;max-width:calc(100vw - 16px);background:#fff;border:1px solid #dde4f0;border-radius:12px;box-shadow:0 14px 34px #182b4833;padding:14px 15px;font:500 12px "DM Sans",sans-serif;color:#2b3a55}'
   +'.imp-pop h4{margin:0 0 9px;font:800 13px Manrope,sans-serif;color:#1d2b42}.imp-pop .r{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid #f0f3f8}.imp-pop .r span:last-child{text-align:right;white-space:nowrap}'
   +'.imp-pop .r.t{border-bottom:0;border-top:2px solid #dde4f0;margin-top:3px;padding-top:8px;font-weight:800;color:#159568}.imp-pop small{display:block;margin-top:8px;color:#9aa4b2;font-size:10px;line-height:1.4}';
  document.head.appendChild(st);
  pop=document.createElement('div');pop.className='imp-pop';pop.hidden=true;document.body.appendChild(pop);
  document.addEventListener('click',e=>{if(ajudaId&&!pop.contains(e.target)&&!e.target.closest('.imp-q'))fecharAjuda();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')fecharAjuda();});
  window.addEventListener('resize',fecharAjuda);
  return pop;
}
function fecharAjuda(){ajudaId=null;if(pop)pop.hidden=true;}
function linha(rot,val,total,cls){return `<div class="r${cls?' '+cls:''}"><span>${rot}</span><span>${money(val)} · ${pct1(total>0?val/total*100:0)}</span></div>`;}
function montarAjuda(id){
  const d=detalhe[id];
  if(!d){fecharAjuda();return;}
  const imposto=round2(d.total*d.ae/100);
  const lucro=round2(d.profit-imposto);
  pop.innerHTML=`<h4>De onde vem o lucro</h4>`
    +`<div class="r"><span>Total da venda</span><span>${money(d.total)} · 100,0%</span></div>`
    +linha('(−) Custo dos produtos (CMV)',d.cost,d.total)
    +linha(`(−) Imposto (alíq. efetiva ${d.ae.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4})}%)`,imposto,d.total)
    +(d.fee>0.004?linha('(−) Taxa da maquininha',d.fee,d.total):'')
    +linha('(=) Lucro',lucro,d.total,'t')
    +`<small>A porcentagem de cada linha é sobre o total da venda (já com desconto).</small>`;
}
function abrirAjuda(id){
  criarPop();
  if(ajudaId===id){fecharAjuda();return;}
  ajudaId=id;montarAjuda(id);
  if(!ajudaId)return;
  pop.hidden=false;
  const b=botoes[id].getBoundingClientRect(),w=pop.offsetWidth,h=pop.offsetHeight;
  const left=Math.max(8,Math.min(b.left,window.innerWidth-w-8));
  let top=b.bottom+6;if(top+h>window.innerHeight-8)top=Math.max(8,b.top-h-6);
  pop.style.left=left+'px';pop.style.top=top+'px';
}
if(typeof baseShowProfit==='function'){
  window.showProfitPct=function(id,v){
    const ok=v!==null&&Number.isFinite(v);
    let ae=0;
    if(ok){const df=$(id==='pdvLucroPct'?'pdvData':'vendaData');ae=aeDoMes(df&&df.value?df.value.slice(0,7):'');}
    baseShowProfit(id,ok?v-ae:v);
    const el=$(id);
    if(!el)return;
    const sd=window.saleProfitDetail;
    detalhe[id]=ok&&sd?{total:sd.total,cost:sd.cost,fee:sd.fee,profit:sd.profit,ae}:null;
    el.title='';
    if(detalhe[id]){
      if(!botoes[id]){
        const b=document.createElement('button');
        b.type='button';b.className='imp-q';b.textContent='?';
        b.setAttribute('aria-label','Ver de onde vem o lucro');b.title='De onde vem o lucro';
        b.addEventListener('click',e=>{e.preventDefault();abrirAjuda(id);});
        botoes[id]=b;
      }
      el.appendChild(botoes[id]);
      if(ajudaId===id&&pop&&!pop.hidden)montarAjuda(id);
    }else if(ajudaId===id)fecharAjuda();
  };
}
render();
})();
