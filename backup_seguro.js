'use strict';
// Conceito - Backup integral v1. Somente os procedimentos explícitos de exportação e restauração escrevem no navegador.
// O backup ZIP exige todos os XML referenciados, inclui fotos e passa por verificação CRC32 antes de restaurar.
(function(){
 const $=id=>document.getElementById(id);
 const REQUIRED_ARRAYS=['products','movements','customers','cashSessions','xmlImports','receivables','quotes','preorders','factoryLedger','factoryOrders','factoryCreditsManual','expenses','taxNotes','cashLedger'];
 const REQUIRED_OBJECTS=['productLinks','cashConfig','settings','taxCfg','taxAdj'];
 const DATE=()=>new Date().toISOString().slice(0,10);
 let busy=false;
 const state=s=>{for(const id of ['backupStatus','restoreStatus']){const x=$(id);if(x)x.textContent=s;}};
 function errText(e){return e&&e.message?String(e.message):String(e);}
 function fail(e){state('Operação não concluída: '+errText(e));toast('Backup: '+errText(e),true);}
 function isObj(x){return !!x&&typeof x==='object'&&!Array.isArray(x);}
 function validate(d){
  if(!isObj(d))throw Error('Arquivo sem objeto de dados válido');
  if(!Number.isSafeInteger(Number(d.version))||Number(d.version)<1||Number(d.version)>4)throw Error('Versão de dados não suportada');
  for(const k of REQUIRED_ARRAYS)if(!Array.isArray(d[k]))throw Error('Backup incompleto: campo '+k+' ausente ou inválido');
  for(const k of REQUIRED_OBJECTS)if(!isObj(d[k]))throw Error('Backup incompleto: campo '+k+' ausente ou inválido');
  if(d.expenseCatalog!==undefined&&!Array.isArray(d.expenseCatalog))throw Error('Catálogo de despesas inválido');
  if(d.productPhotos!==undefined&&!isObj(d.productPhotos))throw Error('Fotos de produtos inválidas');
  for(const p of d.products)if(!isObj(p)||!String(p.id||'').trim()||!String(p.name||'').trim()||!Number.isFinite(Number(p.stock))||Number(p.stock)<0)throw Error('Produto inválido no backup');
  for(const a of d.xmlImports)if(!isObj(a)||!String(a.key||'').trim())throw Error('Importação XML sem chave');
  if(d.cashConfig.start&&!/^\d{4}-\d{2}-\d{2}$/.test(d.cashConfig.start))throw Error('Data de corte inválida');
  return d;
 }
 const crcTable=(()=>{const t=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[i]=c>>>0;}return t;})();
 function crc32(txt){const bytes=new TextEncoder().encode(txt);let c=0xFFFFFFFF;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return ((c^0xFFFFFFFF)>>>0).toString(16).padStart(8,'0');}
 const cloneData=d=>JSON.parse(JSON.stringify(d));
 async function photos(){if(typeof window.ckrBackupFotos!=='function')throw Error('Módulo de fotografias não disponível');return window.ckrBackupFotos();}
 async function xmlAll(){if(typeof window.ckrBackupLerXML!=='function')throw Error('Módulo de XML não disponível');return window.ckrBackupLerXML();}
 function ensureXML(d,items){
  const map=new Map(items.map(x=>[x.key,x.text]));
  for(const imp of d.xmlImports)if(!map.has(String(imp.key))||typeof map.get(String(imp.key))!=='string'||!map.get(String(imp.key)).trim().startsWith('<')){
    throw Error('XML original da nota '+String(imp.number||imp.key)+' não encontrado. O backup completo não foi gerado.');
  }
 }
 async function zipFromSource(src,photoMap,xmlItems){
  if(!window.JSZip)throw Error('Biblioteca ZIP não carregada. Verifique a conexão e recarregue a página');
  const d=validate({...cloneData(src),productPhotos:photoMap,exportedAt:new Date().toISOString()});
  ensureXML(d,xmlItems);
  const z=new JSZip();const json=JSON.stringify(d,null,2);z.file('dados.json',json);
  const manifest={format:'conceito-backup-integral',formatVersion:1,exportedAt:d.exportedAt,dataVersion:d.version,financialRecords:{products:d.products.length,movements:d.movements.length,expenses:d.expenses.length,cashLedger:d.cashLedger.length,preorders:d.preorders.length,receivables:d.receivables.length,xmlImports:d.xmlImports.length},productPhotos:Object.keys(photoMap).length,files:[{path:'dados.json',crc32:crc32(json),bytes:new TextEncoder().encode(json).length}],xml:[]};
  xmlItems.forEach((it,i)=>{
    if(!it||typeof it.key!=='string'||!it.key||typeof it.text!=='string'||!it.text.trim().startsWith('<'))throw Error('Documento XML inválido no armazenamento');
    const path='xml/'+String(i+1).padStart(5,'0')+'.xml';z.file(path,it.text);
    manifest.xml.push({key:it.key,path});manifest.files.push({path,crc32:crc32(it.text),bytes:new TextEncoder().encode(it.text).length});
  });
  z.file('manifesto.json',JSON.stringify(manifest,null,2));
  return {blob:await z.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}}),manifest};
 }
 function countText(m){return `${m.financialRecords.movements} movimentações, ${m.financialRecords.expenses} despesas, ${m.productPhotos} fotos e ${m.xml.length} XML`}
 async function saveZip(pkg,name){const message=await ckrSaveFile(name,pkg.blob,'application/zip');if(/cancelad/i.test(String(message)))throw Error('Salvamento cancelado');return message;}

 // Reanexa documento XML perdido, exclusivamente a uma NF-e já importada.
 // Nenhuma compra é reimportada e nenhum lançamento financeiro é modificado.
 window.ckrReporXMLOriginal=async()=>{
  if(!isAdminRole()){toast('Somente ADMIN pode repor documentos fiscais.',true);return;}
  if(busy)return;
  const el=$('reporArquivoXML'),file=el&&el.files&&el.files[0];
  if(!file){state('Escolha o XML original que deseja recuperar.');return;}
  busy=true;
  try{
   if(window.ckrStorageCorrompido)throw Error('Armazenamento financeiro ilegível; recuperação bloqueada');
   if(file.size>5*1024*1024)throw Error('O arquivo XML ultrapassa o limite de 5 MB');
   const xml=await file.text();
   const doc=new DOMParser().parseFromString(xml,'application/xml');
   if(doc.getElementsByTagName('parsererror').length)throw Error('O documento não é um XML válido');
   const tag=(parent,n)=>{
    if(!parent)return '';
    for(const el of parent.getElementsByTagNameNS('*',n))return String(el.textContent||'').trim();
    return '';
   };
   const info=doc.getElementsByTagNameNS('*','infNFe')[0];
   const ide=doc.getElementsByTagNameNS('*','ide')[0];
   const total=doc.getElementsByTagNameNS('*','ICMSTot')[0];
   const protocolo=doc.getElementsByTagNameNS('*','infProt')[0];
   if(!info||!ide||!total||!protocolo)throw Error('Escolha uma NF-e processada e autorizada (nfeProc)');
   const key=String(info.getAttribute('Id')||'').replace(/^NFe/,'');
   const nf=tag(ide,'nNF'),serie=tag(ide,'serie'),valor=Number(tag(total,'vNF'));
   if(!/^\d{44}$/.test(key)||tag(protocolo,'chNFe')!==key||tag(protocolo,'cStat')!=='100')throw Error('Chave ou protocolo de autorização não confere');
   const imp=(data.xmlImports||[]).find(x=>String(x.key)===key);
   if(!imp)throw Error('Essa NF-e não consta nas importações atuais. NÃO use o recurso de recuperação para cadastrar novas compras');
   if(String(imp.number)!==String(nf)||String(imp.serie)!==String(serie)||!Number.isFinite(valor)||Math.abs(Number(imp.total)-valor)>.005)throw Error('Número, série ou valor do XML não coincidem com a importação existente');
   if(typeof window.ckrBackupLerXML!=='function'||typeof window.ckrBackupReporXML!=='function')throw Error('O módulo de documentos fiscais não está atualizado');
   const exists=(await window.ckrBackupLerXML()).find(x=>x.key===key);
   if(exists&&exists.text&&exists.text.trim()){
    state('O XML da NF-e nº '+nf+' já está armazenado. Nenhum dado foi alterado.');return;
   }
   await window.ckrBackupReporXML(key,xml);
   const confirmed=(await window.ckrBackupLerXML()).find(x=>x.key===key);
   if(!confirmed||confirmed.text!==xml)throw Error('O XML não pôde ser confirmado após a gravação');
   el.value='';
   state('XML original da NF-e nº '+nf+' recuperado com sucesso. Sem alterações em estoque, vendas ou Caixa. Agora tente gerar o backup completo.');
   toast('Documento XML vinculado à importação existente.');
  }catch(e){fail(e);}finally{busy=false;}
 };
 const repor=$('reporBotaoXML');if(repor)repor.addEventListener('click',()=>window.ckrReporXMLOriginal());
 window.ckrExportarBackupCompleto=async()=>{
  if(!document.body.dataset.ckrRole){toast('Entre no sistema para fazer backup.',true);return;}
  if(busy){toast('Já existe uma operação de backup em andamento.',true);return;}
  busy=true;try{
   if(window.ckrStorageCorrompido)throw Error('Dados locais ilegíveis: não gere backup normal. Preserve o arquivo antigo e restaure uma cópia válida');
   state('Verificando dados, fotos e documentos XML...');
   const pkg=await zipFromSource(data,await photos(),await xmlAll());
   state('Gerando arquivo completo...');const message=await saveZip(pkg,'conceito-backup-completo-'+DATE()+'.zip');
   state('ZIP preparado: '+countText(pkg.manifest)+'. Guarde-o também fora deste dispositivo.');toast(message);
  }catch(e){fail(e);}finally{busy=false;}
 };
 window.ckrExportarBackupJson=async()=>{
  if(!document.body.dataset.ckrRole){toast('Entre no sistema para fazer backup.',true);return;}
  if(busy)return;
  busy=true;try{
   if(window.ckrStorageCorrompido)throw Error('Dados locais ilegíveis');
   const d=validate({...cloneData(data),productPhotos:await photos(),exportedAt:new Date().toISOString()});
   const msg=await ckrSaveFile('conceito-backup-somente-dados-'+DATE()+'.json',JSON.stringify(d,null,2),'application/json');
   if(/cancelad/i.test(String(msg)))throw Error('Salvamento cancelado');
   state('JSON exportado. AVISO: esta opção não inclui XML originais das notas.');toast(msg);
  }catch(e){fail(e);}finally{busy=false;}
 };
 window.ckrCopiarBackupTexto=async()=>{
  if(!document.body.dataset.ckrRole){toast('Entre no sistema para fazer backup.',true);return;}
  if(busy)return;
  busy=true;try{
   if(window.ckrStorageCorrompido)throw Error('Dados locais ilegíveis');
   const d=validate({...cloneData(data),productPhotos:await photos(),exportedAt:new Date().toISOString()});
   const code='CKR1:'+ckrToB64(JSON.stringify(d));
   try{await navigator.clipboard.writeText(code);state('Texto copiado, SEM XML das notas fiscais.');toast('Dados copiados. Este formato não contém XML.');}
   catch(_){$('textoBackup').value=code;$('textoBackup').select();state('Copie manualmente o texto selecionado. Não contém XML.');toast('Copie manualmente o texto selecionado.',true);}
  }catch(e){fail(e);}finally{busy=false;}
 };
 async function unpackZip(file){
  if(!window.JSZip)throw Error('Biblioteca ZIP indisponível');
  const z=await JSZip.loadAsync(file,{checkCRC32:true});
  const mf=z.file('manifesto.json');if(!mf)throw Error('ZIP não contém manifesto de integridade');
  const m=JSON.parse(await mf.async('string'));
  if(m.format!=='conceito-backup-integral'||m.formatVersion!==1||!Array.isArray(m.files)||!Array.isArray(m.xml)||!isObj(m.financialRecords))throw Error('Formato de backup ZIP desconhecido');
  const contents={};
  for(const f of m.files){
   if(!f||!/^dados\.json$|^xml\/\d{5}\.xml$/.test(f.path)||!z.file(f.path)||Object.hasOwn(contents,f.path))throw Error('Arquivo não listado ou duplicado no ZIP');
   const str=await z.file(f.path).async('string');
   if(crc32(str)!==f.crc32||new TextEncoder().encode(str).length!==f.bytes)throw Error('Falha na verificação de integridade de '+f.path);
   contents[f.path]=str;
  }
  if(!Object.hasOwn(contents,'dados.json')||m.files.length!==m.xml.length+1)throw Error('Arquivo ZIP incompleto');
  const d=validate(JSON.parse(contents['dados.json']));
  if(Object.keys(d.productPhotos||{}).length!==m.productPhotos||d.xmlImports.length!==m.financialRecords.xmlImports||d.products.length!==m.financialRecords.products||d.movements.length!==m.financialRecords.movements||d.expenses.length!==m.financialRecords.expenses||d.cashLedger.length!==m.financialRecords.cashLedger||d.preorders.length!==m.financialRecords.preorders||d.receivables.length!==m.financialRecords.receivables)throw Error('As contagens do manifesto não conferem');
  const keys=new Set(),xml=m.xml.map(x=>{
   if(!x||typeof x.key!=='string'||!x.key||!Object.hasOwn(contents,x.path)||keys.has(x.key))throw Error('Relação de XML inválida');
   keys.add(x.key);return {key:x.key,text:contents[x.path]};
  });
  ensureXML(d,xml);
  const archiveXml=Object.keys(z.files).filter(n=>/^xml\//.test(n)&&!z.files[n].dir);
  if(archiveXml.length!==m.xml.length)throw Error('O ZIP tem XML não identificados no manifesto');
  return {d,xml,full:true,m};
 }
 async function readSelected(){
  const file=$('arquivoBackup').files[0],pasted=$('textoBackup').value.trim();
  if(!file&&!pasted)throw Error('Escolha um arquivo ZIP, JSON ou cole um texto de backup');
  if(file&&(/\.zip$/i.test(file.name)||file.type==='application/zip'))return unpackZip(file);
  const d=validate(ckrParseBackup(file?await file.text():pasted));return {d,xml:null,full:false};
 }
 window.ckrVerificarBackupSeguro=async()=>{
  if(!isAdminRole()){toast('Somente ADMIN pode verificar para restauração.',true);return;}
  if(busy)return;busy=true;
  try{state('Verificando o arquivo selecionado...');const t=await readSelected();state(t.full?('Arquivo íntegro: '+countText(t.m)+'. Nenhum dado foi alterado.'):'JSON válido: contém os registros financeiros, mas não os XML originais. Nenhum dado foi alterado.');toast('Verificação concluída. Nenhum dado foi alterado.');}
  catch(e){fail(e);}finally{busy=false;}
 };
 async function protectBeforeRestore(){
  if(window.ckrStorageCorrompido){
   const old=localStorage.getItem(STORAGE_KEY)||'';
   if(old){const msg=await ckrSaveFile('conceito-dados-ilegíveis-antes-restauracao-'+DATE()+'.txt',old,'text/plain');if(/cancelad/i.test(String(msg)))throw Error('Cópia preventiva cancelada');}
   return 'Cópia do conteúdo ilegível gerada';
  }
  const snap=await zipFromSource(data,await photos(),await xmlAll());
  const msg=await saveZip(snap,'conceito-ANTES-DA-RESTAURACAO-'+DATE()+'.zip');
  return msg;
 }
 window.ckrRestaurarBackupSeguro=async()=>{
  if(!isAdminRole()){toast('Somente ADMIN pode restaurar backup.',true);return;}
  if(busy)return;
  busy=true;
  try{
   state('Validando arquivo sem modificar os dados atuais...');
   const target=await readSelected();
   if(!target.full&&!confirm('Este backup antigo em JSON/TXT NÃO contém XML originais. As fotos existentes serão preservadas caso o arquivo não inclua imagens. Deseja continuar com essa limitação?')){state('Restauração cancelada.');return;}
   if(!confirm('Arquivo validado. A restauração irá SUBSTITUIR os dados financeiros deste dispositivo. Deseja iniciar a cópia preventiva obrigatória?')){state('Restauração cancelada.');return;}
   state('Gerando cópia de segurança dos dados atuais...');await protectBeforeRestore();
   if(!confirm('Confirme que você SALVOU a cópia preventiva em local seguro. Só então os dados atuais poderão ser substituídos. Prosseguir?')){state('Nenhum dado alterado.');return;}
   const oldRaw=localStorage.getItem(STORAGE_KEY),oldData=data,oldLock=!!window.ckrStorageCorrompido;
   const oldPhotos=await photos(),oldXML=await xmlAll();
   const imported=cloneData(target.d);delete imported.productPhotos;delete imported.exportedAt;
   let commitStarted=false;
   try{
    // Os três armazenamentos têm suas cópias em memória para eventual reversão.
    const serialized=JSON.stringify(imported);
    localStorage.setItem(STORAGE_KEY,serialized);
    commitStarted=true;
    if(localStorage.getItem(STORAGE_KEY)!==serialized)throw Error('Falha na conferência da gravação local');
    data=imported;window.ckrStorageCorrompido=false;
    if(target.full)await window.ckrBackupSubstituirXML(target.xml);
    if(target.d.productPhotos!==undefined)await window.pfRestore(target.d.productPhotos);
    renderAll();resetProductForm();$('arquivoBackup').value='';$('textoBackup').value='';
    state('Restauração concluída e validada. Recarregue a página para atualizar todos os módulos.');
    alert('Backup restaurado. Recarregue a página (Ctrl+F5) para atualizar todos os módulos.');
   }catch(e){
    let rollbackErr='';
    if(commitStarted){
     try{if(oldRaw===null)localStorage.removeItem(STORAGE_KEY);else localStorage.setItem(STORAGE_KEY,oldRaw);data=oldData;window.ckrStorageCorrompido=oldLock;}catch(x){rollbackErr+=' Armazenamento local: '+errText(x);}
     try{if(target.full)await window.ckrBackupSubstituirXML(oldXML);}catch(x){rollbackErr+=' XML: '+errText(x);}
     try{if(target.d.productPhotos!==undefined)await window.pfRestore(oldPhotos);}catch(x){rollbackErr+=' Fotos: '+errText(x);}
     try{renderAll();}catch(_){}
    }
    throw Error('Restauração interrompida. '+errText(e)+(rollbackErr?' ATENÇÃO: reversão incompleta.'+rollbackErr:' Os dados anteriores foram mantidos/repostos.'));
   }
  }catch(e){fail(e);}finally{busy=false;}
 };
 if(window.ckrStorageCorrompido){
  const banner=document.createElement('div');banner.setAttribute('role','alert');banner.style.cssText='position:fixed;bottom:12px;left:12px;right:12px;z-index:99999;padding:16px;background:#fff4e6;color:#7c2800;border:2px solid #c35911;border-radius:8px;box-shadow:0 6px 30px #0003;font:600 14px Arial,sans-serif';
  banner.textContent='ATENÇÃO: os dados locais não puderam ser lidos. Gravações bloqueadas para preservar o conteúdo original. Abra Backup e transferência e restaure uma cópia válida.';
  document.body.appendChild(banner);state('Dados ilegíveis: gravações bloqueadas. Restaure um backup válido.');
 }
})();
