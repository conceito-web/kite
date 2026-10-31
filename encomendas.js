'use strict';
// Conceito: ENCOMENDAS — venda de produto que ainda não chegou.
// A encomenda guarda cliente + itens + desconto + o que o cliente já pagou (sinal ou valor total),
// SEM baixar estoque e SEM lançar nada no financeiro/caixa/lucro. Quando o produto chega e é dado entrada
// no estoque, o botão "Entregar" carrega tudo em "Registrar venda": o sinal já vem preenchido nos pagamentos,
// o saldo vem numa linha à parte, e ao confirmar a venda a encomenda passa para "Entregue".
// Usa as funções e dados do app.js (data, saleCart, readPayments, saveData...).
(function(){
const $=x=>document.getElementById(x), r2=n=>Math.round(Number(n||0)*100)/100;
const list=()=>data.preorders||(data.preorders=[]);
let pending=null; // {id}: encomenda carregada em "Registrar venda" (para entregar ou editar)
const num=o=>'Enc. '+String(o.number).padStart(4,'0');
const paidOf=o=>r2((o.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0));
const restOf=o=>Math.max(0,r2(o.total-paidOf(o)));
const fmt=v=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtOpt=v=>Number(v)>0?fmt(v):'';
const isOn=()=>!!$('vendaEncomenda')&&$('vendaEncomenda').checked;
window.ckrEncomendaOn=isOn;

// Todas as unidades da encomenda já estão no estoque?
function ready(o){
 const need={};o.items.forEach(i=>{need[i.productId]=(need[i.productId]||0)+Number(i.quantity||0);});
 return Object.keys(need).every(pid=>{const p=productById(pid);return !!p&&Number(p.stock||0)>=need[pid];});
}

// ---------- modo "Encomenda" no formulário de venda ----------
function sync(skipSummary){
 const box=$('vendaEncomenda');if(!box)return;
 if(editingSale&&box.checked)box.checked=false;
 box.disabled=!!editingSale;
 const on=box.checked,o=pending&&list().find(x=>x.id===pending.id&&x.status==='aberta');
 if(pending&&!o)pending=null;
 // Com a encomenda carregada, os campos de produto/qtd/preço ficam vazios (os itens já estão no carrinho): a validação é feita no envio.
 $('formVenda').noValidate=!!pending;
 $('vendaEncExtra').hidden=!on;
 const so=$('filtroVendaEstoque');
 if(so){if(on&&so.checked){so.checked=false;so.dispatchEvent(new Event('change'));}so.disabled=on;}
 const lbl=$('confirmarVendaTexto');
 if(lbl){if(on)lbl.textContent=pending?'Salvar alterações da encomenda':'Salvar encomenda (não baixa estoque)';else if(!editingSale)lbl.textContent='Confirmar venda e baixar estoque';}
 const ban=$('vendaEncAviso');
 ban.hidden=!o;
 if(o){
  $('vendaEncTitulo').textContent=(on?'Editando a encomenda ':'Entregando a encomenda ')+num(o)+' — '+o.client;
  $('vendaEncTexto').textContent=on?'Ajuste itens, valores ou o que o cliente já pagou e salve. Nada é baixado do estoque.':'O produto precisa estar no estoque (menu Entrada de estoque). Complete o pagamento do saldo e confirme: a encomenda passa para “Entregue”.';
 }
 if(!skipSummary)updatePaymentSummary();
}
const baseRenderCart=window.renderCart;
if(typeof baseRenderCart==='function')window.renderCart=function(){const r=baseRenderCart.apply(this,arguments);try{sync(true);}catch(_){}return r;};

const baseUPS=window.updatePaymentSummary;
if(typeof baseUPS==='function')window.updatePaymentSummary=function(){
 const r=baseUPS.apply(this,arguments);
 try{
  if(isOn()){
   const total=saleTotals().total,got=r2(readPayments().reduce((s,x)=>s+x.amount,0)),rem=r2(total-got),n=$('avisoPagamento');
   n.classList.remove('payment-ok','payment-error');
   if(rem<-0.009){n.textContent=`O valor recebido ultrapassa o total em ${money(-rem)}.`;n.classList.add('payment-error');}
   else if(got<=0.009)n.textContent='Sem sinal: o valor total fica para receber na entrega. Se o cliente já pagou algo, adicione a forma de pagamento acima.';
   else if(rem>0.009)n.textContent=`Já recebido: ${money(got)} · falta ${money(rem)} para receber na entrega.`;
   else{n.textContent='Pagamento total recebido. Na entrega só falta baixar o estoque.';n.classList.add('payment-ok');}
  }
 }catch(_){}
 return r;
};

// Se o usuário começar a editar uma venda, solta a encomenda que estava carregada.
const baseStartEdit=window.startSaleEdit;
if(typeof baseStartEdit==='function')window.startSaleEdit=function(){
 const r=baseStartEdit.apply(this,arguments);
 if(editingSale)pending=null;
 try{sync();}catch(_){}
 return r;
};

// ---------- salvar encomenda (chamado pelo submit de "Registrar venda") ----------
window.ckrEncomendaSubmit=function(){
 if(!isOn())return false;
 const err=m=>{toast(m,true);return true;};
 if(editingSale)return err('Termine ou cancele a edição da venda antes de salvar uma encomenda.');
 if(!saleCart.length)return err('Adicione pelo menos um produto ao carrinho antes de salvar a encomenda.');
 const client=$('vendaCliente').value.trim();
 if(!client)return err('Informe o cliente da encomenda.');
 const t=saleTotals();
 if(!(t.total>0))return err('O total da encomenda precisa ser maior que zero.');
 const pays=readPayments();
 if(pays.some(p=>p.method===PM.PROM))return err('Na encomenda, informe só o que o cliente já pagou. A promissória do saldo é escolhida na entrega.');
 if(pays.some(p=>!p.method||!(p.amount>0)))return err('Informe a forma e o valor de cada pagamento, ou remova a linha em branco.');
 const got=r2(pays.reduce((s,p)=>s+p.amount,0));
 if(got>t.total+0.009)return err(`O valor recebido (${money(got)}) é maior que o total (${money(t.total)}).`);
 const perr=pays.length?validatePayments(pays,client):'';
 if(perr)return err(perr);
 const now=new Date().toISOString(),by=currentUserName();
 const old=pending?list().find(x=>x.id===pending.id&&x.status==='aberta'):null;
 let alloc=0;
 const items=saleCart.map((it,i)=>{let lt;if(i===saleCart.length-1)lt=r2(t.total-alloc);else{lt=t.subtotal?r2(r2(it.quantity*it.price)*(t.total/t.subtotal)):0;alloc+=lt;}return {productId:it.productId,name:it.name,quantity:it.quantity,price:it.price,cost:Number(it.cost||0),lineTotal:lt};});
 const date=saleDateISO('vendaData',old?old.date:null);
 const payments=pays.map((p,i)=>({...p,id:id(),date:(old&&old.payments&&old.payments[i]&&old.payments[i].date)||date,by}));
 const base={client,note:$('vendaObs').value.trim(),eta:$('vendaEncPrevisao').value||'',items,subtotal:t.subtotal,discountCash:t.discountCash,discountPercent:t.discountPercent,discount:r2(t.subtotal-t.total),total:t.total,payments};
 let o;
 if(old){Object.assign(old,base,{editedAt:now,editedBy:by});o=old;}
 else{o={id:id(),number:list().reduce((n,x)=>Math.max(n,x.number||0),0)+1,date,status:'aberta',createdAt:now,createdBy:by,...base};list().push(o);}
 pending=null;
 saleCart=[];$('formVenda').reset();setSaleDateToday();$('linhasPagamento').innerHTML='';addPaymentRow();renderVendaProdutoSelect(false);
 renderCart();updateSalePreview();
 if(saveData()){toast(`Encomenda ${num(o)} ${old?'atualizada':'salva'}. Estoque e financeiro não foram alterados.`);goTo('encomendas');}
 return true;
};

// ---------- entrega: a venda foi confirmada, encomenda vira "Entregue" ----------
window.ckrEncomendaDone=function(saleId){
 if(!pending||editingSale)return;
 const o=list().find(x=>x.id===pending.id);
 if(o&&o.status==='aberta'){o.status='entregue';o.saleId=saleId;o.deliveredAt=new Date().toISOString();o.deliveredBy=currentUserName();}
 pending=null;
};

// ---------- carregar a encomenda em "Registrar venda" ----------
function load(o,deliver){
 if(editingSale){toast('Termine ou cancele a edição da venda antes de abrir uma encomenda.',true);return;}
 if(saleCart.length&&!confirm('O carrinho de Registrar venda tem itens. Substituí-los pelos da encomenda?'))return;
 const lines=[],missing=[];
 o.items.forEach(it=>{const p=productById(it.productId);if(!p){missing.push(it.name);return;}lines.push({productId:p.id,name:p.name,quantity:it.quantity,price:it.price,cost:Number(p.cost||0)});});
 if(missing.length)toast('Produto(s) não encontrado(s) no catálogo e ignorado(s): '+missing.join(', '),true);
 if(!lines.length)return;
 if(deliver&&!ready(o)&&!confirm('O estoque ainda não tem todas as unidades desta encomenda.\n\nAntes de confirmar a venda, dê entrada do produto em "Entrada de estoque". Abrir mesmo assim?'))return;
 saleCart=lines;pending={id:o.id};
 $('vendaEncomenda').checked=!deliver;
 $('vendaCliente').value=o.client;$('vendaObs').value=o.note||'';
 $('vendaDescontoReais').value=fmtOpt(o.discountCash);$('vendaDescontoPercentual').value=fmtOpt(o.discountPercent);
 $('vendaEncPrevisao').value=o.eta||'';
 $('vendaData').value=deliver?todayISO():localDateKey(o.date);
 $('linhasPagamento').innerHTML='';
 const pays=o.payments||[];
 pays.forEach(pm=>{
  const row=addPaymentRow();
  row.querySelector('.pagamentoMetodo').value=pm.method||'';
  row.querySelector('.pagamentoValor').value=fmt(pm.amount||0);
  row.querySelector('.pagamentoParcelas').value=pm.installments||1;
  row.querySelector('.pagamentoResponsavel').value=pm.responsible||'loja';
  row.querySelector('.pagamentoBandeira').value=pm.brand||'vm';
  row.querySelector('.pagamentoVencimento').value=pm.dueDate||'';
  row.querySelector('.pagamentoExtendido').checked=pm.extended!==false;
  updatePaymentRow(row);
 });
 const rem=restOf(o);
 if(deliver&&rem>0.009){const row=addPaymentRow();row.querySelector('.pagamentoValor').value=fmt(rem);}
 else if(!pays.length)addPaymentRow();
 $('reciboAcoes').hidden=true;
 renderVendaProdutoSelect(false);renderCart();updateSalePreview();goTo('venda');
 toast(deliver?`Encomenda ${num(o)} carregada. Escolha como o saldo foi pago e confirme a venda.`:`Encomenda ${num(o)} carregada para edição.`);
}

// ---------- receber pagamento (sinal extra) ----------
let payId=null;
function openPay(o){
 payId=o.id;
 $('encModalInfo').textContent=`${o.client} · ${num(o)} · total ${money(o.total)} · falta ${money(restOf(o))}`;
 $('encModalValor').value=fmt(restOf(o));
 $('encModalForma').innerHTML='<option value="">Selecione...</option>'+PAY_METHODS.filter(m=>m!==PM.PROM).map(m=>`<option>${esc(m)}</option>`).join('');
 $('encModalData').value=todayISO();$('encModalErro').textContent='';$('encModal').hidden=false;
 setTimeout(()=>{$('encModalValor').focus();$('encModalValor').select();},50);
}
function closePay(){$('encModal').hidden=true;payId=null;}
bindMoneyMask($('encModalValor'));
$('encModalFechar').addEventListener('click',closePay);
$('encModal').addEventListener('click',e=>{if(e.target===$('encModal'))closePay();});
$('encModalForm').addEventListener('submit',e=>{
 e.preventDefault();
 const o=list().find(x=>x.id===payId&&x.status==='aberta'),err=m=>{$('encModalErro').textContent=m;};
 if(!o){closePay();return;}
 const v=r2(parseMoneyInput($('encModalValor').value)),m=$('encModalForma').value;
 if(!(v>0))return err('Informe o valor recebido.');
 if(!m)return err('Escolha a forma de pagamento.');
 if(v>restOf(o)+0.009)return err(`O valor é maior que o que falta receber (${money(restOf(o))}).`);
 (o.payments=o.payments||[]).push({id:id(),date:saleDateISO('encModalData'),method:m,amount:v,installments:null,responsible:null,brand:null,dueDate:null,extended:null,by:currentUserName()});
 if(saveData()){closePay();toast(`Recebimento de ${money(v)} registrado na encomenda ${num(o)}.`);}
});

// ---------- comprovante em PDF ----------
function pdf(o){
 if(!window.jspdf||!window.jspdf.jsPDF){toast('A biblioteca de PDF não carregou. Verifique a internet e tente novamente.',true);return;}
 const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});let y=18;
 doc.setFont('helvetica','bold');doc.setFontSize(17);doc.text('CONCEITO - COMPROVANTE DE ENCOMENDA',15,y);y+=9;
 doc.setFont('helvetica','normal');doc.setFontSize(10);
 doc.text(`${num(o)}   |   Data: ${new Date(o.date).toLocaleDateString('pt-BR')}${o.eta?`   |   Previsão de chegada: ${brDate(o.eta)}`:''}`,15,y);y+=6;
 doc.text(`Cliente: ${o.client}`,15,y);y+=9;
 doc.setFont('helvetica','bold');doc.text('PRODUTO',15,y);doc.text('QTD.',108,y);doc.text('VALOR UNIT.',126,y);doc.text('VALOR TOTAL',166,y);y+=3;doc.line(15,y,195,y);y+=6;doc.setFont('helvetica','normal');
 o.items.forEach(it=>{const nm=doc.splitTextToSize(it.name,88),h=Math.max(7,nm.length*5);if(y+h>265){doc.addPage();y=18;}doc.text(nm,15,y);doc.text(String(it.quantity),108,y);doc.text(money(it.price),126,y);doc.text(money(it.lineTotal),166,y);y+=h;});
 y+=2;doc.line(15,y,195,y);y+=8;
 if(y>235){doc.addPage();y=18;}
 if(o.discount>0){doc.text('Subtotal:',135,y);doc.text(money(o.subtotal),195,y,{align:'right'});y+=6;doc.text('Desconto:',135,y);doc.text('- '+money(o.discount),195,y,{align:'right'});y+=7;}
 doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('TOTAL:',125,y);doc.text(money(o.total),195,y,{align:'right'});y+=9;
 doc.setFontSize(10);
 if((o.payments||[]).length){doc.text('Pagamentos recebidos',15,y);y+=6;doc.setFont('helvetica','normal');
  o.payments.forEach(p=>{if(y>270){doc.addPage();y=18;}doc.text(`${brDate(localDateKey(p.date))}  -  ${p.method}`,20,y);doc.text(money(p.amount),195,y,{align:'right'});y+=6;});
  y+=2;doc.setFont('helvetica','bold');}
 doc.text('TOTAL PAGO:',125,y);doc.text(money(paidOf(o)),195,y,{align:'right'});y+=7;
 doc.setFontSize(13);doc.text('FALTA PAGAR:',125,y);doc.text(money(restOf(o)),195,y,{align:'right'});y+=11;
 doc.setFont('helvetica','normal');doc.setFontSize(10);
 const ls=doc.splitTextToSize('Produto sob encomenda: a entrega será combinada quando ele chegar. O valor restante é pago na entrega. Este comprovante não é documento fiscal.',175);
 if(y+ls.length*5>280){doc.addPage();y=18;}doc.text(ls,15,y);y+=ls.length*5+3;
 if(o.note){const nl=doc.splitTextToSize(`Observação: ${o.note}`,175);doc.text(nl,15,y);}
 doc.save(`encomenda-${String(o.number).padStart(4,'0')}.pdf`);
}

// ---------- painel Encomendas ----------
function render(){
 const L=list(),open=L.filter(o=>o.status==='aberta'),pronta=open.filter(ready);
 const badge=$('menuEncomendas');if(badge){badge.textContent=open.length;badge.classList.toggle('alert',pronta.length>0);}
 if(!$('encLista'))return;
 const sum=a=>r2(a.reduce((s,x)=>s+x,0));
 $('encStatAbertas').textContent=open.length;$('encStatAbertasNota').textContent=open.length?`Total encomendado: ${money(sum(open.map(o=>o.total)))}`:'Nenhuma encomenda esperando';
 $('encStatRecebido').textContent=money(sum(open.map(paidOf)));
 $('encStatReceber').textContent=money(sum(open.map(restOf)));
 $('encStatProntas').textContent=pronta.length;$('encStatProntasNota').textContent=pronta.length?'Produto já no estoque: pode entregar':'Aguardando chegada do produto';
 const f=$('encFiltro').value,q=fold($('encBusca').value);
 let rows=L.filter(o=>f==='todas'||(f==='abertas'&&o.status==='aberta')||(f==='entregues'&&o.status==='entregue')||(f==='canceladas'&&o.status==='cancelada'));
 if(q)rows=rows.filter(o=>fold(o.client+' '+num(o)+' '+o.items.map(i=>i.name).join(' ')).includes(q));
 rows.sort((a,b)=>b.number-a.number);
 const btn=(a,t,i,cls)=>`<button type="button" class="row-action${cls?' '+cls:''}" data-enc-act="${a}" data-enc-id="${esc(i)}">${t}</button>`;
 const pill=o=>o.status==='entregue'?`<span class="pill ativa">Entregue</span>${o.saleId?`<br><small>Venda ${esc(o.saleId)}</small>`:''}`:o.status==='cancelada'?'<span class="pill cancelada">Cancelada</span>':`<span class="pill aguardando">Aguardando</span><br>${ready(o)?'<small class="enc-ok">Produto já no estoque</small>':'<small>Produto não chegou</small>'}`;
 $('encLista').innerHTML=rows.map(o=>{
  const pays=(o.payments||[]).map(p=>`${esc(p.method)} ${money(p.amount)} (${esc(brDate(localDateKey(p.date)))})`).join('<br>');
  const actions=btn('pdf','Comprovante PDF',o.id)+(o.status==='aberta'?btn('entregar','Entregar (virar venda)',o.id,'enc-main')+(restOf(o)>0.009?btn('pagar','Receber pagamento',o.id):'')+btn('editar','Editar',o.id)+btn('cancelar','Cancelar',o.id,'delete'):'')+(o.status==='cancelada'?btn('reabrir','Reabrir',o.id):'');
  return `<tr${o.status==='cancelada'?' class="row-canceled"':''}><td>${esc(num(o))}</td><td>${esc(new Date(o.date).toLocaleDateString('pt-BR'))}</td><td>${esc(o.client)}</td><td class="enc-items">${o.items.map(i=>`${i.quantity}× ${esc(i.name)}`).join('<br>')}</td><td>${money(o.total)}</td><td>${money(paidOf(o))}${pays?`<br><small>${pays}</small>`:''}</td><td><b>${o.status==='aberta'?money(restOf(o)):'—'}</b></td><td>${o.eta?esc(brDate(o.eta)):'—'}</td><td class="sale-status">${pill(o)}</td><td>${actions}</td></tr>`;
 }).join('')||'<tr><td colspan="10" class="cart-empty">Nenhuma encomenda encontrada.</td></tr>';
}
$('encFiltro').addEventListener('change',render);$('encBusca').addEventListener('input',render);
$('encLista').addEventListener('click',e=>{
 const b=e.target.closest('[data-enc-act]');if(!b)return;
 const o=list().find(x=>x.id===b.dataset.encId);if(!o)return;
 const full=()=>{if(hasFullAccess())return true;toast('Seu perfil não tem permissão para esta ação.',true);return false;};
 switch(b.dataset.encAct){
  case 'pdf':pdf(o);break;
  case 'entregar':if(o.status==='aberta')load(o,true);break;
  case 'pagar':if(o.status==='aberta')openPay(o);break;
  case 'editar':if(full()&&o.status==='aberta')load(o,false);break;
  case 'cancelar':
   if(!full()||o.status!=='aberta')break;
   if(!confirm(`Cancelar a encomenda ${num(o)} de ${o.client}?`+(paidOf(o)>0?`\n\nO cliente já pagou ${money(paidOf(o))}. Combine a devolução com ele, se for o caso. Esse valor não entrou no caixa do sistema.`:'')))break;
   o.status='cancelada';o.canceledAt=new Date().toISOString();if(pending&&pending.id===o.id)pending=null;
   if(saveData())toast('Encomenda cancelada.');break;
  case 'reabrir':if(full()){o.status='aberta';o.canceledAt='';if(saveData())toast('Encomenda reaberta.');}break;
 }
});
$('vendaEncomenda').addEventListener('change',()=>sync());
$('cancelarEncVenda').addEventListener('click',()=>{pending=null;sync();toast('Encomenda desvinculada. O carrinho continua como está.');});

// ---------- integração ----------
const baseRenderAll=window.renderAll;
window.renderAll=function(){baseRenderAll();render();try{sync(true);}catch(_){}};
render();sync(true);
})();
