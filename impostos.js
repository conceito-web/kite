'use strict';
// Conceito: Impostos — registro solto de notas (DATA, VALOR DA NOTA, N° DA NOTA).
// Os botões "Informações de imposto" em Registrar venda e PDV abrem o formulário.
// Por enquanto a nota NÃO é vinculada à venda; fica apenas no painel Impostos (somente admin/master).
// Usa as funções e dados do app.js (data, money, saveData, toast, esc, parseMoneyInput, bindMoneyMask, todayISO).
(function(){
const $=x=>document.getElementById(x);
const notes=()=>data.taxNotes||(data.taxNotes=[]);
let origem='painel';
const ORIGENS={venda:'Registrar venda',pdv:'PDV',painel:'Painel Impostos'};
const dateBR=iso=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');return m?`${m[3]}/${m[2]}/${m[1]}`:'—';};

function abrir(o){
  origem=o;
  $('impData').value=todayISO();
  $('impValor').value='';
  $('impNumero').value='';
  $('impErro').textContent='';
  $('impostoModal').hidden=false;
  setTimeout(()=>$('impValor').focus(),50);
}
function fechar(){$('impostoModal').hidden=true;}

function salvar(e){
  e.preventDefault();
  const date=$('impData').value;
  const value=parseMoneyInput($('impValor').value);
  const number=$('impNumero').value.trim();
  if(!date){$('impErro').textContent='Informe a data.';return;}
  if(!(value>0)){$('impErro').textContent='Informe o valor da nota.';return;}
  if(!number){$('impErro').textContent='Informe o número da nota.';return;}
  notes().push({id:'imp_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),date,value:Math.round(value*100)/100,number,origin:origem,createdAt:new Date().toISOString()});
  if(saveData()){fechar();toast('Informações de imposto salvas no painel Impostos.');}
}

function render(){
  const mes=$('impMes').value;
  const all=notes().slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt).localeCompare(String(a.createdAt)));
  const list=mes?all.filter(n=>String(n.date).startsWith(mes)):all;
  $('impQtd').textContent=list.length;
  $('impTotal').textContent=money(list.reduce((t,n)=>t+Number(n.value||0),0));
  $('menuImpostos').textContent=all.length;
  $('impLista').innerHTML=list.map(n=>`<tr><td>${esc(dateBR(n.date))}</td><td>${esc(n.number)}</td><td>${money(n.value)}</td><td>${esc(ORIGENS[n.origin]||'—')}</td><td><button class="button button-danger-light button-small" type="button" data-imp-del="${esc(n.id)}">Excluir</button></td></tr>`).join('')
    ||'<tr><td colspan="5" class="cart-empty">Nenhuma nota registrada neste período.</td></tr>';
}

function init(){
  bindMoneyMask($('impValor'));
  $('vendaImposto').addEventListener('click',()=>abrir('venda'));
  $('pdvImposto').addEventListener('click',()=>abrir('pdv'));
  $('impNova').addEventListener('click',()=>abrir('painel'));
  $('impFechar').addEventListener('click',fechar);
  $('impostoModal').addEventListener('click',e=>{if(e.target===$('impostoModal'))fechar();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('impostoModal').hidden)fechar();});
  $('impostoForm').addEventListener('submit',salvar);
  $('impMes').addEventListener('change',render);
  $('impLista').addEventListener('click',e=>{
    const b=e.target.closest('[data-imp-del]');if(!b)return;
    const n=notes().find(x=>x.id===b.dataset.impDel);if(!n)return;
    if(confirm(`Excluir a nota ${n.number}?`)){data.taxNotes=notes().filter(x=>x.id!==n.id);if(saveData())toast('Nota excluída.');}
  });
}
init();

// Atualiza junto com o resto do sistema e ao abrir o painel.
const baseRender=window.renderAll;
window.renderAll=function(){baseRender();render();};
const baseGoTo=window.goTo;
window.goTo=function(name){baseGoTo.apply(this,arguments);if(name==='impostos')render();};
render();
})();
