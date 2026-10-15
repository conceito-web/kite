'use strict';
const STORAGE_KEY = 'ckr_estoque_web_v2';
let data = loadData();
let editingId = null;
let toastTimer;

function emptyData(){return {version:3,products:[],movements:[],customers:[]};}
function loadData(){try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return emptyData();const parsed=JSON.parse(raw);if(!Array.isArray(parsed.products)||!Array.isArray(parsed.movements))return emptyData();if(!Array.isArray(parsed.customers))parsed.customers=[];return parsed;}catch(e){return emptyData();}}
function saveData(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));renderAll();return true;}catch(e){toast('Não foi possível salvar. Verifique o espaço disponível no navegador.',true);return false;}}
function id(){return (crypto&&crypto.randomUUID)?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;}
function money(n){return Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(message,error=false){const el=document.getElementById('toast');el.textContent=message;el.classList.toggle('error',error);el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200);}

// BACKUP MENSAL AUTOMÁTICO POR E-MAIL (serviço remoto configurado pelo administrador)
// Cole abaixo a URL pública do Cloudflare Worker depois de publicá-lo.
const MONTHLY_BACKUP_ENDPOINT = 'COLE_AQUI_A_URL_DO_CLOUDFLARE_WORKER';
const MONTHLY_BACKUP_STATUS_KEY = 'conceito_backup_mensal_status_v1';
const MONTHLY_BACKUP_EMAIL = 'infane10@gmail.com';
function detectarDispositivoBackup(){
  const ua = navigator.userAgent || '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua) || (navigator.maxTouchPoints > 1 && Math.min(screen.width || 9999, screen.height || 9999) < 800);
  return mobile ? 'Celular' : 'PC';
}
function chaveMesBackup(){
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}`;
}
function bytesParaBase64Utf8(texto){
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  const bloco = 0x8000;
  for(let i=0;i<bytes.length;i+=bloco) binario += String.fromCharCode(...bytes.subarray(i,i+bloco));
  return btoa(binario);
}
async function tentarBackupMensalAutomatico(){
  if(!navigator.onLine) return;
  if(!MONTHLY_BACKUP_ENDPOINT || MONTHLY_BACKUP_ENDPOINT.startsWith('COLE_AQUI_')) return;
  const mes = chaveMesBackup();
  let enviado = {};
  try { enviado = JSON.parse(localStorage.getItem(MONTHLY_BACKUP_STATUS_KEY) || '{}') || {}; } catch(_) { enviado = {}; }
  if(enviado[mes] === true) return;
  const dispositivo = detectarDispositivoBackup();
  const nomeArquivo = `Conceito_${dispositivo}_${mes}.json`;
  const conteudo = JSON.stringify({...data, exportedAt:new Date().toISOString(), backupMonth:mes, device:dispositivo}, null, 2);
  try {
    const resposta = await fetch(MONTHLY_BACKUP_ENDPOINT, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({fileName:nomeArquivo, contentBase64:bytesParaBase64Utf8(conteudo), month:mes, device:dispositivo})
    });
    let retorno = {};
    try { retorno = await resposta.json(); } catch(_) {}
    if(!resposta.ok || retorno.success !== true) throw new Error(retorno.error || `HTTP ${resposta.status}`);
    enviado[mes] = true;
    localStorage.setItem(MONTHLY_BACKUP_STATUS_KEY, JSON.stringify(enviado));
    toast(`Backup mensal enviado para ${MONTHLY_BACKUP_EMAIL} (${dispositivo}).`);
  } catch(err) {
    // Não marcar o mês como enviado: haverá nova tentativa na próxima abertura.
    console.warn('Backup mensal do Conceito não foi enviado; tentará novamente na próxima abertura.', err);
    toast('Backup mensal não enviado. O sistema tentará novamente na próxima abertura.', true);
  }
}
function agendarBackupMensalAutomatico(){
  // Espera o login e a renderização inicial; só envia quando o site está aberto e online.
  setTimeout(()=>{tentarBackupMensalAutomatico();}, 1800);
  window.addEventListener('online', ()=>{tentarBackupMensalAutomatico();}, {once:true});
}

function productById(pid){return data.products.find(p=>p.id===pid);}
function recordMovement(type,p,qty,total,details='',extra={}){data.movements.unshift({id:id(),type,productId:p.id,productName:p.name,quantity:Number(qty),total:Number(total||0),details,...extra,date:new Date().toISOString()});}
function dateText(d){return new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});}
function goTo(name){if(name==='backup'&&document.body.dataset.ckrRole!=='admin'){toast('Somente o ADMIN pode acessar Backup e transferência.',true);return;}document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===`panel-${name}`));document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.panel===name));const selected=document.querySelector(`.nav-link[data-panel="${name}"]`);document.getElementById('pageBreadcrumb').textContent=selected?selected.textContent.trim().replace(/\d+$/,'').trim():'Visão geral';document.getElementById('sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});}
document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>goTo(b.dataset.panel)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>goTo(b.dataset.go)));
document.getElementById('mobileMenu').addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));
document.getElementById('closeNotice').addEventListener('click',()=>document.querySelector('.notice').style.display='none');
document.getElementById('todayLabel').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});

function renderAll(){renderStats();renderProducts();renderSelects();renderHistory();renderRecent();renderCustomers();renderDashboardInsights();renderDateReport();}
function renderStats(){
 document.getElementById('totalProdutos').textContent=data.products.length;
 document.getElementById('menuProdutos').textContent=data.products.length;
  document.getElementById('menuClientes').textContent=(data.customers||[]).length;
 document.getElementById('totalUnidades').textContent=data.products.reduce((s,p)=>s+Number(p.stock||0),0);
 document.getElementById('totalVendas').textContent=data.movements.filter(m=>m.type==='venda').length;
 document.getElementById('valorEstoque').textContent=money(data.products.reduce((s,p)=>s+Number(p.stock||0)*Number(p.cost||0),0));
 // O lucro só usa vendas que guardam o custo real da época da venda.
 // Vendas antigas sem esse registro não podem ser recalculadas com segurança.
 const vendas=data.movements.filter(m=>m.type==='venda');
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
 const items=data.products.filter(p=>p.name.toLowerCase().includes(q)||String(p.code||'').toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 document.getElementById('listaProdutos').innerHTML=items.map(p=>`<tr><td><span class="product-name">${esc(p.name)}</span></td><td>${esc(p.code||'—')}</td><td class="${p.stock<=2?'stock-low':''}">${Number(p.stock)}</td><td>${money(p.cost)}</td><td>${money(p.price)}</td><td><button class="row-action" data-edit="${esc(p.id)}">Editar</button><button class="row-action delete" data-delete="${esc(p.id)}">Excluir</button></td></tr>`).join('');
 document.getElementById('semProdutos').style.display=items.length?'none':'block';
 document.getElementById('produtoSubtitulo').textContent=`${items.length} ${items.length===1?'item encontrado':'itens encontrados'}`;
}
function renderSelects(){
 const options=data.products.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(p=>`<option value="${esc(p.id)}">${esc(p.name)} — estoque: ${Number(p.stock)}</option>`).join('');
 ['entradaProduto','vendaProduto'].forEach(key=>{const el=document.getElementById(key),current=el.value;el.innerHTML='<option value="">Selecione um produto...</option>'+options;if(data.products.some(p=>p.id===current))el.value=current;});
 updateSalePreview();
}
function renderHistory(){
 const filter=document.getElementById('filtroTipo').value;
 const list=data.movements.filter(m=>filter==='todos'||m.type===filter);
 document.getElementById('listaHistorico').innerHTML=list.map(m=>`<tr><td>${esc(dateText(m.date))}</td><td><span class="pill ${m.type}">${m.type==='venda'?'Venda':'Entrada'}</span></td><td><span class="product-name">${esc(m.productName)}</span></td><td>${Number(m.quantity)}</td><td>${money(m.total)}</td><td>${esc(m.details||'—')}</td></tr>`).join('');
 document.getElementById('semHistorico').style.display=list.length?'none':'block';
}
function renderRecent(){
 const list=data.movements.slice(0,5);
 document.getElementById('recentRows').innerHTML=list.map(m=>`<tr><td><span class="pill ${m.type}">${m.type==='venda'?'Venda':'Entrada'}</span></td><td><span class="product-name">${esc(m.productName)}</span></td><td>${m.type==='venda'?'−':'+'}${Number(m.quantity)}</td><td>${money(m.total)}</td><td>${esc(dateText(m.date))}</td></tr>`).join('');
 document.getElementById('recentEmpty').style.display=list.length?'none':'block';
}

function localDateKey(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function renderDashboardInsights(){
 const now=new Date(),days=[];
 for(let i=6;i>=0;i--){const d=new Date(now);d.setHours(0,0,0,0);d.setDate(d.getDate()-i);const key=localDateKey(d);const total=data.movements.filter(m=>m.type==='venda'&&localDateKey(m.date)===key).reduce((s,m)=>s+Number(m.total||0),0);days.push({key,label:d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),total});}
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
 const rows=getDateReportRows(),sales=rows.filter(m=>m.type==='venda').reduce((s,m)=>s+Number(m.total||0),0),entries=rows.filter(m=>m.type==='entrada').reduce((s,m)=>s+Number(m.total||0),0);
 const el=id=>document.getElementById(id);if(!el('relatorioRows'))return;
 el('relatorioTotalVendas').textContent=money(sales);el('relatorioTotalEntradas').textContent=money(entries);el('relatorioQtd').textContent=rows.length;
 const start=el('relatorioDataInicio').value,end=el('relatorioDataFim').value;el('relatorioDescricao').textContent=`${start?new Date(start+'T12:00:00').toLocaleDateString('pt-BR'):'Desde o início'} até ${end?new Date(end+'T12:00:00').toLocaleDateString('pt-BR'):'hoje'} · ${rows.length} registro(s)`;
 el('relatorioRows').innerHTML=rows.map(m=>`<tr><td>${esc(dateText(m.date))}</td><td><span class="pill ${m.type}">${m.type==='venda'?'Venda':'Entrada'}</span></td><td><span class="product-name">${esc(m.productName)}</span></td><td>${Number(m.quantity)}</td><td>${money(m.total)}</td><td>${esc([m.client?`Cliente: ${m.client}`:'',m.details||''].filter(Boolean).join(' · ')||'—')}</td></tr>`).join('');el('relatorioVazio').style.display=rows.length?'none':'block';
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
function resetProductForm(){editingId=null;document.getElementById('formProduto').reset();document.getElementById('produtoEstoque').disabled=false;document.getElementById('produtoEstoque').title='';document.getElementById('produtoCusto').value='0';document.getElementById('produtoPreco').value='0';document.getElementById('produtoEstoque').value='0';document.getElementById('formProdutoTitulo').textContent='Adicionar produto';document.getElementById('salvarProdutoBtn').textContent='Salvar produto';document.getElementById('cancelarEdicao').hidden=true;}
document.getElementById('formProduto').addEventListener('submit',e=>{
 e.preventDefault();const name=document.getElementById('produtoNome').value.trim(),code=document.getElementById('produtoCodigo').value.trim(),cost=Number(document.getElementById('produtoCusto').value),price=Number(document.getElementById('produtoPreco').value),stock=Number(document.getElementById('produtoEstoque').value);
 if(!name||!Number.isFinite(cost)||!Number.isFinite(price)||cost<0||price<0||!Number.isInteger(stock)||stock<0){toast('Confira os dados informados.',true);return;}
 if(code&&data.products.some(p=>p.id!==editingId&&p.code.toLowerCase()===code.toLowerCase())){toast('Já existe um produto com esse código.',true);return;}
 if(editingId){const p=productById(editingId);if(!p)return;p.name=name;p.code=code;p.cost=cost;p.price=price;toast('Produto atualizado. O estoque foi mantido.');}
 else{const p={id:id(),name,code,cost,price,stock};data.products.push(p);if(stock>0)recordMovement('entrada',p,stock,cost*stock,'Estoque inicial');toast('Produto cadastrado com sucesso.');}
 if(saveData())resetProductForm();
});
document.getElementById('cancelarEdicao').addEventListener('click',resetProductForm);
document.getElementById('listaProdutos').addEventListener('click',e=>{
 const edit=e.target.dataset.edit,del=e.target.dataset.delete;
 if(edit){const p=productById(edit);if(!p)return;editingId=p.id;document.getElementById('produtoNome').value=p.name;document.getElementById('produtoCodigo').value=p.code||'';document.getElementById('produtoCusto').value=p.cost;document.getElementById('produtoPreco').value=p.price;document.getElementById('produtoEstoque').value=p.stock;document.getElementById('produtoEstoque').disabled=true;document.getElementById('formProdutoTitulo').textContent='Editar produto';document.getElementById('salvarProdutoBtn').textContent='Salvar alterações';document.getElementById('cancelarEdicao').hidden=false;document.getElementById('produtoEstoque').title='Para alterar estoque, use Entrada ou Venda.';document.getElementById('formProduto').scrollIntoView({behavior:'smooth',block:'start'});}
 if(del){const p=productById(del);if(!p)return;if(!confirm(`Excluir "${p.name}" do catálogo? O histórico será mantido.`))return;data.products=data.products.filter(x=>x.id!==del);if(editingId===del)resetProductForm();if(saveData())toast('Produto excluído.');}
});
document.getElementById('buscaProduto').addEventListener('input',renderProducts);
document.getElementById('formEntrada').addEventListener('submit',e=>{e.preventDefault();const p=productById(document.getElementById('entradaProduto').value),qty=Number(document.getElementById('entradaQuantidade').value),note=document.getElementById('entradaObs').value.trim();if(!p){toast('Cadastre e selecione um produto primeiro.',true);return;}if(!Number.isInteger(qty)||qty<1){toast('Informe uma quantidade inteira maior que zero.',true);return;}p.stock+=qty;recordMovement('entrada',p,qty,p.cost*qty,note);if(saveData()){e.target.reset();toast('Entrada registrada com sucesso.');}});
function saleTotals(){
 const qty=Number(document.getElementById('vendaQuantidade').value||0),price=Number(document.getElementById('vendaPreco').value||0);
 const subtotal=Math.round(qty*price*100)/100;
 const discountCash=Math.min(subtotal,Math.max(0,Number(document.getElementById('vendaDescontoReais').value||0)));
 const afterCash=Math.max(0,subtotal-discountCash);
 const discountPercent=Math.min(100,Math.max(0,Number(document.getElementById('vendaDescontoPercentual').value||0)));
 const total=Math.round(afterCash*(1-discountPercent/100)*100)/100;
 return {subtotal,discountCash,discountPercent,total};
}
function updatePaymentRow(row){
 const isCard=row.querySelector('.pagamentoMetodo').value==='Cartão de crédito';
 row.querySelector('.payment-card-options').hidden=!isCard;
}
function addPaymentRow(){
 const wrap=document.getElementById('linhasPagamento'),row=document.createElement('div');row.className='payment-row';
 row.innerHTML=`<div class="payment-row-main"><label class="field">Forma de pagamento<select class="pagamentoMetodo"><option value="">Selecione...</option><option>Pix</option><option>Dinheiro</option><option>Cartão de débito</option><option>Cartão de crédito</option><option>Transferência</option><option>Boleto</option><option>Outro</option></select></label><label class="field">Valor pago (R$)<input class="pagamentoValor" type="number" min="0" step="0.01" placeholder="0,00"></label><button type="button" class="payment-remove" aria-label="Remover pagamento" title="Remover pagamento">×</button></div><div class="payment-card-options" hidden><label class="field">Parcelas<input class="pagamentoParcelas" type="number" min="1" step="1" value="1"></label><label class="field">Parcelamento<select class="pagamentoResponsavel"><option value="loja">Pela loja</option><option value="fabrica">Pela fábrica</option></select></label></div>`;
 wrap.appendChild(row);row.querySelector('.pagamentoMetodo').addEventListener('change',()=>{updatePaymentRow(row);updatePaymentSummary();});row.querySelector('.pagamentoValor').addEventListener('input',updatePaymentSummary);row.querySelector('.pagamentoParcelas').addEventListener('input',updatePaymentSummary);row.querySelector('.pagamentoResponsavel').addEventListener('change',updatePaymentSummary);row.querySelector('.payment-remove').addEventListener('click',()=>{row.remove();updatePaymentSummary();});updatePaymentRow(row);updatePaymentSummary();
}
function readPayments(){
 return [...document.querySelectorAll('.payment-row')].map(row=>({method:row.querySelector('.pagamentoMetodo').value,amount:Math.round(Number(row.querySelector('.pagamentoValor').value||0)*100)/100,installments:row.querySelector('.pagamentoMetodo').value==='Cartão de crédito'?Number(row.querySelector('.pagamentoParcelas').value||0):null,responsible:row.querySelector('.pagamentoMetodo').value==='Cartão de crédito'?row.querySelector('.pagamentoResponsavel').value:null})).filter(x=>x.method||x.amount>0);
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
 const p=productById(document.getElementById('vendaProduto').value);if(p&&document.activeElement!==document.getElementById('vendaPreco'))document.getElementById('vendaPreco').value=Number(p.price).toFixed(2);
 const t=saleTotals();document.getElementById('subtotalVendaPreview').textContent=money(t.subtotal);document.getElementById('totalVendaPreview').textContent=money(t.total);updatePaymentSummary();
}
['vendaProduto','vendaQuantidade','vendaPreco','vendaDescontoReais','vendaDescontoPercentual'].forEach(key=>document.getElementById(key).addEventListener(key==='vendaProduto'?'change':'input',updateSalePreview));
document.getElementById('adicionarPagamento').addEventListener('click',addPaymentRow);
document.getElementById('formVenda').addEventListener('submit',e=>{
 e.preventDefault();const p=productById(document.getElementById('vendaProduto').value),qty=Number(document.getElementById('vendaQuantidade').value),price=Number(document.getElementById('vendaPreco').value),client=document.getElementById('vendaCliente').value.trim(),note=document.getElementById('vendaObs').value.trim(),totals=saleTotals(),payments=readPayments(),received=Math.round(payments.reduce((s,x)=>s+x.amount,0)*100)/100;
 if(!p){toast('Cadastre e selecione um produto primeiro.',true);return;}if(!Number.isInteger(qty)||qty<1){toast('Informe uma quantidade inteira maior que zero.',true);return;}if(qty>p.stock){toast(`Estoque insuficiente. Disponível: ${p.stock}.`,true);return;}if(!Number.isFinite(price)||price<0){toast('Informe um preço válido.',true);return;}
 if(totals.discountCash<0||totals.discountPercent<0||totals.discountPercent>100){toast('Confira os descontos informados.',true);return;}
 if(!payments.length||payments.some(x=>!x.method||x.amount<=0)){toast('Informe a forma e o valor de cada pagamento.',true);return;}
 if(payments.some(x=>x.method==='Cartão de crédito'&&(!Number.isInteger(x.installments)||x.installments<1))){toast('Informe um número válido de parcelas para cada cartão.',true);return;}
 if(Math.abs(received-totals.total)>0.009){toast(`Os pagamentos devem somar exatamente ${money(totals.total)}. Saldo: ${money(totals.total-received)}.`,true);return;}
 const paymentDetails=payments.map(x=>x.method==='Cartão de crédito'?`${x.method}: ${money(x.amount)} em ${x.installments}x (${x.responsible==='fabrica'?'fábrica':'loja'})`:`${x.method}: ${money(x.amount)}`).join(' | ');
 const details=[client?`Cliente: ${client}`:'',`Subtotal: ${money(totals.subtotal)}`,totals.discountCash?`Desconto: ${money(totals.discountCash)} + ${totals.discountPercent}%`:'',`Pagamentos: ${paymentDetails}`,note].filter(Boolean).join(' · ');
 const custoUnitarioVenda=Math.round(Number(p.cost||0)*100)/100;
 const custoTotalVenda=Math.round(custoUnitarioVenda*qty*100)/100;
 const lucroVenda=Math.round((Number(totals.total||0)-custoTotalVenda)*100)/100;
 p.stock-=qty;recordMovement('venda',p,qty,totals.total,details,{client,payments,subtotal:totals.subtotal,discountCash:totals.discountCash,discountPercent:totals.discountPercent,unitPrice:price,unitCost:custoUnitarioVenda,costTotal:custoTotalVenda,profit:lucroVenda});
 if(saveData()){e.target.reset();document.getElementById('linhasPagamento').innerHTML='';addPaymentRow();updateSalePreview();toast('Venda registrada e estoque atualizado.');}
});
document.getElementById('filtroTipo').addEventListener('change',renderHistory);
document.getElementById('limparHistorico').addEventListener('click',()=>{if(!confirm('Apagar o histórico? Os produtos e quantidades em estoque serão mantidos.'))return;data.movements=[];if(saveData())toast('Histórico apagado.');});
document.getElementById('fazerBackup').addEventListener('click',()=>{if(document.body.dataset.ckrRole!=='admin'){toast('Somente o ADMIN pode fazer backup.',true);return;}const blob=new Blob([JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`conceito-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Backup exportado. Guarde o arquivo em local seguro.');});
document.getElementById('restaurarBackup').addEventListener('click',async()=>{if(document.body.dataset.ckrRole!=='admin'){toast('Somente o ADMIN pode restaurar backup.',true);return;}const file=document.getElementById('arquivoBackup').files[0];if(!file){toast('Escolha um arquivo JSON primeiro.',true);return;}if(!confirm('A restauração vai substituir os dados deste dispositivo. Deseja continuar?'))return;try{const imported=JSON.parse(await file.text());if(!Array.isArray(imported.products)||!Array.isArray(imported.movements))throw Error('Formato');for(const p of imported.products){if(!p.id||!String(p.name||'').trim()||!Number.isFinite(Number(p.stock))||Number(p.stock)<0)throw Error('Produto');}data={version:3,products:imported.products,movements:imported.movements,customers:Array.isArray(imported.customers)?imported.customers:[]};if(saveData()){document.getElementById('arquivoBackup').value='';resetProductForm();toast('Backup restaurado com sucesso.');}}catch(err){toast('Arquivo inválido ou incompatível com o Conceito Web V2.',true);}});
document.getElementById('apagarTudo').addEventListener('click',()=>{if(document.body.dataset.ckrRole!=='admin'){toast('Somente o ADMIN pode apagar os dados.',true);return;}if(!confirm('Isso apagará todos os produtos, clientes, entradas e vendas deste navegador. Continuar?'))return;if(!confirm('Confirme mais uma vez. Só será possível recuperar com backup.'))return;data=emptyData();if(saveData()){resetProductForm();toast('Dados locais apagados.');}});
document.getElementById('gerarRelatorio').addEventListener('click',()=>{const a=document.getElementById('relatorioDataInicio').value,b=document.getElementById('relatorioDataFim').value;if(a&&b&&a>b){toast('A data inicial não pode ser posterior à data final.',true);return;}renderDateReport();});
['relatorioDataInicio','relatorioDataFim','relatorioTipo'].forEach(k=>document.getElementById(k).addEventListener('change',renderDateReport));
document.getElementById('exportarRelatorioCsv').addEventListener('click',()=>{const rows=getDateReportRows();const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const lines=[['Data e hora','Tipo','Produto','Quantidade','Valor','Cliente','Detalhes'].map(cell).join(';'),...rows.map(m=>[dateText(m.date),m.type==='venda'?'Venda':'Entrada',m.productName,m.quantity,Number(m.total||0).toFixed(2).replace('.',','),m.client||'',m.details||''].map(cell).join(';'))];const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`conceito-relatorio-${document.getElementById('relatorioDataInicio').value||'inicio'}-${document.getElementById('relatorioDataFim').value||'hoje'}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);});
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
 let admin=null, users=[], currentUser=null;
 try{admin=JSON.parse(localStorage.getItem(AUTH_KEY)||'null');}catch(e){admin=null;}
 try{users=JSON.parse(localStorage.getItem(USERS_KEY)||'[]');if(!Array.isArray(users))users=[];}catch(e){users=[];}
 const saveUsers=()=>localStorage.setItem(USERS_KEY,JSON.stringify(users));
 const normalized=s=>String(s||'').trim().toLowerCase();
 function showLogin(){gate.hidden=false;shell.hidden=true;loginForm.hidden=false;setupForm.hidden=true;showSetupButton.hidden=!!(admin&&admin.username&&admin.password);desc.textContent='Informe seu usuário e senha para continuar.';error.textContent='';userInput.focus();}
 function showSetup(){gate.hidden=false;shell.hidden=true;loginForm.hidden=true;setupForm.hidden=false;showSetupButton.hidden=true;desc.textContent='Crie o usuário ADMIN e uma senha para este navegador.';setupError.textContent='';document.getElementById('ckrSetupUser').focus();}
 showSetupButton.addEventListener('click',()=>{showSetup();});
 function updateExpiryStatus(){const el=document.getElementById('ckrExpiryStatus');if(!el)return;if(!currentUser||currentUser.role==='admin'){el.hidden=true;el.textContent='';return;}const found=users.find(u=>normalized(u.username)===normalized(currentUser.username));if(!found||!found.expiresAt){el.hidden=true;el.textContent='';return;}const remaining=new Date(found.expiresAt).getTime()-Date.now();if(remaining<=0){el.textContent='◷ Acesso expirado';el.hidden=false;el.classList.add('expired');return;}const days=Math.ceil(remaining/(24*60*60*1000));el.textContent='◷ '+days+' '+(days===1?'dia':'dias');el.hidden=false;el.classList.remove('expired');}
 function enter(user){currentUser=user;document.body.dataset.ckrRole=user.role;sessionStorage.setItem(SESSION_KEY,JSON.stringify({username:user.username,role:user.role}));gate.hidden=true;shell.hidden=false;document.getElementById('ckrUserAvatar').textContent=(user.username||'AD').trim().slice(0,2).toUpperCase();manageButton.hidden=user.role!=='admin';if(manageSidebar)manageSidebar.hidden=user.role!=='admin';document.querySelectorAll('[data-panel="backup"],[data-go="backup"]').forEach(el=>{el.hidden=user.role!=='admin';});updateExpiryStatus();const backupPanel=document.getElementById('panel-backup');if(backupPanel&&user.role!=='admin'&&backupPanel.classList.contains('active'))goTo('dashboard');agendarBackupMensalAutomatico();}
 function getValidUser(username,password){
   if(admin&&normalized(username)===normalized(admin.username)&&password===admin.password)return {username:admin.username,role:'admin'};
   const found=users.find(u=>normalized(u.username)===normalized(username));
   if(!found||found.password!==password)return null;
   if(found.expiresAt && Date.now()>=new Date(found.expiresAt).getTime())return {expired:true,username:found.username};
   return {username:found.username,role:'usuario'};
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
     name.textContent=u.username;
     const meta=document.createElement('small');
     meta.textContent=u.expiresAt?'Expira em '+new Date(u.expiresAt).toLocaleString('pt-BR'):'Prazo não definido';
     info.append(name,meta);

     const actions=document.createElement('div');
     const change=document.createElement('button');
     change.type='button';
     change.className='button';
     change.textContent='Alterar senha';
     change.addEventListener('click',()=>openPasswordChange(u.username));

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
     actions.append(change,del);
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
       const updatedAdmin={...admin,password:newPassword};
       localStorage.setItem(AUTH_KEY,JSON.stringify(updatedAdmin));
       admin=updatedAdmin;
     }else{
       const user=users.find(u=>normalized(u.username)===normalized(username));
       if(!user){err.textContent='Usuário não encontrado.';return;}
       const oldPassword=user.password;
       user.password=newPassword;
       try{saveUsers();}catch(saveError){user.password=oldPassword;throw saveError;}
     }
     hidePasswordChange();
     renderUsers();
     toast('Senha alterada com sucesso.');
   }catch(ex){
     err.textContent='Não foi possível salvar a nova senha neste navegador.';
   }
 });
 function openUsers(){
   if(!currentUser||currentUser.role!=='admin'){
     toast('Somente o ADMIN pode gerenciar usuários.',true);
     return;
   }
   hidePasswordChange();
   document.getElementById('ckrUsersError').textContent='';
   document.getElementById('ckrCreateUserForm').reset();
   renderUsers();
   usersModal.hidden=false;
   document.getElementById('ckrNewUsername').focus();
 }
 function closeUsers(){hidePasswordChange();usersModal.hidden=true;}
 manageButton.addEventListener('click',openUsers);if(manageSidebar)manageSidebar.addEventListener('click',openUsers);document.getElementById('ckrCloseUsers').addEventListener('click',closeUsers);usersModal.addEventListener('click',e=>{if(e.target===usersModal)closeUsers();});
 document.getElementById('ckrCreateUserForm').addEventListener('submit',e=>{e.preventDefault();const err=document.getElementById('ckrUsersError');err.textContent='';if(!currentUser||currentUser.role!=='admin'){err.textContent='Somente o ADMIN pode criar usuários.';return;}
   const username=document.getElementById('ckrNewUsername').value.trim(),password=document.getElementById('ckrNewPassword').value,confirmPassword=document.getElementById('ckrNewPasswordConfirm').value;
   if(username.length<3){err.textContent='O usuário precisa ter pelo menos 3 caracteres.';return;}if(password.length<6){err.textContent='A senha precisa ter pelo menos 6 caracteres.';return;}if(password!==confirmPassword){err.textContent='As senhas não coincidem.';return;}
   if(normalized(username)===normalized(admin.username)||users.some(u=>normalized(u.username)===normalized(username))){err.textContent='Esse nome de usuário já está cadastrado.';return;}
   const created=Date.now(), expiry=new Date(created+182.5*24*60*60*1000).toISOString();users.push({username,password,createdAt:new Date(created).toISOString(),expiresAt:expiry});
   try{saveUsers();renderUsers();e.target.reset();toast('Usuário criado. O acesso expira em 182,5 dias.');}catch(ex){users.pop();err.textContent='Não foi possível salvar o usuário neste navegador.';}
 });
 if(!admin||!admin.username||!admin.password){showSetup();}
 else if(sessionStorage.getItem(SESSION_KEY)){try{const sess=JSON.parse(sessionStorage.getItem(SESSION_KEY));const u=getValidUser(sess.username, sess.role==='admin'?admin.password:(users.find(x=>normalized(x.username)===normalized(sess.username))||{}).password);if(u&&!u.expired)enter(u);else{sessionStorage.removeItem(SESSION_KEY);showLogin();}}catch(e){showLogin();}}
 else{showLogin();}
 setupForm.addEventListener('submit',e=>{e.preventDefault();setupError.textContent='';const username=document.getElementById('ckrSetupUser').value.trim(),password=document.getElementById('ckrSetupPassword').value,confirmPassword=document.getElementById('ckrSetupConfirm').value;if(username.length<3){setupError.textContent='O usuário deve ter pelo menos 3 caracteres.';return;}if(password.length<6){setupError.textContent='A senha precisa ter pelo menos 6 caracteres.';return;}if(password!==confirmPassword){setupError.textContent='As senhas não são iguais.';return;}try{localStorage.setItem(AUTH_KEY,JSON.stringify({username,password}));admin={username,password};enter({username,role:'admin'});toast('Administrador criado neste navegador.');}catch(err){setupError.textContent='Não foi possível salvar as credenciais neste navegador.';}});
 loginForm.addEventListener('submit',e=>{e.preventDefault();error.textContent='';const username=userInput.value.trim(),password=passInput.value,u=getValidUser(username,password);if(u&&u.expired){error.textContent='O prazo de uso deste usuário terminou. Solicite ao ADMIN um novo acesso.';passInput.value='';return;}if(u){passInput.value='';enter(u);}else{error.textContent='Usuário ou senha incorretos.';passInput.value='';passInput.focus();}});
 setInterval(updateExpiryStatus,60000);
 document.getElementById('ckrLogout').addEventListener('click',()=>{sessionStorage.removeItem(SESSION_KEY);currentUser=null;updateExpiryStatus();delete document.body.dataset.ckrRole;closeUsers();showLogin();passInput.value='';});
})();
