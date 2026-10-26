'use strict';
// Conceito: Impostos — notas (DATA, VALOR DA NOTA, N° DA NOTA) vinculadas à venda.
// - Registrar venda / PDV: a nota digitada fica guardada e é gravada junto com o código da venda ao confirmá-la.
// - Editando uma venda: o botão encontra a nota dela, avisa que já foi registrada e pergunta se quer modificar.
// - Painel Impostos (somente admin/master): lista as notas e mostra a venda de origem.
// Usa as funções e dados do app.js (data, money, saveData, toast, esc, parseMoneyInput, bindMoneyMask, todayISO, editingSale, lastReceipt).
(function(){
const $=x=>document.getElementById(x);
const notes=()=>data.taxNotes||(data.taxNotes=[]);
const ORIGENS={venda:'Registrar venda',pdv:'PDV',painel:'Painel Impostos'};
const dateBR=iso=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');return m?`${m[3]}/${m[2]}/${m[1]}`:'—';};
const r2=n=>Math.round(Number(n||0)*100)/100;
let origem='painel';          // tela de onde o formulário foi aberto
let editando=null;            // nota em edição (já salva ou pendente); null = nota nova
const pendente={venda:null,pdv:null}; // nota digitada para a venda em andamento (ainda sem código de venda)
let recibosVistos=typeof lastReceipt!=='undefined'?lastReceipt:null;

const notaDaVenda=id=>id&&notes().find(n=>n.saleId===id);
const emEdicao=()=>(typeof editingSale!=='undefined'&&editingSale)?editingSale:null;

function abrir(o,nota){
  origem=o;editando=nota||null;
  const n=editando;
  $('impTitulo').textContent=n?'Modificar informações de imposto':'Informações de imposto';
  $('impData').value=n?n.date:todayISO();
  $('impValor').value=n?Number(n.value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'';
  $('impNumero').value=n?n.number:'';
  $('impErro').textContent='';
  $('impostoModal').hidden=false;
  setTimeout(()=>$('impValor').focus(),50);
}
function fechar(){$('impostoModal').hidden=true;editando=null;}

// Aviso antes de modificar uma nota que já foi registrada.
function confirmarModificar(n){
  return confirm(`Já foram registradas informações de imposto:\n\nData: ${dateBR(n.date)}\nN° da nota: ${n.number}\nValor da nota: ${money(n.value)}\n\nDeseja realmente modificar?`);
}

// Clique nos botões "Informações de imposto" de Registrar venda e PDV.
function clicarBotao(o){
  const ed=o==='venda'?emEdicao():null;
  const n=ed?notaDaVenda(ed.saleId):pendente[o];   // editando venda: nota gravada; venda nova: nota pendente
  if(!n){abrir(o);return;}
  if(confirmarModificar(n))abrir(o,n);
}

function salvar(e){
  e.preventDefault();
  const date=$('impData').value;
  const value=r2(parseMoneyInput($('impValor').value));
  const number=$('impNumero').value.trim();
  if(!date){$('impErro').textContent='Informe a data.';return;}
  if(!(value>0)){$('impErro').textContent='Informe o valor da nota.';return;}
  if(!number){$('impErro').textContent='Informe o número da nota.';return;}
  const novoId=()=>'imp_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const ed=origem==='venda'?emEdicao():null;
  if(editando){
    Object.assign(editando,{date,value,number});
    if(editando.id){                       // nota já gravada
      editando.updatedAt=new Date().toISOString();
      if(saveData()){fechar();toast('Informações de imposto atualizadas.');}
    }else{                                 // nota ainda pendente (venda não confirmada)
      fechar();toast('Informações de imposto atualizadas. Serão gravadas ao confirmar a venda.');
    }
    return;
  }
  if(ed){                                  // editando uma venda que ainda não tinha nota
    notes().push({id:novoId(),date,value,number,origin:'venda',saleId:ed.saleId,createdAt:new Date().toISOString()});
    if(saveData()){fechar();toast(`Informações de imposto gravadas na venda ${ed.saleId}.`);}
    return;
  }
  if(origem==='venda'||origem==='pdv'){    // venda nova: guarda e grava junto com a venda
    pendente[origem]={date,value,number,origin:origem};
    fechar();toast('Informações de imposto guardadas. Serão gravadas junto com a venda ao confirmá-la.');
    return;
  }
  notes().push({id:novoId(),date,value,number,origin:'painel',saleId:'',createdAt:new Date().toISOString()});
  if(saveData()){fechar();toast('Nota registrada no painel Impostos.');}
}

// Depois que uma venda é salva, grava a nota pendente com o código da venda.
function verificarVenda(){
  if(typeof lastReceipt==='undefined'||!lastReceipt||lastReceipt===recibosVistos)return;
  recibosVistos=lastReceipt;
  const id=lastReceipt.id;if(!id)return;
  const mv=data.movements.find(m=>m.type==='venda'&&(m.saleId||m.id)===id);
  if(!mv||mv.editedAt)return;              // edição de venda não consome a nota pendente
  const o=mv.source==='pdv'?'pdv':'venda';
  const p=pendente[o];if(!p||notaDaVenda(id))return;
  notes().push({id:'imp_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),date:p.date,value:p.value,number:p.number,origin:o,saleId:id,createdAt:new Date().toISOString()});
  pendente[o]=null;
  if(saveData())toast(`Venda ${id} registrada. Nota ${p.number} vinculada à venda.`);
}

function origemTexto(n){
  if(!n.saleId)return 'Avulsa'+(n.origin&&n.origin!=='painel'?' · '+(ORIGENS[n.origin]||''):'');
  const mv=data.movements.find(m=>m.type==='venda'&&(m.saleId||m.id)===n.saleId);
  const cancel=mv&&mv.canceled?' (venda cancelada)':'';
  return `Venda ${n.saleId} · ${ORIGENS[n.origin]||'Registrar venda'}${cancel}`;
}

function render(){
  const mes=$('impMes').value;
  const all=notes().slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt).localeCompare(String(a.createdAt)));
  const list=mes?all.filter(n=>String(n.date).startsWith(mes)):all;
  $('impQtd').textContent=list.length;
  $('impTotal').textContent=money(list.reduce((t,n)=>t+Number(n.value||0),0));
  $('menuImpostos').textContent=all.length;
  $('impLista').innerHTML=list.map(n=>`<tr><td>${esc(dateBR(n.date))}</td><td>${esc(n.number)}</td><td>${money(n.value)}</td><td>${esc(origemTexto(n))}</td><td><button class="button button-light button-small" type="button" data-imp-edit="${esc(n.id)}">Modificar</button> <button class="button button-danger-light button-small" type="button" data-imp-del="${esc(n.id)}">Excluir</button></td></tr>`).join('')
    ||'<tr><td colspan="5" class="cart-empty">Nenhuma nota registrada neste período.</td></tr>';
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
    if(ed){const n=notes().find(x=>x.id===ed.dataset.impEdit);if(n&&confirmarModificar(n))abrir(n.origin||'painel',n);return;}
    const b=e.target.closest('[data-imp-del]');if(!b)return;
    const n=notes().find(x=>x.id===b.dataset.impDel);if(!n)return;
    if(confirm(`Excluir a nota ${n.number}${n.saleId?` (venda ${n.saleId})`:''}?`)){
      data.taxNotes=notes().filter(x=>x.id!==n.id);
      if(saveData())toast('Nota excluída.');
    }
  });
  // Venda salva como orçamento: a nota pendente não deve passar para a próxima venda.
  $('salvarOrcamentoVenda').addEventListener('click',()=>setTimeout(()=>{if(!saleCart.length)pendente.venda=null;},300));
  $('pdvOrcamento').addEventListener('click',()=>setTimeout(()=>{if(/^R\$\s?0,00$/.test($('pdvTotal').textContent.trim()))pendente.pdv=null;},300));
}
init();

// Atualiza junto com o resto do sistema e ao abrir o painel.
const baseRender=window.renderAll;
window.renderAll=function(){baseRender();render();};
const baseGoTo=window.goTo;
window.goTo=function(name){baseGoTo.apply(this,arguments);if(name==='impostos')render();};
// Observa os salvamentos para vincular a nota pendente à venda recém-confirmada (Registrar venda e PDV, inclusive F2).
const baseSave=window.saveData;
window.saveData=function(){const ok=baseSave.apply(this,arguments);if(ok)setTimeout(verificarVenda,0);return ok;};
render();
})();
