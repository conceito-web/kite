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
const atual={venda:null,pdv:null}; // nota já registrada para a venda em andamento em cada tela

function abrir(o,id){
  origem=o;editandoId=id||null;
  const n=id?notes().find(x=>x.id===id):null;
  $('impTitulo').textContent=n?'Modificar informações de imposto':'Informações de imposto';
  $('impData').value=n?n.date:todayISO();
  $('impValor').value=n?Number(n.value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'';
  $('impNumero').value=n?n.number:'';
  $('impErro').textContent='';
  $('impostoModal').hidden=false;
  setTimeout(()=>$('impValor').focus(),50);
}
function fechar(){$('impostoModal').hidden=true;editandoId=null;}

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
  if(old){
    Object.assign(old,{date,value:Math.round(value*100)/100,number,updatedAt:new Date().toISOString()});
  }else{
    const id='imp_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    notes().push({id,date,value:Math.round(value*100)/100,number,origin:origem,createdAt:new Date().toISOString()});
    if(origem==='venda'||origem==='pdv')atual[origem]=id;
  }
  if(saveData()){fechar();toast(old?'Informações de imposto atualizadas.':'Informações de imposto salvas no painel Impostos.');}
}

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
render();
})();
