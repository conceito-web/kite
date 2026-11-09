'use strict';
// Conceito: RECEITAS DE SERVIÇOS.
// Um quadradinho "Serviço" ao lado do "Lucro (%)" (no PDV e em Registrar venda) abre uma janela para cadastrar uma receita de serviço:
// descrição, cliente (opcional), data, valor e forma de pagamento. Não mexe no estoque nem no carrinho da venda.
// Onde o serviço entra:
//   • Caixa: segue as mesmas regras das vendas (dinheiro e Pix entram na hora; cartão entra líquido da taxa, parcela por parcela).
//   • DRE: linha "Venda de serviço" (e a taxa do cartão entra em "Despesa com taxa de cartão").
//   • Despesas e lucro: lucro do serviço = valor − taxa do cartão (serviço não tem custo de produto).
// Os serviços ficam guardados em data.cashConfig.servicos (assim o backup e a restauração já os preservam).
// Usa funções do app.js (data, saveData, id, esc, money, parseMoneyInput, bindMoneyMask, toast, todayISO, localDateKey, brDate, PM, PAY_METHODS,
// payExtraHtml, readPayExtra, syncPayExtra, validatePayments, enrichPayment, payLabel, hasFullAccess, currentUserName).
(function(){
const $=x=>document.getElementById(x), r2=n=>Math.round(Number(n||0)*100)/100;
const list=()=>{const c=data.cashConfig||(data.cashConfig={});return Array.isArray(c.servicos)?c.servicos:(c.servicos=[]);};
// Lista usada pelo Caixa, pelo DRE e por Despesas e lucro.
window.ckrServicos=()=>list().filter(s=>s&&Number(s.amount)>0);
const METHODS=PAY_METHODS.filter(m=>m!==PM.PROM);   // promissória exige cliente e controle de parcelas: fica só nas vendas

const CSS=`
.svc-toggle{display:inline-flex;align-items:center;gap:6px;font:700 12px 'DM Sans',sans-serif;color:#536178;cursor:pointer;user-select:none;white-space:nowrap}
.svc-toggle input{width:18px;height:18px;margin:0;accent-color:#f97316;cursor:pointer}
#svcModal .svc-form{display:grid;gap:12px;margin-top:14px}
#svcModal .svc-form>label,#svcModal .svc-two>label{display:grid;gap:6px;font:700 11px 'DM Sans',sans-serif;color:#536178;letter-spacing:.04em}
#svcModal .svc-form>label input,#svcModal .svc-form>label select,#svcModal .svc-two>label input{width:100%;box-sizing:border-box;min-height:44px;border:1px solid #d0d5dd;border-radius:10px;padding:10px 12px;font:inherit;font-size:14px;letter-spacing:0;color:#1f2a44;background:#fff}
#svcModal .svc-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
#svcModal .svc-list{margin-top:20px;padding-top:12px;border-top:1px solid #eaecf0}
#svcModal .svc-list h3{margin:0 0 2px;font-size:14px}
#svcModal .svc-resumo{margin:0 0 6px;font-size:12px;color:#637087}
#svcModal .svc-item{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f0f2f6;font-size:13px}
#svcModal .svc-item small{display:block;color:#637087;margin-top:2px}
#svcModal .svc-item button{border:0;background:none;color:#d74b55;font:700 12px 'DM Sans',sans-serif;cursor:pointer;padding:6px}
@media(max-width:520px){#svcModal .svc-two{grid-template-columns:1fr}}`;

function build(){
 if($('svcModal'))return;
 const ov=document.createElement('div');
 ov.id='svcModal';ov.className='users-modal';ov.hidden=true;ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-labelledby','svcTitulo');
 ov.innerHTML=`<div class="users-card">
  <div class="users-heading"><div><p class="auth-eyebrow">RECEITAS DE SERVIÇOS</p><h2 id="svcTitulo">Cadastrar serviço</h2><p>Informe o valor e como o cliente pagou. Não mexe no estoque nem no carrinho da venda.</p></div><button type="button" id="svcFechar" class="users-close" aria-label="Fechar">×</button></div>
  <form id="svcForm" class="svc-form" autocomplete="off">
   <label>DESCRIÇÃO DO SERVIÇO<input id="svcDesc" maxlength="150" placeholder="Ex.: entrega e montagem, reforma de colchão"></label>
   <label>CLIENTE (OPCIONAL)<input id="svcCliente" maxlength="150" list="clientesSugestoes" placeholder="Digite as primeiras letras"></label>
   <div class="svc-two"><label>VALOR (R$)<input id="svcValor" type="text" inputmode="numeric" placeholder="0,00"></label><label>DATA<input id="svcData" type="date"></label></div>
   <label>FORMA DE PAGAMENTO<select id="svcForma"><option value="">Selecione...</option>${METHODS.map(m=>`<option>${esc(m)}</option>`).join('')}</select></label>
   <div id="svcExtra" class="payment-card-options" hidden>${payExtraHtml()}</div>
   <p id="svcErro" class="auth-error" role="alert"></p>
   <button class="button button-primary auth-submit" type="submit">Salvar receita de serviço</button>
  </form>
  <div class="svc-list"><h3>Serviços lançados</h3><p class="svc-resumo" id="svcResumo"></p><div id="svcLista"></div></div>
 </div>`;
 document.body.appendChild(ov);
 bindMoneyMask($('svcValor'));
 $('svcFechar').addEventListener('click',fechar);
 ov.addEventListener('click',e=>{if(e.target===ov)fechar();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!ov.hidden)fechar();});
 $('svcForma').addEventListener('change',sync);
 $('svcValor').addEventListener('input',sync);
 $('svcValor').addEventListener('money-mask-updated',sync);
 $('svcExtra').addEventListener('input',sync);
 $('svcExtra').addEventListener('change',sync);
 $('svcForm').addEventListener('submit',salvar);
 $('svcLista').addEventListener('click',e=>{const b=e.target.closest('[data-svc-del]');if(b)excluir(b.dataset.svcDel);});
}

// Mostra/oculta bandeira, parcelas etc. conforme a forma de pagamento (mesmas regras das vendas). Serviço é sempre "pela loja".
function sync(){
 const box=$('svcExtra'),resp=box.querySelector('.pagamentoResponsavel');
 resp.value='loja';
 syncPayExtra(box,$('svcForma').value,r2(parseMoneyInput($('svcValor').value)));
 resp.closest('label').hidden=true;
}

function dateISO(v){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return new Date().toISOString();
 const [y,m,d]=v.split('-').map(Number),n=new Date();
 return new Date(y,m-1,d,n.getHours(),n.getMinutes()).toISOString();   // hora local: evita cair no dia anterior
}

function abrir(clienteInputId){
 build();
 $('svcForm').reset();
 $('svcErro').textContent='';
 $('svcData').value=todayISO();
 const c=$(clienteInputId);if(c&&c.value.trim())$('svcCliente').value=c.value.trim();
 sync();renderLista();
 $('svcModal').hidden=false;
 setTimeout(()=>$('svcDesc').focus(),50);
}
function fechar(){
 if($('svcModal'))$('svcModal').hidden=true;
 document.querySelectorAll('.svcChk').forEach(c=>{c.checked=false;});   // o quadradinho desmarca para poder abrir de novo
}

function salvar(ev){
 ev.preventDefault();
 const err=m=>{$('svcErro').textContent=m;};
 err('');
 const description=$('svcDesc').value.trim(),client=$('svcCliente').value.trim(),amount=r2(parseMoneyInput($('svcValor').value)),method=$('svcForma').value;
 if(!description)return err('Descreva o serviço.');
 if(!(amount>0))return err('Informe o valor do serviço.');
 if(!method)return err('Escolha a forma de pagamento.');
 const pay=readPayExtra($('svcExtra'),method,amount),verr=validatePayments([pay],client);
 if(verr)return err(verr);
 const rec={id:id(),date:dateISO($('svcData').value),client,description,amount,payment:enrichPayment(pay),createdAt:new Date().toISOString(),by:currentUserName()};
 list().push(rec);
 if(!saveData()){list().pop();return;}
 toast(`Serviço de ${money(amount)} registrado. Já entrou no Caixa, no DRE e no lucro.`);
 fechar();
}

function excluir(sid){
 if(!hasFullAccess()){toast('Seu perfil não tem permissão para excluir serviços.',true);return;}
 const s=list().find(x=>x.id===sid);if(!s)return;
 if(!confirm(`Excluir o serviço "${s.description}" de ${money(s.amount)}?\n\nEle sai do Caixa, do DRE e do lucro.`))return;
 data.cashConfig.servicos=list().filter(x=>x.id!==sid);
 if(saveData()){toast('Serviço excluído.');renderLista();}
}

function renderLista(){
 const all=window.ckrServicos().slice().sort((a,b)=>String(b.createdAt||b.date).localeCompare(String(a.createdAt||a.date)));
 const mes=todayISO().slice(0,7),doMes=all.filter(s=>localDateKey(s.date).slice(0,7)===mes),total=r2(doMes.reduce((n,s)=>n+Number(s.amount||0),0));
 $('svcResumo').textContent=all.length?`Neste mês: ${doMes.length} serviço(s) · ${money(total)}. Mostrando os 15 mais recentes.`:'Nenhum serviço lançado ainda.';
 const full=hasFullAccess();
 $('svcLista').innerHTML=all.slice(0,15).map(s=>`<div class="svc-item"><div><b>${esc(s.description)}</b>${s.client?' · '+esc(s.client):''}<small>${esc(brDate(localDateKey(s.date)))} · ${esc(payLabel(s.payment||{method:'—',amount:s.amount}))}</small></div>${full?`<button type="button" data-svc-del="${esc(s.id)}">Excluir</button>`:''}</div>`).join('');
}

// Coloca o quadradinho "Serviço" ao lado do Lucro (%) do PDV e de Registrar venda.
function instalar(){
 [['vendaLucroPct','vendaCliente'],['pdvLucroPct','pdvCliente']].forEach(([lucroId,clienteId])=>{
  const strong=$(lucroId);if(!strong||strong.dataset.svc)return;
  strong.dataset.svc='1';
  const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:10px;flex-wrap:wrap';
  strong.parentNode.insertBefore(row,strong);row.appendChild(strong);
  const lab=document.createElement('label');lab.className='svc-toggle';lab.title='Cadastrar receita de serviço';
  lab.innerHTML='<input type="checkbox" class="svcChk"><span>Serviço</span>';
  row.appendChild(lab);
  lab.querySelector('input').addEventListener('change',e=>{if(e.target.checked)abrir(clienteId);});
 });
}
// estilo do quadradinho disponível desde o início (a janela só é criada na primeira vez que for aberta)
const st0=document.createElement('style');st0.id='svcCss';st0.textContent=CSS;document.head.appendChild(st0);
instalar();
// o Caixa, o DRE e Despesas e lucro já carregaram: redesenha para incluir os serviços já salvos
try{if(typeof renderAll==='function')renderAll();}catch(_){}
})();