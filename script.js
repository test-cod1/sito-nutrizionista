// Catturati SUBITO, prima di creare il client Supabase: il client "ripulisce"
// l'URL (hash/query) durante l'inizializzazione, quindi leggerli più tardi
// restituirebbe sempre stringhe vuote anche per i link di invito/recupero.
const URL_HASH_INIZIALE = window.location.hash || "";
const URL_SEARCH_INIZIALE = window.location.search || "";

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
let collapsedGiorni = new Set(GIORNI);
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
const panoramicaDettaglioOverlay = document.getElementById("panoramica-dettaglio-overlay");
const panoramicaDettaglioTitolo = document.getElementById("panoramica-dettaglio-titolo");
const panoramicaDettaglioContenuto = document.getElementById("panoramica-dettaglio-contenuto");
const panoramicaDettaglioChiudiBtn = document.getElementById("panoramica-dettaglio-chiudi-btn");
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

// Sidebar di navigazione rapida tra le sezioni della vista amministratore
const sezioniToggleBtn = document.getElementById("sezioni-toggle-btn");
const sezioniSidebar = document.getElementById("sezioni-sidebar");
const sezioniOverlay = document.getElementById("sezioni-overlay");
const sezioniLink = document.querySelectorAll(".sezioni-link");
const sezioniLinkPaziente = document.querySelectorAll(".sezioni-link-paziente");
const pazienteSearchInput = document.getElementById("paziente-search-input");
const pazienteSuggestions = document.getElementById("paziente-suggestions");
let pazienteSuggestionIndex = -1;
const storicoBtn = document.getElementById("storico-btn");
const profiloBtn = document.getElementById("profilo-btn");
const anteprimaPazienteBtn = document.getElementById("anteprima-paziente-btn");
const anteprimaBanner = document.getElementById("anteprima-banner");
const anteprimaTornaBtn = document.getElementById("anteprima-torna-btn");
const logoutBtn = document.getElementById("logout-btn");

// Check-in periodico (paziente)
const checkinProssimaData = document.getElementById("checkin-prossima-data");
const checkinAnticipoNota = document.getElementById("checkin-anticipo-nota");
const checkinPesoInput = document.getElementById("checkin-peso");
const checkinBraccioInput = document.getElementById("checkin-braccio");
const checkinAddomeInput = document.getElementById("checkin-addome");
const checkinPettoInput = document.getElementById("checkin-petto");
const checkinCosciaInput = document.getElementById("checkin-coscia");
const checkinError = document.getElementById("checkin-error");
const checkinSuccesso = document.getElementById("checkin-successo");
const checkinInviaBtn = document.getElementById("checkin-invia-btn");
const checkinStoricoToggle = document.getElementById("checkin-storico-toggle");
const checkinStoricoContenuto = document.getElementById("checkin-storico-contenuto");
let checkinCompletiPaziente = [];

// Check-in periodico (admin)
const checkinBadgeStato = document.getElementById("checkin-badge-stato");
const checkinAdminTabella = document.getElementById("checkin-admin-tabella");
const checkinFrequenzaSelect = document.getElementById("checkin-frequenza-select");
const checkinFrequenzaSalvaBtn = document.getElementById("checkin-frequenza-salva-btn");
const checkinFrequenzaSuccesso = document.getElementById("checkin-frequenza-successo");

// Notifiche push
const notificheOverlay = document.getElementById("notifiche-overlay");
const notificheTesto = document.getElementById("notifiche-testo");
const notificheAttivaBtn = document.getElementById("notifiche-attiva-btn");
const notificheRifiutaBtn = document.getElementById("notifiche-rifiuta-btn");
const notificheOkBtn = document.getElementById("notifiche-ok-btn");

const nuovoPazienteNomeInput = document.getElementById("nuovo-paziente-nome");
const nuovoPazienteError = document.getElementById("nuovo-paziente-error");
const nuovoPazienteConfermaBtn = document.getElementById("nuovo-paziente-conferma-btn");

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
const profiloNonSeguitoCheck = document.getElementById("profilo-non-seguito-check");
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
const gestioneUtentiBtn = document.getElementById("gestione-utenti-btn");
const gestioneUtentiOverlay = document.getElementById("gestione-utenti-overlay");
const gestioneUtentiChiudiBtn = document.getElementById("gestione-utenti-chiudi-btn");
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
const pazienteDietaVista = document.getElementById("paziente-dieta-vista");
const pazientePdfBtn = document.getElementById("paziente-pdf-btn");
const pazienteSpesaBtn = document.getElementById("paziente-spesa-btn");
const pazienteLogoutBtn = document.getElementById("paziente-logout-btn");
const pzTemaChiaroBtn = document.getElementById("pz-tema-chiaro-btn");
const pzTemaNotteBtn = document.getElementById("pz-tema-notte-btn");

// Impostazioni (paziente): reimposta password + richiesta cancellazione dati
const pazienteImpostazioniBtn = document.getElementById("paziente-impostazioni-btn");
const pazienteImpostazioniOverlay = document.getElementById("paziente-impostazioni-overlay");
const pazienteImpostazioniChiudiBtn = document.getElementById("paziente-impostazioni-chiudi-btn");
const impostazioniResetPasswordBtn = document.getElementById("impostazioni-reset-password-btn");
const impostazioniCancellazioneBtn = document.getElementById("impostazioni-cancellazione-btn");

// Reimposta password (paziente)
const pazienteSicurezzaOverlay = document.getElementById("paziente-sicurezza-overlay");
const pazienteSicurezzaMsg = document.getElementById("paziente-sicurezza-msg");
const pazienteSicurezzaInviaBtn = document.getElementById("paziente-sicurezza-invia-btn");
const pazienteSicurezzaChiudiBtn = document.getElementById("paziente-sicurezza-chiudi-btn");

// Richiesta di cancellazione dati (paziente)
const cancellazioneOverlay = document.getElementById("cancellazione-overlay");
const cancellazioneStep1 = document.getElementById("cancellazione-step-1");
const cancellazioneStep2 = document.getElementById("cancellazione-step-2");
const cancellazioneStep3 = document.getElementById("cancellazione-step-3");
const cancellazioneStep1AvantiBtn = document.getElementById("cancellazione-step-1-avanti-btn");
const cancellazioneStep1AnnullaBtn = document.getElementById("cancellazione-step-1-annulla-btn");
const cancellazioneMessaggioInput = document.getElementById("cancellazione-messaggio-input");
const cancellazionePasswordInput = document.getElementById("cancellazione-password-input");
const cancellazioneError = document.getElementById("cancellazione-error");
const cancellazioneStep2InviaBtn = document.getElementById("cancellazione-step-2-invia-btn");
const cancellazioneStep2AnnullaBtn = document.getElementById("cancellazione-step-2-annulla-btn");
const cancellazioneStep3ChiudiBtn = document.getElementById("cancellazione-step-3-chiudi-btn");

// Profilo paziente (accordion, sola lettura)
const profiloFisiciToggle = document.getElementById("profilo-fisici-toggle");
const profiloFisiciContenuto = document.getElementById("profilo-fisici-contenuto");
const profiloContattiToggle = document.getElementById("profilo-contatti-toggle");
const profiloContattiContenuto = document.getElementById("profilo-contatti-contenuto");
// Progressi peso (paziente)
const pesoGraficoEl = document.getElementById("peso-grafico");
const pesoFiltroBtns = document.querySelectorAll(".peso-filtro-btn");

let storicoPesoCompleto = [];
let filtroPesoAttivo = "tutto";
let pazienteHaDieta = false;
let profiloPesoOriginale = null;

// Open Food Facts (admin)
const offRicercaToggleBtn = document.getElementById("off-ricerca-toggle-btn");
const offRicercaAdminContenuto = document.getElementById("off-ricerca-admin-contenuto");
const offAdminQueryInput = document.getElementById("off-admin-query-input");
const offAdminBarcodeInput = document.getElementById("off-admin-barcode-input");
const offAdminCercaBtn = document.getElementById("off-admin-cerca-btn");
const offAdminErrore = document.getElementById("off-admin-error");
const offAdminRisultati = document.getElementById("off-admin-risultati");

// Open Food Facts (paziente, scanner barcode)
const offScannerAvviaBtn = document.getElementById("off-scanner-avvia-btn");
const offScannerPermessoNota = document.getElementById("off-scanner-permesso-nota");
const offScannerViewport = document.getElementById("off-scanner-viewport");
const offScannerStopBtn = document.getElementById("off-scanner-stop-btn");
const offBarcodeManualeInput = document.getElementById("off-barcode-manuale-input");
const offBarcodeManualeBtn = document.getElementById("off-barcode-manuale-btn");
const offPazienteErrore = document.getElementById("off-paziente-error");
const offPazienteRisultati = document.getElementById("off-paziente-risultati");
const offFotoOverlay = document.getElementById("off-foto-overlay");
const offFotoGrande = document.getElementById("off-foto-grande");
const offFotoChiudiBtn = document.getElementById("off-foto-chiudi-btn");

// Agenda appuntamenti (admin)
const agendaBtn = document.getElementById("agenda-btn");
const agendaOverlay = document.getElementById("agenda-overlay");
const agendaChiudiBtn = document.getElementById("agenda-chiudi-btn");
const agendaListaEl = document.getElementById("agenda-lista");
const agendaNuovoBtn = document.getElementById("agenda-nuovo-btn");
const agendaFiltroPazienteSelect = creaComboPazienteRicerca(
  document.getElementById("agenda-filtro-paziente"),
  document.getElementById("agenda-filtro-paziente-suggestions"),
  "Tutti i pazienti"
);
agendaFiltroPazienteSelect.onChange = () => renderListaAppuntamenti();
const prossimoAppuntamentoAdminContenuto = document.getElementById("prossimo-appuntamento-admin-contenuto");

// Richieste di cancellazione dati (admin)
const richiesteBtn = document.getElementById("richieste-btn");
const richiesteBadge = document.getElementById("richieste-badge");
const richiesteOverlay = document.getElementById("richieste-overlay");
const richiesteLista = document.getElementById("richieste-lista");
const richiesteChiudiBtn = document.getElementById("richieste-chiudi-btn");
let listaRichieste = [];

// Bacheca task (admin)
const taskBoardBtn = document.getElementById("task-board-btn");
const taskBoard = document.getElementById("task-board");
const taskBoardChiudiBtn = document.getElementById("task-board-chiudi-btn");
const taskNuovaBtn = document.getElementById("task-nuova-btn");
const taskArchivioBtn = document.getElementById("task-archivio-btn");
const taskListaEl = {
  da_fare: document.getElementById("task-lista-da_fare"),
  in_corso: document.getElementById("task-lista-in_corso"),
  fatto: document.getElementById("task-lista-fatto")
};
const taskContatoreEl = {
  da_fare: document.getElementById("task-contatore-da_fare"),
  in_corso: document.getElementById("task-contatore-in_corso"),
  fatto: document.getElementById("task-contatore-fatto")
};
const taskContatorePrioritaEl = {
  alta: document.getElementById("task-contatore-da_fare-alta"),
  media: document.getElementById("task-contatore-da_fare-media"),
  bassa: document.getElementById("task-contatore-da_fare-bassa")
};
const taskVediTutteBtn = document.getElementById("task-vedi-tutte-btn");

const taskModalOverlay = document.getElementById("task-modal-overlay");
const taskModalTitolo = document.getElementById("task-modal-titolo");
const taskTitoloInput = document.getElementById("task-titolo-input");
const taskNotaInput = document.getElementById("task-nota-input");
const taskPrioritaSelect = document.getElementById("task-priorita-select");
const taskPazienteSelect = creaComboPazienteRicerca(
  document.getElementById("task-paziente-select"),
  document.getElementById("task-paziente-suggestions"),
  "— Nessun paziente —"
);
const taskModalError = document.getElementById("task-modal-error");
const taskSalvaBtn = document.getElementById("task-salva-btn");
const taskEliminaBtn = document.getElementById("task-elimina-btn");
const taskAnnullaBtn = document.getElementById("task-annulla-btn");

const taskVediTutteOverlay = document.getElementById("task-vedi-tutte-overlay");
const taskVediTutteLista = document.getElementById("task-vedi-tutte-lista");
const taskVediTutteChiudiBtn = document.getElementById("task-vedi-tutte-chiudi-btn");

const taskArchivioOverlay = document.getElementById("task-archivio-overlay");
const taskArchivioLista = document.getElementById("task-archivio-lista");
const taskArchivioChiudiBtn = document.getElementById("task-archivio-chiudi-btn");

let listaTask = [];
let taskInModifica = null;
const TASK_FATTO_LIMITE = 15;
const TASK_STATO_LABEL = { da_fare: "Da fare", in_corso: "In corso", fatto: "Fatto" };
const TASK_PRIORITA_LABEL = { bassa: "Bassa", media: "Media", alta: "Alta" };
const TASK_PRIORITA_ORDINE = { alta: 0, media: 1, bassa: 2 };
const appuntamentoOverlay = document.getElementById("appuntamento-overlay");
const appuntamentoTitolo = document.getElementById("appuntamento-titolo");
const appuntamentoPazienteSelect = creaComboPazienteRicerca(
  document.getElementById("appuntamento-paziente-select"),
  document.getElementById("appuntamento-paziente-suggestions"),
  null
);
const appuntamentoDataInput = document.getElementById("appuntamento-data-input");
// Ore e minuti sono due <select> separati (minuti solo 00/15/30/45): molti
// picker nativi di <input type="time"> ignorano l'attributo "step" e
// mostrano comunque tutti i 60 minuti, quindi si usano due tendine per
// garantire l'intervallo su ogni browser. Questo oggetto espone un'unica
// proprietà "value" in formato "HH:MM" per non dover toccare il resto del
// codice che legge/scrive l'orario dell'appuntamento.
const appuntamentoOraOreSelect = document.getElementById("appuntamento-ora-ore-select");
const appuntamentoOraMinutiSelect = document.getElementById("appuntamento-ora-minuti-select");
for (let h = 0; h < 24; h++) {
  const ora = String(h).padStart(2, "0");
  const opzione = document.createElement("option");
  opzione.value = ora;
  opzione.textContent = ora;
  appuntamentoOraOreSelect.appendChild(opzione);
}
const appuntamentoOraInput = {
  get value() {
    // Se l'ora non è stata scelta, il valore resta vuoto (come il vecchio
    // input type="time" vuoto), per mantenere invariata la validazione
    // "inserisci data e ora" in salvaAppuntamento().
    if (!appuntamentoOraOreSelect.value) return "";
    return `${appuntamentoOraOreSelect.value}:${appuntamentoOraMinutiSelect.value}`;
  },
  set value(orario) {
    if (!orario) {
      appuntamentoOraOreSelect.value = "";
      appuntamentoOraMinutiSelect.value = "00";
      return;
    }
    const [ore, minuti] = orario.split(":");
    appuntamentoOraOreSelect.value = ore;
    // Arrotonda ai 15 minuti più vicini, per compatibilità con eventuali
    // appuntamenti salvati in passato con un orario non allineato.
    const minutiArrotondati = [0, 15, 30, 45].reduce((piuVicino, valore) =>
      Math.abs(valore - Number(minuti)) < Math.abs(piuVicino - Number(minuti)) ? valore : piuVicino
    );
    appuntamentoOraMinutiSelect.value = String(minutiArrotondati).padStart(2, "0");
  }
};
const appuntamentoTipologiaSelect = document.getElementById("appuntamento-tipologia-select");
const appuntamentoNoteInput = document.getElementById("appuntamento-note-input");
const appuntamentoErrore = document.getElementById("appuntamento-error");
const appuntamentoSalvaBtn = document.getElementById("appuntamento-salva-btn");
const appuntamentoEliminaBtn = document.getElementById("appuntamento-elimina-btn");
const appuntamentoAnnullaBtn = document.getElementById("appuntamento-annulla-btn");
let appuntamentoInModifica = null;

// Prossimo appuntamento (paziente)
const prossimoAppuntamentoContenuto = document.getElementById("prossimo-appuntamento-contenuto");
let prossimoAppuntamentoCorrente = null;

// Reset password paziente (admin)
const profiloResetPasswordBtn = document.getElementById("profilo-reset-password-btn");
const profiloResetMsg = document.getElementById("profilo-reset-msg");

// Sicurezza / 2FA (admin)
const sicurezzaBtn = document.getElementById("sicurezza-btn");
const sicurezzaOverlay = document.getElementById("sicurezza-overlay");
const sicurezzaChiudiBtn = document.getElementById("sicurezza-chiudi-btn");
const sicurezzaStatoEl = document.getElementById("sicurezza-stato");
const sicurezzaAttivaBtn = document.getElementById("sicurezza-attiva-btn");
const sicurezzaDisattivaBlocco = document.getElementById("sicurezza-disattiva-blocco");
const sicurezzaDisattivaCodiceInput = document.getElementById("sicurezza-disattiva-codice-input");
const sicurezzaDisattivaConfermaBtn = document.getElementById("sicurezza-disattiva-conferma-btn");
const sicurezzaDisattivaErrore = document.getElementById("sicurezza-disattiva-errore");
const sicurezzaSetupBlocco = document.getElementById("sicurezza-setup-blocco");
const sicurezzaQrContenitore = document.getElementById("sicurezza-qr-contenitore");
const sicurezzaSecretTesto = document.getElementById("sicurezza-secret-testo");
const sicurezzaSetupCodiceInput = document.getElementById("sicurezza-setup-codice-input");
const sicurezzaSetupConfermaBtn = document.getElementById("sicurezza-setup-conferma-btn");
const sicurezzaSetupAnnullaBtn = document.getElementById("sicurezza-setup-annulla-btn");
const sicurezzaSetupErrore = document.getElementById("sicurezza-setup-errore");
const sicurezzaBackupBlocco = document.getElementById("sicurezza-backup-blocco");
const sicurezzaBackupLista = document.getElementById("sicurezza-backup-lista");
const sicurezzaBackupChiudiBtn = document.getElementById("sicurezza-backup-chiudi-btn");
let mfaFactorIdCorrente = null;

// Verifica 2FA al login (admin)
const verifica2faOverlay = document.getElementById("verifica-2fa-overlay");
const verifica2faCodiceInput = document.getElementById("verifica-2fa-codice-input");
const verifica2faConfermaBtn = document.getElementById("verifica-2fa-conferma-btn");
const verifica2faErrore = document.getElementById("verifica-2fa-errore");
const verifica2faBackupLink = document.getElementById("verifica-2fa-backup-link");
const verifica2faBackupBlocco = document.getElementById("verifica-2fa-backup-blocco");
const verifica2faBackupInput = document.getElementById("verifica-2fa-backup-input");
const verifica2faBackupBtn = document.getElementById("verifica-2fa-backup-btn");
let mfaFactorIdLogin = null;

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

let passwordRecoveryEventRicevuto = false;

function inizializzaSupabase() {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      passwordRecoveryEventRicevuto = true;
    }
  });
}

function urlEraTipo(tipo) {
  return URL_HASH_INIZIALE.includes(`type=${tipo}`) || URL_SEARCH_INIZIALE.includes(`type=${tipo}`);
}

function mostraLogin() {
  loginOverlay.classList.remove("hidden");
  impostaPasswordOverlay.classList.add("hidden");
  recuperoPasswordOverlay.classList.add("hidden");
  appShell.classList.add("hidden");
  vistaPaziente.classList.add("hidden");
  loginEmailInput.focus();
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

// ---------- Impostazioni (paziente) ----------
// Punto d'ingresso unico per le due funzioni di account: da qui si passa
// al modale di reset password o a quello di richiesta cancellazione dati,
// che restano invariati internamente.

function apriPazienteImpostazioni() {
  pazienteImpostazioniOverlay.classList.remove("hidden");
}

function chiudiPazienteImpostazioni() {
  pazienteImpostazioniOverlay.classList.add("hidden");
}

// ---------- Reimposta password (paziente già loggato) ----------
// Stesso meccanismo del recupero password self-service dalla schermata di
// login: invia un'email con link di reset monouso, senza bisogno di
// conoscere la password attuale. L'indirizzo è quello dell'account con cui
// il paziente ha effettuato l'accesso (non un campo digitabile).

function apriPazienteSicurezza() {
  pazienteSicurezzaMsg.classList.add("hidden");
  pazienteSicurezzaOverlay.classList.remove("hidden");
}

function chiudiPazienteSicurezza() {
  pazienteSicurezzaOverlay.classList.add("hidden");
}

async function inviaResetPasswordPazienteProprio() {
  pazienteSicurezzaMsg.classList.add("hidden");

  const { data: { user }, error: erroreUser } = await supabaseClient.auth.getUser();
  if (erroreUser || !user || !user.email) {
    pazienteSicurezzaMsg.textContent = "Errore nel recupero dell'account: " + (erroreUser ? erroreUser.message : "email non disponibile.");
    pazienteSicurezzaMsg.classList.remove("hidden");
    return;
  }

  pazienteSicurezzaInviaBtn.disabled = true;
  const { error } = await supabaseClient.auth.resetPasswordForEmail(user.email);
  pazienteSicurezzaInviaBtn.disabled = false;

  if (error) {
    pazienteSicurezzaMsg.textContent = "Errore nell'invio dell'email: " + error.message;
    pazienteSicurezzaMsg.classList.remove("hidden");
    return;
  }

  pazienteSicurezzaMsg.textContent = `Ti abbiamo inviato un'email a ${user.email} con le istruzioni per reimpostare la password.`;
  pazienteSicurezzaMsg.classList.remove("hidden");
}

// ---------- Richiesta di cancellazione dati (paziente) ----------
// Tre passaggi: spiegazione + conferma, verifica password (re-login senza
// alterare la sessione), messaggio finale. La richiesta viene solo
// registrata qui: l'effettiva cancellazione avviene lato amministratore,
// dopo revisione, tramite la funzione serverless elimina-paziente.

function mostraStepCancellazione(step) {
  cancellazioneStep1.classList.toggle("hidden", step !== 1);
  cancellazioneStep2.classList.toggle("hidden", step !== 2);
  cancellazioneStep3.classList.toggle("hidden", step !== 3);
}

function apriCancellazione() {
  cancellazioneMessaggioInput.value = "";
  cancellazionePasswordInput.value = "";
  cancellazioneError.classList.add("hidden");
  mostraStepCancellazione(1);
  cancellazioneOverlay.classList.remove("hidden");
}

function chiudiCancellazione() {
  cancellazioneOverlay.classList.add("hidden");
}

function avantiStep2Cancellazione() {
  mostraStepCancellazione(2);
  cancellazionePasswordInput.focus();
}

async function inviaRichiestaCancellazione() {
  cancellazioneError.classList.add("hidden");
  const password = cancellazionePasswordInput.value;
  if (!password) {
    cancellazioneError.textContent = "Inserisci la password.";
    cancellazioneError.classList.remove("hidden");
    return;
  }

  const { data: { user }, error: erroreUser } = await supabaseClient.auth.getUser();
  if (erroreUser || !user || !user.email) {
    cancellazioneError.textContent = "Errore nel recupero dell'account.";
    cancellazioneError.classList.remove("hidden");
    return;
  }

  cancellazioneStep2InviaBtn.disabled = true;
  const { error: erroreLogin } = await supabaseClient.auth.signInWithPassword({ email: user.email, password });
  cancellazioneStep2InviaBtn.disabled = false;

  if (erroreLogin) {
    cancellazioneError.textContent = "Password errata.";
    cancellazioneError.classList.remove("hidden");
    return;
  }

  const { error } = await supabaseClient.from("richieste_cancellazione").insert({
    paziente_id: pazienteCorrente.id,
    paziente_nome_snapshot: pazienteCorrente.nome,
    paziente_email_snapshot: user.email,
    messaggio_paziente: cancellazioneMessaggioInput.value.trim() || null
  });

  if (error) {
    cancellazioneError.textContent = "Errore nell'invio della richiesta: " + error.message;
    cancellazioneError.classList.remove("hidden");
    return;
  }

  mostraStepCancellazione(3);
}

function mostraImpostaPassword() {
  loginOverlay.classList.add("hidden");
  nuovaPasswordInput.value = "";
  impostaPasswordError.classList.add("hidden");
  impostaPasswordOverlay.classList.remove("hidden");
}

function passwordRispettaRequisiti(pw) {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
}

async function confermaImpostaPassword() {
  const nuovaPassword = nuovaPasswordInput.value;
  impostaPasswordError.classList.add("hidden");

  if (!passwordRispettaRequisiti(nuovaPassword)) {
    impostaPasswordError.textContent = "La password deve avere almeno 8 caratteri, con almeno una lettera maiuscola e un numero.";
    impostaPasswordError.classList.remove("hidden");
    return;
  }

  impostaPasswordBtn.disabled = true;
  const { error } = await supabaseClient.auth.updateUser({
    password: nuovaPassword,
    data: { password_impostata: true }
  });
  impostaPasswordBtn.disabled = false;

  if (error) {
    impostaPasswordError.textContent = "Errore: " + error.message;
    impostaPasswordError.classList.remove("hidden");
    return;
  }

  impostaPasswordOverlay.classList.add("hidden");
  passwordRecoveryEventRicevuto = false;
  history.replaceState(null, "", window.location.pathname);
  await avviaDopoLogin();
}

// Decide se mostrare "imposta password" invece di far entrare subito:
// - password_impostata mancante => primo accesso (invito), non ha mai impostato una password
// - link di tipo "recovery" o evento PASSWORD_RECOVERY => ha chiesto di recuperare la password,
//   va sempre fatta reimpostare anche se ne aveva già una
async function gestisciSessioneStabilita() {
  const passwordGiaImpostata = !!(sessioneUtente.user.user_metadata && sessioneUtente.user.user_metadata.password_impostata);
  const eRecupero = urlEraTipo("recovery") || passwordRecoveryEventRicevuto;

  if (!passwordGiaImpostata || eRecupero) {
    mostraImpostaPassword();
    return;
  }

  await avviaDopoLogin();
}

async function inizializzaAuth() {
  const { data } = await supabaseClient.auth.getSession();
  sessioneUtente = data.session;

  if (sessioneUtente) {
    await gestisciSessioneStabilita();
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
  await gestisciSessioneStabilita();
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

  if (await verificaSeServe2FA()) return;

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

// ---------- Verifica 2FA al login ----------
// Si attiva solo se l'amministratore ha attivato la 2FA nelle impostazioni:
// se nessun fattore è registrato, getAuthenticatorAssuranceLevel() riporta
// currentLevel === nextLevel e questo blocco non fa nulla (login invariato).

async function verificaSeServe2FA() {
  const { data, error } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  if (data.currentLevel !== "aal1" || data.nextLevel !== "aal2") return false;

  const { data: fattori } = await supabaseClient.auth.mfa.listFactors();
  const totp = fattori && fattori.totp ? fattori.totp.find(f => f.status === "verified") : null;
  if (!totp) return false;

  mfaFactorIdLogin = totp.id;
  mostraVerifica2FA();
  return true;
}

function mostraVerifica2FA() {
  verifica2faCodiceInput.value = "";
  verifica2faErrore.classList.add("hidden");
  verifica2faBackupBlocco.classList.add("hidden");
  verifica2faBackupInput.value = "";
  verifica2faOverlay.classList.remove("hidden");
  verifica2faCodiceInput.focus();
}

function chiudiVerifica2FA() {
  verifica2faOverlay.classList.add("hidden");
}

async function confermaVerifica2FA() {
  const codice = verifica2faCodiceInput.value.trim();
  verifica2faErrore.classList.add("hidden");
  if (!codice) {
    verifica2faErrore.textContent = "Inserisci il codice generato dall'app.";
    verifica2faErrore.classList.remove("hidden");
    return;
  }

  verifica2faConfermaBtn.disabled = true;
  const { data: challenge, error: erroreChallenge } = await supabaseClient.auth.mfa.challenge({ factorId: mfaFactorIdLogin });
  if (erroreChallenge) {
    verifica2faConfermaBtn.disabled = false;
    verifica2faErrore.textContent = "Errore: " + erroreChallenge.message;
    verifica2faErrore.classList.remove("hidden");
    return;
  }

  const { error } = await supabaseClient.auth.mfa.verify({ factorId: mfaFactorIdLogin, challengeId: challenge.id, code: codice });
  verifica2faConfermaBtn.disabled = false;

  if (error) {
    verifica2faErrore.textContent = "Codice non valido. Riprova.";
    verifica2faErrore.classList.remove("hidden");
    return;
  }

  chiudiVerifica2FA();
  await avviaDopoLogin();
}

async function confermaBackupLogin() {
  const codice = verifica2faBackupInput.value.trim();
  verifica2faErrore.classList.add("hidden");
  if (!codice) {
    verifica2faErrore.textContent = "Inserisci un codice di backup.";
    verifica2faErrore.classList.remove("hidden");
    return;
  }

  const valido = await consumaCodiceBackup(codice);
  if (!valido) {
    verifica2faErrore.textContent = "Codice di backup non valido o già usato.";
    verifica2faErrore.classList.remove("hidden");
    return;
  }

  chiudiVerifica2FA();
  await avviaDopoLogin();
}

async function avviaAppAdmin() {
  vistaPaziente.classList.add("hidden");
  appShell.classList.remove("hidden");
  aggiornaDisponibilitaSezioniPaziente();

  await caricaAlimentiBase();
  customFoodsRemoti = await caricaAlimentiPersonalizzatiRemoti();
  ricostruisciElencoAlimenti();

  await caricaListaPazienti();
  await caricaAppuntamenti();
  await caricaRichieste();

  renderDraft();
  renderDieta();
}

// ---------- Vista paziente (sola lettura) ----------

const PLACEHOLDER_PROFILO = '<span class="vuoto">Non ancora inserito dal tuo nutrizionista</span>';

function rigaProfiloVista(label, valore) {
  const testo = (valore === null || valore === undefined || valore === "") ? PLACEHOLDER_PROFILO : escapeHtml(String(valore));
  return `<p><strong>${escapeHtml(label)}:</strong> ${testo}</p>`;
}

function renderProfiloPazienteVista(p) {
  profiloFisiciContenuto.innerHTML =
    rigaProfiloVista("Sesso", p.sesso) +
    rigaProfiloVista("Altezza", p.altezza_cm ? `${p.altezza_cm} cm` : null) +
    rigaProfiloVista("Peso attuale", p.peso_kg ? `${p.peso_kg} kg` : null);

  profiloContattiContenuto.innerHTML =
    rigaProfiloVista("Telefono", p.telefono) +
    rigaProfiloVista("Email", p.email);
}

function toggleAccordionProfilo(bottone, contenuto, etichetta) {
  const chiusa = contenuto.classList.toggle("hidden");
  bottone.textContent = `${chiusa ? "▸" : "▾"} ${etichetta}`;
}

// ---------- Storico peso e grafico progressi ----------

async function caricaStoricoPeso(pazienteId) {
  const { data, error } = await supabaseClient
    .from("storico_peso")
    .select("*")
    .eq("paziente_id", pazienteId)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("Errore nel caricamento dello storico peso:", error);
    return [];
  }
  return data || [];
}

const FILTRI_PESO_GIORNI = { "1m": 30, "3m": 90, "6m": 180, "tutto": null };

function filtraStoricoPeso(storico, filtro) {
  const giorni = FILTRI_PESO_GIORNI[filtro];
  if (!giorni) return storico;
  const soglia = Date.now() - giorni * 24 * 60 * 60 * 1000;
  return storico.filter(r => new Date(r.created_at).getTime() >= soglia);
}

function renderGraficoPeso(storico) {
  if (!storico || storico.length === 0) {
    pesoGraficoEl.innerHTML = '<p class="vuoto">Nessun dato di peso ancora registrato per questo periodo.</p>';
    return;
  }

  const larghezza = 600, altezza = 220;
  const margine = { top: 16, right: 16, bottom: 28, left: 42 };
  const larghezzaGrafico = larghezza - margine.left - margine.right;
  const altezzaGrafico = altezza - margine.top - margine.bottom;

  const pesi = storico.map(r => r.peso_kg);
  const min = Math.min(...pesi), max = Math.max(...pesi);
  const range = max - min || 1;
  const padding = range * 0.2;
  const yMin = min - padding, yMax = max + padding;

  const x = i => margine.left + (storico.length === 1 ? larghezzaGrafico / 2 : (i / (storico.length - 1)) * larghezzaGrafico);
  const y = v => margine.top + altezzaGrafico - ((v - yMin) / (yMax - yMin)) * altezzaGrafico;

  const punti = storico.map((r, i) => `${x(i)},${y(r.peso_kg)}`).join(" ");
  const cerchi = storico.map((r, i) => `<circle cx="${x(i)}" cy="${y(r.peso_kg)}" r="4" class="peso-punto"><title>${new Date(r.created_at).toLocaleDateString("it-IT")}: ${r.peso_kg} kg</title></circle>`).join("");

  const passoEtichette = Math.max(1, Math.ceil(storico.length / 6));
  const etichetteX = storico.map((r, i) => {
    if (i % passoEtichette !== 0 && i !== storico.length - 1) return "";
    return `<text x="${x(i)}" y="${altezza - 6}" class="peso-asse-testo" text-anchor="middle">${new Date(r.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}</text>`;
  }).join("");

  pesoGraficoEl.innerHTML = `
    <svg viewBox="0 0 ${larghezza} ${altezza}" class="peso-grafico-svg" role="img" aria-label="Andamento del peso nel tempo">
      <line x1="${margine.left}" y1="${margine.top}" x2="${margine.left}" y2="${altezza - margine.bottom}" class="peso-asse" />
      <line x1="${margine.left}" y1="${altezza - margine.bottom}" x2="${larghezza - margine.right}" y2="${altezza - margine.bottom}" class="peso-asse" />
      <polyline points="${punti}" class="peso-linea" fill="none" />
      ${cerchi}
      ${etichetteX}
    </svg>
  `;
}

function aggiornaFiltroPeso(filtro) {
  filtroPesoAttivo = filtro;
  pesoFiltroBtns.forEach(b => b.classList.toggle("attivo", b.dataset.filtro === filtro));
  renderGraficoPeso(filtraStoricoPeso(storicoPesoCompleto, filtro));
}

function dietaVuota() {
  return GIORNI.every(g => !giornoHaAlimenti(g));
}

function aggiornaBottoniPdfPaziente() {
  pazientePdfBtn.disabled = !pazienteHaDieta;
  pazienteSpesaBtn.disabled = !pazienteHaDieta;
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

// ---------- Prossimo appuntamento (paziente) ----------
// RLS scopa già la lettura al proprio paziente_id: qui prendiamo solo il primo
// appuntamento futuro. "Aggiungi al calendario" genera un file .ics lato
// client (nessun server coinvolto): data_ora è già un timestamptz, quindi
// convertirlo a UTC con toISOString() dà l'orario corretto in ogni fuso.

async function caricaProssimoAppuntamento(pazienteId) {
  const { data, error } = await supabaseClient
    .from("appuntamenti")
    .select("*")
    .eq("paziente_id", pazienteId)
    .gte("data_ora", new Date().toISOString())
    .order("data_ora", { ascending: true })
    .limit(1);

  prossimoAppuntamentoCorrente = (!error && data && data.length > 0) ? data[0] : null;
  renderProssimoAppuntamento();
}

function renderProssimoAppuntamento() {
  if (!prossimoAppuntamentoCorrente) {
    prossimoAppuntamentoContenuto.innerHTML = '<p class="vuoto">Nessun appuntamento programmato.</p>';
    return;
  }

  const a = prossimoAppuntamentoCorrente;
  const dataOra = new Date(a.data_ora);
  const tipologiaLabel = a.tipologia === "remoto" ? "Da remoto" : "In studio";

  prossimoAppuntamentoContenuto.innerHTML = `
    <div class="prossimo-appuntamento-riga">
      <div>
        <strong>${dataOra.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</strong>
        <p>${dataOra.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · ${tipologiaLabel}</p>
        ${a.note ? `<p class="hint">${escapeHtml(a.note)}</p>` : ""}
      </div>
      <button type="button" id="appuntamento-calendario-btn" class="secondary">Aggiungi al calendario</button>
    </div>
  `;

  document.getElementById("appuntamento-calendario-btn").addEventListener("click", scaricaIcsAppuntamento);
}

function formattaDataIcs(data) {
  return data.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function scaricaIcsAppuntamento() {
  if (!prossimoAppuntamentoCorrente) return;
  const a = prossimoAppuntamentoCorrente;
  const inizio = new Date(a.data_ora);
  const fine = new Date(inizio.getTime() + 60 * 60 * 1000); // durata di default: 1 ora
  const tipologiaLabel = a.tipologia === "remoto" ? "Da remoto" : "In studio";
  const note = (a.note || "").replace(/\n/g, "\\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NutriPlan//Appuntamento//IT",
    "BEGIN:VEVENT",
    `UID:appuntamento-${a.id}@nutriplan`,
    `DTSTAMP:${formattaDataIcs(new Date())}`,
    `DTSTART:${formattaDataIcs(inizio)}`,
    `DTEND:${formattaDataIcs(fine)}`,
    `SUMMARY:Appuntamento nutrizionista (${tipologiaLabel})`,
    note ? `DESCRIPTION:${note}` : "",
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter(Boolean).join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "appuntamento-nutriplan.ics";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function avviaVistaPaziente(pazienteRecord) {
  appShell.classList.add("hidden");
  vistaPaziente.classList.remove("hidden");
  anteprimaBanner.classList.add("hidden");
  pazienteLogoutBtn.classList.remove("hidden");
  vistaPazienteNomeEl.textContent = pazienteRecord.nome;

  pazienteCorrente = { id: pazienteRecord.id, nome: pazienteRecord.nome, frequenza_checkin: pazienteRecord.frequenza_checkin };
  renderProfiloPazienteVista(pazienteRecord);
  await caricaProssimoAppuntamento(pazienteRecord.id);

  storicoPesoCompleto = await caricaStoricoPeso(pazienteRecord.id);
  aggiornaFiltroPeso(filtroPesoAttivo);

  const rigaDieta = await caricaDietaAttivaPaziente(pazienteRecord.id);
  if (rigaDieta) {
    dietaCorrenteId = rigaDieta.id;
    applicaDatiDieta(rigaDieta.dati);
  } else {
    dietaCorrenteId = null;
    state = creaStatoVuoto();
  }

  pazienteHaDieta = !!rigaDieta && !dietaVuota();
  aggiornaBottoniPdfPaziente();
  pazienteDietaVista.innerHTML = costruisciContenutoPrintDieta();
  collapsedGiorniPaziente = new Set(GIORNI);
  applicaStatoCollassoPaziente();

  await ricaricaCheckinPaziente();
  if (dovrebbeChiedereNotifiche(pazienteRecord)) {
    mostraRichiestaNotifiche();
  } else if (Notification.permission === "granted") {
    verificaESincronizzaSubscription();
  }
}

// Se il permesso è già stato concesso in passato, il popup di richiesta non
// ricompare più (dovrebbeChiedereNotifiche lo esclude). Ma se nel frattempo la
// subscription si è persa (app disinstallata e reinstallata, dati del browser
// cancellati, nuovo dispositivo), il paziente resterebbe silenziosamente senza
// promemoria. Qui la ricreiamo in automatico, senza mostrare nulla, dato che
// il permesso del browser è già stato dato in precedenza.
async function verificaESincronizzaSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) return;
    await attivaNotifiche();
  } catch (e) {
    console.warn("Errore nella verifica della subscription push:", e);
  }
}

// ---------- Anteprima vista paziente (dal pannello amministratore) ----------
// Mostra all'admin esattamente ciò che vede il paziente selezionato, usando il
// piano alimentare attualmente caricato (già salvato a ogni modifica) e i dati
// di profilo/peso dal database. Un banner permette di tornare indietro senza
// effettuare il logout.

async function apriAnteprimaPaziente() {
  if (!pazienteCorrente) return;

  const { data, error } = await supabaseClient
    .from("pazienti")
    .select("*")
    .eq("id", pazienteCorrente.id)
    .single();

  if (error) {
    alert("Errore nel caricamento dell'anteprima: " + error.message);
    return;
  }

  vistaPazienteNomeEl.textContent = data.nome;
  renderProfiloPazienteVista(data);
  pazienteCorrente.frequenza_checkin = data.frequenza_checkin;
  await caricaProssimoAppuntamento(data.id);

  storicoPesoCompleto = await caricaStoricoPeso(data.id);
  aggiornaFiltroPeso(filtroPesoAttivo);

  pazienteHaDieta = !dietaVuota();
  aggiornaBottoniPdfPaziente();
  pazienteDietaVista.innerHTML = costruisciContenutoPrintDieta();
  collapsedGiorniPaziente = new Set(GIORNI);
  applicaStatoCollassoPaziente();
  await ricaricaCheckinPaziente();

  anteprimaBanner.classList.remove("hidden");
  pazienteLogoutBtn.classList.add("hidden");
  appShell.classList.add("hidden");
  vistaPaziente.classList.remove("hidden");
  window.scrollTo(0, 0);
}

function chiudiAnteprimaPaziente() {
  anteprimaBanner.classList.add("hidden");
  pazienteLogoutBtn.classList.remove("hidden");
  vistaPaziente.classList.add("hidden");
  appShell.classList.remove("hidden");
  renderDieta();
  window.scrollTo(0, 0);
}

// ---------- Check-in periodico: dati condivisi tra vista paziente e admin ----------

async function caricaCheckin(pazienteId) {
  const { data, error } = await supabaseClient
    .from("checkin")
    .select("*")
    .eq("paziente_id", pazienteId)
    .order("data_rilevazione", { ascending: false });

  if (error) {
    console.warn("Errore nel caricamento dei check-in:", error);
    return [];
  }
  return data || [];
}

function calcolaProssimoCheckin(ultimaData, frequenza) {
  if (!ultimaData || !frequenza) return null;
  const d = new Date(ultimaData);
  if (frequenza === "settimanale") d.setDate(d.getDate() + 7);
  else if (frequenza === "quindicinale") d.setDate(d.getDate() + 14);
  else if (frequenza === "mensile") d.setMonth(d.getMonth() + 1);
  else return null;
  return d;
}

function formattaVariazioneBreve(attuale, precedente, unita) {
  if (precedente === null || precedente === undefined) return "";
  const diff = round1(attuale - precedente);
  if (diff === 0) return "invariato";
  return `${diff > 0 ? "+" : ""}${diff} ${unita}`;
}

function costruisciTabellaCheckin(righe) {
  if (righe.length === 0) {
    return '<p class="vuoto">Nessun check-in registrato.</p>';
  }

  const corpo = righe.map((r, i) => {
    const precedente = righe[i + 1];
    const celle = [
      ["peso", "kg"],
      ["circonferenza_braccio", "cm"],
      ["circonferenza_addome", "cm"],
      ["circonferenza_petto", "cm"],
      ["circonferenza_coscia", "cm"]
    ].map(([campo, unita]) => {
      const variazione = formattaVariazioneBreve(r[campo], precedente?.[campo], unita);
      return `<td>${r[campo]} ${unita}${variazione ? `<span class="variazione">${escapeHtml(variazione)}</span>` : ""}</td>`;
    }).join("");

    return `<tr><td>${new Date(r.data_rilevazione).toLocaleDateString("it-IT")}</td>${celle}</tr>`;
  }).join("");

  return `
    <table class="tabella-checkin">
      <thead><tr><th>Data</th><th>Peso</th><th>Braccio</th><th>Addome</th><th>Petto</th><th>Coscia</th></tr></thead>
      <tbody>${corpo}</tbody>
    </table>
  `;
}

// ---------- Check-in periodico: vista paziente ----------

function renderProssimoCheckinPaziente(checkins, frequenza) {
  checkinAnticipoNota.classList.add("hidden");

  if (checkins.length === 0) {
    checkinProssimaData.textContent = "Primo check-in da compilare.";
    return;
  }

  const prossima = calcolaProssimoCheckin(checkins[0].data_rilevazione, frequenza);
  if (!prossima) {
    checkinProssimaData.textContent = `Ultimo check-in registrato: ${new Date(checkins[0].data_rilevazione).toLocaleDateString("it-IT")}.`;
    return;
  }

  checkinProssimaData.textContent = `Prossimo check-in previsto: ${prossima.toLocaleDateString("it-IT")}.`;
  if (new Date() < prossima) {
    checkinAnticipoNota.textContent = "Non è ancora il momento del prossimo check-in, ma puoi comunque registrarne uno adesso se vuoi.";
    checkinAnticipoNota.classList.remove("hidden");
  }
}

async function ricaricaCheckinPaziente() {
  if (!pazienteCorrente) return;
  checkinCompletiPaziente = await caricaCheckin(pazienteCorrente.id);
  renderProssimoCheckinPaziente(checkinCompletiPaziente, pazienteCorrente.frequenza_checkin);
  checkinStoricoContenuto.innerHTML = costruisciTabellaCheckin(checkinCompletiPaziente);
}

function validaCheckinInput() {
  const valori = {
    peso: parseFloat(checkinPesoInput.value),
    circonferenza_braccio: parseFloat(checkinBraccioInput.value),
    circonferenza_addome: parseFloat(checkinAddomeInput.value),
    circonferenza_petto: parseFloat(checkinPettoInput.value),
    circonferenza_coscia: parseFloat(checkinCosciaInput.value)
  };

  if (isNaN(valori.peso) || valori.peso < 20 || valori.peso > 300) {
    return { errore: "Inserisci un peso valido, tra 20 e 300 kg." };
  }

  const circonferenze = [
    ["circonferenza_braccio", "braccio"],
    ["circonferenza_addome", "addome"],
    ["circonferenza_petto", "petto"],
    ["circonferenza_coscia", "coscia"]
  ];
  for (const [campo, nome] of circonferenze) {
    const v = valori[campo];
    if (isNaN(v) || v < 10 || v > 200) {
      return { errore: `Inserisci una circonferenza ${nome} valida, tra 10 e 200 cm.` };
    }
  }

  return { valori };
}

async function inviaCheckin() {
  checkinError.classList.add("hidden");
  checkinSuccesso.classList.add("hidden");

  if (!pazienteCorrente) return;

  const { errore, valori } = validaCheckinInput();
  if (errore) {
    checkinError.textContent = errore;
    checkinError.classList.remove("hidden");
    return;
  }

  checkinInviaBtn.disabled = true;
  const { error } = await supabaseClient.from("checkin").insert({
    paziente_id: pazienteCorrente.id,
    ...valori
  });
  checkinInviaBtn.disabled = false;

  if (error) {
    checkinError.textContent = "Errore nel salvataggio: " + error.message;
    checkinError.classList.remove("hidden");
    return;
  }

  checkinSuccesso.textContent = "Check-in registrato correttamente.";
  checkinSuccesso.classList.remove("hidden");
  checkinPesoInput.value = "";
  checkinBraccioInput.value = "";
  checkinAddomeInput.value = "";
  checkinPettoInput.value = "";
  checkinCosciaInput.value = "";

  await ricaricaCheckinPaziente();
}

// ---------- Check-in periodico: vista admin ----------

function renderBadgeStatoCheckin(righe, frequenza) {
  if (righe.length === 0) {
    checkinBadgeStato.innerHTML = '<span class="badge-checkin in-linea">Nessun check-in ancora ricevuto</span>';
    return;
  }
  if (!frequenza) {
    checkinBadgeStato.innerHTML = "";
    return;
  }

  const prossima = calcolaProssimoCheckin(righe[0].data_rilevazione, frequenza);
  if (prossima && new Date() > prossima) {
    checkinBadgeStato.innerHTML = `<span class="badge-checkin in-ritardo">In ritardo (previsto per il ${prossima.toLocaleDateString("it-IT")})</span>`;
  } else {
    checkinBadgeStato.innerHTML = '<span class="badge-checkin in-linea">In linea con la cadenza prevista</span>';
  }
}

async function caricaEMostraCheckinAdmin(pazienteRecord) {
  const righe = await caricaCheckin(pazienteRecord.id);
  checkinAdminTabella.innerHTML = costruisciTabellaCheckin(righe);
  checkinFrequenzaSelect.value = pazienteRecord.frequenza_checkin || "";
  checkinFrequenzaSuccesso.classList.add("hidden");
  renderBadgeStatoCheckin(righe, pazienteRecord.frequenza_checkin);
}

async function salvaFrequenzaCheckin() {
  if (!pazienteCorrente) return;

  const frequenza = checkinFrequenzaSelect.value || null;
  checkinFrequenzaSuccesso.classList.add("hidden");

  const { error } = await supabaseClient.from("pazienti").update({ frequenza_checkin: frequenza }).eq("id", pazienteCorrente.id);
  if (error) {
    alert("Errore nel salvataggio della frequenza: " + error.message);
    return;
  }

  pazienteCorrente.frequenza_checkin = frequenza;
  checkinFrequenzaSuccesso.textContent = "Frequenza aggiornata.";
  checkinFrequenzaSuccesso.classList.remove("hidden");

  const righe = await caricaCheckin(pazienteCorrente.id);
  renderBadgeStatoCheckin(righe, frequenza);
}

function apriTabCheckin(tabId) {
  document.querySelectorAll("#checkin-admin .tab-btn").forEach(b => b.classList.toggle("attivo", b.dataset.tab === tabId));
  document.querySelectorAll("#checkin-admin .tab-pannello").forEach(p => p.classList.toggle("hidden", p.id !== tabId));
}

// ---------- Open Food Facts: consultazione prodotti (admin + paziente) ----------
// Solo consultazione: nessun dato viene salvato nel calcolatore né nel profilo
// del paziente. La ricerca passa sempre dalla nostra Pages Function
// (/api/openfoodfacts), che aggiunge lo User-Agent richiesto da Open Food
// Facts e mette in cache i risultati per non interrogarlo ripetutamente.

async function cercaOpenFoodFacts({ query, barcode }) {
  const params = new URLSearchParams();
  if (barcode) params.set("barcode", barcode);
  else if (query) params.set("query", query);

  let risposta;
  try {
    risposta = await fetch(`/api/openfoodfacts?${params.toString()}`);
  } catch (e) {
    return { errore: "Errore di rete. Controlla la connessione e riprova." };
  }

  const corpo = await risposta.json().catch(() => ({}));
  if (!risposta.ok) {
    return { errore: corpo.errore || "Errore imprevisto nella ricerca." };
  }
  return { prodotti: corpo.prodotti || [] };
}

const OFF_NUTRISCORE_LABEL = { a: "A", b: "B", c: "C", d: "D", e: "E" };

function renderSchedaProdottoOFF(p) {
  const badgeNutriscore = p.nutriscore && OFF_NUTRISCORE_LABEL[p.nutriscore]
    ? `<span class="off-badge-nutriscore off-nutriscore-${p.nutriscore}">Nutri-Score ${OFF_NUTRISCORE_LABEL[p.nutriscore]}</span>`
    : "";
  const badgeNova = p.nova ? `<span class="off-badge-nova">NOVA ${escapeHtml(String(p.nova))}</span>` : "";

  const foto = p.immagine
    ? `<img src="${escapeHtml(p.immagine)}" data-full="${escapeHtml(p.immagineGrande || p.immagine)}" alt="Foto prodotto (clicca per ingrandire)" class="off-foto-prodotto" loading="lazy" onerror="this.remove()">`
    : "";

  return `
    <article class="off-scheda-prodotto">
      <div class="off-scheda-intestazione">
        ${foto}
        <div>
          <h3>${escapeHtml(p.nome || "Prodotto senza nome")}</h3>
          <p class="hint">${escapeHtml(p.marca || "Marca non indicata")}${p.quantita ? " · " + escapeHtml(p.quantita) : ""}</p>
          <div class="off-badge-riga">${badgeNutriscore}${badgeNova}</div>
        </div>
      </div>
      <table class="off-tabella-nutrienti">
        <tbody>
          <tr><td>Energia</td><td>${p.kcal100g != null ? round1(p.kcal100g) + " kcal" : "—"}</td></tr>
          <tr><td>Proteine</td><td>${p.proteine100g != null ? round1(p.proteine100g) + " g" : "—"}</td></tr>
          <tr><td>Grassi</td><td>${p.grassi100g != null ? round1(p.grassi100g) + " g" : "—"}</td></tr>
          <tr><td>Carboidrati</td><td>${p.carboidrati100g != null ? round1(p.carboidrati100g) + " g" : "—"}</td></tr>
        </tbody>
      </table>
      <p class="hint">Valori per 100 g/ml.</p>
      ${p.ingredienti ? `<p><strong>Ingredienti:</strong> ${escapeHtml(p.ingredienti)}</p>` : ""}
      ${p.allergeni ? `<p><strong>Allergeni:</strong> ${escapeHtml(p.allergeni)}</p>` : ""}
    </article>
  `;
}

// Con più di un risultato si mostra prima un elenco compatto (nome + marca)
// tra cui scegliere, invece di scaricare in pagina tutte le schede intere:
// i prodotti vengono tenuti in memoria sull'elemento contenitore stesso, così
// "torna all'elenco" non deve rifare la ricerca.
function renderRisultatiOFF(container, erroreEl, risultato) {
  erroreEl.classList.add("hidden");
  container._prodottiOFF = null;

  if (risultato.errore) {
    erroreEl.textContent = risultato.errore;
    erroreEl.classList.remove("hidden");
    container.innerHTML = "";
    return;
  }

  if (risultato.prodotti.length <= 1) {
    container.innerHTML = risultato.prodotti.map(renderSchedaProdottoOFF).join("");
    return;
  }

  container._prodottiOFF = risultato.prodotti;
  renderElencoOFF(container);
}

function renderElencoOFF(container) {
  const prodotti = container._prodottiOFF || [];
  container.innerHTML = `
    <p class="hint">${prodotti.length} risultati: scegli quello che ti interessa.</p>
    <div class="off-suggestions">
      ${prodotti.map((p, i) => `
        <button type="button" class="off-suggestion-item" data-index="${i}">
          <strong>${escapeHtml(p.nome || "Prodotto senza nome")}</strong>
          <span class="hint">${escapeHtml(p.marca || "Marca non indicata")}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function selezionaRisultatoOFF(container, index) {
  const prodotti = container._prodottiOFF;
  if (!prodotti || !prodotti[index]) return;
  container.innerHTML = `
    <button type="button" class="secondary off-torna-elenco-btn">← Torna all'elenco</button>
    ${renderSchedaProdottoOFF(prodotti[index])}
  `;
}

function apriFotoProdotto(url) {
  if (!url) return;
  offFotoGrande.src = url;
  offFotoOverlay.classList.remove("hidden");
}

function chiudiFotoProdotto() {
  offFotoOverlay.classList.add("hidden");
  offFotoGrande.src = "";
}

async function cercaOFFAdmin() {
  const query = offAdminQueryInput.value.trim();
  const barcode = offAdminBarcodeInput.value.trim();
  if (!query && !barcode) {
    offAdminErrore.textContent = "Inserisci un nome prodotto o un codice a barre.";
    offAdminErrore.classList.remove("hidden");
    return;
  }
  offAdminRisultati.innerHTML = '<p class="hint">Ricerca in corso...</p>';
  const risultato = await cercaOpenFoodFacts({ query, barcode });
  renderRisultatiOFF(offAdminRisultati, offAdminErrore, risultato);
}

// ---------- Open Food Facts: scanner barcode (paziente) ----------
// html5-qrcode gestisce sia il permesso fotocamera che la decodifica del
// codice a barre; se la fotocamera non è disponibile o il permesso viene
// negato, resta comunque possibile inserire il codice a barre a mano.

let html5QrCodeScanner = null;

async function avviaScannerBarcode() {
  offPazienteErrore.classList.add("hidden");
  offScannerPermessoNota.classList.remove("hidden");
  offScannerViewport.classList.remove("hidden");
  offScannerAvviaBtn.classList.add("hidden");
  offScannerStopBtn.classList.remove("hidden");

  html5QrCodeScanner = new Html5Qrcode("off-scanner-viewport");
  try {
    await html5QrCodeScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      async (codiceLetto) => {
        await fermaScannerBarcode();
        offBarcodeManualeInput.value = codiceLetto;
        await cercaOFFBarcode(codiceLetto);
      },
      () => {} // errori di lettura frame-by-frame: normali durante la scansione, si ignorano
    );
  } catch (e) {
    offPazienteErrore.textContent = "Impossibile accedere alla fotocamera. Puoi comunque inserire il codice a barre manualmente qui sotto.";
    offPazienteErrore.classList.remove("hidden");
    await fermaScannerBarcode();
  }
}

async function fermaScannerBarcode() {
  offScannerViewport.classList.add("hidden");
  offScannerPermessoNota.classList.add("hidden");
  offScannerAvviaBtn.classList.remove("hidden");
  offScannerStopBtn.classList.add("hidden");
  if (html5QrCodeScanner) {
    try {
      await html5QrCodeScanner.stop();
      html5QrCodeScanner.clear();
    } catch (e) {}
    html5QrCodeScanner = null;
  }
}

async function cercaOFFBarcode(barcode) {
  offPazienteRisultati.innerHTML = '<p class="hint">Ricerca in corso...</p>';
  const risultato = await cercaOpenFoodFacts({ barcode });
  renderRisultatiOFF(offPazienteRisultati, offPazienteErrore, risultato);
}

async function cercaOFFBarcodeManuale() {
  const barcode = offBarcodeManualeInput.value.trim();
  if (!barcode) {
    offPazienteErrore.textContent = "Inserisci un codice a barre.";
    offPazienteErrore.classList.remove("hidden");
    return;
  }
  await cercaOFFBarcode(barcode);
}

// ---------- Notifiche push: consenso e subscription ----------

function rilevaIosNonStandalone() {
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const standalone = window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  return iOS && !standalone;
}

// Su Android, l'app installata sulla schermata Home (WebAPK) ha un permesso di
// notifica di sistema separato da quello del browser: il sito può vedere il
// permesso come "concesso" anche se le notifiche restano disattivate a
// livello di sistema per quell'app specifica. Non esiste modo, da pagina web,
// di leggere o forzare quello stato: l'unico rimedio è avvisare l'utente.
function rilevaAndroidStandalone() {
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const standalone = window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  return standalone && !iOS;
}

function dovrebbeChiedereNotifiche(pazienteRecord) {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (Notification.permission !== "default") return false;
  if (pazienteRecord.notifiche_richieste) return false;
  return true;
}

function mostraRichiestaNotifiche() {
  if (rilevaIosNonStandalone()) {
    notificheTesto.textContent = 'Puoi ricevere un promemoria quando è ora del tuo check-in periodico (peso e circonferenze). Su iPhone/iPad devi prima aggiungere questo sito alla schermata Home (tasto Condividi → "Aggiungi a Home"), poi riaprirlo da lì per poter attivare i promemoria.';
    notificheAttivaBtn.classList.add("hidden");
  } else {
    notificheTesto.textContent = "Puoi ricevere un promemoria quando è ora del tuo check-in periodico (peso e circonferenze). Vuoi attivarlo?";
    notificheAttivaBtn.classList.remove("hidden");
  }
  notificheOverlay.classList.remove("hidden");
}

function chiudiRichiestaNotifiche() {
  notificheOverlay.classList.add("hidden");
}

function mostraSuggerimentoAndroidPWA() {
  notificheTesto.textContent = 'Promemoria attivati. Se in futuro non dovessi ricevere i promemoria: apri Impostazioni del telefono → App → cerca "NutriPlan" → Notifiche, e controlla che siano attive per questa app (è un permesso separato da quello del browser, capita che resti disattivato di default).';
  notificheAttivaBtn.classList.add("hidden");
  notificheRifiutaBtn.classList.add("hidden");
  notificheOkBtn.classList.remove("hidden");
  notificheOverlay.classList.remove("hidden");
}

async function segnaNotificheRichieste() {
  if (!pazienteCorrente) return;
  await supabaseClient.from("pazienti").update({ notifiche_richieste: true }).eq("id", pazienteCorrente.id);
}

async function rifiutaNotifiche() {
  chiudiRichiestaNotifiche();
  await segnaNotificheRichieste();
}

function base64UrlToUint8Array(base64Url) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const array = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) array[i] = raw.charCodeAt(i);
  return array;
}

async function attivaNotifiche() {
  chiudiRichiestaNotifiche();
  await segnaNotificheRichieste();

  const permesso = await Notification.requestPermission();
  if (permesso !== "granted") return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscriptionEsistente = await registration.pushManager.getSubscription();
    if (subscriptionEsistente) await subscriptionEsistente.unsubscribe();

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY)
    });

    const json = subscription.toJSON();
    const { error } = await supabaseClient.from("push_subscriptions").upsert({
      paziente_id: pazienteCorrente.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth
    }, { onConflict: "endpoint" });

    if (error) console.warn("Errore nel salvataggio della subscription:", error);
    else if (rilevaAndroidStandalone()) mostraSuggerimentoAndroidPWA();
  } catch (e) {
    console.warn("Errore nell'attivazione delle notifiche:", e);
  }
}

// ---------- Vista paziente: giorni collassabili (vista più compatta) ----------

let collapsedGiorniPaziente = new Set(GIORNI);

function applicaStatoCollassoPaziente() {
  pazienteDietaVista.querySelectorAll(".p-giorno").forEach(el => {
    const giorno = el.dataset.giorno;
    const chiuso = collapsedGiorniPaziente.has(giorno);
    const corpo = el.querySelector(".p-giorno-corpo");
    if (corpo) corpo.classList.toggle("collassato", chiuso);
    const freccia = el.querySelector(".freccia-giorno");
    if (freccia) freccia.textContent = chiuso ? "▸" : "▾";
  });
}

function toggleGiornoPaziente(giorno) {
  if (collapsedGiorniPaziente.has(giorno)) collapsedGiorniPaziente.delete(giorno);
  else collapsedGiorniPaziente.add(giorno);
  applicaStatoCollassoPaziente();
}

// ---------- Gestione utenti (admin): invito nuovi accessi ----------

function apriGestioneUtenti() {
  invitoError.classList.add("hidden");
  invitoSuccesso.classList.add("hidden");
  popolaSelettorePazientiInvito();
  nuovoPazienteNomeInput.value = "";
  nuovoPazienteError.classList.add("hidden");
  apriTabGestioneUtenti("gestione-invito-tab");
  gestioneUtentiOverlay.classList.remove("hidden");
}

function chiudiGestioneUtenti() {
  gestioneUtentiOverlay.classList.add("hidden");
}

function apriTabGestioneUtenti(tabId) {
  document.querySelectorAll("#gestione-utenti-overlay .tab-btn").forEach(b => b.classList.toggle("attivo", b.dataset.tab === tabId));
  document.querySelectorAll("#gestione-utenti-overlay .tab-pannello").forEach(p => p.classList.toggle("hidden", p.id !== tabId));
  if (tabId === "gestione-nuovo-paziente-tab") nuovoPazienteNomeInput.focus();
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

// ---------- Sicurezza account: autenticazione a due fattori (admin) ----------
// Usa l'MFA nativo di Supabase Auth (TOTP): QR code, verifica e assurance
// level (aal1/aal2) sono gestiti interamente da Supabase, qui ci limitiamo a
// chiamare mfa.enroll/challenge/verify/unenroll. I codici di backup non sono
// previsti dall'MFA nativo: li generiamo noi (crypto.getRandomValues) e ne
// salviamo solo l'hash SHA-256 in admin_backup_codes (RLS: solo il proprietario
// può leggerli/cancellarli). Di default la 2FA è disattivata: se l'admin non
// la attiva mai, verificaSeServe2FA() non troverà nessun fattore e il login
// resta esattamente come oggi.

async function sha256Hex(testo) {
  const dati = new TextEncoder().encode(testo);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dati);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function generaCodiceBackup() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${hex.slice(0, 5)}-${hex.slice(5, 10)}`;
}

async function consumaCodiceBackup(codice) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return false;

  const hash = await sha256Hex(codice.trim().toUpperCase());
  const { data, error } = await supabaseClient
    .from("admin_backup_codes")
    .select("id")
    .eq("user_id", user.id)
    .eq("code_hash", hash)
    .limit(1);

  if (error || !data || data.length === 0) return false;

  await supabaseClient.from("admin_backup_codes").delete().eq("id", data[0].id);
  return true;
}

async function apriSicurezza() {
  sicurezzaSetupBlocco.classList.add("hidden");
  sicurezzaBackupBlocco.classList.add("hidden");
  sicurezzaDisattivaBlocco.classList.add("hidden");
  sicurezzaAttivaBtn.classList.add("hidden");
  sicurezzaStatoEl.textContent = "Verifica in corso...";
  sicurezzaOverlay.classList.remove("hidden");

  const { data, error } = await supabaseClient.auth.mfa.listFactors();
  const totpAttivo = !error && data && data.totp ? data.totp.find(f => f.status === "verified") : null;

  if (totpAttivo) {
    mfaFactorIdCorrente = totpAttivo.id;
    sicurezzaStatoEl.textContent = "Autenticazione a due fattori: attiva.";
    sicurezzaDisattivaCodiceInput.value = "";
    sicurezzaDisattivaErrore.classList.add("hidden");
    sicurezzaDisattivaBlocco.classList.remove("hidden");
  } else {
    mfaFactorIdCorrente = null;
    sicurezzaStatoEl.textContent = "Autenticazione a due fattori: non attiva.";
    sicurezzaAttivaBtn.classList.remove("hidden");
  }
}

function chiudiSicurezza() {
  sicurezzaOverlay.classList.add("hidden");
}

async function avviaAttivazione2FA() {
  sicurezzaSetupErrore.classList.add("hidden");
  const { data, error } = await supabaseClient.auth.mfa.enroll({ factorType: "totp" });
  if (error) {
    alert("Errore nell'avvio dell'attivazione: " + error.message);
    return;
  }

  mfaFactorIdCorrente = data.id;
  sicurezzaQrContenitore.innerHTML = data.totp.qr_code;
  sicurezzaSecretTesto.textContent = "Codice manuale (se non puoi inquadrare il QR): " + data.totp.secret;
  sicurezzaSetupCodiceInput.value = "";
  sicurezzaAttivaBtn.classList.add("hidden");
  sicurezzaSetupBlocco.classList.remove("hidden");
}

async function annullaAttivazione2FA() {
  if (mfaFactorIdCorrente) {
    await supabaseClient.auth.mfa.unenroll({ factorId: mfaFactorIdCorrente });
  }
  mfaFactorIdCorrente = null;
  sicurezzaSetupBlocco.classList.add("hidden");
  sicurezzaAttivaBtn.classList.remove("hidden");
}

async function confermaAttivazione2FA() {
  const codice = sicurezzaSetupCodiceInput.value.trim();
  sicurezzaSetupErrore.classList.add("hidden");
  if (!codice) {
    sicurezzaSetupErrore.textContent = "Inserisci il codice a 6 cifre.";
    sicurezzaSetupErrore.classList.remove("hidden");
    return;
  }

  sicurezzaSetupConfermaBtn.disabled = true;
  const { data: challenge, error: erroreChallenge } = await supabaseClient.auth.mfa.challenge({ factorId: mfaFactorIdCorrente });
  if (erroreChallenge) {
    sicurezzaSetupConfermaBtn.disabled = false;
    sicurezzaSetupErrore.textContent = "Errore: " + erroreChallenge.message;
    sicurezzaSetupErrore.classList.remove("hidden");
    return;
  }

  const { error } = await supabaseClient.auth.mfa.verify({ factorId: mfaFactorIdCorrente, challengeId: challenge.id, code: codice });
  sicurezzaSetupConfermaBtn.disabled = false;

  if (error) {
    sicurezzaSetupErrore.textContent = "Codice non valido. Riprova.";
    sicurezzaSetupErrore.classList.remove("hidden");
    return;
  }

  sicurezzaSetupBlocco.classList.add("hidden");
  await generaEMostraBackupCodes();
}

async function generaEMostraBackupCodes() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  // Rimuove eventuali codici di un'attivazione precedente, ormai non più validi.
  await supabaseClient.from("admin_backup_codes").delete().eq("user_id", user.id);

  const codici = Array.from({ length: 8 }, generaCodiceBackup);
  const righe = await Promise.all(codici.map(async (c) => ({
    user_id: user.id,
    code_hash: await sha256Hex(c)
  })));

  const { error } = await supabaseClient.from("admin_backup_codes").insert(righe);
  if (error) {
    alert("2FA attivata, ma non è stato possibile salvare i codici di backup: " + error.message);
    return;
  }

  sicurezzaBackupLista.innerHTML = codici.map(c => `<p><code>${c}</code></p>`).join("");
  sicurezzaBackupBlocco.classList.remove("hidden");
}

function chiudiBackupBlocco() {
  sicurezzaBackupBlocco.classList.add("hidden");
  chiudiSicurezza();
}

async function disattiva2FA() {
  const codice = sicurezzaDisattivaCodiceInput.value.trim();
  sicurezzaDisattivaErrore.classList.add("hidden");
  if (!codice) {
    sicurezzaDisattivaErrore.textContent = "Inserisci un codice per confermare.";
    sicurezzaDisattivaErrore.classList.remove("hidden");
    return;
  }

  let verificato = false;
  const { data: challenge, error: erroreChallenge } = await supabaseClient.auth.mfa.challenge({ factorId: mfaFactorIdCorrente });
  if (!erroreChallenge) {
    const { error } = await supabaseClient.auth.mfa.verify({ factorId: mfaFactorIdCorrente, challengeId: challenge.id, code: codice });
    verificato = !error;
  }
  if (!verificato) {
    verificato = await consumaCodiceBackup(codice);
  }

  if (!verificato) {
    sicurezzaDisattivaErrore.textContent = "Codice non valido.";
    sicurezzaDisattivaErrore.classList.remove("hidden");
    return;
  }

  const { error } = await supabaseClient.auth.mfa.unenroll({ factorId: mfaFactorIdCorrente });
  if (error) {
    sicurezzaDisattivaErrore.textContent = "Errore nella disattivazione: " + error.message;
    sicurezzaDisattivaErrore.classList.remove("hidden");
    return;
  }

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (user) await supabaseClient.from("admin_backup_codes").delete().eq("user_id", user.id);

  chiudiSicurezza();
  alert("Autenticazione a due fattori disattivata.");
}

// ---------- Pazienti ----------

// Combo di ricerca paziente riutilizzabile: un input di testo + lista
// suggerimenti che si comporta come "Paziente in lavorazione" in homepage
// (si scrive per filtrare, si cancella il testo per cercarne un altro).
// Espone una proprietà "value" (id paziente, "" se non selezionato) al
// posto di quella di un <select>, così il resto del codice che legge/scrive
// ".value" non cambia.
function creaComboPazienteRicerca(inputEl, suggestionsEl, opzioneVuotaTesto) {
  let elenco = [];
  let valore = "";
  let indiceEvidenziato = -1;

  function opzioniVisibili(testoRicerca) {
    const norm = normalizza((testoRicerca || "").trim());
    const filtrati = !norm ? elenco : elenco.filter(p => normalizza(p.nome).includes(norm));
    if (!opzioneVuotaTesto) return filtrati;
    const vuotaCombacia = !norm || normalizza(opzioneVuotaTesto).includes(norm);
    return vuotaCombacia ? [{ id: "", nome: opzioneVuotaTesto }].concat(filtrati) : filtrati;
  }

  function mostra(lista) {
    indiceEvidenziato = -1;
    if (lista.length === 0) {
      suggestionsEl.innerHTML = "";
      suggestionsEl.classList.add("hidden");
      return;
    }
    suggestionsEl.innerHTML = lista
      .map((p, i) => `<div class="suggestion-item" data-index="${i}">${escapeHtml(p.nome)}</div>`)
      .join("");
    suggestionsEl.dataset.ids = JSON.stringify(lista.map(p => p.id));
    suggestionsEl.classList.remove("hidden");
  }

  function nascondi() {
    suggestionsEl.classList.add("hidden");
    indiceEvidenziato = -1;
  }

  function aggiornaFiltro() {
    mostra(opzioniVisibili(inputEl.value));
  }

  function evidenzia() {
    suggestionsEl.querySelectorAll(".suggestion-item").forEach((el, i) => el.classList.toggle("active", i === indiceEvidenziato));
  }

  function testoPerValore(id) {
    // Quando non c'è selezione il campo resta vuoto (mostra il placeholder
    // HTML): scriverci dentro il testo dell'opzione vuota lo farebbe
    // ri-filtrare come se fosse testo digitato dall'utente al focus
    // successivo, mostrando solo se stesso nei suggerimenti.
    if (!id) return "";
    const p = elenco.find(p => p.id === id);
    return p ? p.nome : "";
  }

  function seleziona(id) {
    valore = id || "";
    inputEl.value = testoPerValore(valore);
    nascondi();
    if (combo.onChange) combo.onChange(valore);
  }

  // Al click/focus mostra sempre l'elenco completo e seleziona il testo:
  // così si può scorrere tutti i nomi, oppure iniziare a digitare per
  // filtrare (come il combo "Paziente in lavorazione" della homepage).
  const apriElencoCompleto = () => {
    inputEl.select();
    mostra(opzioniVisibili(""));
  };
  inputEl.addEventListener("input", aggiornaFiltro);
  inputEl.addEventListener("focus", apriElencoCompleto);
  inputEl.addEventListener("click", apriElencoCompleto);
  inputEl.addEventListener("keydown", (e) => {
    const items = suggestionsEl.querySelectorAll(".suggestion-item");
    if (suggestionsEl.classList.contains("hidden") || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      indiceEvidenziato = Math.min(indiceEvidenziato + 1, items.length - 1);
      evidenzia();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      indiceEvidenziato = Math.max(indiceEvidenziato - 1, 0);
      evidenzia();
    } else if (e.key === "Enter" && indiceEvidenziato >= 0) {
      e.preventDefault();
      const ids = JSON.parse(suggestionsEl.dataset.ids || "[]");
      seleziona(ids[indiceEvidenziato]);
    } else if (e.key === "Escape") {
      nascondi();
    }
  });
  suggestionsEl.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".suggestion-item");
    if (!item) return;
    e.preventDefault();
    const ids = JSON.parse(suggestionsEl.dataset.ids || "[]");
    seleziona(ids[Number(item.dataset.index)]);
  });
  document.addEventListener("click", (e) => {
    if (e.target !== inputEl && !suggestionsEl.contains(e.target)) nascondi();
  });

  const combo = {
    get value() {
      return valore;
    },
    set value(id) {
      valore = id || "";
      inputEl.value = testoPerValore(valore);
    },
    setElenco(nuovoElenco) {
      elenco = nuovoElenco || [];
      inputEl.value = testoPerValore(valore);
    },
    onChange: null
  };
  return combo;
}

async function caricaListaPazienti() {
  const { data, error } = await supabaseClient.from("pazienti").select("*").order("nome", { ascending: true });
  if (error) {
    alert("Errore nel caricamento dei pazienti: " + error.message);
    return;
  }
  listaPazienti = data || [];
}

function mostraSuggerimentiPazienti(elenco) {
  pazienteSuggestionIndex = -1;
  if (elenco.length === 0) {
    pazienteSuggestions.innerHTML = "";
    pazienteSuggestions.classList.add("hidden");
    return;
  }
  pazienteSuggestions.innerHTML = elenco
    .map((p, i) => `<div class="suggestion-item" data-index="${i}">${escapeHtml(p.nome)}</div>`)
    .join("");
  pazienteSuggestions.dataset.ids = JSON.stringify(elenco.map(p => p.id));
  pazienteSuggestions.classList.remove("hidden");
}

function nascondiSuggerimentiPazienti() {
  pazienteSuggestions.classList.add("hidden");
  pazienteSuggestionIndex = -1;
}

function aggiornaSuggerimentiPazienti(mostraTutti) {
  const testo = normalizza(pazienteSearchInput.value.trim());
  const elenco = (mostraTutti || !testo)
    ? listaPazienti
    : listaPazienti.filter(p => normalizza(p.nome).includes(testo));
  mostraSuggerimentiPazienti(elenco);
}

function evidenziaSuggerimentoPaziente() {
  const items = pazienteSuggestions.querySelectorAll(".suggestion-item");
  items.forEach((el, i) => el.classList.toggle("active", i === pazienteSuggestionIndex));
}

async function selezionaPazienteDaRicerca(id) {
  const p = listaPazienti.find(p => p.id === id);
  if (!p) return;
  pazienteSearchInput.value = p.nome;
  nascondiSuggerimentiPazienti();
  await selezionaPaziente(id);
}

function aggiornaDisponibilitaSezioniPaziente() {
  const disponibili = !areaLavoro.classList.contains("hidden");
  sezioniLinkPaziente.forEach(link => link.classList.toggle("non-disponibile", !disponibili));
}

async function selezionaPaziente(pazienteId) {
  if (!pazienteId) {
    pazienteCorrente = null;
    dietaCorrenteId = null;
    storicoBtn.disabled = true;
    profiloBtn.disabled = true;
    anteprimaPazienteBtn.disabled = true;
    agendaNuovoBtn.disabled = true;
    areaLavoro.classList.add("hidden");
    aggiornaDisponibilitaSezioniPaziente();
    renderProssimoAppuntamentoAdmin();
    return;
  }

  const p = listaPazienti.find(p => p.id === pazienteId);
  if (!p) return;
  pazienteCorrente = { id: p.id, nome: p.nome, frequenza_checkin: p.frequenza_checkin };

  const { data: dieteAttive, error } = await supabaseClient
    .from("diete")
    .select("*")
    .eq("paziente_id", pazienteId)
    .eq("stato", "attiva")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    alert("Errore nel caricamento del piano alimentare: " + error.message);
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
      alert("Errore nella creazione del piano alimentare: " + erroreCreazione.message);
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

  collapsedGiorni = new Set(GIORNI);
  draftPasto = [];

  storicoBtn.disabled = false;
  profiloBtn.disabled = false;
  anteprimaPazienteBtn.disabled = false;
  agendaNuovoBtn.disabled = false;
  areaLavoro.classList.remove("hidden");
  aggiornaDisponibilitaSezioniPaziente();
  renderProssimoAppuntamentoAdmin();

  renderDraft();
  renderDieta();
  caricaEMostraCheckinAdmin(p);
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

  chiudiGestioneUtenti();
  await caricaListaPazienti();
  pazienteSearchInput.value = data.nome;
  await selezionaPaziente(data.id);
}

// ---------- Agenda appuntamenti (admin) ----------
// Vista trasversale, non legata al "paziente in lavorazione": mostra tutti gli
// appuntamenti (passati e futuri) con possibilità di filtrare per paziente.
// Solo l'amministratore può crearli/modificarli/cancellarli (RLS lo impone
// anche lato database); il paziente li vede in sola lettura, solo i propri.

let listaAppuntamenti = [];

async function caricaAppuntamenti() {
  const { data, error } = await supabaseClient
    .from("appuntamenti")
    .select("*, pazienti(nome)")
    .order("data_ora", { ascending: true });

  if (error) {
    console.error("Errore nel caricamento degli appuntamenti:", error);
    listaAppuntamenti = [];
  } else {
    listaAppuntamenti = data || [];
  }
  popolaFiltroAgenda();
  renderListaAppuntamenti();
  renderProssimoAppuntamentoAdmin();
}

function apriAgendaModale() {
  popolaFiltroAgenda();
  renderListaAppuntamenti();
  agendaOverlay.classList.remove("hidden");
}

function chiudiAgendaModale() {
  agendaOverlay.classList.add("hidden");
}

// Prossimo appuntamento futuro del paziente in lavorazione, calcolato da
// listaAppuntamenti (già caricata) senza una nuova interrogazione al database.
function renderProssimoAppuntamentoAdmin() {
  if (!pazienteCorrente) {
    prossimoAppuntamentoAdminContenuto.innerHTML = '<p class="vuoto">Nessun appuntamento programmato.</p>';
    return;
  }

  const ora = new Date();
  const prossimo = listaAppuntamenti
    .filter(a => a.paziente_id === pazienteCorrente.id && new Date(a.data_ora) >= ora)
    .sort((a, b) => new Date(a.data_ora) - new Date(b.data_ora))[0];

  if (!prossimo) {
    prossimoAppuntamentoAdminContenuto.innerHTML = '<p class="vuoto">Nessun appuntamento programmato.</p>';
    return;
  }

  const dataOra = new Date(prossimo.data_ora);
  const tipologiaLabel = prossimo.tipologia === "remoto" ? "Da remoto" : "In studio";
  prossimoAppuntamentoAdminContenuto.innerHTML = `
    <div class="prossimo-appuntamento-riga">
      <div>
        <strong>${dataOra.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</strong>
        <p>${dataOra.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · ${tipologiaLabel}</p>
        ${prossimo.note ? `<p class="hint">${escapeHtml(prossimo.note)}</p>` : ""}
      </div>
      <button type="button" class="secondary agenda-modifica-btn" data-id="${prossimo.id}">Modifica</button>
    </div>
  `;
}

function popolaFiltroAgenda() {
  const selezionato = agendaFiltroPazienteSelect.value;
  agendaFiltroPazienteSelect.setElenco(listaPazienti);
  agendaFiltroPazienteSelect.value = selezionato || "";
}

function renderListaAppuntamenti() {
  const filtroPaziente = agendaFiltroPazienteSelect.value;
  const ora = new Date();
  const righe = listaAppuntamenti.filter(a => !filtroPaziente || a.paziente_id === filtroPaziente);

  if (righe.length === 0) {
    agendaListaEl.innerHTML = '<p class="vuoto">Nessun appuntamento registrato.</p>';
    return;
  }

  agendaListaEl.innerHTML = righe.map(a => {
    const dataOra = new Date(a.data_ora);
    const passato = dataOra < ora;
    const nomePaziente = a.pazienti ? a.pazienti.nome : "—";
    const tipologiaLabel = a.tipologia === "remoto" ? "Da remoto" : "In studio";
    return `
      <div class="agenda-riga ${passato ? "agenda-passato" : "agenda-futuro"}">
        <div class="agenda-riga-info">
          <span class="badge-checkin ${passato ? "in-ritardo" : "in-linea"}">${passato ? "Passato" : "Futuro"}</span>
          <strong>${dataOra.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })} · ${dataOra.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</strong>
          <span>${escapeHtml(nomePaziente)} — ${tipologiaLabel}</span>
          ${a.note ? `<span class="hint">${escapeHtml(a.note)}</span>` : ""}
        </div>
        ${!passato ? `<button type="button" class="secondary agenda-modifica-btn" data-id="${a.id}">Modifica</button>` : ""}
      </div>
    `;
  }).join("");
}

function apriNuovoAppuntamento() {
  appuntamentoInModifica = null;
  appuntamentoTitolo.textContent = "Nuovo appuntamento";
  appuntamentoPazienteSelect.setElenco(listaPazienti);
  if (pazienteCorrente) appuntamentoPazienteSelect.value = pazienteCorrente.id;
  appuntamentoDataInput.value = "";
  appuntamentoOraInput.value = "";
  appuntamentoTipologiaSelect.value = "studio";
  appuntamentoNoteInput.value = "";
  appuntamentoErrore.classList.add("hidden");
  appuntamentoEliminaBtn.classList.add("hidden");
  appuntamentoOverlay.classList.remove("hidden");
  appuntamentoDataInput.focus();
}

function apriModificaAppuntamento(id) {
  const a = listaAppuntamenti.find(x => x.id === id);
  if (!a) return;
  appuntamentoInModifica = a;
  appuntamentoTitolo.textContent = "Modifica appuntamento";
  appuntamentoPazienteSelect.setElenco(listaPazienti);
  appuntamentoPazienteSelect.value = a.paziente_id;
  const dataOra = new Date(a.data_ora);
  appuntamentoDataInput.value = dataOra.toISOString().slice(0, 10);
  appuntamentoOraInput.value = dataOra.toTimeString().slice(0, 5);
  appuntamentoTipologiaSelect.value = a.tipologia;
  appuntamentoNoteInput.value = a.note || "";
  appuntamentoErrore.classList.add("hidden");
  appuntamentoEliminaBtn.classList.remove("hidden");
  appuntamentoOverlay.classList.remove("hidden");
}

function chiudiAppuntamento() {
  appuntamentoOverlay.classList.add("hidden");
}

async function salvaAppuntamento() {
  const pazienteId = appuntamentoPazienteSelect.value;
  const data = appuntamentoDataInput.value;
  const ora = appuntamentoOraInput.value;
  appuntamentoErrore.classList.add("hidden");

  if (!pazienteId || !data || !ora) {
    appuntamentoErrore.textContent = "Seleziona un paziente e inserisci data e ora.";
    appuntamentoErrore.classList.remove("hidden");
    return;
  }

  const dataOraLocale = new Date(`${data}T${ora}:00`);
  if (isNaN(dataOraLocale.getTime())) {
    appuntamentoErrore.textContent = "Data o ora non valide.";
    appuntamentoErrore.classList.remove("hidden");
    return;
  }

  const corpo = {
    paziente_id: pazienteId,
    data_ora: dataOraLocale.toISOString(),
    tipologia: appuntamentoTipologiaSelect.value,
    note: appuntamentoNoteInput.value.trim() || null
  };

  let error;
  appuntamentoSalvaBtn.disabled = true;
  try {
    if (appuntamentoInModifica) {
      // Se l'orario cambia, va ridato il permesso di inviare un nuovo promemoria.
      if (new Date(appuntamentoInModifica.data_ora).getTime() !== dataOraLocale.getTime()) {
        corpo.promemoria_inviato = false;
      }
      ({ error } = await supabaseClient.from("appuntamenti").update(corpo).eq("id", appuntamentoInModifica.id));
    } else {
      ({ error } = await supabaseClient.from("appuntamenti").insert(corpo));
    }
  } finally {
    appuntamentoSalvaBtn.disabled = false;
  }

  if (error) {
    appuntamentoErrore.textContent = "Errore: " + error.message;
    appuntamentoErrore.classList.remove("hidden");
    return;
  }

  chiudiAppuntamento();
  await caricaAppuntamenti();
}

async function eliminaAppuntamentoCorrente() {
  if (!appuntamentoInModifica) return;
  if (!confirm("Eliminare questo appuntamento?")) return;

  const { error } = await supabaseClient.from("appuntamenti").delete().eq("id", appuntamentoInModifica.id);
  if (error) {
    alert("Errore nell'eliminazione: " + error.message);
    return;
  }
  chiudiAppuntamento();
  await caricaAppuntamenti();
}

// ---------- Richieste di cancellazione dati (admin) ----------
// Notifica interna (nessuna push): un contatore sull'icona 🔔, aggiornato al
// caricamento della vista admin e dopo ogni azione. "Accetta" registra la
// decisione e lancia subito la funzione serverless elimina-paziente, che
// cancella account e dati: da qui in avanti l'operazione non è reversibile.

async function caricaRichieste() {
  const { data, error } = await supabaseClient
    .from("richieste_cancellazione")
    .select("*")
    .order("richiesta_il", { ascending: false });

  if (error) {
    console.error("Errore nel caricamento delle richieste di cancellazione:", error);
    listaRichieste = [];
  } else {
    listaRichieste = data || [];
  }
  aggiornaBadgeRichieste();
  renderListaRichieste();
}

function aggiornaBadgeRichieste() {
  const inAttesa = listaRichieste.filter(r => r.stato === "in_attesa").length;
  richiesteBadge.textContent = inAttesa;
  richiesteBadge.classList.toggle("hidden", inAttesa === 0);
}

function renderListaRichieste() {
  if (listaRichieste.length === 0) {
    richiesteLista.innerHTML = '<p class="vuoto">Nessuna richiesta di cancellazione dati.</p>';
    return;
  }

  const STATO_LABEL = {
    accettata: "Accettata — cancellazione in corso",
    rifiutata: "Rifiutata",
    completata: "Completata — dati cancellati definitivamente"
  };

  richiesteLista.innerHTML = listaRichieste.map(r => {
    const data = new Date(r.richiesta_il).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });

    if (r.stato === "in_attesa") {
      return `
        <div class="richiesta-riga">
          <div class="richiesta-riga-info">
            <strong>${escapeHtml(r.paziente_nome_snapshot)}</strong>
            <span class="hint">${escapeHtml(r.paziente_email_snapshot || "")}</span>
            <span class="hint">Richiesta il ${data}</span>
            ${r.messaggio_paziente ? `<span class="hint">Messaggio: ${escapeHtml(r.messaggio_paziente)}</span>` : ""}
          </div>
          <div class="richiesta-riga-azioni">
            <button type="button" class="secondary richiesta-accetta-btn" data-id="${r.id}">Accetta e cancella</button>
            <button type="button" class="danger richiesta-rifiuta-btn" data-id="${r.id}">Rifiuta</button>
          </div>
          <div class="richiesta-rifiuta-blocco hidden" data-id="${r.id}">
            <label>Motivo del rifiuto</label>
            <textarea class="richiesta-motivazione-input" rows="2" placeholder="Spiega perché la richiesta viene rifiutata..."></textarea>
            <button type="button" class="danger richiesta-conferma-rifiuto-btn" data-id="${r.id}">Conferma rifiuto</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="richiesta-riga richiesta-riga-chiusa">
        <div class="richiesta-riga-info">
          <strong>${escapeHtml(r.paziente_nome_snapshot)}</strong>
          <span class="hint">${escapeHtml(r.paziente_email_snapshot || "")}</span>
          <span class="hint">Richiesta il ${data} — ${STATO_LABEL[r.stato] || r.stato}</span>
          ${r.messaggio_paziente ? `<span class="hint">Messaggio: ${escapeHtml(r.messaggio_paziente)}</span>` : ""}
          ${r.motivazione_rifiuto ? `<span class="hint">Motivo: ${escapeHtml(r.motivazione_rifiuto)}</span>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

async function apriRichieste() {
  await caricaRichieste();
  richiesteOverlay.classList.remove("hidden");
}

function chiudiRichieste() {
  richiesteOverlay.classList.add("hidden");
}

async function accettaRichiesta(id) {
  const richiesta = listaRichieste.find(r => r.id === id);
  if (!richiesta) return;
  if (!confirm(`Confermi la cancellazione DEFINITIVA di tutti i dati di ${richiesta.paziente_nome_snapshot}? L'operazione non può essere annullata.`)) return;

  const { data: { user } } = await supabaseClient.auth.getUser();
  const { error: erroreAccetta } = await supabaseClient
    .from("richieste_cancellazione")
    .update({ stato: "accettata", gestita_il: new Date().toISOString(), gestita_da: user ? user.id : null })
    .eq("id", id);

  if (erroreAccetta) {
    alert("Errore nell'aggiornamento della richiesta: " + erroreAccetta.message);
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  try {
    const res = await fetch("/api/elimina-paziente", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ richiestaId: id })
    });
    const dati = await res.json();
    if (!res.ok) throw new Error(dati.error || "Errore nella cancellazione.");
  } catch (e) {
    alert("La richiesta è stata accettata ma la cancellazione automatica non è riuscita: " + e.message + "\nRiprova più tardi o contatta l'assistenza.");
  }

  await caricaRichieste();
}

async function rifiutaRichiesta(id, motivazione) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  const { error } = await supabaseClient
    .from("richieste_cancellazione")
    .update({ stato: "rifiutata", motivazione_rifiuto: motivazione, gestita_il: new Date().toISOString(), gestita_da: user ? user.id : null })
    .eq("id", id);

  if (error) {
    alert("Errore nel rifiuto della richiesta: " + error.message);
    return;
  }
  await caricaRichieste();
}

// ---------- Bacheca task (admin) ----------
// Kanban condiviso tra tutti gli amministratori. Una task collegata a un
// paziente segnato come "non più seguito" (pazienti.attivo = false) non
// compare più sulla bacheca principale in nessuna colonna: è consultabile
// solo dall'Archivio, così la bacheca resta focalizzata sui pazienti attivi
// e la colonna Fatto non cresce all'infinito.

function taskArchiviata(task) {
  return !!(task.paziente_id && task.pazienti && task.pazienti.attivo === false);
}

async function caricaTask() {
  const { data, error } = await supabaseClient
    .from("task_nutrizionista")
    .select("*, pazienti(nome, attivo)")
    .order("creato_il", { ascending: true });

  if (error) {
    console.error("Errore nel caricamento delle task:", error);
    listaTask = [];
  } else {
    listaTask = data || [];
  }
  renderBachecaTask();
}

function renderBachecaTask() {
  ["da_fare", "in_corso", "fatto"].forEach(stato => {
    const attive = listaTask.filter(t => t.stato === stato && !taskArchiviata(t));
    attive.sort((a, b) => {
      if (stato === "fatto") {
        return new Date(b.completato_il || b.creato_il) - new Date(a.completato_il || a.creato_il);
      }
      // Priorità alta sempre in cima, anche se creata dopo; a parità di
      // priorità, la più vecchia resta in cima (ordine di creazione).
      const differenzaPriorita = TASK_PRIORITA_ORDINE[a.priorita] - TASK_PRIORITA_ORDINE[b.priorita];
      return differenzaPriorita !== 0 ? differenzaPriorita : new Date(a.creato_il) - new Date(b.creato_il);
    });

    taskContatoreEl[stato].textContent = attive.length;

    if (stato === "da_fare") {
      ["alta", "media", "bassa"].forEach(priorita => {
        taskContatorePrioritaEl[priorita].textContent = attive.filter(t => t.priorita === priorita).length;
      });
    }

    if (stato === "fatto") {
      const daMostrare = attive.slice(0, TASK_FATTO_LIMITE);
      taskListaEl.fatto.innerHTML = daMostrare.length === 0
        ? '<p class="vuoto">Nessuna task completata.</p>'
        : daMostrare.map(renderTaskCard).join("");
      taskVediTutteBtn.classList.toggle("hidden", attive.length <= TASK_FATTO_LIMITE);
    } else {
      taskListaEl[stato].innerHTML = attive.length === 0
        ? '<p class="vuoto">Nessuna task.</p>'
        : attive.map(renderTaskCard).join("");
    }
  });
}

function renderTaskCard(task) {
  const nomePaziente = task.pazienti ? task.pazienti.nome : null;
  const pulsantiSposta = {
    da_fare: `<button type="button" class="task-sposta-btn" data-id="${task.id}" data-nuovo-stato="in_corso">In corso →</button>`,
    in_corso: `<button type="button" class="task-sposta-btn" data-id="${task.id}" data-nuovo-stato="da_fare">← Da fare</button><button type="button" class="task-sposta-btn" data-id="${task.id}" data-nuovo-stato="fatto">Fatto →</button>`,
    fatto: `<button type="button" class="task-sposta-btn" data-id="${task.id}" data-nuovo-stato="in_corso">← Riapri</button>`
  };

  return `
    <div class="task-card task-priorita-${task.priorita}" draggable="true" data-id="${task.id}">
      <div class="task-card-titolo" data-id="${task.id}">${escapeHtml(task.titolo)}</div>
      ${task.nota ? `<div class="task-card-nota">${escapeHtml(task.nota)}</div>` : ""}
      <div class="task-card-riga">
        ${nomePaziente ? `<span class="task-card-paziente">${escapeHtml(nomePaziente)}</span>` : "<span></span>"}
        <div class="task-card-sposta">${pulsantiSposta[task.stato]}</div>
      </div>
    </div>
  `;
}

async function spostaTask(id, nuovoStato) {
  const task = listaTask.find(t => t.id === id);
  if (!task || task.stato === nuovoStato) return;

  const aggiornamento = { stato: nuovoStato, completato_il: nuovoStato === "fatto" ? new Date().toISOString() : null };

  const { error } = await supabaseClient.from("task_nutrizionista").update(aggiornamento).eq("id", id);
  if (error) {
    alert("Errore nello spostamento della task: " + error.message);
    return;
  }

  task.stato = nuovoStato;
  task.completato_il = aggiornamento.completato_il;
  renderBachecaTask();
}

function inizializzaTaskBoardDragDrop() {
  const colonne = document.getElementById("task-colonne");

  Object.values(taskListaEl).forEach(lista => {
    lista.addEventListener("dragover", (e) => {
      e.preventDefault();
      lista.classList.add("drag-over");
    });
    lista.addEventListener("dragleave", () => {
      lista.classList.remove("drag-over");
    });
    lista.addEventListener("drop", (e) => {
      e.preventDefault();
      lista.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      if (id) spostaTask(id, lista.dataset.stato);
    });
    lista.addEventListener("click", (e) => {
      const spostaBtn = e.target.closest(".task-sposta-btn");
      if (spostaBtn) {
        spostaTask(spostaBtn.dataset.id, spostaBtn.dataset.nuovoStato);
        return;
      }
      const titolo = e.target.closest(".task-card-titolo");
      if (titolo) apriModificaTask(titolo.dataset.id);
    });
  });

  colonne.addEventListener("dragstart", (e) => {
    const card = e.target.closest(".task-card");
    if (!card) return;
    e.dataTransfer.setData("text/plain", card.dataset.id);
    card.classList.add("dragging");
  });
  colonne.addEventListener("dragend", (e) => {
    const card = e.target.closest(".task-card");
    if (card) card.classList.remove("dragging");
  });
}

async function apriTaskBoard() {
  appShell.classList.add("hidden");
  taskBoard.classList.remove("hidden");
  await caricaTask();
}

function chiudiTaskBoard() {
  taskBoard.classList.add("hidden");
  appShell.classList.remove("hidden");
}

function popolaSelectPazienteTask(selezionato) {
  const elenco = listaPazienti.map(p => ({ id: p.id, nome: p.nome + (p.attivo === false ? " (non seguito)" : "") }));
  taskPazienteSelect.setElenco(elenco);
  taskPazienteSelect.value = selezionato || "";
}

function apriNuovaTask() {
  taskInModifica = null;
  taskModalTitolo.textContent = "Nuova task";
  taskTitoloInput.value = "";
  taskNotaInput.value = "";
  taskPrioritaSelect.value = "media";
  popolaSelectPazienteTask("");
  taskModalError.classList.add("hidden");
  taskEliminaBtn.classList.add("hidden");
  taskModalOverlay.classList.remove("hidden");
  taskTitoloInput.focus();
}

function apriModificaTask(id) {
  const task = listaTask.find(t => t.id === id);
  if (!task) return;
  taskInModifica = task;
  taskModalTitolo.textContent = "Modifica task";
  taskTitoloInput.value = task.titolo;
  taskNotaInput.value = task.nota || "";
  taskPrioritaSelect.value = task.priorita;
  popolaSelectPazienteTask(task.paziente_id || "");
  taskModalError.classList.add("hidden");
  taskEliminaBtn.classList.remove("hidden");
  taskVediTutteOverlay.classList.add("hidden");
  taskArchivioOverlay.classList.add("hidden");
  taskModalOverlay.classList.remove("hidden");
}

function chiudiTaskModale() {
  taskModalOverlay.classList.add("hidden");
}

async function salvaTask() {
  const titolo = taskTitoloInput.value.trim();
  if (!titolo) {
    taskModalError.textContent = "Inserisci un titolo.";
    taskModalError.classList.remove("hidden");
    return;
  }

  const corpo = {
    titolo,
    nota: taskNotaInput.value.trim() || null,
    priorita: taskPrioritaSelect.value,
    paziente_id: taskPazienteSelect.value || null
  };

  let error;
  taskSalvaBtn.disabled = true;
  try {
    if (taskInModifica) {
      ({ error } = await supabaseClient.from("task_nutrizionista").update(corpo).eq("id", taskInModifica.id));
    } else {
      corpo.stato = "da_fare";
      ({ error } = await supabaseClient.from("task_nutrizionista").insert(corpo));
    }
  } finally {
    taskSalvaBtn.disabled = false;
  }

  if (error) {
    taskModalError.textContent = "Errore: " + error.message;
    taskModalError.classList.remove("hidden");
    return;
  }

  chiudiTaskModale();
  await caricaTask();
}

async function eliminaTaskCorrente() {
  if (!taskInModifica) return;
  if (!confirm("Eliminare questa task?")) return;

  const { error } = await supabaseClient.from("task_nutrizionista").delete().eq("id", taskInModifica.id);
  if (error) {
    alert("Errore nell'eliminazione: " + error.message);
    return;
  }
  chiudiTaskModale();
  await caricaTask();
}

function renderTaskRigaCompatta(task) {
  const nomePaziente = task.pazienti ? task.pazienti.nome : null;
  const dataRif = (task.stato === "fatto" && task.completato_il ? new Date(task.completato_il) : new Date(task.creato_il))
    .toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `
    <div class="richiesta-riga task-riga-compatta" data-id="${task.id}">
      <div class="richiesta-riga-info">
        <strong>${escapeHtml(task.titolo)}</strong>
        <span class="hint">${TASK_STATO_LABEL[task.stato]} · Priorità ${TASK_PRIORITA_LABEL[task.priorita]}${nomePaziente ? " · " + escapeHtml(nomePaziente) : ""} · ${dataRif}</span>
      </div>
    </div>
  `;
}

function apriVediTutteFatto() {
  const tutte = listaTask
    .filter(t => t.stato === "fatto" && !taskArchiviata(t))
    .sort((a, b) => new Date(b.completato_il || b.creato_il) - new Date(a.completato_il || a.creato_il));

  taskVediTutteLista.innerHTML = tutte.length === 0
    ? '<p class="vuoto">Nessuna task completata.</p>'
    : tutte.map(renderTaskRigaCompatta).join("");

  taskVediTutteOverlay.classList.remove("hidden");
}

function chiudiVediTutteFatto() {
  taskVediTutteOverlay.classList.add("hidden");
}

function apriArchivioTask() {
  const archiviati = listaTask.filter(taskArchiviata);

  if (archiviati.length === 0) {
    taskArchivioLista.innerHTML = '<p class="vuoto">Nessuna task archiviata.</p>';
  } else {
    const gruppi = new Map();
    archiviati.forEach(t => {
      const nome = t.pazienti ? t.pazienti.nome : "—";
      if (!gruppi.has(nome)) gruppi.set(nome, []);
      gruppi.get(nome).push(t);
    });
    taskArchivioLista.innerHTML = Array.from(gruppi.entries()).map(([nome, task]) => `
      <div class="task-archivio-gruppo">
        <h4>${escapeHtml(nome)}</h4>
        ${task.map(renderTaskRigaCompatta).join("")}
      </div>
    `).join("");
  }

  taskArchivioOverlay.classList.remove("hidden");
}

function chiudiArchivioTask() {
  taskArchivioOverlay.classList.add("hidden");
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
  profiloPesoOriginale = data.peso_kg ?? null;
  profiloResetMsg.classList.add("hidden");

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
    note: profiloNoteInput.value.trim() || null,
    attivo: !profiloNonSeguitoCheck.checked
  };

  const { error } = await supabaseClient.from("pazienti").update(aggiornamento).eq("id", pazienteCorrente.id);
  if (error) {
    alert("Errore nel salvataggio del profilo: " + error.message);
    return;
  }

  if (aggiornamento.peso_kg !== null && aggiornamento.peso_kg !== profiloPesoOriginale) {
    const { error: erroreStorico } = await supabaseClient
      .from("storico_peso")
      .insert({ paziente_id: pazienteCorrente.id, peso_kg: aggiornamento.peso_kg });
    if (erroreStorico) {
      console.error("Errore nel salvataggio dello storico peso:", erroreStorico);
    }
  }

  chiudiProfiloPaziente();
}

// Riusa lo stesso meccanismo del recupero password self-service (vedi
// inviaRecuperoPassword): invia un'email con link di reset monouso e a
// scadenza breve, senza bisogno di conoscere la password attuale. Visibile
// solo qui, nel modale profilo lato admin — mai lato paziente.
async function resettaPasswordPaziente() {
  profiloResetMsg.classList.add("hidden");

  const email = profiloEmailInput.value.trim();
  if (!email) {
    profiloResetMsg.textContent = "Il paziente non ha un'email registrata: aggiungila e salva il profilo prima di procedere.";
    profiloResetMsg.classList.remove("hidden");
    return;
  }

  profiloResetPasswordBtn.disabled = true;
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
  profiloResetPasswordBtn.disabled = false;

  if (error) {
    profiloResetMsg.textContent = "Errore nell'invio dell'email: " + error.message;
    profiloResetMsg.classList.remove("hidden");
    return;
  }

  profiloResetMsg.textContent = `Email di reset inviata a ${email}.`;
  profiloResetMsg.classList.remove("hidden");
}

// ---------- Storico diete ----------

async function salvaComeStorico() {
  if (!dietaCorrenteId || !pazienteCorrente) return;
  if (!confirm(`Salvare una copia del piano alimentare attuale nello storico di ${pazienteCorrente.nome}? Il piano alimentare attivo resterà comunque modificabile.`)) return;

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
      <td>${item.mostraPorzione ? `${item.porzione || "porzione"} <em>(${item.grammi} g)</em>` : `${item.grammi} g`}</td>
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
      <span class="giorno-nome"><span class="freccia no-print">${collassato ? "▸" : "▾"}</span> ${giorno}</span>
      <span class="giorno-duplica-slot">${giornoHaAlimenti(giorno) ? `<button class="duplica-giorno-btn no-print" data-giorno="${giorno}" title="Duplica l'intera giornata in altri giorni">Duplica</button>` : ''}</span>
      <span class="solo-nutrizionista giorno-totale">${superato ? '<span class="totale-warning">! ' : ''}Totale: ${formattaTotali(totaleGiorno)}${superato ? '</span>' : ''}</span>
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
            cellaQta = `<td class="ha-porzione"><span class="solo-non-cliente">${item.porzione || "porzione"} <em>(${item.grammi} g)</em></span><span class="solo-cliente">${item.porzione || ""}</span></td>`;
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
        const testo = items.map(i => i.libero ? "Pasto libero" : escapeHtml(i.alimento)).join(", ");
        html += `<div class="pan-cella" data-giorno="${giorno}" data-pasto="${escapeHtml(pasto)}" title="Vedi dettagli"><div class="pan-testo">${testo}</div><div class="pan-kcal">${round1(t.kcal)} kcal</div></div>`;
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

function apriDettaglioPasto(giorno, pasto) {
  const items = state.dieta[giorno][pasto];
  if (!items || items.length === 0) return;

  panoramicaDettaglioTitolo.textContent = `${pasto} — ${giorno}`;

  const righe = items.map(item => {
    let cellaQta;
    if (item.libero) {
      cellaQta = "—";
    } else if (item.mostraPorzione) {
      cellaQta = `${escapeHtml(item.porzione || "porzione")} (${item.grammi} g)`;
    } else {
      cellaQta = `${item.grammi} g`;
    }
    const cellaKcal = item.libero
      ? (item.kcal ? `${item.kcal} kcal (stima)` : "—")
      : `${item.kcal} kcal`;
    return `
      <tr${item.libero ? ' class="riga-libero"' : ''}>
        <td>${escapeHtml(item.alimento)}</td>
        <td>${cellaQta}</td>
        <td>${item.nota ? escapeHtml(item.nota) : "-"}</td>
        <td>${cellaKcal}</td>
        <td>${item.libero ? "—" : `${item.proteine} g`}</td>
        <td>${item.libero ? "—" : `${item.grassi} g`}</td>
        <td>${item.libero ? "—" : `${item.carboidrati} g`}</td>
      </tr>
    `;
  }).join("");

  const totale = totaliPasto(items);

  panoramicaDettaglioContenuto.innerHTML = `
    <table class="pan-dettaglio-tabella">
      <thead>
        <tr>
          <th>Alimento</th><th>Quantità</th><th>Note</th><th>Calorie</th><th>Proteine</th><th>Grassi</th><th>Carboidrati</th>
        </tr>
      </thead>
      <tbody>${righe}</tbody>
      <tfoot>
        <tr class="riga-totale">
          <td colspan="3">Totale</td>
          <td>${round1(totale.kcal)} kcal</td>
          <td>${round1(totale.proteine)} g</td>
          <td>${round1(totale.grassi)} g</td>
          <td>${round1(totale.carboidrati)} g</td>
        </tr>
      </tfoot>
    </table>
  `;

  panoramicaDettaglioOverlay.classList.remove("hidden");
}

function chiudiDettaglioPasto() {
  panoramicaDettaglioOverlay.classList.add("hidden");
}

function toggleOffRicerca() {
  const aperto = offRicercaAdminContenuto.classList.toggle("hidden") === false;
  offRicercaToggleBtn.classList.toggle("attivo", aperto);
  if (aperto) offAdminQueryInput.focus();
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
  if (!confirm("Vuoi davvero svuotare tutto il piano alimentare? L'operazione non è reversibile.")) return;
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
    cellaQta = `<span class="solo-non-cliente">${item.porzione || "porzione"} <em>(${item.grammi} g)</em></span><span class="solo-cliente">${item.porzione || ""}</span>`;
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
  if (giorniConDati.length === 0) return "<p>Il piano alimentare è vuoto.</p>";

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
      <div class="p-giorno" data-giorno="${giorno}">
        <div class="p-giorno-titolo"><span><span class="freccia-giorno no-print">▾</span> ${giorno}</span><span class="solo-nutrizionista">${formattaTotali(totG)}</span></div>
        <div class="p-giorno-corpo">${pastiHtml}</div>
      </div>
    `;
  }).join("");
}

function costruisciContenutoListaSpesa() {
  const lista = calcolaListaSpesa();
  if (lista.length === 0) return "<p>Il piano alimentare è vuoto: nessun alimento da acquistare.</p>";

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
  loginEmailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") effettuaLogin();
  });
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

  pazienteImpostazioniBtn.addEventListener("click", apriPazienteImpostazioni);
  pazienteImpostazioniChiudiBtn.addEventListener("click", chiudiPazienteImpostazioni);
  pazienteImpostazioniOverlay.addEventListener("click", (e) => {
    if (e.target === pazienteImpostazioniOverlay) chiudiPazienteImpostazioni();
  });
  impostazioniResetPasswordBtn.addEventListener("click", () => {
    chiudiPazienteImpostazioni();
    apriPazienteSicurezza();
  });
  impostazioniCancellazioneBtn.addEventListener("click", () => {
    chiudiPazienteImpostazioni();
    apriCancellazione();
  });

  pazienteSicurezzaInviaBtn.addEventListener("click", inviaResetPasswordPazienteProprio);
  pazienteSicurezzaChiudiBtn.addEventListener("click", chiudiPazienteSicurezza);
  pazienteSicurezzaOverlay.addEventListener("click", (e) => {
    if (e.target === pazienteSicurezzaOverlay) chiudiPazienteSicurezza();
  });

  cancellazioneStep1AvantiBtn.addEventListener("click", avantiStep2Cancellazione);
  cancellazioneStep1AnnullaBtn.addEventListener("click", chiudiCancellazione);
  cancellazioneStep2InviaBtn.addEventListener("click", inviaRichiestaCancellazione);
  cancellazionePasswordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") inviaRichiestaCancellazione();
  });
  cancellazioneStep2AnnullaBtn.addEventListener("click", chiudiCancellazione);
  cancellazioneStep3ChiudiBtn.addEventListener("click", chiudiCancellazione);
  cancellazioneOverlay.addEventListener("click", (e) => {
    if (e.target === cancellazioneOverlay) chiudiCancellazione();
  });

  impostaPasswordBtn.addEventListener("click", confermaImpostaPassword);
  nuovaPasswordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confermaImpostaPassword();
  });

  pzTemaChiaroBtn.addEventListener("click", () => impostaTema("chiaro"));
  pzTemaNotteBtn.addEventListener("click", () => impostaTema("notte"));
  pazientePdfBtn.addEventListener("click", generaPdfDieta);
  pazienteSpesaBtn.addEventListener("click", generaPdfSpesa);

  pazienteDietaVista.addEventListener("click", (e) => {
    const titolo = e.target.closest(".p-giorno-titolo");
    if (!titolo) return;
    const giornoEl = titolo.closest(".p-giorno");
    if (giornoEl) toggleGiornoPaziente(giornoEl.dataset.giorno);
  });

  profiloFisiciToggle.addEventListener("click", () => toggleAccordionProfilo(profiloFisiciToggle, profiloFisiciContenuto, "Dati fisici"));
  profiloContattiToggle.addEventListener("click", () => toggleAccordionProfilo(profiloContattiToggle, profiloContattiContenuto, "Contatti"));

  pesoFiltroBtns.forEach(b => {
    b.addEventListener("click", () => aggiornaFiltroPeso(b.dataset.filtro));
  });

  checkinStoricoToggle.addEventListener("click", () => toggleAccordionProfilo(checkinStoricoToggle, checkinStoricoContenuto, "I miei check-in precedenti"));
  checkinInviaBtn.addEventListener("click", inviaCheckin);

  checkinFrequenzaSalvaBtn.addEventListener("click", salvaFrequenzaCheckin);
  document.querySelectorAll("#checkin-admin .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => apriTabCheckin(btn.dataset.tab));
  });

  offRicercaToggleBtn.addEventListener("click", toggleOffRicerca);
  offAdminCercaBtn.addEventListener("click", cercaOFFAdmin);
  offScannerAvviaBtn.addEventListener("click", avviaScannerBarcode);
  offScannerStopBtn.addEventListener("click", fermaScannerBarcode);
  offBarcodeManualeBtn.addEventListener("click", cercaOFFBarcodeManuale);

  const gestisciClickRisultatiOFF = (e) => {
    const foto = e.target.closest(".off-foto-prodotto");
    if (foto) {
      apriFotoProdotto(foto.dataset.full);
      return;
    }
    const suggerimento = e.target.closest(".off-suggestion-item");
    if (suggerimento) {
      selezionaRisultatoOFF(e.currentTarget, parseInt(suggerimento.dataset.index, 10));
      return;
    }
    const tornaBtn = e.target.closest(".off-torna-elenco-btn");
    if (tornaBtn) {
      renderElencoOFF(e.currentTarget);
    }
  };
  offAdminRisultati.addEventListener("click", gestisciClickRisultatiOFF);
  offPazienteRisultati.addEventListener("click", gestisciClickRisultatiOFF);
  offFotoChiudiBtn.addEventListener("click", chiudiFotoProdotto);
  offFotoOverlay.addEventListener("click", (e) => {
    if (e.target === offFotoOverlay) chiudiFotoProdotto();
  });

  notificheAttivaBtn.addEventListener("click", attivaNotifiche);
  notificheRifiutaBtn.addEventListener("click", rifiutaNotifiche);
  notificheOkBtn.addEventListener("click", chiudiRichiestaNotifiche);

  gestioneUtentiBtn.addEventListener("click", apriGestioneUtenti);
  gestioneUtentiChiudiBtn.addEventListener("click", chiudiGestioneUtenti);
  gestioneUtentiOverlay.addEventListener("click", (e) => {
    if (e.target === gestioneUtentiOverlay) chiudiGestioneUtenti();
  });
  document.querySelectorAll("#gestione-utenti-overlay .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => apriTabGestioneUtenti(btn.dataset.tab));
  });
  invitoRuoloSelect.addEventListener("change", aggiornaVisibilitaBloccoPaziente);
  invitoPazienteSelect.addEventListener("change", aggiornaVisibilitaBloccoPaziente);
  invitoInviaBtn.addEventListener("click", inviaInvito);
  aggiornaVisibilitaBloccoPaziente();

  sicurezzaBtn.addEventListener("click", apriSicurezza);
  sicurezzaChiudiBtn.addEventListener("click", chiudiSicurezza);
  sicurezzaOverlay.addEventListener("click", (e) => {
    if (e.target === sicurezzaOverlay) chiudiSicurezza();
  });
  sicurezzaAttivaBtn.addEventListener("click", avviaAttivazione2FA);
  sicurezzaSetupConfermaBtn.addEventListener("click", confermaAttivazione2FA);
  sicurezzaSetupAnnullaBtn.addEventListener("click", annullaAttivazione2FA);
  sicurezzaBackupChiudiBtn.addEventListener("click", chiudiBackupBlocco);
  sicurezzaDisattivaConfermaBtn.addEventListener("click", disattiva2FA);

  verifica2faConfermaBtn.addEventListener("click", confermaVerifica2FA);
  verifica2faCodiceInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confermaVerifica2FA();
  });
  verifica2faBackupLink.addEventListener("click", (e) => {
    e.preventDefault();
    verifica2faBackupBlocco.classList.remove("hidden");
  });
  verifica2faBackupBtn.addEventListener("click", confermaBackupLogin);

  pazienteSearchInput.addEventListener("input", () => aggiornaSuggerimentiPazienti(false));

  // Al click/focus mostra sempre l'elenco completo e seleziona il testo:
  // così si può scorrere tutti i nomi, oppure iniziare a digitare per filtrare.
  const apriElencoPazienti = () => {
    pazienteSearchInput.select();
    aggiornaSuggerimentiPazienti(true);
  };
  pazienteSearchInput.addEventListener("focus", apriElencoPazienti);
  pazienteSearchInput.addEventListener("click", apriElencoPazienti);

  pazienteSearchInput.addEventListener("keydown", (e) => {
    const items = pazienteSuggestions.querySelectorAll(".suggestion-item");
    if (pazienteSuggestions.classList.contains("hidden") || items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      pazienteSuggestionIndex = Math.min(pazienteSuggestionIndex + 1, items.length - 1);
      evidenziaSuggerimentoPaziente();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      pazienteSuggestionIndex = Math.max(pazienteSuggestionIndex - 1, 0);
      evidenziaSuggerimentoPaziente();
    } else if (e.key === "Enter" && pazienteSuggestionIndex >= 0) {
      e.preventDefault();
      const ids = JSON.parse(pazienteSuggestions.dataset.ids || "[]");
      const id = ids[pazienteSuggestionIndex];
      if (id) selezionaPazienteDaRicerca(id);
    } else if (e.key === "Escape") {
      nascondiSuggerimentiPazienti();
    }
  });

  pazienteSuggestions.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".suggestion-item");
    if (!item) return;
    e.preventDefault();
    const ids = JSON.parse(pazienteSuggestions.dataset.ids || "[]");
    const id = ids[parseInt(item.dataset.index, 10)];
    if (id) selezionaPazienteDaRicerca(id);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#paziente-search-input") && !e.target.closest("#paziente-suggestions")) {
      nascondiSuggerimentiPazienti();
    }
  });
  nuovoPazienteConfermaBtn.addEventListener("click", confermaNuovoPaziente);

  agendaBtn.addEventListener("click", apriAgendaModale);
  agendaChiudiBtn.addEventListener("click", chiudiAgendaModale);
  agendaOverlay.addEventListener("click", (e) => {
    if (e.target === agendaOverlay) chiudiAgendaModale();
  });
  agendaNuovoBtn.addEventListener("click", apriNuovoAppuntamento);

  richiesteBtn.addEventListener("click", apriRichieste);
  richiesteChiudiBtn.addEventListener("click", chiudiRichieste);
  richiesteOverlay.addEventListener("click", (e) => {
    if (e.target === richiesteOverlay) chiudiRichieste();
  });
  richiesteLista.addEventListener("click", (e) => {
    const accettaBtn = e.target.closest(".richiesta-accetta-btn");
    if (accettaBtn) {
      accettaRichiesta(accettaBtn.dataset.id);
      return;
    }
    const rifiutaBtn = e.target.closest(".richiesta-rifiuta-btn");
    if (rifiutaBtn) {
      const blocco = richiesteLista.querySelector(`.richiesta-rifiuta-blocco[data-id="${rifiutaBtn.dataset.id}"]`);
      if (blocco) blocco.classList.remove("hidden");
      return;
    }
    const confermaRifiutoBtn = e.target.closest(".richiesta-conferma-rifiuto-btn");
    if (confermaRifiutoBtn) {
      const blocco = confermaRifiutoBtn.closest(".richiesta-rifiuta-blocco");
      const testo = blocco.querySelector(".richiesta-motivazione-input").value.trim();
      if (!testo) {
        alert("Inserisci una motivazione per il rifiuto.");
        return;
      }
      rifiutaRichiesta(confermaRifiutoBtn.dataset.id, testo);
    }
  });

  taskBoardBtn.addEventListener("click", apriTaskBoard);
  taskBoardChiudiBtn.addEventListener("click", chiudiTaskBoard);
  taskNuovaBtn.addEventListener("click", apriNuovaTask);
  taskArchivioBtn.addEventListener("click", apriArchivioTask);
  taskVediTutteBtn.addEventListener("click", apriVediTutteFatto);

  taskSalvaBtn.addEventListener("click", salvaTask);
  taskEliminaBtn.addEventListener("click", eliminaTaskCorrente);
  taskAnnullaBtn.addEventListener("click", chiudiTaskModale);
  taskModalOverlay.addEventListener("click", (e) => {
    if (e.target === taskModalOverlay) chiudiTaskModale();
  });

  taskVediTutteChiudiBtn.addEventListener("click", chiudiVediTutteFatto);
  taskVediTutteOverlay.addEventListener("click", (e) => {
    if (e.target === taskVediTutteOverlay) chiudiVediTutteFatto();
  });
  taskVediTutteLista.addEventListener("click", (e) => {
    const riga = e.target.closest(".task-riga-compatta");
    if (riga) apriModificaTask(riga.dataset.id);
  });

  taskArchivioChiudiBtn.addEventListener("click", chiudiArchivioTask);
  taskArchivioOverlay.addEventListener("click", (e) => {
    if (e.target === taskArchivioOverlay) chiudiArchivioTask();
  });
  taskArchivioLista.addEventListener("click", (e) => {
    const riga = e.target.closest(".task-riga-compatta");
    if (riga) apriModificaTask(riga.dataset.id);
  });

  inizializzaTaskBoardDragDrop();

  agendaListaEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".agenda-modifica-btn");
    if (btn) apriModificaAppuntamento(btn.dataset.id);
  });
  prossimoAppuntamentoAdminContenuto.addEventListener("click", (e) => {
    const btn = e.target.closest(".agenda-modifica-btn");
    if (btn) apriModificaAppuntamento(btn.dataset.id);
  });
  appuntamentoSalvaBtn.addEventListener("click", salvaAppuntamento);
  appuntamentoEliminaBtn.addEventListener("click", eliminaAppuntamentoCorrente);
  appuntamentoAnnullaBtn.addEventListener("click", chiudiAppuntamento);
  appuntamentoOverlay.addEventListener("click", (e) => {
    if (e.target === appuntamentoOverlay) chiudiAppuntamento();
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
  profiloResetPasswordBtn.addEventListener("click", resettaPasswordPaziente);
  profiloAnnullaBtn.addEventListener("click", chiudiProfiloPaziente);
  profiloOverlay.addEventListener("click", (e) => {
    if (e.target === profiloOverlay) chiudiProfiloPaziente();
  });

  salvaStoricoBtn.addEventListener("click", salvaComeStorico);

  anteprimaPazienteBtn.addEventListener("click", apriAnteprimaPaziente);
  anteprimaTornaBtn.addEventListener("click", chiudiAnteprimaPaziente);

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
  panoramicaGriglia.addEventListener("click", (e) => {
    const cella = e.target.closest(".pan-cella:not(.pan-vuota):not(.pan-tot)");
    if (cella) apriDettaglioPasto(cella.dataset.giorno, cella.dataset.pasto);
  });
  panoramicaDettaglioChiudiBtn.addEventListener("click", chiudiDettaglioPasto);
  panoramicaDettaglioOverlay.addEventListener("click", (e) => {
    if (e.target === panoramicaDettaglioOverlay) chiudiDettaglioPasto();
  });
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

  inizializzaSidebarSezioni();
  inizializzaAuth();
}

// ---------- Sidebar di navigazione rapida tra le sezioni (vista amministratore) ----------

function apriSidebarSezioni() {
  sezioniSidebar.classList.add("aperta");
  sezioniOverlay.classList.remove("hidden");
}

function chiudiSidebarSezioni() {
  sezioniSidebar.classList.remove("aperta");
  sezioniOverlay.classList.add("hidden");
}

function inizializzaSidebarSezioni() {
  sezioniToggleBtn.addEventListener("click", () => {
    if (sezioniSidebar.classList.contains("aperta")) {
      chiudiSidebarSezioni();
    } else {
      apriSidebarSezioni();
    }
  });
  sezioniOverlay.addEventListener("click", chiudiSidebarSezioni);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // Chiude con Esc il modale aperto in cima (l'ultimo nel DOM). Riusa il
    // gestore di click sullo sfondo già presente su ogni modale descartabile:
    // i modali non descartabili (login, 2FA, imposta password) non hanno quel
    // gestore, quindi un click sintetico non ha effetto e restano aperti.
    const overlaysAperti = document.querySelectorAll(".duplica-overlay:not(.hidden)");
    if (overlaysAperti.length > 0) {
      overlaysAperti[overlaysAperti.length - 1].click();
      return;
    }
    chiudiSidebarSezioni();
  });
  sezioniLink.forEach(link => {
    link.addEventListener("click", (e) => {
      if (link.classList.contains("non-disponibile")) {
        e.preventDefault();
        return;
      }
      chiudiSidebarSezioni();
    });
  });

  // Evidenzia nella sidebar la sezione attualmente visibile durante lo scroll.
  const sezioniOsservate = Array.from(sezioniLink)
    .map(link => document.getElementById(link.dataset.target))
    .filter(Boolean);

  if ("IntersectionObserver" in window && sezioniOsservate.length > 0) {
    const osservatore = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const link = document.querySelector(`.sezioni-link[data-target="${entry.target.id}"]`);
        if (link) link.classList.toggle("attiva", entry.isIntersecting);
      });
    }, { rootMargin: "-40% 0px -50% 0px" });

    sezioniOsservate.forEach(sezione => osservatore.observe(sezione));
  }
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
