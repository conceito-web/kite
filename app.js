'use strict';
const STORAGE_KEY = 'ckr_estoque_web_v2';
let data = loadData();
let editingId = null;
let toastTimer;
let saleCart = [];
let lastReceipt = null;
let editingSale = null; // venda sendo editada em "Registrar venda"

function emptyData(){return {version:3,products:[],movements:[],customers:[]};}
function loadData(){try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return emptyData();const parsed=JSON.parse(raw);if(!Array.isArray(parsed.products)||!Array.isArray(parsed.movements))return emptyData();if(!Array.isArray(parsed.customers))parsed.customers=[];return parsed;}catch(e){return emptyData();}}
function saveData(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));renderAll();return true;}catch(e){toast('Não foi possível salvar. Verifique o espaço disponível no navegador.',true);return false;}}
function id(){return (crypto&&crypto.randomUUID)?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;}
function money(n){return Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
// Converte valores digitados em centavos automaticamente: 1050 -> 10,50.
function parseMoneyInput(value){
 const raw=String(value??'').trim();
 if(!raw)return 0;
 const cleaned=raw.replace(/R\$\s?/g,'').replace(/\s/g,'');
 if(/[.,]/.test(cleaned)){
  const normalized=cleaned.replace(/\./g,'').replace(',','.');
  const n=Number(normalized);
  return Number.isFinite(n)?Math.max(0,n):0;
 }
 const digits=cleaned.replace(/\D/g,'');
 return digits?Number(digits)/100:0;
}
function parsePercentInput(value){
 const raw=String(value??'').trim();
 if(!raw)return 0;
 const n=Number(raw.replace(/\./g,'').replace(',','.'));
 return Number.isFinite(n)?Math.max(0,n):0;
}
function bindPercentInput(input){
 if(!input)return;
 input.addEventListener('focus',()=>{if(['0','0,00','0.00'].includes(input.value))input.value='';});
 input.addEventListener('blur',()=>{
  if(!input.value.trim())return;
  const n=Math.min(100,parsePercentInput(input.value));
  input.value=n.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:2});
 });
}
function formatMoneyDigits(value){
 const digits=String(value??'').replace(/\D/g,'');
 if(!digits)return '';
 const cents=Number(digits);
 return (cents/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function bindMoneyMask(input, {percent=false}={}){
 if(!input||input.dataset.moneyMask==='1')return;
 input.dataset.moneyMask='1';
 input.setAttribute('inputmode','numeric');
 input.setAttribute('autocomplete','off');
 const toEnd=()=>{try{const l=input.value.length;input.setSelectionRange(l,l);}catch(e){}};
 const apply=(digits)=>{
  digits=String(digits||'').replace(/\D/g,'').replace(/^0+(?=\d)/,'').slice(0,12);
  let out=digits?formatMoneyDigits(digits):'';
  if(percent&&out&&parseMoneyInput(out)>100)out='100,00';
  input.value=out;
  toEnd();
  input.dispatchEvent(new Event('money-mask-updated',{bubbles:false}));
 };
 input.addEventListener('focus',()=>{
  if(['0','0,00','0.00'].includes(input.value))input.value='';
  setTimeout(toEnd,0);
 });
 // Sempre usa só os dígitos digitados: cada número novo entra pela direita (centavos).
 // Guarda o valor ANTES da digitação e soma o dígito novo pela direita,
 // mesmo que o teclado do celular altere o texto ou o cursor fique no meio.
 const snap=()=>{input._prev=input.value;input._sel=input.selectionStart!==input.selectionEnd;};
 input.addEventListener('beforeinput',snap);
 input.addEventListener('keydown',snap);
 input.addEventListener('input',e=>{
  const prev=String(input._prev??'').replace(/\D/g,'');
  const type=e&&e.inputType||'';
  const ch=e&&typeof e.data==='string'?e.data.replace(/\D/g,''):'';
  const hadSel=input._sel;input._prev=undefined;input._sel=false;
  if(hadSel||!input.value){apply(input.value);return;}
  if(type==='insertText'&&ch.length===1){apply(prev+ch);return;}
  if(type==='deleteContentBackward'||type==='deleteContentForward'){apply(prev.slice(0,-1));return;}
  apply(input.value);
 });
 // Colar "10,50" ou "R$ 1.234,56" mantém o valor correto.
 input.addEventListener('paste',e=>{
  const txt=(e.clipboardData||window.clipboardData).getData('text');
  if(!txt)return;
  e.preventDefault();
  const n=parseMoneyInput(txt);
  apply(String(Math.round(n*100)));
 });
 // Mantém o cursor sempre no fim (evita bagunça ao tocar no campo no celular).
 ['click','touchend','keyup'].forEach(ev=>input.addEventListener(ev,()=>setTimeout(toEnd,0)));
 input.addEventListener('blur',()=>{
  if(!input.value.trim())return;
  const n=parseMoneyInput(input.value);
  input.value=n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 });
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(message,error=false){const el=document.getElementById('toast');el.textContent=message;el.classList.toggle('error',error);el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200);}
function productById(pid){return data.products.find(p=>p.id===pid);}
function recordMovement(type,p,qty,total,details='',extra={}){data.movements.unshift({id:id(),type,productId:p.id,productName:p.name,quantity:Number(qty),total:Number(total||0),details,date:new Date().toISOString(),...extra});}
function typePill(m){if(m.type==='venda'&&m.canceled)return '<span class="pill cancelada">Venda cancelada</span>';return `<span class="pill ${m.type}">${m.type==='venda'?'Venda':'Entrada'}</span>`;}
function dateText(d){return new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});}
// Usuários que não são ADMIN só acessam estes painéis:
const USER_PANELS=['dashboard','clientes','venda'];
// Perfis: admin (tudo + usuários, sem prazo) | master (tudo, menos usuários, com prazo) | usuario (só USER_PANELS, com prazo)
function hasFullAccess(){const r=document.body.dataset.ckrRole;return r==='admin'||r==='master';}
// Painéis só do ADMIN (backup, transferência e restauração).
const ADMIN_PANELS=['backup'];
function isAdmin(){return document.body.dataset.ckrRole==='admin';}
function canAccessPanel(name){if(ADMIN_PANELS.includes(name))return isAdmin();return hasFullAccess()||USER_PANELS.includes(name);}
function currentUserName(){return document.body.dataset.ckrUser||'';}
function goTo(name){if(!canAccessPanel(name)){toast('Seu acesso permite apenas Visão geral, Clientes e Registrar venda.',true);return;}document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===`panel-${name}`));document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.panel===name));const selected=document.querySelector(`.nav-link[data-panel="${name}"]`);document.getElementById('pageBreadcrumb').textContent=selected?selected.textContent.trim().replace(/\d+$/,'').trim():'Visão geral';document.getElementById('sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});}
document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>goTo(b.dataset.panel)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>goTo(b.dataset.go)));
document.getElementById('mobileMenu').addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));
document.getElementById('closeNotice').addEventListener('click',()=>document.querySelector('.notice').style.display='none');
document.getElementById('todayLabel').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});

function renderAll(){renderStats();renderProducts();renderSelects();renderHistory();renderRecent();renderCustomers();renderDashboardInsights();renderDateReport();renderSaleSearch();}
function renderStats(){
 document.getElementById('totalProdutos').textContent=data.products.length;
 document.getElementById('menuProdutos').textContent=data.products.length;
  document.getElementById('menuClientes').textContent=(data.customers||[]).length;
 document.getElementById('totalUnidades').textContent=data.products.reduce((s,p)=>s+Number(p.stock||0),0);
 document.getElementById('totalVendas').textContent=data.movements.filter(m=>m.type==='venda'&&!m.canceled).length;
 document.getElementById('valorEstoque').textContent=money(data.products.reduce((s,p)=>s+Number(p.stock||0)*Number(p.cost||0),0));
 // O lucro só usa vendas que guardam o custo real da época da venda.
 // Vendas antigas sem esse registro não podem ser recalculadas com segurança.
 const vendas=data.movements.filter(m=>m.type==='venda'&&!m.canceled);
 const vendasComCusto=vendas.filter(m=>m.costTotal!==undefined && Number.isFinite(Number(m.costTotal)));
 const receitaHistorica=vendasComCusto.reduce((s,m)=>s+Number(m.total||0),0);
 const custoHistorico=vendasComCusto.reduce((s,m)=>s+Number(m.costTotal||0),0);
 const lucro=Math.round((receitaHistorica-custoHistorico)*100)/100;
 const margem=receitaHistorica>0?(lucro/receitaHistorica)*100:0;
 const lucroEl=document.getElementById('lucroTotal');
 const margemEl=document.getElementById('margemLucro');
 const notaEl=document.getElementById('lucroHistoricoNota');
 if(lucroEl)lucroEl.textContent=money(lucro);
 if(margemEl)margemEl.textContent=`${margem.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%`;
 if(notaEl){const antigas=vendas.length-vendasComCusto.length;notaEl.textContent=antigas>0?`${antigas} venda(s) antiga(s) sem custo histórico não incluída(s)`:'Calculado pelo custo registrado em cada venda';}
}
function renderProducts(){
 const q=document.getElementById('buscaProduto').value.trim().toLowerCase();
 const soPositivos=document.getElementById('filtroEstoquePositivo').checked;
 const items=data.products.filter(p=>(p.name.toLowerCase().includes(q)||String(p.code||'').toLowerCase().includes(q))&&(!soPositivos||Number(p.stock)>0)).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 document.getElementById('listaProdutos').innerHTML=items.map(p=>`<tr><td><span class="product-name">${esc(p.name)}</span></td><td>${esc(p.code||'—')}</td><td class="${p.stock<=2?'stock-low':''}">${Number(p.stock)}</td><td>${money(p.cost)}</td><td>${money(p.price)}</td><td><button class="row-action" data-edit="${esc(p.id)}">Editar</button><button class="row-action delete" data-delete="${esc(p.id)}">Excluir</button></td></tr>`).join('');
 document.getElementById('semProdutos').style.display=items.length?'none':'block';
 document.getElementById('produtoSubtitulo').textContent=`${items.length} ${items.length===1?'item encontrado':'itens encontrados'}`;
}
function renderSelects(){
 const options=data.products.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(p=>`<option value="${esc(p.id)}">${esc(p.name)} — estoque: ${Number(p.stock)}</option>`).join('');
 ['entradaProduto'].forEach(key=>{const el=document.getElementById(key),current=el.value;el.innerHTML='<option value="">Selecione um produto...</option>'+options;if(data.products.some(p=>p.id===current))el.value=current;});
 renderVendaProdutoSelect(false);
 updateSalePreview();
}
// Busca de produto na venda: ao digitar parte do nome (ou código), aparece uma lista de sugestões para clicar.
// Ignora acentos e maiúsculas; várias palavras valem em qualquer ordem (ex.: "casal colchao").
function renderVendaProdutoSelect(){
 const el=document.getElementById('vendaProduto'),current=el.value;
 const soPos=document.getElementById('filtroVendaEstoque')&&document.getElementById('filtroVendaEstoque').checked;
 el.innerHTML='<option value="">Selecione um produto...</option>'+data.products.filter(p=>!soPos||Number(p.stock)>0||p.id===current).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(p=>`<option value="${esc(p.id)}">${esc(p.name)} — estoque: ${Number(p.stock)}</option>`).join('');
 if(data.products.some(p=>p.id===current))el.value=current;
}
(function(){
 const box=document.getElementById('vendaBuscaProduto'),list=document.getElementById('vendaSugestoes'),sel=document.getElementById('vendaProduto');
 if(!box||!list||!sel)return;
 let items=[],active=-1;
 const close=()=>{list.hidden=true;active=-1;};
 const setActive=i=>{active=i;[...list.children].forEach((c,k)=>c.classList.toggle('active',k===i));const c=list.children[i];if(c&&c.scrollIntoView)c.scrollIntoView({block:'nearest'});};
 function render(){
  const words=fold(box.value).split(/\s+/).filter(Boolean);
  if(!words.length){items=[];close();return;}
  const soPos=document.getElementById('filtroVendaEstoque').checked;
  items=data.products.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).filter(p=>(!soPos||Number(p.stock)>0)&&words.every(w=>fold(p.name).includes(w)||fold(p.code||'').includes(w))).slice(0,30);
  list.innerHTML=items.length?items.map((p,i)=>`<button type="button" data-i="${i}"><span>${esc(p.name)}</span><small>${Number(p.stock)>0?'estoque: '+Number(p.stock):'sem estoque'} · ${money(p.price)}</small></button>`).join(''):'<div class="empty">Nenhum produto encontrado</div>';
  list.hidden=false;active=-1;
 }
 function pick(i){
  const p=items[i];if(!p)return;
  sel.value=p.id;box.value=p.name;close();updateSalePreview();
  document.getElementById('vendaQuantidade').focus();
 }
 box.addEventListener('input',()=>{
  if(sel.value){const cur=productById(sel.value);if(!cur||cur.name!==box.value){sel.value='';updateSalePreview();}}
  render();
 });
 box.addEventListener('focus',()=>{if(box.value.trim()&&!sel.value)render();});
 document.getElementById('filtroVendaEstoque').addEventListener('change',()=>{renderVendaProdutoSelect();if(box.value.trim()&&!sel.value)render();});
 box.addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();if(!list.hidden&&items.length)pick(active>=0?active:0);return;}
  if(e.key==='Escape'){close();return;}
  if((e.key==='ArrowDown'||e.key==='ArrowUp')&&items.length){
   e.preventDefault();if(list.hidden)render();
   setActive(e.key==='ArrowDown'?Math.min(items.length-1,active+1):Math.max(0,active-1));
  }
 });
 list.addEventListener('mousedown',e=>e.preventDefault());
 list.addEventListener('click',e=>{const b=e.target.closest('button[data-i]');if(b)pick(Number(b.dataset.i));});
 document.addEventListener('click',e=>{if(!e.target.closest('.product-search'))close();});
})();
function renderHistory(){
 const filter=document.getElementById('filtroTipo').value;
 const list=data.movements.filter(m=>filter==='todos'||m.type===filter);
 document.getElementById('listaHistorico').innerHTML=list.map(m=>`<tr${m.canceled?' class="row-canceled"':''}><td>${esc(dateText(m.date))}</td><td>${typePill(m)}</td><td><span class="product-name">${esc(m.productName)}</span></td><td>${Number(m.quantity)}</td><td>${money(m.total)}</td><td>${esc(m.details||'—')}</td></tr>`).join('');
 document.getElementById('semHistorico').style.display=list.length?'none':'block';
}
function renderRecent(){
 const list=data.movements.slice(0,5);
 document.getElementById('recentRows').innerHTML=list.map(m=>`<tr><td>${typePill(m)}</td><td><span class="product-name">${esc(m.productName)}</span></td><td>${m.type==='venda'?'−':'+'}${Number(m.quantity)}</td><td>${money(m.total)}</td><td>${esc(dateText(m.date))}</td></tr>`).join('');
 document.getElementById('recentEmpty').style.display=list.length?'none':'block';
}

function localDateKey(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function renderDashboardInsights(){
 const now=new Date(),days=[];
 for(let i=6;i>=0;i--){const d=new Date(now);d.setHours(0,0,0,0);d.setDate(d.getDate()-i);const key=localDateKey(d);const total=data.movements.filter(m=>m.type==='venda'&&!m.canceled&&localDateKey(m.date)===key).reduce((s,m)=>s+Number(m.total||0),0);days.push({key,label:d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),total});}
 const max=Math.max(1,...days.map(x=>x.total)),w=700,h=250,left=58,right=18,top=22,bottom=42,plotW=w-left-right,plotH=h-top-bottom;
 const x=i=>left+(days.length===1?plotW/2:i*plotW/(days.length-1));
 const y=v=>top+plotH-(v/max)*plotH;
 const grid=[0,.25,.5,.75,1].map(fr=>{const val=max*fr,yy=top+plotH-plotH*fr;return `<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="#e8edf5" stroke-width="1"/><text x="${left-10}" y="${yy+4}" text-anchor="end" fill="#8290a5" font-size="11">${fr===0?'R$ 0':esc(shortMoney(val))}</text>`}).join('');
 const points=days.map((d,i)=>`${x(i)},${y(d.total)}`).join(' ');
 const area=`${x(0)},${top+plotH} ${points} ${x(days.length-1)},${top+plotH}`;
 const marks=days.map((d,i)=>`<circle cx="${x(i)}" cy="${y(d.total)}" r="5" fill="#fff" stroke="#3568f5" stroke-width="3"><title>${d.label}: ${esc(money(d.total))}</title></circle><text x="${x(i)}" y="${h-15}" text-anchor="middle" fill="#74839a" font-size="11">${d.label}</text>`).join('');
 document.getElementById('dashboardSalesChart').innerHTML=`<svg class="sales-line-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Vendas por dia">${grid}<polygon points="${area}" fill="#3568f5" opacity=".09"/><polyline points="${points}" fill="none" stroke="#3568f5" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>${marks}</svg>`;
 document.getElementById('dashboardVendasTotal').textContent=money(days.reduce((s,d)=>s+d.total,0));
 const zero=data.products.filter(p=>Number(p.stock)<=0).length,low=data.products.filter(p=>Number(p.stock)>0&&Number(p.stock)<=2).length,ok=data.products.filter(p=>Number(p.stock)>2).length,total=data.products.length;
 document.getElementById('estoqueZerado').textContent=zero;document.getElementById('estoqueBaixo').textContent=low;document.getElementById('estoqueEmDia').textContent=ok;
 document.getElementById('stockDonutTotal').textContent=total;
 const okPct=total?ok/total*100:0,lowPct=total?low/total*100:0,zeroPct=total?zero/total*100:0;
 document.getElementById('stockDonut').style.background=total?`conic-gradient(#16a36a 0 ${okPct}%, #f59e0b ${okPct}% ${okPct+lowPct}%, #ef4444 ${okPct+lowPct}% 100%)`:'#e8edf5';
}
function shortMoney(n){const v=Number(n||0);if(v>=1000000)return `R$ ${(v/1000000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mi`;if(v>=1000)return `R$ ${(v/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mil`;return `R$ ${Math.round(v).toLocaleString('pt-BR')}`;}

function getDateReportRows(){
 const start=document.getElementById('relatorioDataInicio').value,end=document.getElementById('relatorioDataFim').value,type=document.getElementById('relatorioTipo').value;
 return data.movements.filter(m=>{const day=localDateKey(m.date);return (!start||day>=start)&&(!end||day<=end)&&(type==='todos'||m.type===type);}).sort((a,b)=>new Date(b.date)-new Date(a.date));
}
function renderDateReport(){
 const rows=getDateReportRows(),sales=rows.filter(m=>m.type==='venda'&&!m.canceled).reduce((s,m)=>s+Number(m.total||0),0),entries=rows.filter(m=>m.type==='entrada').reduce((s,m)=>s+Number(m.total||0),0);
 const el=id=>document.getElementById(id);if(!el('relatorioRows'))return;
 el('relatorioTotalVendas').textContent=money(sales);el('relatorioTotalEntradas').textContent=money(entries);el('relatorioQtd').textContent=rows.length;
 const start=el('relatorioDataInicio').value,end=el('relatorioDataFim').value;el('relatorioDescricao').textContent=`${start?new Date(start+'T12:00:00').toLocaleDateString('pt-BR'):'Desde o início'} até ${end?new Date(end+'T12:00:00').toLocaleDateString('pt-BR'):'hoje'} · ${rows.length} registro(s)`;
 el('relatorioRows').innerHTML=rows.map(m=>`<tr><td>${esc(dateText(m.date))}</td><td>${typePill(m)}</td><td><span class="product-name">${esc(m.productName)}</span></td><td>${Number(m.quantity)}</td><td>${money(m.total)}</td><td>${esc([m.client?`Cliente: ${m.client}`:'',m.details||''].filter(Boolean).join(' · ')||'—')}</td></tr>`).join('');el('relatorioVazio').style.display=rows.length?'none':'block';
}

let editingCustomerId = null;
function customerById(cid){return (data.customers||[]).find(c=>c.id===cid);}
function digits(v){return String(v||'').replace(/\D/g,'');}
function maskCpf(v){const d=digits(v).slice(0,11);return d.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/(\d{3})\.(\d{3})\.(\d{3})(\d{1,2})$/,'$1.$2.$3-$4');}
function maskPhone(v){const d=digits(v).slice(0,11);if(d.length<=10)return d.replace(/^(\d{2})(\d)/,'($1) $2').replace(/(\d{4})(\d{1,4})$/,'$1-$2');return d.replace(/^(\d{2})(\d{5})(\d{1,4})$/,'($1) $2-$3');}
function resetCustomerForm(){editingCustomerId=null;document.getElementById('formCliente').reset();document.getElementById('formClienteTitulo').textContent='Cadastrar cliente';document.getElementById('salvarClienteBtn').textContent='Salvar cliente';document.getElementById('cancelarClienteEdicao').hidden=true;}
function renderCustomers(){
 const customers=data.customers||[],q=(document.getElementById('buscaCliente')?.value||'').trim().toLowerCase();
 const filtered=customers.filter(c=>[c.name,c.cpf,c.phone,c.city,c.state].some(v=>String(v||'').toLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 document.getElementById('listaClientes').innerHTML=filtered.map(c=>`<tr><td><span class="product-name">${esc(c.name)}</span></td><td>${esc(c.cpf||'—')}</td><td>${esc(c.phone||'—')}</td><td>${esc([c.city,c.state].filter(Boolean).join(' / ')||'—')}</td><td><button class="row-action" data-customer-edit="${esc(c.id)}">Editar</button><button class="row-action delete" data-customer-delete="${esc(c.id)}">Excluir</button></td></tr>`).join('');
 document.getElementById('semClientes').style.display=filtered.length?'none':'block';
 document.getElementById('clienteSubtitulo').textContent=`${filtered.length} ${filtered.length===1?'cliente encontrado':'clientes encontrados'}`;
 document.getElementById('clientesSugestoes').innerHTML=customers.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(c=>`<option value="${esc(c.name)}"></option>`).join('');
}
const customerFields={name:'clienteNome',cep:'clienteCep',street:'clienteLogradouro',number:'clienteNumero',complement:'clienteComplemento',neighborhood:'clienteBairro',city:'clienteCidade',state:'clienteEstado',cpf:'clienteCpf',phone:'clienteTelefone'};
function readCustomerForm(){const c={};for(const [key,field] of Object.entries(customerFields))c[key]=document.getElementById(field).value.trim();c.state=c.state.toUpperCase();return c;}
function fillCustomerForm(c){for(const [key,field] of Object.entries(customerFields))document.getElementById(field).value=c[key]||'';document.getElementById('formClienteTitulo').textContent='Editar cliente';document.getElementById('salvarClienteBtn').textContent='Salvar alterações';document.getElementById('cancelarClienteEdicao').hidden=false;document.getElementById('formCliente').scrollIntoView({behavior:'smooth',block:'start'});}
document.getElementById('clienteCpf').addEventListener('input',e=>e.target.value=maskCpf(e.target.value));
document.getElementById('clienteTelefone').addEventListener('input',e=>e.target.value=maskPhone(e.target.value));
document.getElementById('clienteCep').addEventListener('input',e=>{const d=digits(e.target.value).slice(0,8);e.target.value=d.length>5?d.slice(0,5)+'-'+d.slice(5):d;});
async function buscarEnderecoCep(){
 const cep=digits(document.getElementById('clienteCep').value);
 if(cep.length!==8){toast('Informe um CEP válido com 8 números.',true);return;}
 const btn=document.getElementById('buscarCep');btn.disabled=true;btn.textContent='Buscando...';
 try{
  const response=await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  if(!response.ok)throw new Error('Falha na consulta');
  const address=await response.json();if(address.erro){toast('CEP não encontrado. Confira o número informado.',true);return;}
  document.getElementById('clienteLogradouro').value=address.logradouro||'';
  document.getElementById('clienteBairro').value=address.bairro||'';
  document.getElementById('clienteCidade').value=address.localidade||'';
  document.getElementById('clienteEstado').value=address.uf||'';
  document.getElementById('clienteNumero').focus();toast('Endereço preenchido pelo CEP.');
 }catch(err){toast('Não foi possível consultar o CEP. Verifique a conexão e tente novamente.',true);}
 finally{btn.disabled=false;btn.textContent='Buscar CEP';}
}
document.getElementById('buscarCep').addEventListener('click',buscarEnderecoCep);
document.getElementById('clienteCep').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();buscarEnderecoCep();}});
document.getElementById('formCliente').addEventListener('submit',e=>{
 e.preventDefault();const c=readCustomerForm();
 if(!c.name){toast('Informe o nome do cliente.',true);return;}
 const cpfDigits=digits(c.cpf),phoneDigits=digits(c.phone);
 if(c.cpf&&cpfDigits.length!==11){toast('O CPF deve conter 11 números.',true);return;}
 if(c.phone&&phoneDigits.length<10){toast('Confira o telefone informado.',true);return;}
 if(c.cpf&&(data.customers||[]).some(x=>x.id!==editingCustomerId&&digits(x.cpf)===cpfDigits)){toast('Já existe um cliente cadastrado com este CPF.',true);return;}
 if(editingCustomerId){const old=customerById(editingCustomerId);if(!old)return;Object.assign(old,c);toast('Cadastro do cliente atualizado.');}
 else{c.id=id();data.customers.push(c);toast('Cliente cadastrado com sucesso.');}
 if(saveData())resetCustomerForm();
});
document.getElementById('cancelarClienteEdicao').addEventListener('click',resetCustomerForm);
document.getElementById('buscaCliente').addEventListener('input',renderCustomers);
document.getElementById('listaClientes').addEventListener('click',e=>{
 const edit=e.target.dataset.customerEdit,del=e.target.dataset.customerDelete;
 if(edit){const c=customerById(edit);if(c){editingCustomerId=c.id;fillCustomerForm(c);}}
 if(del){const c=customerById(del);if(!c)return;if(!confirm(`Excluir o cadastro de "${c.name}"? O histórico de vendas será mantido.`))return;data.customers=data.customers.filter(x=>x.id!==del);if(editingCustomerId===del)resetCustomerForm();if(saveData())toast('Cliente excluído.');}
});
['produtoCusto','produtoPreco'].forEach(k=>bindMoneyMask(document.getElementById(k)));
function resetProductForm(){editingId=null;document.getElementById('formProduto').reset();document.getElementById('produtoEstoque').disabled=false;document.getElementById('produtoEstoque').title='';document.getElementById('produtoCusto').value='0,00';document.getElementById('produtoPreco').value='0,00';document.getElementById('produtoEstoque').value='0';document.getElementById('formProdutoTitulo').textContent='Adicionar produto';document.getElementById('salvarProdutoBtn').textContent='Salvar produto';document.getElementById('cancelarEdicao').hidden=true;}
document.getElementById('formProduto').addEventListener('submit',e=>{
 e.preventDefault();const name=document.getElementById('produtoNome').value.trim(),code=document.getElementById('produtoCodigo').value.trim(),cost=parseMoneyInput(document.getElementById('produtoCusto').value),price=parseMoneyInput(document.getElementById('produtoPreco').value),stock=Number(document.getElementById('produtoEstoque').value);
 if(!name||!Number.isFinite(cost)||!Number.isFinite(price)||cost<0||price<0||!Number.isInteger(stock)||stock<0){toast('Confira os dados informados.',true);return;}
 if(code&&data.products.some(p=>p.id!==editingId&&p.code.toLowerCase()===code.toLowerCase())){toast('Já existe um produto com esse código.',true);return;}
 if(editingId){const p=productById(editingId);if(!p)return;p.name=name;p.code=code;p.cost=cost;p.price=price;toast('Produto atualizado. O estoque foi mantido.');}
 else{const p={id:id(),name,code,cost,price,stock};data.products.push(p);if(stock>0)recordMovement('entrada',p,stock,cost*stock,'Estoque inicial');toast('Produto cadastrado com sucesso.');}
 if(saveData())resetProductForm();
});
document.getElementById('cancelarEdicao').addEventListener('click',resetProductForm);
document.getElementById('listaProdutos').addEventListener('click',e=>{
 const edit=e.target.dataset.edit,del=e.target.dataset.delete;
 if(edit){const p=productById(edit);if(!p)return;editingId=p.id;document.getElementById('produtoNome').value=p.name;document.getElementById('produtoCodigo').value=p.code||'';document.getElementById('produtoCusto').value=Number(p.cost||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});document.getElementById('produtoPreco').value=Number(p.price||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});document.getElementById('produtoEstoque').value=p.stock;document.getElementById('produtoEstoque').disabled=true;document.getElementById('formProdutoTitulo').textContent='Editar produto';document.getElementById('salvarProdutoBtn').textContent='Salvar alterações';document.getElementById('cancelarEdicao').hidden=false;document.getElementById('produtoEstoque').title='Para alterar estoque, use Entrada ou Venda.';document.getElementById('formProduto').scrollIntoView({behavior:'smooth',block:'start'});}
 if(del){const p=productById(del);if(!p)return;if(!confirm(`Excluir "${p.name}" do catálogo? O histórico será mantido.`))return;data.products=data.products.filter(x=>x.id!==del);if(editingId===del)resetProductForm();if(saveData())toast('Produto excluído.');}
});
document.getElementById('buscaProduto').addEventListener('input',renderProducts);
document.getElementById('filtroEstoquePositivo').addEventListener('change',renderProducts);
document.getElementById('formEntrada').addEventListener('submit',e=>{e.preventDefault();const p=productById(document.getElementById('entradaProduto').value),qty=Number(document.getElementById('entradaQuantidade').value),note=document.getElementById('entradaObs').value.trim();if(!p){toast('Cadastre e selecione um produto primeiro.',true);return;}if(!Number.isInteger(qty)||qty<1){toast('Informe uma quantidade inteira maior que zero.',true);return;}p.stock+=qty;recordMovement('entrada',p,qty,p.cost*qty,note);if(saveData()){e.target.reset();toast('Entrada registrada com sucesso.');}});
function cartSubtotal(){return Math.round(saleCart.reduce((sum,item)=>sum+item.quantity*item.price,0)*100)/100;}
function saleTotals(){
 const subtotal=saleCart.length?cartSubtotal():Math.round(Number(document.getElementById('vendaQuantidade').value||0)*parseMoneyInput(document.getElementById('vendaPreco').value)*100)/100;
 const discountCash=Math.min(subtotal,Math.max(0,parseMoneyInput(document.getElementById('vendaDescontoReais').value)));
 const afterCash=Math.max(0,subtotal-discountCash);
 const discountPercent=Math.min(100,Math.max(0,parsePercentInput(document.getElementById('vendaDescontoPercentual').value)));
 const total=Math.round(afterCash*(1-discountPercent/100)*100)/100;
 return {subtotal,discountCash,discountPercent,total};
}
function renderCart(){
 const body=document.getElementById('carrinhoLinhas');
 document.getElementById('carrinhoQuantidade').textContent=`${saleCart.reduce((n,x)=>n+x.quantity,0)} item(ns)`;
 if(!saleCart.length){body.innerHTML='<tr><td colspan="5" class="cart-empty">O carrinho está vazio.</td></tr>';}
 else body.innerHTML=saleCart.map((item,i)=>`<tr><td>${esc(item.name)}</td><td>${item.quantity}</td><td>${money(item.price)}</td><td>${money(item.quantity*item.price)}</td><td><button type="button" class="cart-remove" data-cart-remove="${i}" aria-label="Remover ${esc(item.name)}">×</button></td></tr>`).join('');
 document.getElementById('subtotalVendaPreview').textContent=money(saleTotals().subtotal);
 document.getElementById('totalVendaPreview').textContent=money(saleTotals().total);
 updatePaymentSummary();
}
document.getElementById('carrinhoLinhas').addEventListener('click',e=>{const b=e.target.closest('[data-cart-remove]');if(!b)return;saleCart.splice(Number(b.dataset.cartRemove),1);renderCart();});
document.getElementById('adicionarAoCarrinho').addEventListener('click',()=>{
 const p=productById(document.getElementById('vendaProduto').value),qty=Number(document.getElementById('vendaQuantidade').value),price=parseMoneyInput(document.getElementById('vendaPreco').value);
 if(!p){toast('Selecione um produto.',true);return;}if(!Number.isInteger(qty)||qty<1){toast('Informe uma quantidade inteira maior que zero.',true);return;}if(!Number.isFinite(price)||price<0){toast('Informe um preço válido.',true);return;}
 const already=saleCart.filter(x=>x.productId===p.id).reduce((n,x)=>n+x.quantity,0);
 if(already+qty>availableStock(p)){toast(`Estoque insuficiente para ${p.name}. Disponível: ${availableStock(p)}.`,true);return;}
 const existing=saleCart.find(x=>x.productId===p.id&&x.price===Math.round(price*100)/100);
 if(existing)existing.quantity+=qty;else saleCart.push({productId:p.id,name:p.name,quantity:qty,price:Math.round(price*100)/100,cost:Number(p.cost||0)});
 document.getElementById('vendaQuantidade').value='1';document.getElementById('vendaBuscaProduto').value='';renderVendaProdutoSelect(false);renderCart();toast(`${p.name} adicionado ao carrinho.`);
});
function updatePaymentRow(row){
 const isCard=row.querySelector('.pagamentoMetodo').value==='Cartão de crédito';
 row.querySelector('.payment-card-options').hidden=!isCard;
}
function addPaymentRow(){
 const wrap=document.getElementById('linhasPagamento'),row=document.createElement('div');row.className='payment-row';
 row.innerHTML=`<div class="payment-row-main"><label class="field">Forma de pagamento<select class="pagamentoMetodo"><option value="">Selecione...</option><option>Pix</option><option>Dinheiro</option><option>Cartão de débito</option><option>Cartão de crédito</option><option>Transferência</option><option>Boleto</option><option>Outro</option></select></label><label class="field">Valor pago (R$)<input class="pagamentoValor" type="text" inputmode="numeric" autocomplete="off" placeholder="0,00"></label><button type="button" class="payment-remove" aria-label="Remover pagamento" title="Remover pagamento">×</button></div><div class="payment-card-options" hidden><label class="field">Parcelas<input class="pagamentoParcelas" type="number" min="1" step="1" value="1"></label><label class="field">Parcelamento<select class="pagamentoResponsavel"><option value="loja">Pela loja</option><option value="fabrica">Pela fábrica</option></select></label></div>`;
 wrap.appendChild(row);bindMoneyMask(row.querySelector('.pagamentoValor'));row.querySelector('.pagamentoMetodo').addEventListener('change',()=>{updatePaymentRow(row);updatePaymentSummary();});row.querySelector('.pagamentoValor').addEventListener('input',updatePaymentSummary);row.querySelector('.pagamentoParcelas').addEventListener('input',updatePaymentSummary);row.querySelector('.pagamentoResponsavel').addEventListener('change',updatePaymentSummary);row.querySelector('.payment-remove').addEventListener('click',()=>{row.remove();updatePaymentSummary();});updatePaymentRow(row);updatePaymentSummary();return row;
}
function readPayments(){
 return [...document.querySelectorAll('.payment-row')].map(row=>({method:row.querySelector('.pagamentoMetodo').value,amount:Math.round(parseMoneyInput(row.querySelector('.pagamentoValor').value)*100)/100,installments:row.querySelector('.pagamentoMetodo').value==='Cartão de crédito'?Number(row.querySelector('.pagamentoParcelas').value||0):null,responsible:row.querySelector('.pagamentoMetodo').value==='Cartão de crédito'?row.querySelector('.pagamentoResponsavel').value:null})).filter(x=>x.method||x.amount>0);
}
function updatePaymentSummary(){
 const total=saleTotals().total,payments=readPayments(),received=Math.round(payments.reduce((s,x)=>s+x.amount,0)*100)/100,remaining=Math.round((total-received)*100)/100;
 document.getElementById('totalRecebido').textContent=money(received);document.getElementById('saldoRestante').textContent=money(Math.max(0,remaining));
 const notice=document.getElementById('avisoPagamento');
 if(remaining>0.009){notice.textContent=`Falta receber ${money(remaining)} para completar a venda.`;notice.classList.remove('payment-ok','payment-error');}
 else if(remaining< -0.009){notice.textContent=`Os pagamentos ultrapassam o total em ${money(-remaining)}.`;notice.classList.remove('payment-ok');notice.classList.add('payment-error');}
 else{notice.textContent='Pagamento completo: o total da venda foi quitado.';notice.classList.add('payment-ok');notice.classList.remove('payment-error');}
}
function updateSalePreview(){
 const p=productById(document.getElementById('vendaProduto').value);if(p&&document.activeElement!==document.getElementById('vendaPreco'))document.getElementById('vendaPreco').value=Number(p.price).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 const t=saleTotals();document.getElementById('subtotalVendaPreview').textContent=money(t.subtotal);document.getElementById('totalVendaPreview').textContent=money(t.total);updatePaymentSummary();
}
['vendaProduto','vendaQuantidade','vendaPreco','vendaDescontoReais','vendaDescontoPercentual'].forEach(key=>document.getElementById(key).addEventListener(key==='vendaProduto'?'change':'input',updateSalePreview));
['vendaPreco','vendaDescontoReais'].forEach(key=>bindMoneyMask(document.getElementById(key)));bindPercentInput(document.getElementById('vendaDescontoPercentual'));
['vendaPreco','vendaDescontoReais'].forEach(key=>document.getElementById(key).addEventListener('money-mask-updated',updateSalePreview));
document.getElementById('adicionarPagamento').addEventListener('click',addPaymentRow);
function createReceiptPdf(receipt){
 if(!window.jspdf||!window.jspdf.jsPDF){toast('A biblioteca de PDF não carregou. Verifique a internet e tente novamente.',true);return false;}
 const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:'mm',format:'a4'});let y=18;
 doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('CONCEITO - RECIBO DE VENDA',15,y);y+=10;
 doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text(`Data: ${new Date(receipt.date).toLocaleString('pt-BR')}`,15,y);y+=6;doc.text(`Cliente: ${receipt.client||'Não informado'}`,15,y);y+=9;
 doc.setFont('helvetica','bold');doc.text('PRODUTO',15,y);doc.text('QTD.',108,y);doc.text('VALOR UNIT.',126,y);doc.text('VALOR TOTAL',166,y);y+=3;doc.line(15,y,195,y);y+=6;doc.setFont('helvetica','normal');
 receipt.items.forEach(item=>{const name=doc.splitTextToSize(item.name,88);if(y+Math.max(7,name.length*5)>265){doc.addPage();y=18;}doc.text(name,15,y);doc.text(String(item.quantity),108,y);doc.text(money(item.price),126,y);doc.text(money(item.lineTotal),166,y);y+=Math.max(7,name.length*5);});
 y+=2;doc.line(15,y,195,y);y+=8;if(receipt.discount>0){doc.text('Subtotal:',135,y);doc.text(money(receipt.subtotal),195,y,{align:'right'});y+=6;doc.text('Desconto:',135,y);doc.text('- '+money(receipt.discount),195,y,{align:'right'});y+=7;}
 doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('TOTAL GERAL:',125,y);doc.text(money(receipt.total),195,y,{align:'right'});y+=11;
 doc.setFont('helvetica','normal');doc.setFontSize(10);if(y>265){doc.addPage();y=18;}doc.text('Observação: garantia de 3 meses (90 dias).',15,y);y+=7;if(receipt.note){const lines=doc.splitTextToSize(`Obs. do pedido: ${receipt.note}`,175);doc.text(lines,15,y);}
 doc.save(`recibo-conceito-${receipt.id}.pdf`);return true;
}
function receiptWhatsappText(receipt){
 const lines=[`Olá${receipt.client?' '+receipt.client:''}! Segue o resumo da sua compra na Conceito.`,`Data: ${new Date(receipt.date).toLocaleString('pt-BR')}`,...receipt.items.map(x=>`${x.name} | Qtd.: ${x.quantity} | Unit.: ${money(x.price)} | Total: ${money(x.lineTotal)}`)];
 if(receipt.discount>0){lines.push(`Subtotal: ${money(receipt.subtotal)}`,`Desconto: ${money(receipt.discount)}`);}
 lines.push(`TOTAL GERAL: ${money(receipt.total)}`,'Garantia: 3 meses (90 dias).');if(receipt.note)lines.push(`Observação: ${receipt.note}`);lines.push('O recibo em PDF será anexado nesta conversa.');return lines.join('\n');
}
document.getElementById('baixarReciboPdf').addEventListener('click',()=>{if(lastReceipt)createReceiptPdf(lastReceipt);});
document.getElementById('enviarReciboWhatsapp').addEventListener('click',()=>{if(!lastReceipt)return;const phone=prompt('Digite o WhatsApp do cliente com DDD (somente números), ou deixe vazio para escolher uma conversa:','');if(phone===null)return;const number=phone.replace(/\D/g,'');if(number&&number.length<10){toast('Informe um número com DDD válido.',true);return;}const url=`https://wa.me/${number}?text=${encodeURIComponent(receiptWhatsappText(lastReceipt))}`;window.open(url,'_blank','noopener');toast('WhatsApp aberto. Anexe o PDF baixado para enviar o recibo completo.');});
document.getElementById('formVenda').addEventListener('submit',e=>{
 e.preventDefault();
 if(!saleCart.length){toast('Adicione pelo menos um produto ao carrinho antes de confirmar.',true);return;}
 const client=document.getElementById('vendaCliente').value.trim(),note=document.getElementById('vendaObs').value.trim(),totals=saleTotals(),payments=readPayments(),received=Math.round(payments.reduce((s,x)=>s+x.amount,0)*100)/100;
 // Em edição: localiza os lançamentos originais (ainda ativos) e soma de volta o estoque que eles já baixaram.
 let oldMovements=[];
 if(editingSale){
  oldMovements=data.movements.filter(m=>m.type==='venda'&&(m.saleId||m.id)===editingSale.saleId&&!m.canceled);
  if(!oldMovements.length){toast('A venda original não está mais disponível para edição.',true);cancelSaleEdit();return;}
 }
 const oldQty={};oldMovements.forEach(m=>{oldQty[m.productId]=(oldQty[m.productId]||0)+Number(m.quantity||0);});
 const need={};saleCart.forEach(item=>{need[item.productId]=(need[item.productId]||0)+item.quantity;});
 for(const item of saleCart){const p=productById(item.productId);if(!p||need[item.productId]>Number(p.stock)+(oldQty[item.productId]||0)){toast(`Estoque insuficiente ou produto removido: ${item.name}.`,true);return;}}
 if(!payments.length||payments.some(x=>!x.method||x.amount<=0)){toast('Informe a forma e o valor de cada pagamento.',true);return;}
 if(payments.some(x=>x.method==='Cartão de crédito'&&(!Number.isInteger(x.installments)||x.installments<1))){toast('Informe um número válido de parcelas para cada cartão.',true);return;}
 if(Math.abs(received-totals.total)>0.009){toast(`Os pagamentos devem somar exatamente ${money(totals.total)}. Saldo: ${money(totals.total-received)}.`,true);return;}
 const paymentDetails=payments.map(x=>x.method==='Cartão de crédito'?`${x.method}: ${money(x.amount)} em ${x.installments}x (${x.responsible==='fabrica'?'fábrica':'loja'})`:`${x.method}: ${money(x.amount)}`).join(' | ');
 const discount= Math.round((totals.subtotal-totals.total)*100)/100;let allocated=0;
 const receiptItems=saleCart.map((item,index)=>{const raw=Math.round(item.quantity*item.price*100)/100;let lineTotal;if(index===saleCart.length-1)lineTotal=Math.round((totals.total-allocated)*100)/100;else{lineTotal=totals.subtotal?Math.round(raw*(totals.total/totals.subtotal)*100)/100:0;allocated+=lineTotal;}return {...item,lineTotal};});
 const wasEditing=!!editingSale;
 const saleId=wasEditing?editingSale.saleId:Date.now().toString(36).toUpperCase();
 const date=wasEditing?editingSale.date:new Date().toISOString();
 const customer=findCustomerForSale(client,'');
 const detailPrefix=[client?`Cliente: ${client}`:'',`Venda ${saleId}`,wasEditing?'Venda editada':'',`Subtotal: ${money(totals.subtotal)}`,discount?`Desconto total: ${money(discount)}`:'',`Pagamentos: ${paymentDetails}`,note].filter(Boolean).join(' · ');
 const snapshot={id:saleId,date,client,note,items:receiptItems,subtotal:totals.subtotal,discount,total:totals.total};
 // A partir daqui os dados são alterados (todas as validações já passaram).
 let insertAt=0;
 if(wasEditing){
  insertAt=Math.max(0,data.movements.findIndex(m=>oldMovements.includes(m)));
  oldMovements.forEach(m=>{const p=productById(m.productId);if(p)p.stock=Number(p.stock||0)+Number(m.quantity||0);}); // devolve o estoque da versão antiga
  data.movements=data.movements.filter(m=>!oldMovements.includes(m));
 }
 saleCart.forEach((item,index)=>{
  const p=productById(item.productId);
  const unitCost=Number.isFinite(Number(item.cost))?Number(item.cost):Number(p.cost||0);
  const costTotal=Math.round(unitCost*item.quantity*100)/100;
  p.stock-=item.quantity;
  const detail=[detailPrefix,`Item ${index+1}/${saleCart.length}`].filter(Boolean).join(' · ');
  const extra={client,clientCpf:customer?customer.cpf||'':'',customerId:customer?customer.id:'',note,payments,subtotal:totals.subtotal,discountCash:totals.discountCash,discountPercent:totals.discountPercent,unitPrice:item.price,unitCost,costTotal,profit:Math.round((receiptItems[index].lineTotal-costTotal)*100)/100,saleId,date};
  if(wasEditing){extra.editedAt=new Date().toISOString();extra.editedBy=currentUserName();}
  recordMovement('venda',p,item.quantity,receiptItems[index].lineTotal,detail,extra);
 });
 // Edição: os lançamentos novos voltam para a posição da venda original no histórico.
 if(wasEditing){const created=data.movements.splice(0,saleCart.length);data.movements.splice(insertAt,0,...created);}
 if(saveData()){
  lastReceipt=snapshot;saleCart=[];exitSaleEdit();e.target.reset();document.getElementById('linhasPagamento').innerHTML='';addPaymentRow();document.getElementById('reciboAcoes').hidden=false;
  document.getElementById('reciboStatus').textContent=wasEditing?`Venda ${saleId} atualizada. Baixe o PDF atualizado e envie ao cliente.`:`Venda ${saleId} registrada. Baixe o PDF e envie ao cliente.`;
  renderCart();updateSalePreview();toast(wasEditing?'Venda atualizada. Estoque, valores e lucro foram recalculados.':'Venda registrada, estoque atualizado e recibo disponível.');
 }
});

// ===== Movimentações: busca, edição e cancelamento de vendas =====
const numOrNaN=v=>(v===undefined||v===null||v==='')?NaN:Number(v);
function fold(s){return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function availableStock(p){return Number(p.stock||0)+(editingSale?(editingSale.qtyByProduct[p.id]||0):0);}
function findCustomerForSale(client,customerId){
 const list=data.customers||[];
 if(customerId){const c=list.find(x=>x.id===customerId);if(c)return c;}
 const name=fold(client).trim();
 return name?(list.find(x=>fold(x.name).trim()===name)||null):null;
}
// Agrupa os lançamentos (um por item) em vendas completas pelo saleId.
function getSales(){
 const map=new Map();
 data.movements.forEach(m=>{
  if(m.type!=='venda')return;
  const key=m.saleId||m.id;
  let s=map.get(key);
  if(!s){s={id:key,date:m.date,client:m.client||'',customerId:m.customerId||'',clientCpf:m.clientCpf||'',movements:[],total:0,profit:0,profitKnown:true,payments:Array.isArray(m.payments)?m.payments:[]};map.set(key,s);}
  s.movements.push(m);
  if(new Date(m.date)<new Date(s.date))s.date=m.date;
  s.total+=Number(m.total||0);
  if(Number.isFinite(numOrNaN(m.profit)))s.profit+=Number(m.profit);
  else if(Number.isFinite(numOrNaN(m.costTotal)))s.profit+=Number(m.total||0)-Number(m.costTotal);
  else s.profitKnown=false;
 });
 return [...map.values()].map(s=>{
  s.total=Math.round(s.total*100)/100;s.profit=Math.round(s.profit*100)/100;
  s.canceled=s.movements.every(m=>m.canceled);
  s.canceledAt=s.canceled?((s.movements.find(m=>m.canceledAt)||{}).canceledAt||''):'';
  s.edited=s.movements.some(m=>m.editedAt);
  const cust=findCustomerForSale(s.client,s.customerId);
  s.cpf=s.clientCpf||(cust&&cust.cpf)||'';
  s.items=s.movements.slice().reverse().map(m=>{
   const qty=Number(m.quantity||0),unit=numOrNaN(m.unitPrice);
   return {productId:m.productId,name:m.productName,code:(productById(m.productId)||{}).code||'',quantity:qty,price:Number.isFinite(unit)?unit:(qty?Number(m.total||0)/qty:0),cost:m.unitCost,lineTotal:Number(m.total||0)};
  });
  return s;
 }).sort((a,b)=>new Date(b.date)-new Date(a.date));
}
function saleMatches(s,tokens){
 if(!tokens.length)return true;
 const hay=fold([s.client,s.cpf,new Date(s.date).toLocaleDateString('pt-BR'),localDateKey(s.date),s.items.map(i=>`${i.name} ${i.code}`).join(' ')].join(' '));
 const cpfDigits=digits(s.cpf),idFold=fold(s.id);
 return tokens.every(t=>hay.includes(t)||(t.length>=4&&idFold.includes(t))||(/^[\d.\-]+$/.test(t)&&digits(t).length>=3&&cpfDigits.includes(digits(t))));
}
function renderSaleSearch(){
 const body=document.getElementById('listaVendasBusca');if(!body)return;
 const tokens=fold(document.getElementById('buscaVenda').value).split(/\s+/).filter(Boolean);
 const start=document.getElementById('buscaVendaInicio').value,end=document.getElementById('buscaVendaFim').value,status=document.getElementById('buscaVendaStatus').value;
 const sales=getSales().filter(s=>{
  const day=localDateKey(s.date);
  if(start&&day<start)return false;if(end&&day>end)return false;
  if(status==='ativas'&&s.canceled)return false;if(status==='canceladas'&&!s.canceled)return false;
  return saleMatches(s,tokens);
 });
 const active=sales.filter(s=>!s.canceled),LIMIT=100;
 const totalAtivas=active.reduce((n,s)=>n+s.total,0),lucroAtivas=active.filter(s=>s.profitKnown).reduce((n,s)=>n+s.profit,0);
 document.getElementById('vendasResumo').innerHTML=`<span><b>${sales.length}</b> ${sales.length===1?'venda encontrada':'vendas encontradas'}</span><span>Total das ativas: <b>${esc(money(totalAtivas))}</b></span><span>Lucro das ativas: <b>${esc(money(lucroAtivas))}</b></span><span>Canceladas: <b>${sales.length-active.length}</b></span>${sales.length>LIMIT?`<span>Mostrando as ${LIMIT} mais recentes — refine a busca para ver as demais.</span>`:''}`;
 body.innerHTML=sales.slice(0,LIMIT).map(s=>`<tr class="${s.canceled?'row-canceled':''}">`
  +`<td>${esc(dateText(s.date))}<br><small>Venda ${esc(s.id)}</small></td>`
  +`<td><span class="product-name">${esc(s.client||'Sem cliente')}</span>${s.cpf?`<br><small>CPF ${esc(s.cpf)}</small>`:''}</td>`
  +`<td><ul class="sale-items">${s.items.map(i=>`<li>${i.quantity}× ${esc(i.name)}</li>`).join('')}</ul></td>`
  +`<td class="${s.canceled?'sale-money-canceled':''}">${esc(money(s.total))}</td>`
  +`<td>${s.canceled||!s.profitKnown?'—':esc(money(s.profit))}</td>`
  +`<td class="sale-status">${s.canceled?`<span class="pill cancelada">Cancelada</span>${s.canceledAt?`<br><small>${esc(dateText(s.canceledAt))}</small>`:''}`:'<span class="pill ativa">Ativa</span>'}${s.edited?'<br><small>editada</small>':''}</td>`
  +`<td>${s.canceled?'—':`<button type="button" class="row-action" data-sale-edit="${esc(s.id)}">Editar</button><button type="button" class="row-action delete" data-sale-cancel="${esc(s.id)}">Cancelar venda</button>`}</td></tr>`).join('');
 document.getElementById('semVendasBusca').style.display=sales.length?'none':'block';
}
function exitSaleEdit(){
 editingSale=null;
 const banner=document.getElementById('vendaEdicaoAviso');if(banner)banner.hidden=true;
 const label=document.getElementById('confirmarVendaTexto');if(label)label.textContent='Confirmar venda e baixar estoque';
}
function cancelSaleEdit(){
 exitSaleEdit();saleCart=[];
 document.getElementById('formVenda').reset();renderVendaProdutoSelect(false);document.getElementById('linhasPagamento').innerHTML='';addPaymentRow();
 renderCart();updateSalePreview();
}
function startSaleEdit(saleId){
 if(!hasFullAccess()){toast('Seu perfil não tem permissão para editar vendas.',true);return;}
 const s=getSales().find(x=>x.id===saleId);if(!s||s.canceled)return;
 if(!editingSale&&saleCart.length&&!confirm('O carrinho da venda em andamento será substituído pelos itens desta venda. Continuar?'))return;
 const qtyByProduct={};s.movements.forEach(m=>{qtyByProduct[m.productId]=(qtyByProduct[m.productId]||0)+Number(m.quantity||0);});
 editingSale={saleId:s.id,date:s.date,qtyByProduct};
 const ref=s.movements[0],fmt=n=>Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 saleCart=s.items.map(i=>({productId:i.productId,name:i.name,quantity:i.quantity,price:Math.round(i.price*100)/100,cost:Number.isFinite(numOrNaN(i.cost))?Number(i.cost):Number((productById(i.productId)||{}).cost||0)}));
 // Observação: vendas novas guardam a nota separada; as antigas têm que ser extraídas do texto de detalhes.
 let note=ref.note;
 if(note===undefined){note=String(ref.details||'').split(' · ').filter(part=>!/^(Cliente:|Venda |Subtotal:|Desconto total:|Pagamentos:|Item \d+\/\d+)/.test(part)).join(' · ');}
 document.getElementById('vendaCliente').value=s.client;
 document.getElementById('vendaObs').value=note||'';
 document.getElementById('vendaBuscaProduto').value='';renderVendaProdutoSelect(false);document.getElementById('vendaProduto').value='';document.getElementById('vendaQuantidade').value='';document.getElementById('vendaPreco').value='';
 document.getElementById('vendaDescontoReais').value=Number(ref.discountCash)>0?fmt(ref.discountCash):'';
 document.getElementById('vendaDescontoPercentual').value=Number(ref.discountPercent)>0?Number(ref.discountPercent).toLocaleString('pt-BR',{maximumFractionDigits:2}):'';
 document.getElementById('linhasPagamento').innerHTML='';
 (s.payments.length?s.payments:[null]).forEach(pm=>{
  const row=addPaymentRow();if(!pm)return;
  row.querySelector('.pagamentoMetodo').value=pm.method||'';
  row.querySelector('.pagamentoValor').value=fmt(pm.amount||0);
  if(pm.method==='Cartão de crédito'){row.querySelector('.pagamentoParcelas').value=pm.installments||1;row.querySelector('.pagamentoResponsavel').value=pm.responsible||'loja';}
  updatePaymentRow(row);
 });
 document.getElementById('vendaEdicaoTitulo').textContent=`Editando a venda ${s.id}${s.client?' — '+s.client:''}`;
 document.getElementById('vendaEdicaoAviso').hidden=false;
 document.getElementById('confirmarVendaTexto').textContent='Salvar alterações da venda';
 document.getElementById('reciboAcoes').hidden=true;
 renderCart();goTo('venda');
 toast('Venda carregada. Altere o que precisar e salve.');
}
function cancelSale(saleId){
 if(!hasFullAccess()){toast('Seu perfil não tem permissão para cancelar vendas.',true);return;}
 const s=getSales().find(x=>x.id===saleId);if(!s||s.canceled)return;
 const lines=s.items.map(i=>`• ${i.quantity}× ${i.name}`).join('\n');
 if(!confirm(`Cancelar a venda ${s.id}${s.client?' de '+s.client:''}?\n\n${lines}\n\nOs produtos voltarão ao estoque e ${money(s.total)} será retirado do total de vendas e do lucro.`))return;
 const when=new Date().toISOString(),missing=[];
 s.movements.forEach(m=>{
  if(m.canceled)return;
  const p=productById(m.productId);
  if(p)p.stock=Number(p.stock||0)+Number(m.quantity||0);else missing.push(m.productName);
  m.canceled=true;m.canceledAt=when;m.canceledBy=currentUserName();
 });
 if(editingSale&&editingSale.saleId===s.id)cancelSaleEdit();
 if(saveData())toast(missing.length?`Venda cancelada. Não foi possível devolver ao estoque (produto excluído): ${missing.join(', ')}.`:'Venda cancelada. Estoque e valores atualizados.',missing.length>0);
}
document.getElementById('listaVendasBusca').addEventListener('click',e=>{
 const edit=e.target.closest('[data-sale-edit]'),cancel=e.target.closest('[data-sale-cancel]');
 if(edit)startSaleEdit(edit.dataset.saleEdit);else if(cancel)cancelSale(cancel.dataset.saleCancel);
});
['buscaVenda'].forEach(k=>document.getElementById(k).addEventListener('input',renderSaleSearch));
['buscaVendaInicio','buscaVendaFim','buscaVendaStatus'].forEach(k=>document.getElementById(k).addEventListener('change',renderSaleSearch));
document.getElementById('limparBuscaVenda').addEventListener('click',()=>{['buscaVenda','buscaVendaInicio','buscaVendaFim'].forEach(k=>document.getElementById(k).value='');document.getElementById('buscaVendaStatus').value='todas';renderSaleSearch();});
document.getElementById('cancelarEdicaoVenda').addEventListener('click',()=>{cancelSaleEdit();toast('Edição cancelada. Nada foi alterado.');});
document.getElementById('filtroTipo').addEventListener('change',renderHistory);
document.getElementById('limparHistorico').addEventListener('click',()=>{if(!confirm('Apagar o histórico? Os produtos e quantidades em estoque serão mantidos.'))return;data.movements=[];if(saveData())toast('Histórico apagado.');});
document.getElementById('fazerBackup').addEventListener('click',()=>{if(!isAdmin()){toast('Somente o ADMIN pode fazer backup.',true);return;}const blob=new Blob([JSON.stringify({...data,users:(()=>{try{const u=JSON.parse(localStorage.getItem('ckr_web_local_users_v1')||'[]');return Array.isArray(u)?u:[];}catch(e){return [];}})(),exportedAt:new Date().toISOString()},null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`conceito-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Backup exportado. Guarde o arquivo em local seguro.');});
document.getElementById('restaurarBackup').addEventListener('click',async()=>{if(!isAdmin()){toast('Somente o ADMIN pode restaurar backup.',true);return;}const file=document.getElementById('arquivoBackup').files[0];if(!file){toast('Escolha um arquivo JSON primeiro.',true);return;}if(!confirm('A restauração vai substituir os dados deste dispositivo. Deseja continuar?'))return;try{const imported=JSON.parse(await file.text());if(!Array.isArray(imported.products)||!Array.isArray(imported.movements))throw Error('Formato');for(const p of imported.products){if(!p.id||!String(p.name||'').trim()||!Number.isFinite(Number(p.stock))||Number(p.stock)<0)throw Error('Produto');}data={version:3,products:imported.products,movements:imported.movements,customers:Array.isArray(imported.customers)?imported.customers:[]};if(saveData()){document.getElementById('arquivoBackup').value='';resetProductForm();
  if(Array.isArray(imported.users)){
    const okUsers=imported.users.filter(u=>u&&typeof u.username==='string'&&u.username.trim()&&typeof u.password==='string'&&u.password).map(u=>({username:u.username.trim(),password:u.password,role:u.role==='master'?'master':'usuario',createdAt:u.createdAt||new Date().toISOString(),expiresAt:u.expiresAt||null}));
    if(okUsers.length&&confirm('Este backup também contém '+okUsers.length+' usuário(s). Substituir os usuários deste dispositivo (master e demais, exceto o ADMIN)?')){
      localStorage.setItem('ckr_web_local_users_v1',JSON.stringify(okUsers));
      localStorage.setItem('ckr_web_default_user_seeded_v1','1');
      localStorage.setItem('ckr_web_default_master_seeded_v1','1');
      toast('Backup e usuários restaurados. Recarregando...');setTimeout(()=>location.reload(),1200);return;
    }
  }
  toast('Backup restaurado com sucesso.');}}catch(err){toast('Arquivo inválido ou incompatível com o Conceito Web V2.',true);}});
document.getElementById('apagarTudo').addEventListener('click',()=>{if(!isAdmin()){toast('Somente o ADMIN pode apagar os dados.',true);return;}if(!confirm('Isso apagará todos os produtos, clientes, entradas e vendas deste navegador. Continuar?'))return;if(!confirm('Confirme mais uma vez. Só será possível recuperar com backup.'))return;data=emptyData();if(saveData()){resetProductForm();toast('Dados locais apagados.');}});
document.getElementById('gerarRelatorio').addEventListener('click',()=>{const a=document.getElementById('relatorioDataInicio').value,b=document.getElementById('relatorioDataFim').value;if(a&&b&&a>b){toast('A data inicial não pode ser posterior à data final.',true);return;}renderDateReport();});
['relatorioDataInicio','relatorioDataFim','relatorioTipo'].forEach(k=>document.getElementById(k).addEventListener('change',renderDateReport));
document.getElementById('exportarRelatorioCsv').addEventListener('click',()=>{const rows=getDateReportRows();const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const lines=[['Data e hora','Tipo','Produto','Quantidade','Valor','Cliente','Detalhes'].map(cell).join(';'),...rows.map(m=>[dateText(m.date),m.type==='venda'?(m.canceled?'Venda cancelada':'Venda'):'Entrada',m.productName,m.quantity,Number(m.total||0).toFixed(2).replace('.',','),m.client||'',m.details||''].map(cell).join(';'))];const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`conceito-relatorio-${document.getElementById('relatorioDataInicio').value||'inicio'}-${document.getElementById('relatorioDataFim').value||'hoje'}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);});
document.getElementById('imprimirRelatorio').addEventListener('click',()=>{renderDateReport();window.print();});
// Período padrão: mês atual
const reportToday=new Date();document.getElementById('relatorioDataInicio').value=`${reportToday.getFullYear()}-${String(reportToday.getMonth()+1).padStart(2,'0')}-01`;document.getElementById('relatorioDataFim').value=localDateKey(reportToday);
renderAll();
addPaymentRow();


// Login local com perfil ADMIN e usuários temporários. Não substitui autenticação no servidor.
(function setupLocalLogin(){
 const AUTH_KEY='ckr_web_local_admin_v1', SESSION_KEY='ckr_web_local_session_v1', USERS_KEY='ckr_web_local_users_v1';
 const gate=document.getElementById('ckrAuthGate'), shell=document.getElementById('ckrAppShell');
 const loginForm=document.getElementById('ckrLoginForm'), setupForm=document.getElementById('ckrSetupForm'), showSetupButton=document.getElementById('ckrShowSetup');
 const desc=document.getElementById('authDescription'), error=document.getElementById('ckrAuthError'), setupError=document.getElementById('ckrSetupError');
 const userInput=document.getElementById('ckrLoginUser'), passInput=document.getElementById('ckrLoginPassword');
 const manageButton=document.getElementById('ckrManageUsers'), manageSidebar=document.getElementById('ckrManageUsersSidebar'), usersModal=document.getElementById('ckrUsersModal');
 // ===== ADMIN PADRÃO =====
 // Usuário e senha já vêm prontos no sistema (não precisa mais do "primeiro acesso").
 // Padrão: usuário  admin  /  senha  contador123
 // A senha fica guardada só como "hash" (SHA-256), nunca em texto puro no código.
 // Para trocar a senha padrão: entre como admin > Gerenciar usuários > Alterar senha.
 const DEFAULT_ADMIN={username:'admin',password:'sha256:517e4e086d8298b5a78075f5b17b862999154ab8f6c243304a4442f55801e093'};
 function sha256hex(str){
   const msg=unescape(encodeURIComponent(str)),K=[],H=[];
   const frac=x=>Math.floor((x-Math.floor(x))*4294967296);
   for(let n=2,c=0;c<64;n++){let p=true;for(let d=2;d*d<=n;d++)if(n%d===0){p=false;break;}if(p){if(c<8)H[c]=frac(Math.pow(n,1/2));K[c]=frac(Math.pow(n,1/3));c++;}}
   const bytes=[];for(let i=0;i<msg.length;i++)bytes.push(msg.charCodeAt(i));
   const bitLen=bytes.length*8;bytes.push(0x80);while(bytes.length%64!==56)bytes.push(0);
   for(let i=7;i>=0;i--)bytes.push(i>=4?0:(bitLen>>>(i*8))&255);
   const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
   for(let off=0;off<bytes.length;off+=64){
     const w=[];for(let i=0;i<16;i++)w[i]=(bytes[off+i*4]<<24)|(bytes[off+i*4+1]<<16)|(bytes[off+i*4+2]<<8)|bytes[off+i*4+3];
     for(let i=16;i<64;i++){const s0=rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3),s1=rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)|0;}
     let [a,b,c,d,e,f,g,hh]=H;
     for(let i=0;i<64;i++){const S1=rotr(e,6)^rotr(e,11)^rotr(e,25),ch=(e&f)^(~e&g),t1=(hh+S1+ch+K[i]+w[i])|0,S0=rotr(a,2)^rotr(a,13)^rotr(a,22),mj=(a&b)^(a&c)^(b&c),t2=(S0+mj)|0;hh=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
     H[0]=(H[0]+a)|0;H[1]=(H[1]+b)|0;H[2]=(H[2]+c)|0;H[3]=(H[3]+d)|0;H[4]=(H[4]+e)|0;H[5]=(H[5]+f)|0;H[6]=(H[6]+g)|0;H[7]=(H[7]+hh)|0;
   }
   return H.map(x=>(x>>>0).toString(16).padStart(8,'0')).join('');
 }
 const hashPw=password=>'sha256:'+sha256hex('conceito-v3|'+password);
 const passOk=(stored,password)=>String(stored||'').startsWith('sha256:')?stored===hashPw(password):stored===password;
 let admin=null, users=[], currentUser=null;
 try{admin=JSON.parse(localStorage.getItem(AUTH_KEY)||'null');}catch(e){admin=null;}
 try{users=JSON.parse(localStorage.getItem(USERS_KEY)||'[]');if(!Array.isArray(users))users=[];}catch(e){users=[];}
 if(!admin||!admin.username||!admin.password)admin={...DEFAULT_ADMIN};
 // ===== USUÁRIO PADRÃO (com prazo) =====
 // Padrão: usuário  user  /  senha  user123  -> acesso por tempo determinado (começa a contar no 1º uso neste navegador).
 // O ADMIN pode editar o prazo, trocar a senha ou excluir este usuário (depois de excluído ele não volta).
 const DEFAULT_USER={username:'user',password:'sha256:a8e15d73ede61437977070225d9ebb266ff0875deb8063c3593e78d86c7f218f',days:182.5};
 const SEED_KEY='ckr_web_default_user_seeded_v1';
 try{
   if(!localStorage.getItem(SEED_KEY)){
     if(!users.some(u=>String(u.username||'').trim().toLowerCase()===DEFAULT_USER.username)&&DEFAULT_USER.username!==String(admin.username).trim().toLowerCase()){
       const now=Date.now();
       users.push({username:DEFAULT_USER.username,password:DEFAULT_USER.password,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+DEFAULT_USER.days*86400000).toISOString()});
       localStorage.setItem(USERS_KEY,JSON.stringify(users));
     }
     localStorage.setItem(SEED_KEY,'1');
   }
 }catch(e){}
 // ===== USUÁRIO MASTER PADRÃO (com prazo) =====
 // Padrão: usuário  master  /  senha  master 123  (com espaço)  -> todas as funções, MENOS "Gerenciar usuários".
 // Tem prazo de uso como os demais (começa a contar no 1º uso neste navegador). O ADMIN pode renovar, trocar a senha ou excluir.
 const DEFAULT_MASTER={username:'master',password:'sha256:7d0b5dd249519af18f5e986b20303dcd5e29ee57e88bf73bfd90c4c34b715d7f',days:182.5};
 const MASTER_SEED_KEY='ckr_web_default_master_seeded_v1';
 try{
   if(!localStorage.getItem(MASTER_SEED_KEY)){
     const taken=users.some(u=>String(u.username||'').trim().toLowerCase()===DEFAULT_MASTER.username)||DEFAULT_MASTER.username===String(admin.username).trim().toLowerCase();
     if(!taken){
       const now=Date.now();
       users.push({username:DEFAULT_MASTER.username,password:DEFAULT_MASTER.password,role:'master',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+DEFAULT_MASTER.days*86400000).toISOString()});
       localStorage.setItem(USERS_KEY,JSON.stringify(users));
     }
     localStorage.setItem(MASTER_SEED_KEY,'1');
   }
 }catch(e){}
 const saveUsers=()=>localStorage.setItem(USERS_KEY,JSON.stringify(users));
 const normalized=s=>String(s||'').trim().toLowerCase();
 function showLogin(){gate.hidden=false;shell.hidden=true;loginForm.hidden=false;setupForm.hidden=true;showSetupButton.hidden=!!(admin&&admin.username&&admin.password);desc.textContent='Informe seu usuário e senha para continuar.';error.textContent='';userInput.focus();}
 function showSetup(){gate.hidden=false;shell.hidden=true;loginForm.hidden=true;setupForm.hidden=false;showSetupButton.hidden=true;desc.textContent='Crie o usuário ADMIN e uma senha para este navegador.';setupError.textContent='';document.getElementById('ckrSetupUser').focus();}
 showSetupButton.addEventListener('click',()=>{showSetup();});
 function updateExpiryStatus(){const el=document.getElementById('ckrExpiryStatus');if(!el)return;if(!currentUser||currentUser.role==='admin'){el.hidden=true;el.textContent='';return;}const found=users.find(u=>normalized(u.username)===normalized(currentUser.username));if(!found||!found.expiresAt){el.hidden=true;el.textContent='';return;}const remaining=new Date(found.expiresAt).getTime()-Date.now();if(remaining<=0){el.textContent='◷ Acesso expirado';el.hidden=false;el.classList.add('expired');return;}const days=Math.ceil(remaining/(24*60*60*1000));el.textContent='◷ '+days+' '+(days===1?'dia':'dias');el.hidden=false;el.classList.remove('expired');}
 function enter(user){currentUser=user;document.body.dataset.ckrRole=user.role;document.body.dataset.ckrUser=user.username;sessionStorage.setItem(SESSION_KEY,JSON.stringify({username:user.username,role:user.role}));gate.hidden=true;shell.hidden=false;document.getElementById('ckrUserAvatar').textContent=(user.username||'AD').trim().slice(0,2).toUpperCase();manageButton.hidden=user.role!=='admin';if(manageSidebar)manageSidebar.hidden=user.role!=='admin';document.querySelectorAll('[data-panel],[data-go]').forEach(el=>{const target=el.dataset.panel||el.dataset.go;el.hidden=!canAccessPanel(target);});updateExpiryStatus();{const act=document.querySelector('.panel.active');if(!act||!canAccessPanel(act.id.replace('panel-','')))goTo('dashboard');}}
 function getValidUser(username,password){
   if(admin&&normalized(username)===normalized(admin.username)&&passOk(admin.password,password)){
     if(!String(admin.password).startsWith('sha256:')){admin={...admin,password:hashPw(password)};try{localStorage.setItem(AUTH_KEY,JSON.stringify(admin));}catch(e){}}
     return {username:admin.username,role:'admin'};
   }
   const found=users.find(u=>normalized(u.username)===normalized(username));
   if(!found||!passOk(found.password,password))return null;
   if(found.expiresAt && Date.now()>=new Date(found.expiresAt).getTime())return {expired:true,username:found.username};
   if(!String(found.password).startsWith('sha256:')){found.password=hashPw(password);try{saveUsers();}catch(e){}}
   return {username:found.username,role:found.role==='master'?'master':'usuario'};
 }
 const changePasswordForm=document.getElementById('ckrChangePasswordForm');
 function hidePasswordChange(){
   changePasswordForm.hidden=true;
   changePasswordForm.style.display='none';
   changePasswordForm.reset();
   document.getElementById('ckrPasswordError').textContent='';
   delete changePasswordForm.dataset.username;
 }
 function openPasswordChange(username){
   if(!currentUser||currentUser.role!=='admin'){
     toast('Somente o ADMIN pode alterar senhas.',true);
     return;
   }
   if(typeof hideEditUser==='function')hideEditUser();
   changePasswordForm.reset();
   document.getElementById('ckrPasswordTarget').textContent=username;
   document.getElementById('ckrPasswordError').textContent='';
   changePasswordForm.dataset.username=username;
   changePasswordForm.hidden=false;
   changePasswordForm.style.display='grid';
   document.getElementById('ckrAdminNewPassword').focus();
 }
 function renderUsers(){
   const list=document.getElementById('ckrUsersList');
   list.innerHTML='';

   // A conta ADMIN também pode ter a senha redefinida por aqui.
   if(admin&&admin.username){
     const row=document.createElement('div');
     row.className='users-row';
     const info=document.createElement('div');
     const name=document.createElement('strong');
     name.textContent=admin.username+' (ADMIN)';
     const meta=document.createElement('small');
     meta.textContent='Administrador • acesso permanente';
     info.append(name,meta);
     const change=document.createElement('button');
     change.type='button';
     change.className='button';
     change.textContent='Alterar senha';
     change.addEventListener('click',()=>openPasswordChange(admin.username));
     row.append(info,change);
     list.append(row);
   }

   if(!users.length){
     if(!admin) list.innerHTML='<div class="users-empty">Nenhum usuário cadastrado.</div>';
     return;
   }

   users.forEach((u,i)=>{
     const row=document.createElement('div');
     row.className='users-row';
     const info=document.createElement('div');
     const name=document.createElement('strong');
     name.textContent=u.username+(u.role==='master'?' (MASTER)':'');
     const meta=document.createElement('small');
     meta.textContent=(u.role==='master'?'Master • ':'Usuário • ')+(u.expiresAt?((Date.now()>=new Date(u.expiresAt).getTime()?'EXPIRADO em ':'Expira em ')+new Date(u.expiresAt).toLocaleString('pt-BR')):'Prazo não definido');
     info.append(name,meta);

     const actions=document.createElement('div');
     const change=document.createElement('button');
     change.type='button';
     change.className='button';
     change.textContent='Alterar senha';
     change.addEventListener('click',()=>openPasswordChange(u.username));

     const edit=document.createElement('button');
     edit.type='button';
     edit.className='button';
     edit.textContent='Editar';
     edit.addEventListener('click',()=>openEditUser(u.username));

     const del=document.createElement('button');
     del.type='button';
     del.className='button button-danger-light';
     del.textContent='Excluir';
     del.addEventListener('click',()=>{
       if(currentUser?.role!=='admin')return;
       if(!confirm('Excluir o usuário '+u.username+'?'))return;
       users.splice(i,1);
       saveUsers();
       renderUsers();
       toast('Usuário excluído.');
     });
     actions.append(edit,change,del);
     row.append(info,actions);
     list.append(row);
   });
 }
 document.getElementById('ckrCancelPasswordChange').addEventListener('click',hidePasswordChange);
 changePasswordForm.addEventListener('submit',e=>{
   e.preventDefault();
   const err=document.getElementById('ckrPasswordError');
   err.textContent='';
   if(!currentUser||currentUser.role!=='admin'){
     err.textContent='Somente o ADMIN pode alterar senhas.';
     return;
   }
   const username=changePasswordForm.dataset.username;
   const newPassword=document.getElementById('ckrAdminNewPassword').value;
   const confirmPassword=document.getElementById('ckrAdminConfirmPassword').value;
   if(!username){err.textContent='Selecione um usuário.';return;}
   if(newPassword.length<6){err.textContent='A senha precisa ter pelo menos 6 caracteres.';return;}
   if(newPassword!==confirmPassword){err.textContent='As senhas não coincidem.';return;}
   try{
     if(admin&&normalized(username)===normalized(admin.username)){
       const updatedAdmin={...admin,password:hashPw(newPassword)};
       localStorage.setItem(AUTH_KEY,JSON.stringify(updatedAdmin));
       admin=updatedAdmin;
     }else{
       const user=users.find(u=>normalized(u.username)===normalized(username));
       if(!user){err.textContent='Usuário não encontrado.';return;}
       const oldPassword=user.password;
       user.password=hashPw(newPassword);
       try{saveUsers();}catch(saveError){user.password=oldPassword;throw saveError;}
     }
     hidePasswordChange();
     renderUsers();
     toast('Senha alterada com sucesso.');
   }catch(ex){
     err.textContent='Não foi possível salvar a nova senha neste navegador.';
   }
 });
 const editForm=document.getElementById('ckrEditUserForm');
 const pad2=n=>String(n).padStart(2,'0');
 const toLocalInput=iso=>{const d=new Date(iso);return isNaN(d)?'':`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;};
 function hideEditUser(){editForm.hidden=true;editForm.style.display='none';editForm.reset();document.getElementById('ckrEditError').textContent='';delete editForm.dataset.username;}
 function openEditUser(username){
   if(!currentUser||currentUser.role!=='admin'){toast('Somente o ADMIN pode editar usuários.',true);return;}
   const u=users.find(x=>normalized(x.username)===normalized(username));if(!u)return;
   hidePasswordChange();
   editForm.dataset.username=u.username;
   document.getElementById('ckrEditTarget').textContent=u.username;
   document.getElementById('ckrEditUsername').value=u.username;
   document.getElementById('ckrEditExpiry').value=toLocalInput(u.expiresAt);
   document.getElementById('ckrEditRole').value=u.role==='master'?'master':'usuario';
   document.getElementById('ckrEditError').textContent='';
   editForm.hidden=false;editForm.style.display='grid';
   document.getElementById('ckrEditUsername').focus();
 }
 document.getElementById('ckrCancelEditUser').addEventListener('click',hideEditUser);
 document.querySelectorAll('[data-renew-days]').forEach(btn=>btn.addEventListener('click',()=>{document.getElementById('ckrEditExpiry').value=toLocalInput(new Date(Date.now()+Number(btn.dataset.renewDays)*86400000).toISOString());}));
 editForm.addEventListener('submit',e=>{
   e.preventDefault();
   const err=document.getElementById('ckrEditError');err.textContent='';
   if(!currentUser||currentUser.role!=='admin'){err.textContent='Somente o ADMIN pode editar usuários.';return;}
   const old=editForm.dataset.username,u=users.find(x=>normalized(x.username)===normalized(old));
   if(!u){err.textContent='Usuário não encontrado.';return;}
   const name=document.getElementById('ckrEditUsername').value.trim(),exp=document.getElementById('ckrEditExpiry').value;
   if(name.length<3){err.textContent='O usuário precisa ter pelo menos 3 caracteres.';return;}
   if(!exp||isNaN(new Date(exp))){err.textContent='Informe a data e hora de validade.';return;}
   if(normalized(name)===normalized(admin.username)||users.some(x=>x!==u&&normalized(x.username)===normalized(name))){err.textContent='Esse nome de usuário já está cadastrado.';return;}
   const backup={username:u.username,expiresAt:u.expiresAt,role:u.role};
   u.username=name;u.expiresAt=new Date(exp).toISOString();u.role=document.getElementById('ckrEditRole').value==='master'?'master':'usuario';
   try{saveUsers();hideEditUser();renderUsers();toast('Usuário atualizado.');}catch(ex){u.username=backup.username;u.expiresAt=backup.expiresAt;u.role=backup.role;err.textContent='Não foi possível salvar neste navegador.';}
 });
 function openUsers(){
   if(!currentUser||currentUser.role!=='admin'){
     toast('Somente o ADMIN pode gerenciar usuários.',true);
     return;
   }
   hidePasswordChange();hideEditUser();
   document.getElementById('ckrUsersError').textContent='';
   document.getElementById('ckrCreateUserForm').reset();
   renderUsers();
   usersModal.hidden=false;
   document.getElementById('ckrNewUsername').focus();
 }
 function closeUsers(){hidePasswordChange();hideEditUser();usersModal.hidden=true;}
 manageButton.addEventListener('click',openUsers);if(manageSidebar)manageSidebar.addEventListener('click',openUsers);document.getElementById('ckrCloseUsers').addEventListener('click',closeUsers);usersModal.addEventListener('click',e=>{if(e.target===usersModal)closeUsers();});
 document.getElementById('ckrCreateUserForm').addEventListener('submit',e=>{e.preventDefault();const err=document.getElementById('ckrUsersError');err.textContent='';if(!currentUser||currentUser.role!=='admin'){err.textContent='Somente o ADMIN pode criar usuários.';return;}
   const username=document.getElementById('ckrNewUsername').value.trim(),password=document.getElementById('ckrNewPassword').value,confirmPassword=document.getElementById('ckrNewPasswordConfirm').value;
   if(username.length<3){err.textContent='O usuário precisa ter pelo menos 3 caracteres.';return;}if(password.length<6){err.textContent='A senha precisa ter pelo menos 6 caracteres.';return;}if(password!==confirmPassword){err.textContent='As senhas não coincidem.';return;}
   if(normalized(username)===normalized(admin.username)||users.some(u=>normalized(u.username)===normalized(username))){err.textContent='Esse nome de usuário já está cadastrado.';return;}
   const days=Number(document.getElementById('ckrNewValidity').value)||182.5;
   const created=Date.now(), expiry=new Date(created+days*24*60*60*1000).toISOString();users.push({username,password:hashPw(password),role:document.getElementById('ckrNewRole').value==='master'?'master':'usuario',createdAt:new Date(created).toISOString(),expiresAt:expiry});
   try{saveUsers();renderUsers();e.target.reset();toast('Usuário criado. Acesso até '+new Date(expiry).toLocaleDateString('pt-BR')+'.');}catch(ex){users.pop();err.textContent='Não foi possível salvar o usuário neste navegador.';}
 });
 if(!admin||!admin.username||!admin.password){showSetup();}
 else if(sessionStorage.getItem(SESSION_KEY)){try{const sess=JSON.parse(sessionStorage.getItem(SESSION_KEY));let u=null;if(sess.role==='admin'&&normalized(sess.username)===normalized(admin.username))u={username:admin.username,role:'admin'};else{const f=users.find(x=>normalized(x.username)===normalized(sess.username));if(f&&!(f.expiresAt&&Date.now()>=new Date(f.expiresAt).getTime()))u={username:f.username,role:f.role==='master'?'master':'usuario'};}if(u)enter(u);else{sessionStorage.removeItem(SESSION_KEY);showLogin();}}catch(e){showLogin();}}
 else{showLogin();}
 setupForm.addEventListener('submit',e=>{e.preventDefault();setupError.textContent='';const username=document.getElementById('ckrSetupUser').value.trim(),password=document.getElementById('ckrSetupPassword').value,confirmPassword=document.getElementById('ckrSetupConfirm').value;if(username.length<3){setupError.textContent='O usuário deve ter pelo menos 3 caracteres.';return;}if(password.length<6){setupError.textContent='A senha precisa ter pelo menos 6 caracteres.';return;}if(password!==confirmPassword){setupError.textContent='As senhas não são iguais.';return;}try{localStorage.setItem(AUTH_KEY,JSON.stringify({username,password}));admin={username,password};enter({username,role:'admin'});toast('Administrador criado neste navegador.');}catch(err){setupError.textContent='Não foi possível salvar as credenciais neste navegador.';}});
 // ===== Botão "Mostrar/Ocultar" em todos os campos de senha (útil no celular) =====
 document.querySelectorAll('input[type="password"]').forEach(inp=>{
  if(inp.parentElement.classList.contains('pw-wrap'))return;
  const wrap=document.createElement('div'),btn=document.createElement('button');
  wrap.className='pw-wrap';inp.parentNode.insertBefore(wrap,inp);wrap.appendChild(inp);
  btn.type='button';btn.className='pw-toggle';btn.textContent='Mostrar';btn.setAttribute('aria-label','Mostrar senha');btn.setAttribute('aria-pressed','false');
  btn.addEventListener('click',()=>{const show=inp.type==='password';inp.type=show?'text':'password';btn.textContent=show?'Ocultar':'Mostrar';btn.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');btn.setAttribute('aria-pressed',show?'true':'false');});
  wrap.appendChild(btn);
 });
 // ===== Captcha: aparece depois de 3 erros de senha seguidos (a contagem fica salva no navegador até acertar o login) =====
 const FAILS_KEY='ckr_web_login_fails_v1', MAX_FAILS=3;
 const captchaBox=document.getElementById('ckrCaptchaBox'), captchaCanvas=document.getElementById('ckrCaptchaCanvas'), captchaInput=document.getElementById('ckrCaptchaInput');
 let captchaCode='';
 const getFails=()=>{try{return Number(localStorage.getItem(FAILS_KEY))||0;}catch(e){return 0;}};
 const setFails=n=>{try{if(n>0)localStorage.setItem(FAILS_KEY,String(n));else localStorage.removeItem(FAILS_KEY);}catch(e){}};
 const rnd=n=>{try{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%n;}catch(e){return Math.floor(Math.random()*n);}};
 function newCaptcha(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  captchaCode=Array.from({length:5},()=>chars[rnd(chars.length)]).join('');
  const ctx=captchaCanvas.getContext('2d'),w=captchaCanvas.width,h=captchaCanvas.height;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#f1f5fb';ctx.fillRect(0,0,w,h);
  for(let k=0;k<7;k++){ctx.strokeStyle=`hsla(${rnd(360)},45%,55%,.55)`;ctx.lineWidth=1+rnd(2);ctx.beginPath();ctx.moveTo(rnd(w),rnd(h));ctx.bezierCurveTo(rnd(w),rnd(h),rnd(w),rnd(h),rnd(w),rnd(h));ctx.stroke();}
  for(let k=0;k<45;k++){ctx.fillStyle=`hsla(${rnd(360)},40%,50%,.5)`;ctx.fillRect(rnd(w),rnd(h),2,2);}
  const step=w/(captchaCode.length+1);
  [...captchaCode].forEach((ch,k)=>{ctx.save();ctx.translate(step*(k+1),h/2+(rnd(10)-5));ctx.rotate((rnd(50)-25)*Math.PI/180);ctx.font=`bold ${28+rnd(8)}px Manrope, Arial, sans-serif`;ctx.fillStyle=`hsl(${rnd(360)},55%,30%)`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(ch,0,0);ctx.restore();});
  captchaInput.value='';
 }
 function syncCaptcha(){const need=getFails()>=MAX_FAILS;captchaBox.hidden=!need;captchaInput.required=need;if(need){if(!captchaCode)newCaptcha();}else{captchaCode='';captchaInput.value='';}}
 document.getElementById('ckrCaptchaRefresh').addEventListener('click',()=>{newCaptcha();captchaInput.focus();});
 syncCaptcha();
 loginForm.addEventListener('submit',e=>{
  e.preventDefault();error.textContent='';
  if(getFails()>=MAX_FAILS&&captchaInput.value.trim().toUpperCase()!==captchaCode){error.textContent='Código de verificação incorreto. Tente novamente.';newCaptcha();captchaInput.focus();return;}
  const username=userInput.value.trim(),password=passInput.value,u=getValidUser(username,password);
  if(u&&u.expired){error.textContent='O prazo de uso deste usuário terminou. Solicite ao ADMIN um novo acesso.';passInput.value='';return;}
  if(u){setFails(0);syncCaptcha();passInput.value='';enter(u);}
  else{
   const n=getFails()+1;setFails(n);
   error.textContent=n===MAX_FAILS?'Usuário ou senha incorretos. Digite também o código de verificação para continuar.':'Usuário ou senha incorretos.';
   passInput.value='';if(n>=MAX_FAILS){captchaCode='';}syncCaptcha();passInput.focus();
  }
 });
 function doLogout(){if(editingSale||saleCart.length)cancelSaleEdit();sessionStorage.removeItem(SESSION_KEY);currentUser=null;updateExpiryStatus();delete document.body.dataset.ckrRole;delete document.body.dataset.ckrUser;closeUsers();showLogin();passInput.value='';}
 // Master e Usuário perdem o acesso assim que o prazo termina, mesmo com o sistema aberto. O ADMIN nunca expira.
 function checkExpiry(){if(!currentUser||currentUser.role==='admin')return;const f=users.find(u=>normalized(u.username)===normalized(currentUser.username));if(!f||(f.expiresAt&&Date.now()>=new Date(f.expiresAt).getTime())){const removed=!f;doLogout();error.textContent=removed?'Este usuário não existe mais. Solicite acesso ao ADMIN.':'O prazo de uso deste usuário terminou. Solicite ao ADMIN um novo acesso.';}}
 setInterval(()=>{checkExpiry();updateExpiryStatus();},60000);
 document.getElementById('ckrLogout').addEventListener('click',doLogout);
})();

// ===== PWA: service worker + botão "Instalar app" =====
if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').catch(()=>{});});}
let ckrEventoInstalar=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();ckrEventoInstalar=e;const b=document.getElementById('btnInstalar');if(b)b.hidden=false;});
document.addEventListener('click',async e=>{const b=e.target.closest&&e.target.closest('#btnInstalar');if(!b||!ckrEventoInstalar)return;ckrEventoInstalar.prompt();try{await ckrEventoInstalar.userChoice;}catch(_){}ckrEventoInstalar=null;b.hidden=true;});
window.addEventListener('appinstalled',()=>{const b=document.getElementById('btnInstalar');if(b)b.hidden=true;});
