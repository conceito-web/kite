'use strict';
// Conceito: Impostos — registro solto de notas (DATA, VALOR DA NOTA, N° DA NOTA).
// Os botões "Informações de imposto" em Registrar venda e PDV abrem o formulário.
// Se a venda atual já tem informações registradas, o sistema avisa e pergunta se quer modificar.
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

function render(){
  const mes=$('impMes').value;
  const all=notes().slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt).localeCompare(String(a.createdAt)));
  const list=mes?all.filter(n=>String(n.date).startsWith(mes)):all;
  $('impQtd').textContent=list.length;
  $('impTotal').textContent=money(list.reduce((t,n)=>t+Number(n.value||0),0));
  $('menuImpostos').textContent=all.length;
  $('impLista').innerHTML=list.map(n=>`<tr><td>${esc(dateBR(n.date))}</td><td>${esc(n.number)}</td><td>${money(n.value)}</td><td>${esc(ORIGENS[n.origin]||'—')}</td><td><button class="button button-light button-small" type="button" data-imp-edit="${esc(n.id)}">Modificar</button> <button class="button button-danger-light button-small" type="button" data-imp-del="${esc(n.id)}">Excluir</button></td></tr>`).join('')
    ||'<tr><td colspan="5" class="cart-empty">Nenhuma nota registrada neste período.</td></tr>';
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
  $('impMes').addEventListener('change',render);
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
