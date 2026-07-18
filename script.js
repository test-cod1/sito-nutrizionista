const GIORNI = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const GIORNI_FERIALI = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì"];
const GIORNI_WEEKEND = ["Sabato", "Domenica"];
const PASTI = ["Colazione", "Spuntino mattina", "Pranzo", "Merenda", "Cena"];
const TEMA_KEY = "dieta-nutrizionista-tema";

let baseAlimenti = [];
let customFoodsRemoti = [];
let foodMap = new Map();
let foodNames = [];
let currentCalc = null;
let suggestionIndex = -1;
let draftPasto = [];
let collapsedGiorni = new Set();
let duplicaContesto = null;

let supabaseClient = null;
let sessioneUtente = null;
let listaPazienti = [];
let pazienteCorrente = null; // { id, nome }
let dietaCorrenteId = null;

function creaDietaVuota() {
  const dieta = {};
  GIORNI.forEach(giorno => {
    dieta[giorno] = {};
    PASTI.forEach(pasto => {
      dieta[giorno][pasto] = [];
    });
  });
  return dieta;
}

function creaStatoVuoto() {
  return {
    maxKcal: null,
    dieta: creaDietaVuota(),
    sostituzioni: "",
    infoStudio: "",
    validoDal: "",
    validoAl: ""
  };
}

let state = creaStatoVuoto();

function applicaDatiDieta(dati) {
  dati = dati || {};
  state.maxKcal = dati.maxKcal ?? null;
  state.dieta = dati.dieta ?? creaDietaVuota();
  state.sostituzioni = dati.sostituzioni ?? "";
  state.infoStudio = dati.infoStudio ?? "";
  state.validoDal = dati.validoDal ?? "";
  state.validoAl = dati.validoAl ?? "";
}

async function salvaStateRemoto() {
  if (!dietaCorrenteId) return;
  const dati = {
    maxKcal: state.maxKcal,
    dieta: state.dieta,
    sostituzioni: state.sostituzioni,
    infoStudio: state.infoStudio,
    validoDal: state.validoDal,
    validoAl: state.validoAl
  };
  const { error } = await supabaseClient
    .from("diete")
    .update({ dati, updated_at: new Date().toISOString() })
    .eq("id", dietaCorrenteId);
  if (error) {
    console.error("Errore nel salvataggio della dieta:", error);
  }
}

// Elementi DOM
const foodInput = document.getElementById("food-input");
const suggestions = document.getElementById("suggestions");
const foodError = document.getElementById("food-error");
const gramsInput = document.getElementById("grams-input");
const notaInput = document.getElementById("nota-input");
const porzioneCheck = document.getElementById("porzione-check");
const porzioneInput = document.getElementById("porzione-input");
const preview = document.getElementById("preview");
const previewKcal = document.getElementById("preview-kcal");
const previewProt = document.getElementById("preview-prot");
const previewFat = document.getElementById("preview-fat");
const previewCarb = document.getElementById("preview-carb");
const addDraftBtn = document.getElementById("add-draft-btn");

const draftContainer = document.getElementById("draft-container");
const confermaGiorniCheckbox = document.getElementById("conferma-giorni-checkbox");
const giorniDropdownBtn = document.getElementById("giorni-dropdown-btn");
const giorniDropdownPanel = document.getElementById("giorni-dropdown-panel");
const pastoSelect = document.getElementById("pasto-select");
const confermaPastoBtn = document.getElementById("conferma-pasto-btn");
const svuotaPastoBtn = document.getElementById("svuota-pasto-btn");
const liberoKcalInput = document.getElementById("libero-kcal-input");
const liberoNotaInput = document.getElementById("libero-nota-input");
const pastoLiberoBtn = document.getElementById("pasto-libero-btn");

const nuovoAlimentoBtn = document.getElementById("nuovo-alimento-btn");
const nuovoAlimentoForm = document.getElementById("nuovo-alimento-form");
const nuovoNomeInput = document.getElementById("nuovo-nome");
const nuovoKcalInput = document.getElementById("nuovo-kcal");
const nuovoProtInput = document.getElementById("nuovo-prot");
const nuovoFatInput = document.getElementById("nuovo-fat");
const nuovoCarbInput = document.getElementById("nuovo-carb");
const nuovoAlimentoError = document.getElementById("nuovo-alimento-error");
const salvaAlimentoBtn = document.getElementById("salva-alimento-btn");
const annullaAlimentoBtn = document.getElementById("annulla-alimento-btn");

const temaChiaroBtn = document.getElementById("tema-chiaro-btn");
const temaNotteBtn = document.getElementById("tema-notte-btn");

const maxKcalInput = document.getElementById("max-kcal-input");
const impostazioniStampaToggle = document.getElementById("impostazioni-stampa-toggle");
const impostazioniStampaContenuto = document.getElementById("impostazioni-stampa-contenuto");
const sostituzioniInput = document.getElementById("sostituzioni-input");
const infoStudioInput = document.getElementById("info-studio-input");
const validoDalInput = document.getElementById("valido-dal-input");
const validoAlInput = document.getElementById("valido-al-input");
const dietaContainer = document.getElementById("dieta-container");
const panoramicaToggle = document.getElementById("panoramica-toggle");
const panoramicaContenuto = document.getElementById("panoramica-contenuto");
const panoramicaGriglia = document.getElementById("panoramica-griglia");
const pdfDietaBtn = document.getElementById("pdf-dieta-btn");
const pdfSpesaBtn = document.getElementById("pdf-spesa-btn");
const pdfNutrizionistaBtn = document.getElementById("pdf-nutrizionista-btn");
const salvaStoricoBtn = document.getElementById("salva-storico-btn");
const resetBtn = document.getElementById("reset-btn");
const printRunningTitle = document.getElementById("print-running-title");
const printRunningMeta = document.getElementById("print-running-meta");
const printRunningFooter = document.getElementById("print-running-footer");
const printContent = document.getElementById("print-content");

const duplicaOverlay = document.getElementById("duplica-overlay");
const duplicaTitolo = document.getElementById("duplica-titolo");
const duplicaSottotitolo = document.getElementById("duplica-sottotitolo");
const duplicaGiorniCheckbox = document.getElementById("duplica-giorni-checkbox");
const duplicaConfermaBtn = document.getElementById("duplica-conferma-btn");
const duplicaAnnullaBtn = document.getElementById("duplica-annulla-btn");

// Login / pazienti / storico
const loginOverlay = document.getElementById("login-overlay");
const loginEmailInput = document.getElementById("login-email");
const loginPasswordInput = document.getElementById("login-password");
const loginError = document.getElementById("login-error");
const loginBtn = document.getElementById("login-btn");

const appShell = document.getElementById("app-shell");
const areaLavoro = document.getElementById("area-lavoro");
const pazienteSelect = document.getElementById("paziente-select");
const nuovoPazienteBtn = document.getElementById("nuovo-paziente-btn");
const storicoBtn = document.getElementById("storico-btn");
const profiloBtn = document.getElementById("profilo-btn");
const logoutBtn = document.getElementById("logout-btn");

const nuovoPazienteOverlay = document.getElementById("nuovo-paziente-overlay");
const nuovoPazienteNomeInput = document.getElementById("nuovo-paziente-nome");
const nuovoPazienteError = document.getElementById("nuovo-paziente-error");
const nuovoPazienteConfermaBtn = document.getElementById("nuovo-paziente-conferma-btn");
const nuovoPazienteAnnullaBtn = document.getElementById("nuovo-paziente-annulla-btn");

const storicoOverlay = document.getElementById("storico-overlay");
const storicoPazienteNomeEl = document.getElementById("storico-paziente-nome");
const storicoLista = document.getElementById("storico-lista");
const storicoChiudiBtn = document.getElementById("storico-chiudi-btn");

const profiloOverlay = document.getElementById("profilo-overlay");
const profiloPazienteNomeEl = document.getElementById("profilo-paziente-nome");
const profiloDataNascitaInput = document.getElementById("profilo-data-nascita");
const profiloSessoInput = document.getElementById("profilo-sesso");
const profiloAltezzaInput = document.getElementById("profilo-altezza");
const profiloPesoInput = document.getElementById("profilo-peso");
const profiloAttivitaInput = document.getElementById("profilo-attivita");
const profiloTelefonoInput = document.getElementById("profilo-telefono");
const profiloEmailInput = document.getElementById("profilo-email");
const profiloAllergieInput = document.getElementById("profilo-allergie");
const profiloNoteInput = document.getElementById("profilo-note");
const profiloSalvaBtn = document.getElementById("profilo-salva-btn");
const profiloAnnullaBtn = document.getElementById("profilo-annulla-btn");

// Recupero password
const recuperoPasswordLink = document.getElementById("recupero-password-link");
const recuperoPasswordOverlay = document.getElementById("recupero-password-overlay");
const recuperoEmailInput = document.getElementById("recupero-email-input");
const recuperoError = document.getElementById("recupero-error");
const recuperoSuccesso = document.getElementById("recupero-successo");
const recuperoInviaBtn = document.getElementById("recupero-invia-btn");
const recuperoAnnullaBtn = document.getElementById("recupero-annulla-btn");

// Imposta password (primo accesso dopo invito)
const impostaPasswordOverlay = document.getElementById("imposta-password-overlay");
const nuovaPasswordInput = document.getElementById("nuova-password-input");
const impostaPasswordError = document.getElementById("imposta-password-error");
const impostaPasswordBtn = document.getElementById("imposta-password-btn");

// Gestione utenti (admin)
const gestioneUtentiToggle = document.getElementById("gestione-utenti-toggle");
const gestioneUtentiContenuto = document.getElementById("gestione-utenti-contenuto");
const invitoEmailInput = document.getElementById("invito-email");
const invitoRuoloSelect = document.getElementById("invito-ruolo");
const invitoPazienteBlocco = document.getElementById("invito-paziente-blocco");
const invitoPazienteSelect = document.getElementById("invito-paziente-select");
const invitoNuovoPazienteBlocco = document.getElementById("invito-nuovo-paziente-blocco");
const invitoNuovoPazienteNomeInput = document.getElementById("invito-nuovo-paziente-nome");
const invitoError = document.getElementById("invito-error");
const invitoSuccesso = document.getElementById("invito-successo");
const invitoInviaBtn = document.getElementById("invito-invia-btn");

// Vista paziente (sola lettura)
const vistaPaziente = document.getElementById("vista-paziente");
const vistaPazienteNomeEl = document.getElementById("vista-paziente-nome");
const pazienteProfiloVista = document.getElementById("paziente-profilo-vista");
const pazienteDietaVista = document.getElementById("paziente-dieta-vista");
const pazientePdfBtn = document.getElementById("paziente-pdf-btn");
const pazienteLogoutBtn = document.getElementById("paziente-logout-btn");
const pzTemaChiaroBtn = document.getElementById("pz-tema-chiaro-btn");
const pzTemaNotteBtn = document.getElementById("pz-tema-notte-btn");

// ---------- Modalità giorno/notte ----------

function applicaTema(tema) {
  document.documentElement.classList.toggle("tema-notte", tema === "notte");
  temaChiaroBtn.classList.toggle("attivo", tema === "chiaro");
  temaNotteBtn.classList.toggle("attivo", tema === "notte");
  pzTemaChiaroBtn.classList.toggle("attivo", tema === "chiaro");
  pzTemaNotteBtn.classList.toggle("attivo", tema === "notte");
}

function impostaTema(tema) {
  try {
    localStorage.setItem(TEMA_KEY, tema);
  } catch (e) {}
  applicaTema(tema);
}

function inizializzaTema() {
  let salvato = null;
  try {
    salvato = localStorage.getItem(TEMA_KEY);
  } catch (e) {}

  if (salvato === "chiaro" || salvato === "notte") {
    applicaTema(salvato);
  } else {
    const preferisceScuro = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applicaTema(preferisceScuro ? "notte" : "chiaro");
  }
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function escapeHtml(testo) {
  return String(testo).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- Login / sessione ----------

function inizializzaSupabase() {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function mostraLogin() {
  loginOverlay.classList.remove("hidden");
  impostaPasswordOverlay.classList.add("hidden");
  recuperoPasswordOverlay.classList.add("hidden");
  appShell.classList.add("hidden");
  vistaPaziente.classList.add("hidden");
}

function apriRecuperoPassword() {
  recuperoEmailInput.value = loginEmailInput.value.trim();
  recuperoError.classList.add("hidden");
  recuperoSuccesso.classList.add("hidden");
  recuperoPasswordOverlay.classList.remove("hidden");
  recuperoEmailInput.focus();
}

function chiudiRecuperoPassword() {
  recuperoPasswordOverlay.classList.add("hidden");
}

async function inviaRecuperoPassword() {
  const email = recuperoEmailInput.value.trim();
  recuperoError.classList.add("hidden");
  recuperoSuccesso.classList.add("hidden");

  if (!email) {
    recuperoError.textContent = "Inserisci un'email.";
    recuperoError.classList.remove("hidden");
    return;
  }

  recuperoInviaBtn.disabled = true;
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
  recuperoInviaBtn.disabled = false;

  if (error) {
    recuperoError.textContent = "Errore: " + error.message;
    recuperoError.classList.remove("hidden");
    return;
  }

  recuperoSuccesso.textContent = "Se l'email è registrata, riceverai a breve un'email con il link per reimpostare la password.";
  recuperoSuccesso.classList.remove("hidden");
}

function urlContieneTipo(tipo) {
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  return hash.includes(`type=${tipo}`) || search.includes(`type=${tipo}`);
}

function mostraImpostaPassword() {
  loginOverlay.classList.add("hidden");
  nuovaPasswordInput.value = "";
  impostaPasswordError.classList.add("hidden");
  impostaPasswordOverlay.classList.remove("hidden");
}

async function confermaImpostaPassword() {
  const nuovaPassword = nuovaPasswordInput.value;
  impostaPasswordError.classList.add("hidden");

  if (!nuovaPassword || nuovaPassword.length < 6) {
    impostaPasswordError.textContent = "La password deve avere almeno 6 caratteri.";
    impostaPasswordError.classList.remove("hidden");
    return;
  }

  impostaPasswordBtn.disabled = true;
  const { error } = await supabaseClient.auth.updateUser({ password: nuovaPassword });
  impostaPasswordBtn.disabled = false;

  if (error) {
    impostaPasswordError.textContent = "Errore: " + error.message;
    impostaPasswordError.classList.remove("hidden");
    return;
  }

  impostaPasswordOverlay.classList.add("hidden");
  history.replaceState(null, "", window.location.pathname);
  await avviaDopoLogin();
}

async function inizializzaAuth() {
  const { data } = await supabaseClient.auth.getSession();
  sessioneUtente = data.session;

  if (sessioneUtente && (urlContieneTipo("invite") || urlContieneTipo("recovery"))) {
    mostraImpostaPassword();
    return;
  }

  if (sessioneUtente) {
    await avviaDopoLogin();
  } else {
    mostraLogin();
  }
}

async function effettuaLogin() {
  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;
  loginError.classList.add("hidden");

  if (!email || !password) {
    loginError.textContent = "Inserisci email e password.";
    loginError.classList.remove("hidden");
    return;
  }

  loginBtn.disabled = true;
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  loginBtn.disabled = false;

  if (error) {
    loginError.textContent = "Accesso non riuscito: " + error.message;
    loginError.classList.remove("hidden");
    return;
  }

  sessioneUtente = data.session;
  loginPasswordInput.value = "";
  await avviaDopoLogin();
}

async function effettuaLogout() {
  await supabaseClient.auth.signOut();
  location.reload();
}

async function determinaRuolo() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return { ruolo: "nessuno" };

  const { data: rigaAdmin } = await supabaseClient
    .from("amministratori")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (rigaAdmin) return { ruolo: "admin" };

  const { data: rigaPaziente } = await supabaseClient
    .from("pazienti")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (rigaPaziente) return { ruolo: "paziente", paziente: rigaPaziente };

  return { ruolo: "nessuno" };
}

async function avviaDopoLogin() {
  loginOverlay.classList.add("hidden");

  const ruoloInfo = await determinaRuolo();

  if (ruoloInfo.ruolo === "admin") {
    await avviaAppAdmin();
  } else if (ruoloInfo.ruolo === "paziente") {
    await avviaVistaPaziente(ruoloInfo.paziente);
  } else {
    alert("Il tuo account non è collegato a nessun profilo attivo. Contatta lo studio.");
    await supabaseClient.auth.signOut();
    mostraLogin();
  }
}

async function avviaAppAdmin() {
  vistaPaziente.classList.add("hidden");
  appShell.classList.remove("hidden");

  await caricaAlimentiBase();
  customFoodsRemoti = await caricaAlimentiPersonalizzatiRemoti();
  ricostruisciElencoAlimenti();

  await caricaListaPazienti();

  renderDraft();
  renderDieta();
}

// ---------- Vista paziente (sola lettura) ----------

function renderProfiloPazienteVista(p) {
  const campi = [
    ["Data di nascita", p.data_nascita ? formattaDataIt(p.data_nascita) : null],
    ["Sesso", p.sesso],
    ["Altezza", p.altezza_cm ? `${p.altezza_cm} cm` : null],
    ["Peso attuale", p.peso_kg ? `${p.peso_kg} kg` : null],
    ["Livello di attività", p.attivita],
    ["Telefono", p.telefono],
    ["Email", p.email],
    ["Allergie / intolleranze", p.allergie],
    ["Note", p.note]
  ].filter(([, valore]) => valore);

  if (campi.length === 0) {
    pazienteProfiloVista.innerHTML = '<p class="vuoto">Nessun dato disponibile. Contatta lo studio per aggiornare il tuo profilo.</p>';
    return;
  }

  pazienteProfiloVista.innerHTML = campi
    .map(([label, valore]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(valore))}</p>`)
    .join("");
}

async function caricaDietaAttivaPaziente(pazienteId) {
  const { data, error } = await supabaseClient
    .from("diete")
    .select("*")
    .eq("paziente_id", pazienteId)
    .eq("stato", "attiva")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0];
}

async function avviaVistaPaziente(pazienteRecord) {
  appShell.classList.add("hidden");
  vistaPaziente.classList.remove("hidden");
  vistaPazienteNomeEl.textContent = pazienteRecord.nome;

  pazienteCorrente = { id: pazienteRecord.id, nome: pazienteRecord.nome };
  renderProfiloPazienteVista(pazienteRecord);

  const rigaDieta = await caricaDietaAttivaPaziente(pazienteRecord.id);
  if (rigaDieta) {
    dietaCorrenteId = rigaDieta.id;
    applicaDatiDieta(rigaDieta.dati);
  } else {
    dietaCorrenteId = null;
    state = creaStatoVuoto();
  }

  pazienteDietaVista.innerHTML = costruisciContenutoPrintDieta();
}

// ---------- Gestione utenti (admin): invito nuovi accessi ----------

function toggleGestioneUtenti() {
  const chiusa = gestioneUtentiContenuto.classList.toggle("hidden");
  gestioneUtentiToggle.textContent = `${chiusa ? "▸" : "▾"} Gestione utenti`;
  if (!chiusa) popolaSelettorePazientiInvito();
}

function popolaSelettorePazientiInvito() {
  invitoPazienteSelect.innerHTML = '<option value="nuovo">— Crea un nuovo paziente —</option>' +
    listaPazienti.map(p => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join("");
}

function aggiornaVisibilitaBloccoPaziente() {
  const ePaziente = invitoRuoloSelect.value === "paziente";
  invitoPazienteBlocco.classList.toggle("hidden", !ePaziente);
  invitoNuovoPazienteBlocco.classList.toggle("hidden", !ePaziente || invitoPazienteSelect.value !== "nuovo");
}

async function inviaInvito() {
  const email = invitoEmailInput.value.trim();
  const ruolo = invitoRuoloSelect.value;
  invitoError.classList.add("hidden");
  invitoSuccesso.classList.add("hidden");

  if (!email) {
    invitoError.textContent = "Inserisci un'email.";
    invitoError.classList.remove("hidden");
    return;
  }

  const corpo = { email, ruolo };

  if (ruolo === "paziente") {
    const selezione = invitoPazienteSelect.value;
    if (selezione === "nuovo") {
      const nome = invitoNuovoPazienteNomeInput.value.trim();
      if (!nome) {
        invitoError.textContent = "Inserisci il nome del nuovo paziente.";
        invitoError.classList.remove("hidden");
        return;
      }
      corpo.nomeNuovoPaziente = nome;
    } else {
      corpo.pazienteId = selezione;
    }
  }

  const { data: { session } } = await supabaseClient.auth.getSession();

  invitoInviaBtn.disabled = true;
  let risposta;
  try {
    risposta = await fetch("/api/crea-utente", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + session.access_token
      },
      body: JSON.stringify(corpo)
    });
  } catch (e) {
    invitoInviaBtn.disabled = false;
    invitoError.textContent = "Errore di rete: " + e.message;
    invitoError.classList.remove("hidden");
    return;
  }
  invitoInviaBtn.disabled = false;

  const risultato = await risposta.json().catch(() => ({}));

  if (!risposta.ok) {
    invitoError.textContent = "Errore: " + (risultato.error || "sconosciuto");
    invitoError.classList.remove("hidden");
    return;
  }

  invitoSuccesso.textContent = `Invito inviato a ${email}.`;
  invitoSuccesso.classList.remove("hidden");
  invitoEmailInput.value = "";
  invitoNuovoPazienteNomeInput.value = "";
  if (ruolo === "paziente") await caricaListaPazienti();
  popolaSelettorePazientiInvito();
}

// ---------- Pazienti ----------

async function caricaListaPazienti() {
  const { data, error } = await supabaseClient.from("pazienti").select("*").order("nome", { ascending: true });
  if (error) {
    alert("Errore nel caricamento dei pazienti: " + error.message);
    return;
  }
  listaPazienti = data || [];
  pazienteSelect.innerHTML = '<option value="">— Seleziona un paziente —</option>' +
    listaPazienti.map(p => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join("");
}

async function selezionaPaziente(pazienteId) {
  if (!pazienteId) {
    pazienteCorrente = null;
    dietaCorrenteId = null;
    storicoBtn.disabled = true;
    profiloBtn.disabled = true;
    areaLavoro.classList.add("hidden");
    return;
  }

  const p = listaPazienti.find(p => p.id === pazienteId);
  if (!p) return;
  pazienteCorrente = { id: p.id, nome: p.nome };

  const { data: dieteAttive, error } = await supabaseClient
    .from("diete")
    .select("*")
    .eq("paziente_id", pazienteId)
    .eq("stato", "attiva")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    alert("Errore nel caricamento della dieta: " + error.message);
    return;
  }

  let riga;
  if (dieteAttive && dieteAttive.length > 0) {
    riga = dieteAttive[0];
  } else {
    const { data: creata, error: erroreCreazione } = await supabaseClient
      .from("diete")
      .insert({ paziente_id: pazienteId, stato: "attiva", dati: creaStatoVuoto() })
      .select()
      .single();
    if (erroreCreazione) {
      alert("Errore nella creazione della dieta: " + erroreCreazione.message);
      return;
    }
    riga = creata;
  }

  dietaCorrenteId = riga.id;
  applicaDatiDieta(riga.dati);

  maxKcalInput.value = state.maxKcal || "";
  sostituzioniInput.value = state.sostituzioni || "";
  infoStudioInput.value = state.infoStudio || "";
  validoDalInput.value = state.validoDal || "";
  validoAlInput.value = state.validoAl || "";

  collapsedGiorni = new Set();
  draftPasto = [];

  storicoBtn.disabled = false;
  profiloBtn.disabled = false;
  areaLavoro.classList.remove("hidden");

  renderDraft();
  renderDieta();
}

function apriNuovoPaziente() {
  nuovoPazienteNomeInput.value = "";
  nuovoPazienteError.classList.add("hidden");
  nuovoPazienteOverlay.classList.remove("hidden");
  nuovoPazienteNomeInput.focus();
}

function chiudiNuovoPaziente() {
  nuovoPazienteOverlay.classList.add("hidden");
}

async function confermaNuovoPaziente() {
  const nome = nuovoPazienteNomeInput.value.trim();
  if (!nome) {
    nuovoPazienteError.classList.remove("hidden");
    return;
  }

  const { data, error } = await supabaseClient.from("pazienti").insert({ nome }).select().single();
  if (error) {
    alert("Errore nella creazione del paziente: " + error.message);
    return;
  }

  chiudiNuovoPaziente();
  await caricaListaPazienti();
  pazienteSelect.value = data.id;
  await selezionaPaziente(data.id);
}

// ---------- Profilo paziente ----------

async function apriProfiloPaziente() {
  if (!pazienteCorrente) return;
  profiloPazienteNomeEl.textContent = pazienteCorrente.nome;

  const { data, error } = await supabaseClient
    .from("pazienti")
    .select("*")
    .eq("id", pazienteCorrente.id)
    .single();

  if (error) {
    alert("Errore nel caricamento del profilo: " + error.message);
    return;
  }

  profiloDataNascitaInput.value = data.data_nascita || "";
  profiloSessoInput.value = data.sesso || "";
  profiloAltezzaInput.value = data.altezza_cm ?? "";
  profiloPesoInput.value = data.peso_kg ?? "";
  profiloAttivitaInput.value = data.attivita || "";
  profiloTelefonoInput.value = data.telefono || "";
  profiloEmailInput.value = data.email || "";
  profiloAllergieInput.value = data.allergie || "";
  profiloNoteInput.value = data.note || "";

  profiloOverlay.classList.remove("hidden");
}

function chiudiProfiloPaziente() {
  profiloOverlay.classList.add("hidden");
}

async function salvaProfiloPaziente() {
  if (!pazienteCorrente) return;

  const altezza = parseFloat(profiloAltezzaInput.value);
  const peso = parseFloat(profiloPesoInput.value);

  const aggiornamento = {
    data_nascita: profiloDataNascitaInput.value || null,
    sesso: profiloSessoInput.value || null,
    altezza_cm: isNaN(altezza) ? null : altezza,
    peso_kg: isNaN(peso) ? null : peso,
    attivita: profiloAttivitaInput.value || null,
    telefono: profiloTelefonoInput.value.trim() || null,
    email: profiloEmailInput.value.trim() || null,
    allergie: profiloAllergieInput.value.trim() || null,
    note: profiloNoteInput.value.trim() || null
  };

  const { error } = await supabaseClient.from("pazienti").update(aggiornamento).eq("id", pazienteCorrente.id);
  if (error) {
    alert("Errore nel salvataggio del profilo: " + error.message);
    return;
  }

  chiudiProfiloPaziente();
}

// ---------- Storico diete ----------

async function salvaComeStorico() {
  if (!dietaCorrenteId || !pazienteCorrente) return;
  if (!confirm(`Salvare una copia della dieta attuale nello storico di ${pazienteCorrente.nome}? La dieta attiva resterà comunque modificabile.`)) return;

  const dati = {
    maxKcal: state.maxKcal,
    dieta: state.dieta,
    sostituzioni: state.sostituzioni,
    infoStudio: state.infoStudio,
    validoDal: state.validoDal,
    validoAl: state.validoAl
  };

  const { error } = await supabaseClient.from("diete").insert({
    paziente_id: pazienteCorrente.id,
    stato: "archiviata",
    dati
  });

  if (error) {
    alert("Errore nel salvataggio dello storico: " + error.message);
    return;
  }
  alert("Versione salvata nello storico.");
}

async function apriStorico() {
  if (!pazienteCorrente) return;
  storicoPazienteNomeEl.textContent = pazienteCorrente.nome;
  storicoLista.innerHTML = '<p class="vuoto">Caricamento…</p>';
  storicoOverlay.classList.remove("hidden");

  const { data, error } = await supabaseClient
    .from("diete")
    .select("*")
    .eq("paziente_id", pazienteCorrente.id)
    .eq("stato", "archiviata")
    .order("created_at", { ascending: false });

  if (error) {
    storicoLista.innerHTML = `<p class="error">Errore: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    storicoLista.innerHTML = '<p class="vuoto">Nessuna versione salvata per questo paziente.</p>';
    return;
  }

  storicoLista.innerHTML = data.map(riga => {
    const dataStr = new Date(riga.created_at).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
    return `
      <div class="storico-riga">
        <div class="storico-riga-info">
          <div class="storico-data">${dataStr}</div>
        </div>
        <button type="button" class="secondary storico-apri-btn" data-id="${riga.id}">Apri e stampa</button>
      </div>
    `;
  }).join("");
}

function chiudiStorico() {
  storicoOverlay.classList.add("hidden");
}

async function apriEStampaStorico(dietaId) {
  const { data, error } = await supabaseClient.from("diete").select("*").eq("id", dietaId).single();
  if (error) {
    alert("Errore: " + error.message);
    return;
  }

  const backupState = JSON.parse(JSON.stringify(state));
  applicaDatiDieta(data.dati);

  impostaModalitaStampa("stampa-nutrizionista");
  renderIntestazioneStampa(`Piano alimentare — versione del ${new Date(data.created_at).toLocaleDateString("it-IT")}`);
  printContent.innerHTML = costruisciContenutoPrintDieta();

  const ripristina = () => {
    Object.assign(state, backupState);
    window.removeEventListener("afterprint", ripristina);
  };
  window.addEventListener("afterprint", ripristina);

  chiudiStorico();
  window.print();
}

// ---------- Database alimenti (base + personalizzati) ----------

function normalizzaValoriAlimento(a) {
  return {
    nome: a.nome,
    kcal: Math.max(0, a.kcal),
    proteine: Math.max(0, a.proteine),
    grassi: Math.max(0, a.grassi),
    carboidrati: Math.max(0, a.carboidrati)
  };
}

function ricostruisciElencoAlimenti() {
  foodMap = new Map();
  baseAlimenti.forEach(a => foodMap.set(a.nome, normalizzaValoriAlimento(a)));
  customFoodsRemoti.forEach(a => foodMap.set(a.nome, normalizzaValoriAlimento(a)));
  foodNames = Array.from(foodMap.keys()).sort((a, b) => a.localeCompare(b, "it"));
}

async function caricaAlimentiBase() {
  const risposta = await fetch("foods.json");
  baseAlimenti = await risposta.json();
}

async function caricaAlimentiPersonalizzatiRemoti() {
  const { data, error } = await supabaseClient.from("alimenti_personalizzati").select("*").order("nome");
  if (error) {
    console.warn("Errore nel caricamento alimenti personalizzati:", error);
    return [];
  }
  return data || [];
}

function apriFormNuovoAlimento() {
  nuovoAlimentoForm.classList.remove("hidden");
  nuovoNomeInput.value = foodInput.value.trim();
  nascondiSuggerimenti();
  nuovoNomeInput.focus();
}

function chiudiFormNuovoAlimento() {
  nuovoAlimentoForm.classList.add("hidden");
  nuovoAlimentoError.classList.add("hidden");
  nuovoNomeInput.value = "";
  nuovoKcalInput.value = "";
  nuovoProtInput.value = "";
  nuovoFatInput.value = "";
  nuovoCarbInput.value = "";
}

async function salvaNuovoAlimento() {
  const nome = nuovoNomeInput.value.trim();
  const kcal = parseFloat(nuovoKcalInput.value);
  const proteine = parseFloat(nuovoProtInput.value);
  const grassi = parseFloat(nuovoFatInput.value);
  const carboidrati = parseFloat(nuovoCarbInput.value);
  const valori = [kcal, proteine, grassi, carboidrati];

  if (!nome || valori.some(v => isNaN(v) || v < 0)) {
    nuovoAlimentoError.classList.remove("hidden");
    return;
  }
  nuovoAlimentoError.classList.add("hidden");

  if (foodMap.has(nome) && !confirm(`"${nome}" esiste già nel database. Vuoi sovrascrivere i suoi valori nutrizionali?`)) {
    return;
  }

  const nuovoAlimento = {
    nome,
    kcal: round1(kcal),
    proteine: round1(proteine),
    grassi: round1(grassi),
    carboidrati: round1(carboidrati)
  };

  const { error } = await supabaseClient.from("alimenti_personalizzati").upsert(nuovoAlimento, { onConflict: "nome" });
  if (error) {
    alert("Errore nel salvataggio dell'alimento: " + error.message);
    return;
  }

  customFoodsRemoti = customFoodsRemoti.filter(a => a.nome !== nome);
  customFoodsRemoti.push(nuovoAlimento);
  ricostruisciElencoAlimenti();

  chiudiFormNuovoAlimento();
  foodInput.value = nome;
  aggiornaPreview();
  gramsInput.focus();
}

// ---------- Calcolo live ----------

function aggiornaPreview() {
  const nome = foodInput.value.trim();
  const grammi = parseFloat(gramsInput.value);
  const alimento = foodMap.get(nome);

  if (!nome) {
    foodError.classList.add("hidden");
  } else {
    foodError.classList.toggle("hidden", !!alimento);
  }

  if (!alimento || !grammi || grammi <= 0) {
    preview.classList.add("hidden");
    addDraftBtn.disabled = true;
    currentCalc = null;
    return;
  }

  const fattore = grammi / 100;
  currentCalc = {
    alimento: nome,
    grammi: grammi,
    kcal: round1(alimento.kcal * fattore),
    proteine: round1(alimento.proteine * fattore),
    grassi: round1(alimento.grassi * fattore),
    carboidrati: round1(alimento.carboidrati * fattore)
  };

  previewKcal.textContent = currentCalc.kcal;
  previewProt.textContent = currentCalc.proteine;
  previewFat.textContent = currentCalc.grassi;
  previewCarb.textContent = currentCalc.carboidrati;
  preview.classList.remove("hidden");
  addDraftBtn.disabled = false;
}

// ---------- Autocompletamento ----------

function normalizza(testo) {
  return testo.toUpperCase();
}

function mostraSuggerimenti(elenco) {
  suggestionIndex = -1;
  if (elenco.length === 0) {
    suggestions.innerHTML = "";
    suggestions.classList.add("hidden");
    return;
  }
  const customNames = new Set(customFoodsRemoti.map(a => a.nome));
  suggestions.innerHTML = elenco
    .map((nome, i) => `<div class="suggestion-item" data-index="${i}">${nome}${customNames.has(nome) ? ' <span class="tag-custom">personalizzato</span>' : ''}</div>`)
    .join("");
  suggestions.dataset.items = JSON.stringify(elenco);
  suggestions.classList.remove("hidden");
}

function nascondiSuggerimenti() {
  suggestions.classList.add("hidden");
  suggestionIndex = -1;
}

function aggiornaSuggerimenti() {
  const testo = normalizza(foodInput.value.trim());
  if (!testo) {
    nascondiSuggerimenti();
    return;
  }
  const match = foodNames.filter(nome => normalizza(nome).startsWith(testo)).slice(0, 50);
  mostraSuggerimenti(match);
}

function evidenziaSuggerimento() {
  const items = suggestions.querySelectorAll(".suggestion-item");
  items.forEach((el, i) => el.classList.toggle("active", i === suggestionIndex));
}

// ---------- Pasto in corso (fase intermedia) ----------

function aggiungiAlPastoInCorso() {
  if (!currentCalc) return;
  draftPasto.push({
    ...currentCalc,
    nota: notaInput.value.trim(),
    mostraPorzione: porzioneCheck.checked,
    porzione: porzioneCheck.checked ? porzioneInput.value.trim() : ""
  });

  foodInput.value = "";
  gramsInput.value = "";
  notaInput.value = "";
  porzioneCheck.checked = false;
  porzioneInput.value = "";
  porzioneInput.classList.add("hidden");
  aggiornaPreview();
  renderDraft();
  foodInput.focus();
}

function rimuoviDaDraft(index) {
  draftPasto.splice(index, 1);
  renderDraft();
}

function svuotaDraft() {
  if (draftPasto.length === 0) return;
  if (!confirm("Vuoi svuotare il pasto in corso? Gli alimenti aggiunti finora andranno persi.")) return;
  draftPasto = [];
  renderDraft();
}

function giorniSelezionatiConferma() {
  return Array.from(confermaGiorniCheckbox.querySelectorAll("input:checked")).map(cb => cb.value);
}

function aggiornaTestoDropdownGiorni() {
  const selezionati = giorniSelezionatiConferma();
  let testo;
  if (selezionati.length === 0) testo = "Seleziona giorni";
  else if (selezionati.length === GIORNI.length) testo = "Tutti i giorni";
  else testo = selezionati.join(", ");
  giorniDropdownBtn.textContent = `${testo} ▾`;
}

function aggiornaStatoConfermaBtn() {
  confermaPastoBtn.disabled = draftPasto.length === 0 || giorniSelezionatiConferma().length === 0;
  pastoLiberoBtn.disabled = giorniSelezionatiConferma().length === 0;
  aggiornaTestoDropdownGiorni();
}

function renderDraft() {
  aggiornaStatoConfermaBtn();

  if (draftPasto.length === 0) {
    draftContainer.innerHTML = '<p class="vuoto">Nessun alimento aggiunto al pasto in corso.</p>';
    return;
  }

  const totali = draftPasto.reduce((acc, item) => {
    acc.kcal += item.kcal;
    acc.proteine += item.proteine;
    acc.grassi += item.grassi;
    acc.carboidrati += item.carboidrati;
    return acc;
  }, { kcal: 0, proteine: 0, grassi: 0, carboidrati: 0 });

  const righe = draftPasto.map((item, index) => `
    <tr>
      <td>${item.alimento}</td>
      <td>${item.grammi} g${item.mostraPorzione ? ` <em>(${item.porzione || "porzione"})</em>` : ""}</td>
      <td>${item.nota || "-"}</td>
      <td>${item.kcal} kcal</td>
      <td>${item.proteine} g</td>
      <td>${item.grassi} g</td>
      <td>${item.carboidrati} g</td>
      <td><button class="remove-btn" data-draft-index="${index}" title="Rimuovi">×</button></td>
    </tr>
  `).join("");

  draftContainer.innerHTML = `
    <table>
      <thead>
        <tr><th>Alimento</th><th>Quantità</th><th>Note</th><th>Calorie</th><th>Proteine</th><th>Grassi</th><th>Carboidrati</th><th></th></tr>
      </thead>
      <tbody>${righe}</tbody>
      <tfoot>
        <tr class="riga-totale">
          <td colspan="3">Totale pasto</td>
          <td>${round1(totali.kcal)} kcal</td>
          <td>${round1(totali.proteine)} g</td>
          <td>${round1(totali.grassi)} g</td>
          <td>${round1(totali.carboidrati)} g</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  `;
}

function pastoHaLibero(giorno, pasto) {
  return state.dieta[giorno][pasto].some(item => item.libero);
}

function copiaItemsInPasto(items, giorno, pasto) {
  if (items.some(i => i.libero)) {
    state.dieta[giorno][pasto] = items.map(i => ({ ...i }));
    return;
  }
  state.dieta[giorno][pasto] = state.dieta[giorno][pasto].filter(i => !i.libero);
  items.forEach(i => state.dieta[giorno][pasto].push({ ...i }));
}

function confermaPasto() {
  if (draftPasto.length === 0) return;
  const giorni = giorniSelezionatiConferma();
  if (giorni.length === 0) return;
  const pasto = pastoSelect.value;

  const giorniConLibero = giorni.filter(g => pastoHaLibero(g, pasto));
  if (giorniConLibero.length > 0 && !confirm(`In ${giorniConLibero.join(", ")} il pasto "${pasto}" è segnato come pasto libero: gli alimenti lo sostituiranno. Continuare?`)) {
    return;
  }

  giorni.forEach(giorno => copiaItemsInPasto(draftPasto, giorno, pasto));
  draftPasto = [];
  salvaStateRemoto();
  renderDraft();
  renderDieta();

  const giorniSuperati = giorni.filter(g => controllaLimite(g));
  if (giorniSuperati.length > 0) {
    alert(`Attenzione: il totale calorico supera il limite massimo giornaliero impostato per: ${giorniSuperati.join(", ")}.`);
  }
}

function inserisciPastoLibero() {
  const giorni = giorniSelezionatiConferma();
  if (giorni.length === 0) return;
  const pasto = pastoSelect.value;

  const giorniConAlimenti = giorni.filter(g => state.dieta[g][pasto].some(i => !i.libero));
  if (giorniConAlimenti.length > 0 && !confirm(`In ${giorniConAlimenti.join(", ")} il pasto "${pasto}" contiene già degli alimenti: verranno sostituiti dal pasto libero. Continuare?`)) {
    return;
  }

  const kcalStimate = parseFloat(liberoKcalInput.value);
  const itemLibero = {
    libero: true,
    alimento: "Pasto libero",
    grammi: null,
    nota: liberoNotaInput.value.trim(),
    kcal: (!isNaN(kcalStimate) && kcalStimate > 0) ? round1(kcalStimate) : 0,
    proteine: 0,
    grassi: 0,
    carboidrati: 0
  };

  giorni.forEach(giorno => {
    state.dieta[giorno][pasto] = [{ ...itemLibero }];
  });

  liberoKcalInput.value = "";
  liberoNotaInput.value = "";
  salvaStateRemoto();
  renderDieta();

  const giorniSuperati = giorni.filter(g => controllaLimite(g));
  if (giorniSuperati.length > 0) {
    alert(`Attenzione: il totale calorico supera il limite massimo giornaliero impostato per: ${giorniSuperati.join(", ")}.`);
  }
}

// ---------- Dieta settimanale ----------

function totaliPasto(items) {
  return items.reduce((acc, item) => {
    acc.kcal += item.kcal;
    acc.proteine += item.proteine;
    acc.grassi += item.grassi;
    acc.carboidrati += item.carboidrati;
    return acc;
  }, { kcal: 0, proteine: 0, grassi: 0, carboidrati: 0 });
}

function totaliGiorno(giorno) {
  return PASTI.reduce((acc, pasto) => {
    const t = totaliPasto(state.dieta[giorno][pasto]);
    acc.kcal += t.kcal;
    acc.proteine += t.proteine;
    acc.grassi += t.grassi;
    acc.carboidrati += t.carboidrati;
    return acc;
  }, { kcal: 0, proteine: 0, grassi: 0, carboidrati: 0 });
}

function totaleGiornoKcal(giorno) {
  return totaliGiorno(giorno).kcal;
}

function controllaLimite(giorno) {
  const max = parseFloat(state.maxKcal);
  if (!max || max <= 0) return false;
  return totaleGiornoKcal(giorno) > max;
}

function formattaTotali(t) {
  return `${round1(t.kcal)} kcal · ${round1(t.proteine)} g prot · ${round1(t.grassi)} g grassi · ${round1(t.carboidrati)} g carb`;
}

function giornoHaAlimenti(giorno) {
  return PASTI.some(pasto => state.dieta[giorno][pasto].length > 0);
}

// ---------- Selezione multipla dei giorni (checkbox condivisi) ----------

function renderGiorniCheckbox(container, giorni) {
  container.innerHTML = giorni.map(g => `
    <label class="duplica-giorno-check"><input type="checkbox" value="${g}"> ${g}</label>
  `).join("");
}

function applicaPresetGiorni(container, preset) {
  const gruppo = preset === "tutti" ? GIORNI
    : preset === "feriali" ? GIORNI_FERIALI
    : preset === "weekend" ? GIORNI_WEEKEND
    : [];
  if (gruppo.length === 0) return;

  const checkbox = Array.from(container.querySelectorAll("input")).filter(cb => gruppo.includes(cb.value));
  const giaTuttiSelezionati = checkbox.every(cb => cb.checked);
  checkbox.forEach(cb => { cb.checked = !giaTuttiSelezionati; });
}

// ---------- Duplica pasto / giornata ----------

function renderDuplicaGiorni(giornoEscluso) {
  renderGiorniCheckbox(duplicaGiorniCheckbox, GIORNI.filter(g => g !== giornoEscluso));
}

function apriDuplicaPasto(giorno, pasto) {
  duplicaContesto = { tipo: "pasto", giorno, pasto };
  duplicaTitolo.textContent = `Duplica "${pasto}"`;
  duplicaSottotitolo.textContent = `Copia gli alimenti di ${pasto} di ${giorno} anche in altri giorni, nello stesso pasto. Verranno aggiunti a quanto già presente.`;
  renderDuplicaGiorni(giorno);
  duplicaOverlay.classList.remove("hidden");
}

function apriDuplicaGiorno(giorno) {
  duplicaContesto = { tipo: "giorno", giorno };
  duplicaTitolo.textContent = `Duplica giornata "${giorno}"`;
  duplicaSottotitolo.textContent = `Copia tutti i pasti di ${giorno} anche in altri giorni. Verranno aggiunti a quanto già presente.`;
  renderDuplicaGiorni(giorno);
  duplicaOverlay.classList.remove("hidden");
}

function chiudiDuplica() {
  duplicaOverlay.classList.add("hidden");
  duplicaContesto = null;
}

function confermaDuplica() {
  if (!duplicaContesto) return;

  const selezionati = Array.from(duplicaGiorniCheckbox.querySelectorAll("input:checked")).map(el => el.value);
  if (selezionati.length === 0) {
    alert("Seleziona almeno un giorno di destinazione.");
    return;
  }

  if (duplicaContesto.tipo === "pasto") {
    const { giorno, pasto } = duplicaContesto;
    const origine = state.dieta[giorno][pasto];
    selezionati.forEach(target => copiaItemsInPasto(origine, target, pasto));
  } else {
    const { giorno } = duplicaContesto;
    selezionati.forEach(target => {
      PASTI.forEach(pasto => {
        if (state.dieta[giorno][pasto].length > 0) {
          copiaItemsInPasto(state.dieta[giorno][pasto], target, pasto);
        }
      });
    });
  }

  salvaStateRemoto();
  renderDieta();
  chiudiDuplica();
}

function renderDieta() {
  dietaContainer.innerHTML = "";

  GIORNI.forEach(giorno => {
    const totaleGiorno = totaliGiorno(giorno);
    const superato = controllaLimite(giorno);
    const collassato = collapsedGiorni.has(giorno);

    const blocco = document.createElement("div");
    blocco.className = "giorno-block";

    const titolo = document.createElement("div");
    titolo.className = "giorno-titolo";
    titolo.dataset.giorno = giorno;
    titolo.innerHTML = `
      <span>
        <span class="freccia no-print">${collassato ? "▸" : "▾"}</span> ${giorno}
        ${giornoHaAlimenti(giorno) ? `<button class="duplica-giorno-btn no-print" data-giorno="${giorno}" title="Duplica l'intera giornata in altri giorni">Duplica</button>` : ''}
      </span>
      <span class="solo-nutrizionista">${superato ? '<span class="totale-warning">! ' : ''}Totale: ${formattaTotali(totaleGiorno)}${superato ? '</span>' : ''}</span>
    `;
    blocco.appendChild(titolo);

    const contenuto = document.createElement("div");
    contenuto.className = "giorno-contenuto" + (collassato ? " collassato" : "");

    if (superato) {
      const max = parseFloat(state.maxKcal);
      const banner = document.createElement("div");
      banner.className = "alert-banner no-print";
      banner.textContent = `Attenzione: ${giorno} supera il limite di ${max} kcal impostato (${round1(totaleGiorno.kcal)} kcal totali).`;
      contenuto.appendChild(banner);
    }

    PASTI.forEach(pasto => {
      const items = state.dieta[giorno][pasto];
      const pastoDiv = document.createElement("div");
      pastoDiv.className = "pasto-blocco";

      if (items.length === 0) {
        pastoDiv.innerHTML = `<h4>${pasto}</h4><p class="vuoto">Nessun alimento inserito.</p>`;
      } else {
        const totalePasto = totaliPasto(items);
        let righe = items.map((item, index) => {
          let cellaQta;
          if (item.libero) {
            cellaQta = `<td>—</td>`;
          } else if (item.mostraPorzione) {
            cellaQta = `<td class="ha-porzione"><span class="solo-non-cliente">${item.grammi} g <em>(${item.porzione || "porzione"})</em></span><span class="solo-cliente">${item.porzione || ""}</span></td>`;
          } else {
            cellaQta = `<td>${item.grammi} g</td>`;
          }
          const cellaKcal = item.libero
            ? (item.kcal ? `${item.kcal} kcal (stima)` : "—")
            : `${item.kcal} kcal`;
          return `
          <tr${item.libero ? ' class="riga-libero"' : ''}>
            <td>${item.alimento}</td>
            ${cellaQta}
            <td>${item.nota || "-"}</td>
            <td class="solo-nutrizionista">${cellaKcal}</td>
            <td class="solo-nutrizionista">${item.libero ? "—" : `${item.proteine} g`}</td>
            <td class="solo-nutrizionista">${item.libero ? "—" : `${item.grassi} g`}</td>
            <td class="solo-nutrizionista">${item.libero ? "—" : `${item.carboidrati} g`}</td>
            <td class="no-print"><button class="remove-btn" data-giorno="${giorno}" data-pasto="${pasto}" data-index="${index}" title="Rimuovi">×</button></td>
          </tr>
        `;
        }).join("");

        pastoDiv.innerHTML = `
          <h4>${pasto} <span class="solo-nutrizionista">— ${formattaTotali(totalePasto)}</span> <button class="duplica-pasto-btn no-print" data-giorno="${giorno}" data-pasto="${pasto}" title="Duplica questo pasto in altri giorni">Duplica</button></h4>
          <table>
            <thead>
              <tr>
                <th>Alimento</th><th>Quantità</th><th>Note</th><th class="solo-nutrizionista">Calorie</th><th class="solo-nutrizionista">Proteine</th><th class="solo-nutrizionista">Grassi</th><th class="solo-nutrizionista">Carboidrati</th><th class="no-print"></th>
              </tr>
            </thead>
            <tbody>${righe}</tbody>
          </table>
        `;
      }

      contenuto.appendChild(pastoDiv);
    });

    blocco.appendChild(contenuto);
    dietaContainer.appendChild(blocco);
  });

  renderPanoramica();
}

// ---------- Panoramica settimanale ----------

const GIORNI_BREVI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const PASTI_BREVI = { "Spuntino mattina": "Spuntino" };

function renderPanoramica() {
  const target = parseFloat(state.maxKcal);
  let html = "<div></div>";
  GIORNI.forEach((g, i) => {
    html += `<div class="pan-header${i >= 5 ? " pan-weekend" : ""}">${GIORNI_BREVI[i]}</div>`;
  });

  PASTI.forEach(pasto => {
    html += `<div class="pan-label">${PASTI_BREVI[pasto] || pasto}</div>`;
    GIORNI.forEach(giorno => {
      const items = state.dieta[giorno][pasto];
      if (items.length === 0) {
        html += `<div class="pan-cella pan-vuota">—</div>`;
      } else {
        const t = totaliPasto(items);
        const testo = items.map(i => i.libero ? "Pasto libero" : i.alimento).join(", ");
        html += `<div class="pan-cella"><div class="pan-testo">${testo}</div><div class="pan-kcal">${round1(t.kcal)} kcal</div></div>`;
      }
    });
  });

  html += `<div class="pan-label pan-tot-label">Totale</div>`;
  GIORNI.forEach(giorno => {
    const t = totaliGiorno(giorno);
    const oltre = target > 0 && t.kcal > target;
    html += `<div class="pan-cella pan-tot${oltre ? " pan-oltre" : ""}">${t.kcal ? round1(t.kcal) + " kcal" : "—"}</div>`;
  });

  panoramicaGriglia.innerHTML = html;
}

function togglePanoramica() {
  const chiusa = panoramicaContenuto.classList.toggle("hidden");
  panoramicaToggle.textContent = `${chiusa ? "▸" : "▾"} Panoramica settimanale`;
}

function toggleImpostazioniStampa() {
  const chiusa = impostazioniStampaContenuto.classList.toggle("hidden");
  impostazioniStampaToggle.textContent = `⚙ Impostazioni di stampa ${chiusa ? "▸" : "▾"}`;
}

function rimuoviElemento(giorno, pasto, index) {
  state.dieta[giorno][pasto].splice(index, 1);
  salvaStateRemoto();
  renderDieta();
}

function svuotaDieta() {
  if (!confirm("Vuoi davvero svuotare tutta la dieta? L'operazione non è reversibile.")) return;
  state.dieta = creaDietaVuota();
  salvaStateRemoto();
  renderDieta();
}

// ---------- Lista della spesa ----------

function calcolaListaSpesa() {
  const totali = new Map();
  GIORNI.forEach(giorno => {
    PASTI.forEach(pasto => {
      state.dieta[giorno][pasto].forEach(item => {
        if (item.libero || typeof item.grammi !== "number") return;
        totali.set(item.alimento, (totali.get(item.alimento) || 0) + item.grammi);
      });
    });
  });
  return Array.from(totali.entries())
    .map(([nome, grammi]) => ({ nome, grammi: Math.round(grammi) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "it"));
}

// ---------- Generazione PDF (stampa) ----------

function formattaDataIt(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function formattaValidita() {
  const dal = (state.validoDal || "").trim();
  const al = (state.validoAl || "").trim();
  if (dal && al) return `Piano valido dal ${formattaDataIt(dal)} al ${formattaDataIt(al)}`;
  if (dal) return `Piano valido dal ${formattaDataIt(dal)}`;
  return `Stampato il ${new Date().toLocaleDateString("it-IT")}`;
}

function impostaModalitaStampa(modalita) {
  document.body.classList.remove("stampa-dieta", "stampa-nutrizionista", "stampa-spesa");
  document.body.classList.add(modalita);
}

function renderIntestazioneStampa(titolo) {
  printRunningTitle.textContent = titolo;
  const paziente = pazienteCorrente ? pazienteCorrente.nome : "-";
  printRunningMeta.textContent = `Paziente: ${paziente} · ${formattaValidita()}`;
  printRunningFooter.textContent = (state.infoStudio || "").trim();
}

function costruisciSostituzioniHtml() {
  const testo = (state.sostituzioni || "").trim();
  let corpo;
  if (testo) {
    corpo = `<p class="sostituzioni-testo">${escapeHtml(testo).replace(/\n/g, "<br>")}</p>`;
  } else {
    corpo = '<div class="linea-vuota"></div>'.repeat(4);
  }
  return `<div class="print-sostituzioni"><h3>Sostituzioni possibili</h3>${corpo}</div>`;
}

function costruisciRigaPrint(item) {
  let cellaQta;
  if (item.libero) {
    cellaQta = "—";
  } else if (item.mostraPorzione) {
    cellaQta = `<span class="solo-non-cliente">${item.grammi} g <em>(${item.porzione || "porzione"})</em></span><span class="solo-cliente">${item.porzione || ""}</span>`;
  } else {
    cellaQta = `${item.grammi} g`;
  }
  const cellaKcal = item.libero ? (item.kcal ? `${item.kcal} kcal (stima)` : "—") : `${item.kcal} kcal`;

  return `
    <tr${item.libero ? ' class="p-riga-libero"' : ''}>
      <td>${item.alimento}</td>
      <td class="${item.mostraPorzione ? "ha-porzione" : ""}">${cellaQta}</td>
      <td>${item.nota || "-"}</td>
      <td class="solo-nutrizionista">${cellaKcal}</td>
      <td class="solo-nutrizionista">${item.libero ? "—" : `${item.proteine} g`}</td>
      <td class="solo-nutrizionista">${item.libero ? "—" : `${item.grassi} g`}</td>
      <td class="solo-nutrizionista">${item.libero ? "—" : `${item.carboidrati} g`}</td>
    </tr>
  `;
}

function costruisciContenutoPrintDieta() {
  const giorniConDati = GIORNI.filter(giornoHaAlimenti);
  if (giorniConDati.length === 0) return "<p>La dieta è vuota.</p>";

  return giorniConDati.map(giorno => {
    const totG = totaliGiorno(giorno);
    const pastiHtml = PASTI.filter(p => state.dieta[giorno][p].length > 0).map(pasto => {
      const items = state.dieta[giorno][pasto];
      const totP = totaliPasto(items);
      const righe = items.map(item => costruisciRigaPrint(item)).join("");
      return `
        <div class="p-pasto">
          <div class="p-pasto-titolo"><span>${pasto}</span><span class="solo-nutrizionista">${formattaTotali(totP)}</span></div>
          <table class="p-tabella">
            <thead>
              <tr>
                <th>Alimento</th><th>Quantità</th><th>Note</th>
                <th class="solo-nutrizionista">Calorie</th><th class="solo-nutrizionista">Proteine</th><th class="solo-nutrizionista">Grassi</th><th class="solo-nutrizionista">Carboidrati</th>
              </tr>
            </thead>
            <tbody>${righe}</tbody>
          </table>
        </div>
      `;
    }).join("");

    return `
      <div class="p-giorno">
        <div class="p-giorno-titolo"><span>${giorno}</span><span class="solo-nutrizionista">${formattaTotali(totG)}</span></div>
        ${pastiHtml}
      </div>
    `;
  }).join("");
}

function costruisciContenutoListaSpesa() {
  const lista = calcolaListaSpesa();
  if (lista.length === 0) return "<p>La dieta è vuota: nessun alimento da acquistare.</p>";

  const righe = lista.map(voce => `
    <tr><td class="p-checkbox">☐</td><td>${voce.nome}</td><td>${voce.grammi} g</td></tr>
  `).join("");

  return `
    <table class="p-tabella">
      <thead><tr><th></th><th>Alimento</th><th>Quantità totale settimanale</th></tr></thead>
      <tbody>${righe}</tbody>
    </table>
  `;
}

function generaPdfDieta() {
  impostaModalitaStampa("stampa-dieta");
  renderIntestazioneStampa("Piano alimentare");
  printContent.innerHTML = costruisciContenutoPrintDieta() + costruisciSostituzioniHtml();
  window.print();
}

function generaPdfNutrizionista() {
  impostaModalitaStampa("stampa-nutrizionista");
  renderIntestazioneStampa("Piano alimentare — Scheda nutrizionista");
  printContent.innerHTML = costruisciContenutoPrintDieta();
  window.print();
}

function generaPdfSpesa() {
  impostaModalitaStampa("stampa-spesa");
  renderIntestazioneStampa("Lista della spesa settimanale");
  printContent.innerHTML = costruisciContenutoListaSpesa();
  window.print();
}

// ---------- Inizializzazione ----------

function inizializza() {
  inizializzaTema();
  temaChiaroBtn.addEventListener("click", () => impostaTema("chiaro"));
  temaNotteBtn.addEventListener("click", () => impostaTema("notte"));

  inizializzaSupabase();

  loginBtn.addEventListener("click", effettuaLogin);
  loginPasswordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") effettuaLogin();
  });
  logoutBtn.addEventListener("click", effettuaLogout);
  pazienteLogoutBtn.addEventListener("click", effettuaLogout);

  recuperoPasswordLink.addEventListener("click", (e) => {
    e.preventDefault();
    apriRecuperoPassword();
  });
  recuperoInviaBtn.addEventListener("click", inviaRecuperoPassword);
  recuperoAnnullaBtn.addEventListener("click", chiudiRecuperoPassword);
  recuperoEmailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") inviaRecuperoPassword();
  });
  recuperoPasswordOverlay.addEventListener("click", (e) => {
    if (e.target === recuperoPasswordOverlay) chiudiRecuperoPassword();
  });

  impostaPasswordBtn.addEventListener("click", confermaImpostaPassword);
  nuovaPasswordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confermaImpostaPassword();
  });

  pzTemaChiaroBtn.addEventListener("click", () => impostaTema("chiaro"));
  pzTemaNotteBtn.addEventListener("click", () => impostaTema("notte"));
  pazientePdfBtn.addEventListener("click", generaPdfDieta);

  gestioneUtentiToggle.addEventListener("click", toggleGestioneUtenti);
  invitoRuoloSelect.addEventListener("change", aggiornaVisibilitaBloccoPaziente);
  invitoPazienteSelect.addEventListener("change", aggiornaVisibilitaBloccoPaziente);
  invitoInviaBtn.addEventListener("click", inviaInvito);
  aggiornaVisibilitaBloccoPaziente();

  pazienteSelect.addEventListener("change", () => selezionaPaziente(pazienteSelect.value));
  nuovoPazienteBtn.addEventListener("click", apriNuovoPaziente);
  nuovoPazienteConfermaBtn.addEventListener("click", confermaNuovoPaziente);
  nuovoPazienteAnnullaBtn.addEventListener("click", chiudiNuovoPaziente);
  nuovoPazienteOverlay.addEventListener("click", (e) => {
    if (e.target === nuovoPazienteOverlay) chiudiNuovoPaziente();
  });

  storicoBtn.addEventListener("click", apriStorico);
  storicoChiudiBtn.addEventListener("click", chiudiStorico);
  storicoOverlay.addEventListener("click", (e) => {
    if (e.target === storicoOverlay) chiudiStorico();
  });
  storicoLista.addEventListener("click", (e) => {
    const btn = e.target.closest(".storico-apri-btn");
    if (btn) apriEStampaStorico(btn.dataset.id);
  });

  profiloBtn.addEventListener("click", apriProfiloPaziente);
  profiloSalvaBtn.addEventListener("click", salvaProfiloPaziente);
  profiloAnnullaBtn.addEventListener("click", chiudiProfiloPaziente);
  profiloOverlay.addEventListener("click", (e) => {
    if (e.target === profiloOverlay) chiudiProfiloPaziente();
  });

  salvaStoricoBtn.addEventListener("click", salvaComeStorico);

  foodInput.addEventListener("input", () => {
    aggiornaSuggerimenti();
    aggiornaPreview();
  });

  foodInput.addEventListener("keydown", (e) => {
    const items = suggestions.querySelectorAll(".suggestion-item");
    if (suggestions.classList.contains("hidden") || items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      suggestionIndex = Math.min(suggestionIndex + 1, items.length - 1);
      evidenziaSuggerimento();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      suggestionIndex = Math.max(suggestionIndex - 1, 0);
      evidenziaSuggerimento();
    } else if (e.key === "Enter" && suggestionIndex >= 0) {
      e.preventDefault();
      const scelto = JSON.parse(suggestions.dataset.items || "[]")[suggestionIndex];
      if (scelto) {
        foodInput.value = scelto;
        nascondiSuggerimenti();
        aggiornaPreview();
      }
    } else if (e.key === "Escape") {
      nascondiSuggerimenti();
    }
  });

  suggestions.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".suggestion-item");
    if (!item) return;
    e.preventDefault();
    const elenco = JSON.parse(suggestions.dataset.items || "[]");
    const nome = elenco[parseInt(item.dataset.index, 10)];
    foodInput.value = nome;
    nascondiSuggerimenti();
    aggiornaPreview();
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".autocomplete-wrapper")) {
      nascondiSuggerimenti();
    }
  });

  gramsInput.addEventListener("input", aggiornaPreview);
  addDraftBtn.addEventListener("click", aggiungiAlPastoInCorso);

  porzioneCheck.addEventListener("change", () => {
    porzioneInput.classList.toggle("hidden", !porzioneCheck.checked);
    if (porzioneCheck.checked) porzioneInput.focus();
  });

  sostituzioniInput.addEventListener("input", () => {
    state.sostituzioni = sostituzioniInput.value;
    salvaStateRemoto();
  });

  infoStudioInput.addEventListener("input", () => {
    state.infoStudio = infoStudioInput.value;
    salvaStateRemoto();
  });

  validoDalInput.addEventListener("change", () => {
    state.validoDal = validoDalInput.value;
    salvaStateRemoto();
  });

  validoAlInput.addEventListener("change", () => {
    state.validoAl = validoAlInput.value;
    salvaStateRemoto();
  });

  pastoLiberoBtn.addEventListener("click", inserisciPastoLibero);
  panoramicaToggle.addEventListener("click", togglePanoramica);
  impostazioniStampaToggle.addEventListener("click", toggleImpostazioniStampa);

  draftContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-btn")) {
      rimuoviDaDraft(parseInt(e.target.dataset.draftIndex, 10));
    }
  });

  renderGiorniCheckbox(confermaGiorniCheckbox, GIORNI);
  confermaGiorniCheckbox.addEventListener("change", aggiornaStatoConfermaBtn);
  aggiornaTestoDropdownGiorni();

  giorniDropdownBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    giorniDropdownPanel.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".giorni-dropdown")) {
      giorniDropdownPanel.classList.add("hidden");
    }
  });

  document.addEventListener("click", (e) => {
    const presetBtn = e.target.closest(".preset-btn");
    if (!presetBtn) return;
    const target = document.getElementById(presetBtn.dataset.target);
    if (!target) return;
    applicaPresetGiorni(target, presetBtn.dataset.preset);
    if (target === confermaGiorniCheckbox) aggiornaStatoConfermaBtn();
  });

  confermaPastoBtn.addEventListener("click", confermaPasto);
  svuotaPastoBtn.addEventListener("click", svuotaDraft);

  nuovoAlimentoBtn.addEventListener("click", () => {
    if (nuovoAlimentoForm.classList.contains("hidden")) apriFormNuovoAlimento();
    else chiudiFormNuovoAlimento();
  });
  annullaAlimentoBtn.addEventListener("click", chiudiFormNuovoAlimento);
  salvaAlimentoBtn.addEventListener("click", salvaNuovoAlimento);

  maxKcalInput.addEventListener("input", () => {
    state.maxKcal = maxKcalInput.value;
    salvaStateRemoto();
    renderDieta();
  });

  dietaContainer.addEventListener("click", (e) => {
    const duplicaGiornoBtn = e.target.closest(".duplica-giorno-btn");
    if (duplicaGiornoBtn) {
      apriDuplicaGiorno(duplicaGiornoBtn.dataset.giorno);
      return;
    }
    const duplicaPastoBtn = e.target.closest(".duplica-pasto-btn");
    if (duplicaPastoBtn) {
      apriDuplicaPasto(duplicaPastoBtn.dataset.giorno, duplicaPastoBtn.dataset.pasto);
      return;
    }
    const titoloClicked = e.target.closest(".giorno-titolo");
    if (titoloClicked) {
      const giorno = titoloClicked.dataset.giorno;
      if (collapsedGiorni.has(giorno)) collapsedGiorni.delete(giorno);
      else collapsedGiorni.add(giorno);
      renderDieta();
      return;
    }
    if (e.target.classList.contains("remove-btn")) {
      const { giorno, pasto, index } = e.target.dataset;
      rimuoviElemento(giorno, pasto, parseInt(index, 10));
    }
  });

  duplicaConfermaBtn.addEventListener("click", confermaDuplica);
  duplicaAnnullaBtn.addEventListener("click", chiudiDuplica);
  duplicaOverlay.addEventListener("click", (e) => {
    if (e.target === duplicaOverlay) chiudiDuplica();
  });

  pdfDietaBtn.addEventListener("click", generaPdfDieta);
  pdfSpesaBtn.addEventListener("click", generaPdfSpesa);
  pdfNutrizionistaBtn.addEventListener("click", generaPdfNutrizionista);
  resetBtn.addEventListener("click", svuotaDieta);

  window.addEventListener("afterprint", () => {
    document.body.classList.remove("stampa-dieta", "stampa-nutrizionista", "stampa-spesa");
  });

  inizializzaAuth();
}

// ---------- PWA: registrazione service worker ----------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(err => {
      console.warn("Registrazione service worker fallita:", err);
    });
  });
}

document.addEventListener("DOMContentLoaded", inizializza);
