const $ = (sel, el=document) => el.querySelector(sel);

function bytesToB64(bytes){
  let bin="";
  bytes.forEach(b=>bin += String.fromCharCode(b));
  return btoa(bin);
}
function cleanKey(str){
  return (str||"").trim().replace(/\s+/g,'').toUpperCase();
}
function isoNoMsUTC(d=new Date()){
  return d.toISOString().replace(/\.\d{3}Z$/,'Z');
}

function downloadText(filename, text){
  const blob = new Blob([text], {type:"application/octet-stream"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 3000);
}

function loadHistory(){
  try{ return JSON.parse(localStorage.getItem("primedesk_emissor_history")||"[]"); }
  catch{ return []; }
}
function saveHistory(items){
  localStorage.setItem("primedesk_emissor_history", JSON.stringify(items));
}
function addHistory(item){
  const items = loadHistory();
  items.unshift(item);
  saveHistory(items);
}

function fmtBR(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString("pt-BR");
  }catch{ return iso||""; }
}

function renderHistory(){
  const body = $("#histBody");
  if(!body) return;

  const items = loadHistory();
  body.innerHTML = items.map(x=>`
    <tr data-id="${x.id}">
      <td>${fmtBR(x.emittedAt)}</td>
      <td>${(x.customer||"").replace(/</g,"&lt;")}</td>
      <td class="mono">${(x.hwid||"").replace(/</g,"&lt;")}</td>
      <td>${(x.expiresOn||"—")}</td>
      <td class="mono">${(x.filename||"")}</td>
      <td>
        <button class="btn small" data-act="download">Baixar</button>
        <button class="btn small danger" data-act="delete">Apagar</button>
      </td>
    </tr>
  `).join("");

  body.querySelectorAll("tr").forEach(tr=>{
    tr.addEventListener("click", (ev)=>{
      const btn = ev.target.closest("button[data-act]");
      if(!btn) return;
      ev.stopPropagation();
      const act = btn.dataset.act;
      const id = tr.dataset.id;
      const items = loadHistory();
      const idx = items.findIndex(y=>y.id===id);
      if(idx<0) return;
      if(act==="download"){
        downloadText(items[idx].filename, items[idx].licenseText);
      }else if(act==="delete"){
        items.splice(idx,1);
        saveHistory(items);
        renderHistory();
      }
    });
  });
}

let CONFIG = null;
let SIGN_KEY = null;

function setStatus(ok, text){
  const dot = $("#statusDot");
  const st  = $("#statusText");
  if(dot){
    dot.classList.toggle("ok", !!ok);
    dot.classList.toggle("bad", !ok);
  }
  if(st) st.textContent = text;
}

async function loadConfig(){
  // Fallback embutido (caso o host bloqueie JSON / caminho diferente)
  const fallback = {
    password: "PRIMEDESK123",
    schema_version: 2,
    defaults: { product:"PrimeDesk", edition:"Pro", customer:"" }
  };

  try{
    const res = await fetch("./config.json", {cache:"no-store"});
    if(!res.ok) throw new Error("HTTP " + res.status);
    CONFIG = await res.json();
  }catch(e){
    console.warn("Falha ao carregar config.json, usando fallback:", e);
    CONFIG = fallback;
  }

  // Preenche defaults (se existirem campos)
  const customer = $("#customer");
  const edition  = $("#edition");
  if(customer) customer.value = CONFIG.defaults?.customer || "";
  if(edition)  edition.value  = CONFIG.defaults?.edition  || "Pro";
}

async function importPrivateKeyFromXml(xmlText){
  // Converte RSA XML (RSAParameters) para CryptoKey
  const get = (tag) => {
    const m = xmlText.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
    return m ? m[1].trim() : "";
  };
  const modulusB64 = get("Modulus");
  const exponentB64 = get("Exponent");
  const dB64  = get("D");
  const pB64  = get("P");
  const qB64  = get("Q");
  const dpB64 = get("DP");
  const dqB64 = get("DQ");
  const iqB64 = get("InverseQ");

  const jwk = {
    kty: "RSA",
    n: modulusB64.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""),
    e: exponentB64.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""),
    d: dB64.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""),
    p: pB64.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""),
    q: qB64.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""),
    dp: dpB64.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""),
    dq: dqB64.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""),
    qi: iqB64.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""),
    alg: "RS256",
    ext: true,
  };

  return crypto.subtle.importKey(
    "jwk",
    jwk,
    {name:"RSASSA-PKCS1-v1_5", hash:"SHA-256"},
    false,
    ["sign"]
  );
}

async function rsaSign(text){
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const sig = await crypto.subtle.sign({name:"RSASSA-PKCS1-v1_5"}, SIGN_KEY, data);
  return bytesToB64(new Uint8Array(sig));
}

async function login(){
  const pwdEl = $("#password");
  const pwd = (pwdEl?.value || "").trim();
  if(!pwd) return alert("Digite a senha.");
  if(pwd !== (CONFIG.password || "")) return alert("Senha incorreta.");

  const res = await fetch("./primdesk_rsa_private.xml", {cache:"no-store"});
  if(!res.ok) return alert("Não consegui carregar primdesk_rsa_private.xml. Verifique se ele está no mesmo diretório do EmissorWeb.");
  const xmlText = await res.text();

  try{
    SIGN_KEY = await importPrivateKeyFromXml(xmlText);
  }catch(e){
    console.error(e);
    return alert("Falha ao importar a chave privada RSA (XML).");
  }

  $("#loginModal")?.classList.remove("open");
  setStatus(true, "Pronto para emitir");
}

function needLogin(){
  if(!SIGN_KEY){
    $("#loginModal")?.classList.add("open");
    alert("Faça login primeiro.");
    return true;
  }
  return false;
}

function ensureHistoryHandlers(){
  // abrir/fechar modal de histórico
  $("#btnHistory")?.addEventListener("click", ()=>{
    $("#historyModal")?.classList.add("open");
    renderHistory();
  });
  $("#btnCloseHistory")?.addEventListener("click", ()=>{
    $("#historyModal")?.classList.remove("open");
  });

  // export/import/limpar dentro do modal
  $("#btnExport")?.addEventListener("click", ()=>{
    const data = JSON.stringify(loadHistory(), null, 2);
    downloadText(`historico_licencas_${new Date().toISOString().slice(0,10)}.json`, data);
  });

  $("#importFile")?.addEventListener("change", async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    const text = await file.text();
    let arr;
    try{ arr = JSON.parse(text); }catch{ return alert("Arquivo inválido."); }
    if(!Array.isArray(arr)) return alert("Arquivo inválido.");
    saveHistory(arr);
    renderHistory();
    e.target.value = "";
  });

  $("#btnClear")?.addEventListener("click", ()=>{
    if(!confirm("Limpar o histórico deste navegador?")) return;
    saveHistory([]);
    renderHistory();
  });

  // fechar modal clicando fora
  ["loginModal","historyModal"].forEach(id=>{
    const modal = document.getElementById(id);
    if(!modal) return;
    modal.addEventListener("click", (ev)=>{
      if(ev.target === modal) modal.classList.remove("open");
    });
  });
}

async function generateLicense(){
  if(needLogin()) return;

  const hwid = cleanKey($("#hwid")?.value);
  if(!hwid) return alert("Cole a KEY do cliente.");

  const expiresOn = ($("#expiresOn")?.value || "").trim(); // yyyy-mm-dd
  if(!expiresOn) return alert("Informe a validade (data).");

  const customer = ($("#customer")?.value || "").trim();
  const edition  = ($("#edition")?.value  || "").trim() || "Pro";

  // payload v2 (sem features / sem datetime de expiração)
  const payload = {
    schema_version: 2,
    product: CONFIG.defaults?.product || "PrimeDesk",
    edition,
    customer,
    hwid,
    expires_on: expiresOn,
    issued_at: isoNoMsUTC(new Date()),
  };

  const payloadJson = JSON.stringify(payload);
  const sigB64 = await rsaSign(payloadJson);
  const finalObj = {...payload, sig: sigB64};

  const fileName = "primedesk.lic";
  const fileText = JSON.stringify(finalObj, null, 2);

  downloadText(fileName, fileText);

  addHistory({
    id: crypto.randomUUID(),
    emittedAt: new Date().toISOString(),
    customer,
    hwid,
    expiresOn,
    filename: fileName,
    licenseText: fileText,
  });

  $("#hwid").value = "";
}

async function main(){
  setStatus(false, "Carregando…");
  await loadConfig();

  // sempre pede login (mas se preferir, você pode deixar para quando clicar)
  setStatus(false, "Bloqueado (senha)");
  $("#loginModal")?.classList.add("open");

  $("#btnLogin")?.addEventListener("click", login);
  $("#password")?.addEventListener("keydown", (e)=>{
    if(e.key==="Enter") login();
  });

  $("#btnEmit")?.addEventListener("click", generateLicense);

  ensureHistoryHandlers();
}

document.addEventListener("DOMContentLoaded", main);
