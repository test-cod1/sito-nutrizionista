// ---------------------------------------------------------------------------
// Modalità "Calcolo rapido" — versione semplificata e INDIPENDENTE del sito.
//
// Obiettivo: fare in fretta i conti mentre la dieta viene scritta altrove
// (Word, carta, altro gestionale). Qui non ci sono pazienti, login, database:
// si sceglie un alimento, si dice quanto, e si vede subito il risultato.
//
// Nessuna riga di questo file parla con Supabase o con script.js: l'unica cosa
// condivisa col gestionale è il file di dati degli alimenti (foods.json), che è
// in sola lettura, e il tema chiaro/scuro. Tutto il resto (giornata in corso,
// alimenti personalizzati, dati per il fabbisogno) vive nel localStorage di
// questo browser.
// ---------------------------------------------------------------------------

const PASTI = ["Colazione", "Spuntino mattina", "Pranzo", "Merenda", "Cena"];
const TEMA_KEY = "dieta-nutrizionista-tema";
const CHIAVE_STATO = "rapido-stato-v1";
const CHIAVE_ALIMENTI = "rapido-alimenti-v1";

// Fattori di attività (PAL) per passare dal metabolismo basale al fabbisogno:
// stessi valori usati dal gestionale, così le due modalità non si contraddicono.
const FATTORI_ATTIVITA = {
  "Sedentario": 1.2,
  "Leggero": 1.375,
  "Moderato": 1.55,
  "Intenso": 1.725,
  "Molto intenso": 1.9
};

// Proteine suggerite in grammi per kg di peso corporeo, in base al livello di
// attività: sono valori di partenza dentro gli intervalli di uso comune
// (0,8–1 g/kg per l'adulto sedentario secondo i LARN, fino a ~2 g/kg negli
// sportivi). Restano una proposta modificabile: il valore digitato a mano ha
// sempre la precedenza.
const G_PER_KG_SUGGERITO = {
  "Sedentario": 1,
  "Leggero": 1.2,
  "Moderato": 1.4,
  "Intenso": 1.6,
  "Molto intenso": 1.8
};

// ---------- Stato ----------

function creaGiornataVuota() {
  const g = {};
  PASTI.forEach(p => { g[p] = []; });
  return g;
}

function creaStatoVuoto() {
  return {
    obiettivo: null,          // kcal obiettivo del giorno (null = nessuno)
    obiettivoProteine: null,  // grammi di proteine obiettivo (null = nessuno)
    giornata: creaGiornataVuota(),
    profilo: { sesso: "", eta: "", peso: "", altezza: "", attivita: "Moderato", correzione: "", gPerKg: "" }
  };
}

let state = creaStatoVuoto();
let alimentiBase = [];          // voci di foods.json, mai modificate
let alimentiCustom = [];        // alimenti creati qui, solo in locale
let foodMap = new Map();        // chiave (nome originale) -> valori per 100 g
let foodNames = [];             // chiavi ordinate per nome visualizzato
let indiceRicerca = [];         // stesse voci, con i testi già normalizzati
let displayToKey = new Map();   // nome visualizzato normalizzato -> chiave
let alimentoSelezionato = null; // { chiave, nome, per100 }
let modoCalcolo = "grammi";     // grammi | kcal | proteine
let calcoloCorrente = null;     // risultato mostrato nell'anteprima
let indiceSuggerimento = -1;
let timerToast = null;
let erroreCaricamentoAlimenti = false;

// ---------- Elementi ----------

const el = (id) => document.getElementById(id);

const temaChiaroBtn = el("tema-chiaro-btn");
const temaNotteBtn = el("tema-notte-btn");

const obiettivoInput = el("obiettivo-input");
const obiettivoProtInput = el("obiettivo-prot-input");
const fabbisognoToggle = el("fabbisogno-toggle");
const fabbisognoBox = el("fabbisogno-box");
const sessoGruppo = el("sesso-gruppo");
const etaInput = el("eta-input");
const pesoInput = el("peso-input");
const altezzaInput = el("altezza-input");
const attivitaSelect = el("attivita-select");
const correzioneInput = el("deficit-input");
const gkgInput = el("gkg-input");
const gkgNota = el("gkg-nota");
const fabbisognoEsito = el("fabbisogno-esito");

const foodInput = el("food-input");
const suggestions = el("suggestions");
const foodError = el("food-error");
const nuovoAlimentoBtn = el("nuovo-alimento-btn");
const nuovoAlimentoForm = el("nuovo-alimento-form");
const nuovoNome = el("nuovo-nome");
const nuovoKcal = el("nuovo-kcal");
const nuovoProt = el("nuovo-prot");
const nuovoFat = el("nuovo-fat");
const nuovoCarb = el("nuovo-carb");
const nuovoAlimentoError = el("nuovo-alimento-error");
const salvaAlimentoBtn = el("salva-alimento-btn");
const annullaAlimentoBtn = el("annulla-alimento-btn");

const alimentoScelto = el("alimento-scelto");
const alimentoSceltoNome = el("alimento-scelto-nome");
const alimentoSceltoPer100 = el("alimento-scelto-per100");
const alimentoEliminaBtn = el("alimento-elimina-btn");

const modoGruppo = el("modo-gruppo");
const quantitaInput = el("quantita-input");
const quantitaUnita = el("quantita-unita");
const modoNota = el("modo-nota");

const preview = el("preview");
const previewKcal = el("preview-kcal");
const previewGrammi = el("preview-grammi");
const previewProt = el("preview-prot");
const previewFat = el("preview-fat");
const previewCarb = el("preview-carb");

const notaInput = el("nota-input");
const pastoSelect = el("pasto-select");
const aggiungiBtn = el("aggiungi-btn");

const giornataContenuto = el("giornata-contenuto");
const totaliGiorno = el("totali-giorno");
const barraTotale = el("barra-totale");
const copiaBtn = el("copia-btn");
const stampaBtn = el("stampa-btn");
const annullaBtn = el("annulla-btn");
const svuotaBtn = el("svuota-btn");
const areaStampa = el("area-stampa");
const toast = el("toast");

const installaBtn = el("installa-btn");
const installaOverlay = el("installa-overlay");
const installaIstruzioni = el("installa-istruzioni");
const installaChiudiBtn = el("installa-chiudi-btn");

// ---------- Utilità ----------

function round1(n) { return Math.round(n * 10) / 10; }
function arrotonda(n) { return Math.round(n); }

function escapeHtml(testo) {
  return String(testo)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Minuscolo e senza accenti: serve per confrontare quello che si digita con i
// nomi del database (dove "però" e "pero" devono corrispondere entrambi).
function normalizzaTesto(s) {
  return (s == null ? "" : String(s)).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const NOMI_PROPRI = new Set(["bruxelles", "witloof", "iceberg", "cheddar", "grana", "parmigiano", "gouda", "brie", "emmental", "camembert", "philadelphia", "gorgonzola"]);

function sentenceCase(str) {
  return str.trim().split(/\s+/).map((p, i) => {
    const w = p.toLowerCase();
    if (NOMI_PROPRI.has(w) || i === 0) return w.charAt(0).toUpperCase() + w.slice(1);
    return w;
  }).join(" ");
}

// I nomi del database CREA sono in MAIUSCOLO con la coda invertita
// ("AGLIO, fresco"): qui diventano leggibili ("Aglio (fresco)").
function formattaNome(nome) {
  if (!nome) return nome;
  const i = nome.indexOf(",");
  const main = i >= 0 ? nome.slice(0, i) : nome;
  // La virgola iniziale va tolta: nel database CREA qualche voce ne ha due di
  // fila ("POLLO,, INTERO") e senza questo si leggerebbe "Pollo (, intero)".
  const qual = i >= 0 ? nome.slice(i + 1).replace(/^[\s,]+/, "").trim() : "";
  const mainFmt = sentenceCase(main);
  return qual ? `${mainFmt} (${qual.toLowerCase()})` : mainFmt;
}

function mostraToast(messaggio) {
  toast.textContent = messaggio;
  toast.classList.remove("hidden");
  clearTimeout(timerToast);
  timerToast = setTimeout(() => toast.classList.add("hidden"), 2200);
}

// ---------- Tema ----------

function applicaTema(tema) {
  const notte = tema === "notte";
  document.documentElement.classList.toggle("tema-notte", notte);
  temaChiaroBtn.classList.toggle("attivo", !notte);
  temaNotteBtn.classList.toggle("attivo", notte);
  // aria-pressed: a chi usa uno screen reader dice quale delle due modalità è
  // attiva, informazione che altrimenti passa solo dal colore del bottone.
  temaChiaroBtn.setAttribute("aria-pressed", String(!notte));
  temaNotteBtn.setAttribute("aria-pressed", String(notte));
}

function inizializzaTema() {
  let tema = null;
  try { tema = localStorage.getItem(TEMA_KEY); } catch (e) { /* storage non disponibile */ }
  if (tema !== "chiaro" && tema !== "notte") {
    tema = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "notte" : "chiaro";
  }
  applicaTema(tema);
  const imposta = (t) => {
    applicaTema(t);
    try { localStorage.setItem(TEMA_KEY, t); } catch (e) { /* ignora */ }
  };
  temaChiaroBtn.addEventListener("click", () => imposta("chiaro"));
  temaNotteBtn.addEventListener("click", () => imposta("notte"));
}

// ---------- Persistenza locale ----------

function salvaStato() {
  try { localStorage.setItem(CHIAVE_STATO, JSON.stringify(state)); } catch (e) { /* quota/privato */ }
}

function caricaStato() {
  let salvato = null;
  try { salvato = JSON.parse(localStorage.getItem(CHIAVE_STATO) || "null"); } catch (e) { salvato = null; }
  if (!salvato || typeof salvato !== "object") return;

  const nuovo = creaStatoVuoto();
  nuovo.obiettivo = Number(salvato.obiettivo) > 0 ? Number(salvato.obiettivo) : null;
  nuovo.obiettivoProteine = Number(salvato.obiettivoProteine) > 0 ? Number(salvato.obiettivoProteine) : null;
  if (salvato.profilo && typeof salvato.profilo === "object") {
    Object.assign(nuovo.profilo, salvato.profilo);
  }
  // Rileggiamo voce per voce: una struttura salvata da una versione diversa
  // (o manomessa) non deve poter rompere il rendering.
  PASTI.forEach(pasto => {
    const voci = salvato.giornata && Array.isArray(salvato.giornata[pasto]) ? salvato.giornata[pasto] : [];
    nuovo.giornata[pasto] = voci.filter(v => v && v.per100).map(v => ({
      nome: String(v.nome || "Alimento"),
      grammi: Math.max(0, Number(v.grammi) || 0),
      nota: String(v.nota || ""),
      per100: normalizzaPer100(v.per100)
    }));
  });
  state = nuovo;
}

function salvaAlimentiCustom() {
  try { localStorage.setItem(CHIAVE_ALIMENTI, JSON.stringify(alimentiCustom)); } catch (e) { /* ignora */ }
}

function caricaAlimentiCustom() {
  try {
    const dati = JSON.parse(localStorage.getItem(CHIAVE_ALIMENTI) || "[]");
    alimentiCustom = Array.isArray(dati) ? dati.filter(a => a && a.nome) : [];
  } catch (e) {
    alimentiCustom = [];
  }
}

// ---------- Database alimenti ----------

// `|| 0` difensivo: un valore mancante darebbe NaN e il NaN si propagherebbe in
// tutti i totali della giornata.
function normalizzaPer100(a) {
  return {
    kcal: Math.max(0, Number(a.kcal) || 0),
    proteine: Math.max(0, Number(a.proteine) || 0),
    grassi: Math.max(0, Number(a.grassi) || 0),
    carboidrati: Math.max(0, Number(a.carboidrati) || 0)
  };
}

// Ricostruisce SEMPRE la mappa da zero, base + personalizzati. Fondamentale
// per gli alimenti personalizzati che hanno lo stesso nome di uno del database
// CREA: eliminandone uno deve riaffiorare la voce di base, non sparire tutto.
function ricostruisciElenco() {
  foodMap = new Map();
  alimentiBase.forEach(a => foodMap.set(a.nome, normalizzaPer100(a)));
  alimentiCustom.forEach(a => foodMap.set(a.nome, normalizzaPer100(a)));

  foodNames = Array.from(foodMap.keys()).sort((a, b) => formattaNome(a).localeCompare(formattaNome(b), "it"));
  displayToKey = new Map();
  foodNames.forEach(k => displayToKey.set(normalizzaTesto(formattaNome(k)), k));
  // Indice pre-normalizzato: la ricerca scorre 900+ voci a ogni tasto premuto,
  // rifare ogni volta formattaNome + normalizzaTesto renderebbe la digitazione
  // a scatti. L'ordine è quello alfabetico di foodNames e viene conservato.
  indiceRicerca = foodNames.map(k => ({
    chiave: k,
    testoChiave: normalizzaTesto(k),
    testoMostrato: normalizzaTesto(formattaNome(k))
  }));
}

async function caricaAlimenti() {
  try {
    const risposta = await fetch("foods.json");
    alimentiBase = await risposta.json();
  } catch (e) {
    alimentiBase = [];
    erroreCaricamentoAlimenti = true;
    foodError.textContent = "Non è stato possibile caricare l'elenco degli alimenti. Controlla la connessione e ricarica la pagina.";
    foodError.classList.remove("hidden");
  }
  ricostruisciElenco();
}

function ePersonalizzato(chiave) {
  return alimentiCustom.some(a => a.nome === chiave);
}

// ---------- Autocompletamento ----------

function mostraSuggerimenti(chiavi) {
  indiceSuggerimento = -1;
  if (!chiavi.length) {
    nascondiSuggerimenti();
    return;
  }
  suggestions.innerHTML = chiavi.map((k, i) => {
    const tag = ePersonalizzato(k) ? ' <span class="tag-custom">mio</span>' : "";
    return `<div class="suggestion-item" data-index="${i}">${escapeHtml(formattaNome(k))}${tag}</div>`;
  }).join("");
  suggestions.dataset.items = JSON.stringify(chiavi);
  suggestions.classList.remove("hidden");
}

function nascondiSuggerimenti() {
  suggestions.innerHTML = "";
  suggestions.dataset.items = "[]";
  suggestions.classList.add("hidden");
  indiceSuggerimento = -1;
}

// Vero se `q` compare in `testo` all'inizio di una parola: serve a far salire
// "Petto di pollo" o "Pollo (ala)" quando si cerca "pollo", tenendo sotto le
// voci in cui il testo cercato capita in mezzo a una parola ("Cipolle").
function iniziaParola(testo, q) {
  let i = testo.indexOf(q);
  while (i !== -1) {
    if (i === 0 || /[\s,.;:/(\['"«-]/.test(testo.charAt(i - 1))) return true;
    i = testo.indexOf(q, i + 1);
  }
  return false;
}

// Quanto è "buona" la corrispondenza: 0 il nome comincia col testo cercato,
// 1 comincia con esso una delle parole successive, 2 lo contiene e basta.
// null = nessuna corrispondenza.
function rangoCorrispondenza(voce, q) {
  if (voce.testoMostrato.startsWith(q) || voce.testoChiave.startsWith(q)) return 0;
  if (iniziaParola(voce.testoMostrato, q) || iniziaParola(voce.testoChiave, q)) return 1;
  if (voce.testoMostrato.includes(q) || voce.testoChiave.includes(q)) return 2;
  return null;
}

function aggiornaSuggerimenti() {
  const q = normalizzaTesto(foodInput.value.trim());
  if (!q) {
    nascondiSuggerimenti();
    return;
  }
  const trovati = [];
  indiceRicerca.forEach(voce => {
    const rango = rangoCorrispondenza(voce, q);
    if (rango !== null) trovati.push({ rango, chiave: voce.chiave });
  });
  // sort() è stabile: a parità di rango resta l'ordine alfabetico di partenza.
  trovati.sort((a, b) => a.rango - b.rango);
  mostraSuggerimenti(trovati.slice(0, 50).map(t => t.chiave));
}

function evidenziaSuggerimento() {
  const items = suggestions.querySelectorAll(".suggestion-item");
  items.forEach((item, i) => item.classList.toggle("active", i === indiceSuggerimento));
  if (indiceSuggerimento >= 0 && items[indiceSuggerimento]) {
    items[indiceSuggerimento].scrollIntoView({ block: "nearest" });
  }
}

function scegliSuggerimento(indice) {
  const chiavi = JSON.parse(suggestions.dataset.items || "[]");
  const chiave = chiavi[indice];
  if (!chiave) return;
  foodInput.value = formattaNome(chiave);
  nascondiSuggerimenti();
  selezionaAlimento(chiave);
  quantitaInput.focus();
  quantitaInput.select();
}

// Dal testo digitato risale alla chiave originale del database.
function risolviChiave(testo) {
  const raw = (testo || "").trim();
  if (!raw) return null;
  if (foodMap.has(raw)) return raw;
  return displayToKey.get(normalizzaTesto(raw)) || null;
}

// ---------- Selezione alimento e calcolo ----------

function selezionaAlimento(chiave) {
  if (!chiave || !foodMap.has(chiave)) {
    alimentoSelezionato = null;
    alimentoScelto.classList.add("hidden");
  } else {
    const per100 = foodMap.get(chiave);
    alimentoSelezionato = { chiave, nome: formattaNome(chiave), per100 };
    alimentoSceltoNome.textContent = alimentoSelezionato.nome;
    alimentoSceltoPer100.textContent =
      `per 100 g: ${round1(per100.kcal)} kcal · ${round1(per100.proteine)} P · ${round1(per100.grassi)} G · ${round1(per100.carboidrati)} C`;
    alimentoEliminaBtn.classList.toggle("hidden", !ePersonalizzato(chiave));
    alimentoScelto.classList.remove("hidden");
  }
  aggiornaAnteprima();
}

function testoNotaModo() {
  if (modoCalcolo === "grammi") return "Scrivi i grammi: calcoliamo calorie e macronutrienti.";
  if (modoCalcolo === "kcal") return "Scrivi le calorie che vuoi ottenere: calcoliamo i grammi da mettere nella dieta.";
  return "Scrivi i grammi di proteine da raggiungere: calcoliamo i grammi di alimento.";
}

function impostaModo(modo) {
  modoCalcolo = modo;
  Array.from(modoGruppo.children).forEach(b => b.classList.toggle("attivo", b.dataset.modo === modo));
  if (modo === "grammi") quantitaUnita.textContent = "g";
  else if (modo === "kcal") quantitaUnita.textContent = "kcal";
  else quantitaUnita.textContent = "g prot.";
  aggiornaAnteprima();
}

// Traduce il valore digitato in grammi di alimento, secondo la modalità scelta.
// Restituisce null se il calcolo non è possibile (es. grammi di proteine
// richiesti da un alimento che non ne contiene).
function grammiDaValore(per100, valore) {
  if (modoCalcolo === "grammi") return valore;
  const per1g = (modoCalcolo === "kcal" ? per100.kcal : per100.proteine) / 100;
  if (per1g <= 0) return null;
  return valore / per1g;
}

// I grammi si arrotondano PRIMA di calcolare i macronutrienti: così l'anteprima
// e la riga poi inserita nella giornata mostrano esattamente gli stessi numeri.
function calcolaVoce(per100, grammi) {
  const arrotondati = Math.round(grammi);
  const f = arrotondati / 100;
  return {
    grammi: arrotondati,
    kcal: round1(per100.kcal * f),
    proteine: round1(per100.proteine * f),
    grassi: round1(per100.grassi * f),
    carboidrati: round1(per100.carboidrati * f)
  };
}

function aggiornaAnteprima() {
  const testo = foodInput.value.trim();
  // L'avviso "non trovato" compare solo se si sta scrivendo qualcosa. Se invece
  // è fallito il caricamento del database resta sempre a video: senza alimenti
  // la pagina non può funzionare.
  if (!erroreCaricamentoAlimenti) {
    foodError.classList.toggle("hidden", !testo || !!alimentoSelezionato);
  }
  modoNota.textContent = testoNotaModo();

  const valore = parseFloat(quantitaInput.value);
  if (!alimentoSelezionato || !valore || valore <= 0) {
    preview.classList.add("hidden");
    aggiungiBtn.disabled = true;
    calcoloCorrente = null;
    return;
  }

  const grammi = grammiDaValore(alimentoSelezionato.per100, valore);
  if (grammi === null || !isFinite(grammi) || grammi <= 0) {
    preview.classList.add("hidden");
    aggiungiBtn.disabled = true;
    calcoloCorrente = null;
    modoNota.textContent = modoCalcolo === "kcal"
      ? "Questo alimento non apporta calorie: non si può partire da un valore calorico."
      : "Questo alimento non contiene proteine: non si può partire dalle proteine.";
    return;
  }

  const v = calcolaVoce(alimentoSelezionato.per100, grammi);

  // Sotto il grammo il peso arrotonderebbe a 0: si finirebbe per inserire nel
  // piano una riga da "0 g / 0 kcal", che non vuol dire nulla.
  if (v.grammi < 1) {
    preview.classList.add("hidden");
    aggiungiBtn.disabled = true;
    calcoloCorrente = null;
    modoNota.textContent = modoCalcolo === "grammi"
      ? "Quantità troppo piccola: serve almeno 1 g."
      : "Quantità troppo piccola: corrisponde a meno di 1 g di alimento.";
    return;
  }

  calcoloCorrente = { nome: alimentoSelezionato.nome, grammi: v.grammi, per100: alimentoSelezionato.per100 };

  previewKcal.textContent = v.kcal;
  previewGrammi.textContent = modoCalcolo === "grammi" ? "" : `≈ ${v.grammi} g`;
  previewProt.textContent = v.proteine;
  previewFat.textContent = v.grassi;
  previewCarb.textContent = v.carboidrati;
  preview.classList.remove("hidden");
  aggiungiBtn.disabled = false;
}

// ---------- Alimenti personalizzati (solo locali) ----------

function apriFormNuovoAlimento() {
  nuovoAlimentoForm.classList.remove("hidden");
  nuovoNome.value = foodInput.value.trim();
  nascondiSuggerimenti();
  nuovoNome.focus();
}

function chiudiFormNuovoAlimento() {
  nuovoAlimentoForm.classList.add("hidden");
  nuovoAlimentoError.classList.add("hidden");
  [nuovoNome, nuovoKcal, nuovoProt, nuovoFat, nuovoCarb].forEach(i => { i.value = ""; });
}

function salvaNuovoAlimento() {
  const nome = nuovoNome.value.trim();
  const valori = [nuovoKcal, nuovoProt, nuovoFat, nuovoCarb].map(i => parseFloat(i.value));
  if (!nome || valori.some(v => isNaN(v) || v < 0)) {
    nuovoAlimentoError.classList.remove("hidden");
    return;
  }
  const alimento = {
    nome,
    kcal: round1(valori[0]),
    proteine: round1(valori[1]),
    grassi: round1(valori[2]),
    carboidrati: round1(valori[3])
  };
  alimentiCustom = alimentiCustom.filter(a => a.nome !== nome);
  alimentiCustom.push(alimento);
  salvaAlimentiCustom();
  ricostruisciElenco();
  chiudiFormNuovoAlimento();

  foodInput.value = formattaNome(nome);
  selezionaAlimento(nome);
  mostraToast("Alimento salvato su questo dispositivo");
  quantitaInput.focus();
}

function eliminaAlimentoPersonalizzato() {
  if (!alimentoSelezionato || !ePersonalizzato(alimentoSelezionato.chiave)) return;
  const chiave = alimentoSelezionato.chiave;
  if (!confirm(`Eliminare l'alimento personalizzato "${formattaNome(chiave)}"? Le voci già inserite nella giornata restano invariate.`)) return;

  alimentiCustom = alimentiCustom.filter(a => a.nome !== chiave);
  salvaAlimentiCustom();
  ricostruisciElenco();

  // Se il nome esisteva anche nel database CREA, la voce di base torna in gioco:
  // la si rimette in campo invece di svuotare tutto, così si vede cos'è cambiato.
  if (foodMap.has(chiave)) {
    foodInput.value = formattaNome(chiave);
    selezionaAlimento(chiave);
    mostraToast("Eliminato: tornano i valori dell'alimento di base");
  } else {
    foodInput.value = "";
    selezionaAlimento(null);
    mostraToast("Alimento eliminato");
  }
}

// ---------- Annulla ----------
// Ogni modifica alla giornata mette da parte una copia di com'era PRIMA, con
// una descrizione in italiano da mostrare all'utente. Si annulla a ritroso.
// La pila vive solo in memoria: chiudendo o ricaricando la pagina si perde,
// mentre la giornata (già salvata) resta.

const MAX_ANNULLA = 20;
let pilaAnnulla = [];
// Modifica di un peso in corso: la copia viene presa quando il campo riceve il
// fuoco e finisce nella pila solo se il valore cambia davvero, altrimenti ogni
// cifra digitata sarebbe un passo di annullamento a sé.
let modificaPesoInCorso = null;

function clonaGiornata() {
  return JSON.parse(JSON.stringify(state.giornata));
}

function registraAnnulla(descrizione) {
  pilaAnnulla.push({ giornata: clonaGiornata(), descrizione });
  if (pilaAnnulla.length > MAX_ANNULLA) pilaAnnulla.shift();
  aggiornaBottoneAnnulla();
}

function aggiornaBottoneAnnulla() {
  const ultima = pilaAnnulla[pilaAnnulla.length - 1];
  annullaBtn.disabled = !ultima;
  const testo = ultima ? `Annulla: ${ultima.descrizione}` : "Niente da annullare";
  annullaBtn.title = testo;
  annullaBtn.setAttribute("aria-label", testo);
}

function annullaUltima() {
  const ultima = pilaAnnulla.pop();
  if (!ultima) return;
  state.giornata = ultima.giornata;
  salvaStato();
  renderGiornata();
  aggiornaBottoneAnnulla();
  mostraToast("Annullato: " + ultima.descrizione);
}

// ---------- Giornata ----------

function totaliVoci(voci) {
  return voci.reduce((acc, voce) => {
    const v = calcolaVoce(voce.per100, voce.grammi);
    acc.kcal += v.kcal;
    acc.proteine += v.proteine;
    acc.grassi += v.grassi;
    acc.carboidrati += v.carboidrati;
    return acc;
  }, { kcal: 0, proteine: 0, grassi: 0, carboidrati: 0 });
}

function totaliGiornata() {
  return totaliVoci(PASTI.flatMap(p => state.giornata[p]));
}

function giornataVuota() {
  return PASTI.every(p => state.giornata[p].length === 0);
}

function aggiungiAlPasto() {
  if (!calcoloCorrente) return;
  const pasto = pastoSelect.value;
  registraAnnulla(`aggiunta di ${calcoloCorrente.nome} a ${pasto}`);
  state.giornata[pasto].push({
    nome: calcoloCorrente.nome,
    grammi: calcoloCorrente.grammi,
    nota: notaInput.value.trim(),
    per100: calcoloCorrente.per100
  });
  salvaStato();
  renderGiornata();

  // Campo alimento pronto per la voce successiva; il pasto resta quello scelto.
  foodInput.value = "";
  quantitaInput.value = "";
  notaInput.value = "";
  nascondiSuggerimenti();
  selezionaAlimento(null);
  mostraToast(`Aggiunto a ${pasto}`);
  foodInput.focus();
}

// Percentuali di energia dai tre macronutrienti (4/9/4 kcal per grammo).
function ripartizioneMacro(t) {
  const kcalProt = t.proteine * 4;
  const kcalFat = t.grassi * 9;
  const kcalCarb = t.carboidrati * 4;
  const somma = kcalProt + kcalFat + kcalCarb;
  if (somma <= 0) return { prot: 0, fat: 0, carb: 0 };
  return {
    prot: Math.round((kcalProt / somma) * 100),
    fat: Math.round((kcalFat / somma) * 100),
    carb: Math.round((kcalCarb / somma) * 100)
  };
}

function rigaAlimentoHtml(voce, pasto, indice) {
  const v = calcolaVoce(voce.per100, voce.grammi);
  const nota = voce.nota ? ` · ${escapeHtml(voce.nota)}` : "";
  return `
    <div class="riga-alimento" data-pasto="${escapeHtml(pasto)}" data-indice="${indice}">
      <div class="riga-testo">
        <div class="riga-nome">${escapeHtml(voce.nome)}</div>
        <div class="riga-dettaglio">${v.proteine} P · ${v.grassi} G · ${v.carboidrati} C${nota}</div>
      </div>
      <input type="number" class="riga-grammi" value="${v.grammi}" min="0" step="1" inputmode="numeric"
             data-pasto="${escapeHtml(pasto)}" data-indice="${indice}" aria-label="Grammi di ${escapeHtml(voce.nome)}">
      <span class="riga-unita">g</span>
      <span class="riga-kcal">${v.kcal} kcal</span>
      <button type="button" class="riga-elimina" data-pasto="${escapeHtml(pasto)}" data-indice="${indice}"
              title="Togli dalla giornata" aria-label="Togli ${escapeHtml(voce.nome)} dalla giornata">✕</button>
    </div>
  `;
}

function pastoHtml(pasto, kcalGiorno) {
  const voci = state.giornata[pasto];
  const t = totaliVoci(voci);
  const quota = kcalGiorno > 0 ? Math.round((t.kcal / kcalGiorno) * 100) : 0;
  return `
    <div class="pasto" data-pasto="${escapeHtml(pasto)}">
      <div class="pasto-testata">
        <span class="pasto-nome">${pasto}</span>
        <span class="pasto-kcal">${arrotonda(t.kcal)} kcal <span class="pasto-quota">(${quota}%)</span></span>
        <div class="pasto-azioni no-print">
          <button type="button" data-copia-pasto="${escapeHtml(pasto)}" title="Copia questo pasto" aria-label="Copia ${pasto}">📋</button>
          <button type="button" data-svuota-pasto="${escapeHtml(pasto)}" title="Svuota questo pasto" aria-label="Svuota ${pasto}">🗑</button>
        </div>
      </div>
      <div class="pasto-macro">${round1(t.proteine)} g proteine · ${round1(t.grassi)} g grassi · ${round1(t.carboidrati)} g carboidrati</div>
      ${voci.map((voce, i) => rigaAlimentoHtml(voce, pasto, i)).join("")}
    </div>
  `;
}

function totaliHtml(t) {
  const macro = ripartizioneMacro(t);
  const obiettivo = state.obiettivo;
  let barraObiettivo = "";
  let residuo = "";

  if (obiettivo > 0) {
    const percentuale = Math.min(100, Math.round((t.kcal / obiettivo) * 100));
    const sforato = t.kcal > obiettivo;
    const scarto = Math.abs(arrotonda(obiettivo - t.kcal));
    residuo = sforato
      ? `<span class="totali-residuo sforato">${scarto} kcal oltre l'obiettivo (${arrotonda(obiettivo)})</span>`
      : `<span class="totali-residuo">restano ${scarto} kcal su ${arrotonda(obiettivo)}</span>`;
    barraObiettivo = `<div class="barra-obiettivo"><span class="${sforato ? "sforato" : ""}" style="width:${percentuale}%"></span></div>`;
  }

  // Obiettivo proteine: qui "oltre" non è un allarme come per le calorie (è
  // normale superarlo di poco), quindi la barra piena resta del colore delle
  // proteine e cambia solo il testo.
  let bloccoProteine = "";
  if (state.obiettivoProteine > 0) {
    const meta = state.obiettivoProteine;
    const percentuale = Math.min(100, Math.round((t.proteine / meta) * 100));
    const scarto = round1(Math.abs(meta - t.proteine));
    const raggiunto = t.proteine >= meta;
    bloccoProteine = `
      <div class="totali-riga-obiettivo">
        <span>Proteine <strong>${round1(t.proteine)}</strong> / ${round1(meta)} g</span>
        <span class="${raggiunto ? "obiettivo-raggiunto" : ""}">${raggiunto ? `obiettivo raggiunto (+${scarto} g)` : `mancano ${scarto} g`}</span>
      </div>
      <div class="barra-obiettivo barra-proteine"><span style="width:${percentuale}%"></span></div>
    `;
  }

  return `
    <div class="totali">
      <div class="totali-testata">
        <span class="totali-kcal">${arrotonda(t.kcal)} kcal</span>
        ${residuo}
      </div>
      ${barraObiettivo}
      ${bloccoProteine}
      <div class="macro-barra">
        <i class="m-prot" style="width:${macro.prot}%"></i><i class="m-fat" style="width:${macro.fat}%"></i><i class="m-carb" style="width:${macro.carb}%"></i>
      </div>
      <div class="macro-legenda">
        <span><i class="punto p-prot"></i>Proteine <b>${round1(t.proteine)} g</b> (${macro.prot}%)</span>
        <span><i class="punto p-fat"></i>Grassi <b>${round1(t.grassi)} g</b> (${macro.fat}%)</span>
        <span><i class="punto p-carb"></i>Carboidrati <b>${round1(t.carboidrati)} g</b> (${macro.carb}%)</span>
      </div>
    </div>
  `;
}

function renderBarraTotale(t) {
  if (giornataVuota()) {
    barraTotale.classList.add("hidden");
    return;
  }
  let residuo = "";
  if (state.obiettivo > 0) {
    const scarto = arrotonda(state.obiettivo - t.kcal);
    residuo = scarto >= 0
      ? `<span class="bt-residuo">restano ${scarto} kcal</span>`
      : `<span class="bt-residuo sforato">+${Math.abs(scarto)} kcal</span>`;
  }
  let residuoProt = "";
  if (state.obiettivoProteine > 0) {
    const scarto = round1(state.obiettivoProteine - t.proteine);
    residuoProt = scarto > 0
      ? `<span class="bt-residuo bt-residuo-prot">${scarto} g prot.</span>`
      : `<span class="bt-residuo bt-residuo-prot obiettivo-raggiunto">prot. ✓</span>`;
  }
  barraTotale.innerHTML = `
    <span class="bt-kcal">${arrotonda(t.kcal)} kcal</span>
    <span class="bt-macro">${round1(t.proteine)} P · ${round1(t.grassi)} G · ${round1(t.carboidrati)} C</span>
    ${residuo}
    ${residuoProt}
  `;
  barraTotale.classList.remove("hidden");
}

function renderGiornata() {
  const t = totaliGiornata();

  if (giornataVuota()) {
    giornataContenuto.innerHTML = '<p class="vuoto">Nessun alimento inserito: comincia dal riquadro qui sopra.</p>';
    totaliGiorno.innerHTML = "";
  } else {
    giornataContenuto.innerHTML = PASTI
      .filter(p => state.giornata[p].length > 0)
      .map(p => pastoHtml(p, t.kcal))
      .join("");
    totaliGiorno.innerHTML = totaliHtml(t);
  }
  renderBarraTotale(t);
}

// Ricalcola i numeri già a video SENZA ricostruire l'elenco: mentre si corregge
// il peso di una riga il campo deve restare dov'è, con il cursore dentro (un
// render completo lo distruggerebbe a ogni cifra digitata).
function aggiornaCalcoliUI() {
  const t = totaliGiornata();

  giornataContenuto.querySelectorAll(".pasto").forEach(blocco => {
    const pasto = blocco.dataset.pasto;
    const voci = state.giornata[pasto] || [];
    const tp = totaliVoci(voci);
    const quota = t.kcal > 0 ? Math.round((tp.kcal / t.kcal) * 100) : 0;
    blocco.querySelector(".pasto-kcal").innerHTML =
      `${arrotonda(tp.kcal)} kcal <span class="pasto-quota">(${quota}%)</span>`;
    blocco.querySelector(".pasto-macro").textContent =
      `${round1(tp.proteine)} g proteine · ${round1(tp.grassi)} g grassi · ${round1(tp.carboidrati)} g carboidrati`;
  });

  giornataContenuto.querySelectorAll(".riga-alimento").forEach(riga => {
    const voce = vocePer(riga.dataset.pasto, Number(riga.dataset.indice));
    if (!voce) return;
    const v = calcolaVoce(voce.per100, voce.grammi);
    const nota = voce.nota ? ` · ${voce.nota}` : "";
    riga.querySelector(".riga-dettaglio").textContent =
      `${v.proteine} P · ${v.grassi} G · ${v.carboidrati} C${nota}`;
    riga.querySelector(".riga-kcal").textContent = `${v.kcal} kcal`;
  });

  totaliGiorno.innerHTML = totaliHtml(t);
  renderBarraTotale(t);
}

function vocePer(pasto, indice) {
  return (state.giornata[pasto] && state.giornata[pasto][indice]) || null;
}

function rimuoviVoce(pasto, indice) {
  const voce = vocePer(pasto, indice);
  if (!voce) return;
  registraAnnulla(`rimozione di ${voce.nome} da ${pasto}`);
  state.giornata[pasto].splice(indice, 1);
  salvaStato();
  renderGiornata();
}

function svuotaPasto(pasto) {
  if (!state.giornata[pasto] || !state.giornata[pasto].length) return;
  if (!confirm(`Svuotare "${pasto}"?`)) return;
  registraAnnulla(`svuotamento di ${pasto}`);
  state.giornata[pasto] = [];
  salvaStato();
  renderGiornata();
}

function svuotaGiornata() {
  if (giornataVuota()) return;
  if (!confirm("Svuotare tutta la giornata? Puoi comunque tornare indietro con «Annulla».")) return;
  registraAnnulla("svuotamento della giornata");
  state.giornata = creaGiornataVuota();
  salvaStato();
  renderGiornata();
}

// ---------- Copia negli appunti ----------

function testoPasto(pasto) {
  const voci = state.giornata[pasto];
  if (!voci.length) return "";
  const t = totaliVoci(voci);
  const righe = voci.map(voce => {
    const nota = voce.nota ? ` (${voce.nota})` : "";
    return `- ${voce.nome}: ${voce.grammi} g${nota}`;
  });
  return `${pasto.toUpperCase()} — ${arrotonda(t.kcal)} kcal\n${righe.join("\n")}`;
}

function testoGiornata() {
  const blocchi = PASTI.map(testoPasto).filter(Boolean);
  if (!blocchi.length) return "";
  const t = totaliGiornata();
  const macro = ripartizioneMacro(t);
  const obiettivo = state.obiettivo > 0 ? ` (obiettivo ${arrotonda(state.obiettivo)} kcal)` : "";
  // Con l'obiettivo proteine attivo si scrive "93,3/109 g": la percentuale tra
  // parentesi resta quella della ripartizione energetica, come per gli altri
  // due macronutrienti.
  const proteineTxt = state.obiettivoProteine > 0
    ? `${round1(t.proteine)}/${round1(state.obiettivoProteine)} g`
    : `${round1(t.proteine)} g`;
  return blocchi.join("\n\n") +
    `\n\nTOTALE GIORNATA: ${arrotonda(t.kcal)} kcal${obiettivo}` +
    `\nProteine ${proteineTxt} (${macro.prot}%) · Grassi ${round1(t.grassi)} g (${macro.fat}%) · Carboidrati ${round1(t.carboidrati)} g (${macro.carb}%)`;
}

async function copiaTesto(testo, messaggio) {
  if (!testo) {
    mostraToast("Non c'è ancora nulla da copiare");
    return;
  }
  try {
    await navigator.clipboard.writeText(testo);
    mostraToast(messaggio);
  } catch (e) {
    // Fallback per browser/contesti in cui l'API Clipboard non è disponibile.
    const area = document.createElement("textarea");
    area.value = testo;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let riuscito = false;
    try { riuscito = document.execCommand("copy"); } catch (err) { riuscito = false; }
    area.remove();
    mostraToast(riuscito ? messaggio : "Copia non riuscita: seleziona il testo a mano");
  }
}

// ---------- Stampa ----------

// Ricostruisce il foglio da stampare. Va richiamata anche da "beforeprint":
// in stampa il resto della pagina è nascosto, quindi se si usa Ctrl+P (o
// Condividi → Stampa su iPad) senza passare dal pulsante, senza questo si
// stamperebbe il contenuto vecchio o un foglio bianco.
function costruisciAreaStampa() {
  if (giornataVuota()) {
    areaStampa.innerHTML = `
      <h1 class="stampa-titolo">Giornata alimentare</h1>
      <p class="stampa-meta">Calcolo rapido del ${new Date().toLocaleDateString("it-IT")}</p>
      <p>Nessun alimento inserito.</p>
    `;
    return false;
  }
  const t = totaliGiornata();
  const macro = ripartizioneMacro(t);

  const pasti = PASTI.filter(p => state.giornata[p].length > 0).map(pasto => {
    const voci = state.giornata[pasto];
    const tp = totaliVoci(voci);
    const righe = voci.map(voce => {
      const v = calcolaVoce(voce.per100, voce.grammi);
      return `<tr>
        <td>${escapeHtml(voce.nome)}${voce.nota ? ` <em>(${escapeHtml(voce.nota)})</em>` : ""}</td>
        <td class="num">${v.grammi} g</td>
        <td class="num">${v.kcal}</td>
        <td class="num">${v.proteine}</td>
        <td class="num">${v.grassi}</td>
        <td class="num">${v.carboidrati}</td>
      </tr>`;
    }).join("");
    return `
      <div class="stampa-pasto">
        <h3><span>${pasto}</span><span>${arrotonda(tp.kcal)} kcal</span></h3>
        <table class="stampa-tabella">
          <thead><tr><th>Alimento</th><th class="num">Quantità</th><th class="num">kcal</th><th class="num">Prot.</th><th class="num">Grassi</th><th class="num">Carb.</th></tr></thead>
          <tbody>${righe}</tbody>
        </table>
      </div>`;
  }).join("");

  const obiettivi = [
    state.obiettivo > 0 ? `${arrotonda(state.obiettivo)} kcal` : "",
    state.obiettivoProteine > 0 ? `${round1(state.obiettivoProteine)} g di proteine` : ""
  ].filter(Boolean).join(" e ");
  const obiettivo = obiettivi ? ` · Obiettivo: ${obiettivi}` : "";
  areaStampa.innerHTML = `
    <h1 class="stampa-titolo">Giornata alimentare</h1>
    <p class="stampa-meta">Calcolo rapido del ${new Date().toLocaleDateString("it-IT")}${obiettivo}</p>
    ${pasti}
    <div class="stampa-totali">
      Totale giornata: ${arrotonda(t.kcal)} kcal
      <div class="dettaglio">Proteine ${round1(t.proteine)} g (${macro.prot}%) · Grassi ${round1(t.grassi)} g (${macro.fat}%) · Carboidrati ${round1(t.carboidrati)} g (${macro.carb}%)</div>
    </div>
  `;
  return true;
}

// ---------- Fabbisogno calorico ----------

function leggiProfiloDaiCampi() {
  state.profilo.eta = etaInput.value;
  state.profilo.peso = pesoInput.value;
  state.profilo.altezza = altezzaInput.value;
  state.profilo.attivita = attivitaSelect.value;
  state.profilo.correzione = correzioneInput.value;
  state.profilo.gPerKg = gkgInput.value;
}

// Grammi di proteine per kg usati nel calcolo: quelli digitati, altrimenti il
// valore suggerito per il livello di attività scelto.
function gPerKgEffettivo(p) {
  const digitato = parseFloat(String(p.gPerKg).replace(",", "."));
  if (digitato > 0) return digitato;
  return G_PER_KG_SUGGERITO[p.attivita] || 1.4;
}

function calcolaFabbisogno(p) {
  const eta = Number(p.eta);
  const peso = Number(p.peso);
  const altezza = Number(p.altezza);
  const mancanti = [];
  if (!p.sesso) mancanti.push("sesso");
  if (!eta) mancanti.push("età");
  if (!peso) mancanti.push("peso");
  if (!altezza) mancanti.push("altezza");
  if (mancanti.length) return { mancanti };

  // Mifflin-St Jeor: BMR = 10·peso + 6,25·altezza − 5·età + c
  const costante = p.sesso === "M" ? 5 : -161;
  const bmr = Math.round(10 * peso + 6.25 * altezza - 5 * eta + costante);
  const fattore = FATTORI_ATTIVITA[p.attivita] || 1.55;
  const tdee = Math.round(bmr * fattore);
  const correzione = Math.round(Number(p.correzione) || 0);
  const obiettivo = Math.max(0, tdee + correzione);

  // Proteine: grammi per kg di peso corporeo. Ne riportiamo anche la quota
  // sull'obiettivo calorico (4 kcal per grammo), utile per capire subito se la
  // ripartizione richiesta è sostenibile.
  const gPerKg = gPerKgEffettivo(p);
  const proteine = Math.round(peso * gPerKg);
  const quotaProteine = obiettivo > 0 ? Math.round(((proteine * 4) / obiettivo) * 100) : 0;

  return { bmr, fattore, tdee, correzione, obiettivo, peso, gPerKg, proteine, quotaProteine };
}

// Nota sotto il campo g/kg: chiarisce quale valore si sta usando quando il
// campo è lasciato vuoto, e ricorda gli intervalli di riferimento.
function renderNotaGkg() {
  const suggerito = G_PER_KG_SUGGERITO[state.profilo.attivita] || 1.4;
  gkgInput.placeholder = String(suggerito).replace(".", ",");
  const digitato = parseFloat(String(state.profilo.gPerKg).replace(",", "."));
  const testoBase = "Riferimenti: 0,8–1 g/kg adulto sedentario · 1,2–1,6 attivo · 1,6–2,2 sportivo.";
  gkgNota.textContent = digitato > 0
    ? testoBase
    : `Vuoto: usiamo ${String(suggerito).replace(".", ",")} g/kg, il valore tipico per il livello di attività scelto. ${testoBase}`;
}

function renderFabbisogno() {
  renderNotaGkg();
  const r = calcolaFabbisogno(state.profilo);
  if (r.mancanti) {
    fabbisognoEsito.innerHTML = `<span class="passaggio">Per la stima servono ancora: ${r.mancanti.join(", ")}.</span>`;
    return;
  }
  const fattoreTxt = String(r.fattore).replace(".", ",");
  const gkgTxt = String(round1(r.gPerKg)).replace(".", ",");
  const correzioneTxt = r.correzione
    ? ` ${r.correzione > 0 ? "+" : "−"} ${Math.abs(r.correzione)} kcal di correzione`
    : "";
  fabbisognoEsito.innerHTML = `
    <div class="passaggio">Metabolismo basale ${r.bmr.toLocaleString("it-IT")} kcal × ${fattoreTxt} (attività)${correzioneTxt}</div>
    <div class="risultato">${r.obiettivo.toLocaleString("it-IT")} kcal al giorno</div>
    <div class="passaggio">Proteine: ${fmtPeso(r.peso)} kg × ${gkgTxt} g/kg</div>
    <div class="risultato">${r.proteine.toLocaleString("it-IT")} g di proteine al giorno <span class="risultato-quota">(${r.quotaProteine}% delle calorie)</span></div>
    <button type="button" id="usa-fabbisogno-btn">Usa questi obiettivi</button>
  `;
  el("usa-fabbisogno-btn").addEventListener("click", () => {
    // Un obiettivo a 0 (correzione più grande del fabbisogno) vale "nessun
    // obiettivo": scriverlo nel campo mostrerebbe uno "0" che poi non produce
    // né barra né residuo, e sparirebbe comunque alla ricarica.
    state.obiettivo = r.obiettivo > 0 ? r.obiettivo : null;
    state.obiettivoProteine = r.proteine > 0 ? r.proteine : null;
    obiettivoInput.value = state.obiettivo || "";
    obiettivoProtInput.value = state.obiettivoProteine || "";
    salvaStato();
    renderGiornata();
    mostraToast(state.obiettivo ? "Obiettivi impostati" : "Fabbisogno azzerato dalla correzione: nessun obiettivo impostato");
  });
}

// Peso all'italiana, senza decimali inutili: 68 kg, non "68,0 kg".
function fmtPeso(n) {
  return round1(n).toLocaleString("it-IT");
}

// ---------- Installazione come app ----------
// La pagina ha un manifest suo (manifest-rapido.json), quindi si installa come
// applicazione separata dal gestionale, con icona propria. Chrome/Edge/Android
// avvisano quando è installabile e permettono di aprire l'invito dal codice;
// su iPhone/iPad quell'invito non esiste e l'unica strada è Condividi →
// «Aggiungi a Home», quindi il pulsante mostra le istruzioni.

let promptInstallazione = null;

function appGiaInstallata() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function eApple() {
  const ua = navigator.userAgent;
  // Gli iPad recenti si presentano come Mac: si riconoscono dal touch.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function testoIstruzioniInstallazione() {
  if (eApple()) {
    return "Su iPhone e iPad si aggiunge dal browser: tocca <strong>Condividi</strong> " +
      "(il quadrato con la freccia in su) e scegli <strong>Aggiungi a Home</strong>. " +
      "Se non vedi la voce, scorri l'elenco verso il basso.";
  }
  return "Nel browser apri il <strong>menù</strong> (i tre puntini in alto a destra) e scegli " +
    "<strong>Installa applicazione</strong> o <strong>Aggiungi a schermata Home</strong>. " +
    "Su computer puoi anche usare l'icona di installazione che compare nella barra degli indirizzi.";
}

function apriIstruzioniInstallazione() {
  installaIstruzioni.innerHTML = testoIstruzioniInstallazione();
  installaOverlay.classList.remove("hidden");
}

function chiudiIstruzioniInstallazione() {
  installaOverlay.classList.add("hidden");
}

async function avviaInstallazione() {
  if (!promptInstallazione) {
    apriIstruzioniInstallazione();
    return;
  }
  promptInstallazione.prompt();
  const scelta = await promptInstallazione.userChoice;
  // L'invito è usa e getta: se viene rifiutato il browser ne manderà un altro
  // più avanti, e fino ad allora resta la strada manuale.
  promptInstallazione = null;
  if (scelta && scelta.outcome === "accepted") installaBtn.classList.add("hidden");
}

function inizializzaInstallazione() {
  if (appGiaInstallata()) return; // già in uso come app: il pulsante non serve
  installaBtn.classList.remove("hidden");
  installaBtn.addEventListener("click", avviaInstallazione);
  installaChiudiBtn.addEventListener("click", chiudiIstruzioniInstallazione);
  installaOverlay.addEventListener("click", (e) => {
    if (e.target === installaOverlay) chiudiIstruzioniInstallazione();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") chiudiIstruzioniInstallazione();
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    promptInstallazione = e;
  });
  window.addEventListener("appinstalled", () => {
    promptInstallazione = null;
    installaBtn.classList.add("hidden");
    mostraToast("Installata: la trovi tra le tue app");
  });
}

// ---------- Funzionamento offline ----------
// Registriamo qui il service worker del sito: senza, aprendo direttamente
// /rapido (segnalibro o icona sulla Home) la pagina non sarebbe disponibile
// offline finché non si è passati almeno una volta dal gestionale.

function registraServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(errore => {
      console.warn("Registrazione service worker non riuscita:", errore);
    });
  });
}

// ---------- Avvio ----------

function collegaEventi() {
  // Obiettivo
  obiettivoInput.addEventListener("input", () => {
    const v = parseFloat(obiettivoInput.value);
    state.obiettivo = v > 0 ? v : null;
    salvaStato();
    renderGiornata();
  });

  obiettivoProtInput.addEventListener("input", () => {
    const v = parseFloat(obiettivoProtInput.value);
    state.obiettivoProteine = v > 0 ? v : null;
    salvaStato();
    renderGiornata();
  });

  fabbisognoToggle.addEventListener("click", () => {
    const aperto = !fabbisognoBox.classList.contains("hidden");
    fabbisognoBox.classList.toggle("hidden", aperto);
    fabbisognoToggle.textContent = aperto ? "🧮 Calcolalo" : "Chiudi";
    if (!aperto) renderFabbisogno();
  });

  Array.from(sessoGruppo.children).forEach(btn => {
    btn.addEventListener("click", () => {
      state.profilo.sesso = btn.dataset.sesso;
      Array.from(sessoGruppo.children).forEach(b => b.classList.toggle("attivo", b === btn));
      salvaStato();
      renderFabbisogno();
    });
  });

  [etaInput, pesoInput, altezzaInput, attivitaSelect, correzioneInput, gkgInput].forEach(campo => {
    campo.addEventListener("input", () => {
      leggiProfiloDaiCampi();
      salvaStato();
      renderFabbisogno();
    });
  });

  // Ricerca alimento
  foodInput.addEventListener("input", () => {
    aggiornaSuggerimenti();
    selezionaAlimento(risolviChiave(foodInput.value));
  });

  foodInput.addEventListener("keydown", (e) => {
    const items = suggestions.querySelectorAll(".suggestion-item");
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      indiceSuggerimento = Math.min(indiceSuggerimento + 1, items.length - 1);
      evidenziaSuggerimento();
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      indiceSuggerimento = Math.max(indiceSuggerimento - 1, 0);
      evidenziaSuggerimento();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (indiceSuggerimento >= 0) scegliSuggerimento(indiceSuggerimento);
      else if (items.length === 1) scegliSuggerimento(0);
      else if (alimentoSelezionato) {
        nascondiSuggerimenti();
        quantitaInput.focus();
      }
    } else if (e.key === "Escape") {
      nascondiSuggerimenti();
    }
  });

  suggestions.addEventListener("click", (e) => {
    const item = e.target.closest(".suggestion-item");
    if (item) scegliSuggerimento(Number(item.dataset.index));
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".autocomplete-wrapper")) nascondiSuggerimenti();
  });

  // Alimenti personalizzati
  nuovoAlimentoBtn.addEventListener("click", apriFormNuovoAlimento);
  salvaAlimentoBtn.addEventListener("click", salvaNuovoAlimento);
  annullaAlimentoBtn.addEventListener("click", chiudiFormNuovoAlimento);
  alimentoEliminaBtn.addEventListener("click", eliminaAlimentoPersonalizzato);

  // Quantità e modalità di calcolo
  Array.from(modoGruppo.children).forEach(btn => {
    btn.addEventListener("click", () => impostaModo(btn.dataset.modo));
  });
  quantitaInput.addEventListener("input", aggiornaAnteprima);
  quantitaInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !aggiungiBtn.disabled) aggiungiAlPasto();
  });
  aggiungiBtn.addEventListener("click", aggiungiAlPasto);

  // Giornata (delega: le righe vengono ricreate a ogni render)

  // Copia della giornata prima che si cominci a correggere un peso: servirà
  // per l'annulla, ma solo se il valore cambia davvero (vedi handler "change").
  giornataContenuto.addEventListener("focusin", (e) => {
    const campo = e.target.closest(".riga-grammi");
    if (!campo) return;
    const voce = vocePer(campo.dataset.pasto, Number(campo.dataset.indice));
    if (!voce) return;
    modificaPesoInCorso = {
      giornata: clonaGiornata(),
      valore: campo.value,
      descrizione: `peso di ${voce.nome} (${voce.grammi} g)`
    };
  });

  // Mentre si digita: aggiorniamo solo i numeri. Il campo vuoto viene ignorato,
  // altrimenti cancellare "150" per riscrivere "200" farebbe sparire la riga.
  giornataContenuto.addEventListener("input", (e) => {
    const campo = e.target.closest(".riga-grammi");
    if (!campo) return;
    const voce = vocePer(campo.dataset.pasto, Number(campo.dataset.indice));
    const valore = Math.max(0, Math.round(Number(campo.value) || 0));
    if (!voce || !valore) return;
    voce.grammi = valore;
    salvaStato();
    aggiornaCalcoliUI();
  });

  // A conferma (uscita dal campo o Invio): 0 o campo vuoto tolgono la voce.
  giornataContenuto.addEventListener("change", (e) => {
    const campo = e.target.closest(".riga-grammi");
    if (!campo) return;
    const pasto = campo.dataset.pasto;
    const indice = Number(campo.dataset.indice);
    const voce = vocePer(pasto, indice);
    if (!voce) return;
    const testo = campo.value.trim();
    const valore = Math.round(Number(testo));
    // Solo uno 0 scritto apposta toglie la voce. Campo lasciato vuoto, numero
    // negativo o testo incomprensibile (che nei campi numerici arriva qui come
    // stringa vuota) sono quasi sempre errori di battitura: si rimette il
    // valore di prima. Per togliere una voce c'è la ✕ su ogni riga.
    if (valore === 0 && testo !== "") {
      // La rimozione registra da sé il proprio passo di annullamento.
      modificaPesoInCorso = null;
      rimuoviVoce(pasto, indice);
      return;
    }
    if (!(valore > 0)) {
      modificaPesoInCorso = null;
      renderGiornata();
      return;
    }
    // Un solo passo di annullamento per correzione, non uno per cifra digitata.
    if (modificaPesoInCorso && modificaPesoInCorso.valore !== testo) {
      pilaAnnulla.push({ giornata: modificaPesoInCorso.giornata, descrizione: modificaPesoInCorso.descrizione });
      if (pilaAnnulla.length > MAX_ANNULLA) pilaAnnulla.shift();
      aggiornaBottoneAnnulla();
    }
    modificaPesoInCorso = null;
    voce.grammi = valore;
    salvaStato();
    renderGiornata();
  });

  giornataContenuto.addEventListener("click", (e) => {
    const elimina = e.target.closest(".riga-elimina");
    if (elimina) {
      rimuoviVoce(elimina.dataset.pasto, Number(elimina.dataset.indice));
      return;
    }
    const copia = e.target.closest("[data-copia-pasto]");
    if (copia) {
      copiaTesto(testoPasto(copia.dataset.copiaPasto), "Pasto copiato");
      return;
    }
    const svuota = e.target.closest("[data-svuota-pasto]");
    if (svuota) svuotaPasto(svuota.dataset.svuotaPasto);
  });

  // Azioni sulla giornata
  copiaBtn.addEventListener("click", () => copiaTesto(testoGiornata(), "Giornata copiata negli appunti"));
  stampaBtn.addEventListener("click", () => {
    if (!costruisciAreaStampa()) {
      mostraToast("La giornata è vuota");
      return;
    }
    window.print();
  });
  window.addEventListener("beforeprint", costruisciAreaStampa);
  svuotaBtn.addEventListener("click", svuotaGiornata);
  annullaBtn.addEventListener("click", annullaUltima);

  // Ctrl+Z / Cmd+Z. Se il fuoco è in un campo dove si sta scrivendo, la
  // scorciatoia resta quella del browser (annulla la digitazione). Se il campo
  // è vuoto l'annulla nativo non ha nulla da fare e la usiamo noi: è il caso
  // normale, perché dopo ogni inserimento il fuoco torna sulla ricerca vuota.
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== "z") return;
    const attivo = document.activeElement;
    const staScrivendo = attivo && ["INPUT", "TEXTAREA"].includes(attivo.tagName) && attivo.value !== "";
    if (staScrivendo || !pilaAnnulla.length) return;
    e.preventDefault();
    annullaUltima();
  });
}

function ripristinaCampiProfilo() {
  const p = state.profilo;
  etaInput.value = p.eta || "";
  pesoInput.value = p.peso || "";
  altezzaInput.value = p.altezza || "";
  attivitaSelect.value = p.attivita || "Moderato";
  correzioneInput.value = p.correzione || "";
  gkgInput.value = p.gPerKg || "";
  Array.from(sessoGruppo.children).forEach(b => b.classList.toggle("attivo", b.dataset.sesso === p.sesso));
  obiettivoInput.value = state.obiettivo || "";
  obiettivoProtInput.value = state.obiettivoProteine || "";
}

async function inizializza() {
  inizializzaTema();
  caricaAlimentiCustom();
  caricaStato();
  ripristinaCampiProfilo();
  impostaModo("grammi");
  collegaEventi();
  inizializzaInstallazione();
  registraServiceWorker();
  renderGiornata();
  aggiornaBottoneAnnulla();
  renderFabbisogno();
  await caricaAlimenti();
}

inizializza();
