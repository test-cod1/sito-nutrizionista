const GIORNI = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const PASTI = ["Colazione", "Spuntino mattina", "Pranzo", "Merenda", "Cena"];
const STORAGE_KEY = "dieta-nutrizionista-state";

let baseAlimenti = [];
let foodMap = new Map();
let foodNames = [];
let currentCalc = null;
let suggestionIndex = -1;
let draftPasto = [];
let collapsedGiorni = new Set();

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

let state = {
  paziente: "",
  maxKcal: null,
  dieta: creaDietaVuota(),
  customFoods: []
};

function salvaState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function caricaState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const salvato = JSON.parse(raw);
    if (salvato && salvato.dieta) {
      state = salvato;
      if (!Array.isArray(state.customFoods)) state.customFoods = [];
    }
  } catch (e) {
    console.warn("Impossibile leggere lo stato salvato:", e);
  }
}

// Elementi DOM
const foodInput = document.getElementById("food-input");
const suggestions = document.getElementById("suggestions");
const foodError = document.getElementById("food-error");
const gramsInput = document.getElementById("grams-input");
const notaInput = document.getElementById("nota-input");
const preview = document.getElementById("preview");
const previewKcal = document.getElementById("preview-kcal");
const previewProt = document.getElementById("preview-prot");
const previewFat = document.getElementById("preview-fat");
const previewCarb = document.getElementById("preview-carb");
const addDraftBtn = document.getElementById("add-draft-btn");

const draftContainer = document.getElementById("draft-container");
const giornoSelect = document.getElementById("giorno-select");
const pastoSelect = document.getElementById("pasto-select");
const confermaPastoBtn = document.getElementById("conferma-pasto-btn");
const svuotaPastoBtn = document.getElementById("svuota-pasto-btn");

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

const pazienteInput = document.getElementById("paziente-input");
const maxKcalInput = document.getElementById("max-kcal-input");
const dietaContainer = document.getElementById("dieta-container");
const pdfDietaBtn = document.getElementById("pdf-dieta-btn");
const pdfSpesaBtn = document.getElementById("pdf-spesa-btn");
const pdfNutrizionistaBtn = document.getElementById("pdf-nutrizionista-btn");
const resetBtn = document.getElementById("reset-btn");
const printTitle = document.getElementById("print-title");
const printPaziente = document.getElementById("print-paziente");
const printDate = document.getElementById("print-date");
const listaSpesaPrint = document.getElementById("lista-spesa-print");

function round1(n) {
  return Math.round(n * 10) / 10;
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
  state.customFoods.forEach(a => foodMap.set(a.nome, normalizzaValoriAlimento(a)));
  foodNames = Array.from(foodMap.keys()).sort((a, b) => a.localeCompare(b, "it"));
}

async function caricaAlimenti() {
  const risposta = await fetch("foods.json");
  baseAlimenti = await risposta.json();
  ricostruisciElencoAlimenti();
  aggiornaSuggerimenti();
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

function salvaNuovoAlimento() {
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

  state.customFoods = state.customFoods.filter(a => a.nome !== nome);
  state.customFoods.push(nuovoAlimento);
  salvaState();
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
  const customNames = new Set(state.customFoods.map(a => a.nome));
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
  draftPasto.push({ ...currentCalc, nota: notaInput.value.trim() });

  foodInput.value = "";
  gramsInput.value = "";
  notaInput.value = "";
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

function renderDraft() {
  confermaPastoBtn.disabled = draftPasto.length === 0;

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
      <td>${item.grammi} g</td>
      <td>${item.nota || "-"}</td>
      <td>${item.kcal} kcal</td>
      <td>${item.proteine} g</td>
      <td>${item.grassi} g</td>
      <td>${item.carboidrati} g</td>
      <td><button class="remove-btn" data-draft-index="${index}" title="Rimuovi">✕</button></td>
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

function confermaPasto() {
  if (draftPasto.length === 0) return;
  const giorno = giornoSelect.value;
  const pasto = pastoSelect.value;

  draftPasto.forEach(item => state.dieta[giorno][pasto].push({ ...item }));
  draftPasto = [];
  salvaState();
  renderDraft();
  renderDieta();

  if (controllaLimite(giorno)) {
    alert(`Attenzione: il totale calorico di ${giorno} supera il limite massimo giornaliero impostato.`);
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
      <span><span class="freccia no-print">${collassato ? "▸" : "▾"}</span> ${giorno}</span>
      <span class="solo-nutrizionista">${superato ? '<span class="totale-warning">⚠ ' : ''}Totale: ${formattaTotali(totaleGiorno)}${superato ? '</span>' : ''}</span>
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
        pastoDiv.innerHTML = `<h4>🍴 ${pasto}</h4><p class="vuoto">Nessun alimento inserito.</p>`;
      } else {
        const totalePasto = totaliPasto(items);
        let righe = items.map((item, index) => `
          <tr>
            <td>${item.alimento}</td>
            <td>${item.grammi} g</td>
            <td>${item.nota || "-"}</td>
            <td class="solo-nutrizionista">${item.kcal} kcal</td>
            <td class="solo-nutrizionista">${item.proteine} g</td>
            <td class="solo-nutrizionista">${item.grassi} g</td>
            <td class="solo-nutrizionista">${item.carboidrati} g</td>
            <td class="no-print"><button class="remove-btn" data-giorno="${giorno}" data-pasto="${pasto}" data-index="${index}" title="Rimuovi">✕</button></td>
          </tr>
        `).join("");

        pastoDiv.innerHTML = `
          <h4>🍴 ${pasto} <span class="solo-nutrizionista">— ${formattaTotali(totalePasto)}</span></h4>
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
}

function rimuoviElemento(giorno, pasto, index) {
  state.dieta[giorno][pasto].splice(index, 1);
  salvaState();
  renderDieta();
}

function svuotaDieta() {
  if (!confirm("Vuoi davvero svuotare tutta la dieta? L'operazione non è reversibile.")) return;
  state.dieta = creaDietaVuota();
  salvaState();
  renderDieta();
}

// ---------- Lista della spesa ----------

function calcolaListaSpesa() {
  const totali = new Map();
  GIORNI.forEach(giorno => {
    PASTI.forEach(pasto => {
      state.dieta[giorno][pasto].forEach(item => {
        totali.set(item.alimento, (totali.get(item.alimento) || 0) + item.grammi);
      });
    });
  });
  return Array.from(totali.entries())
    .map(([nome, grammi]) => ({ nome, grammi: Math.round(grammi) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "it"));
}

function renderListaSpesa() {
  const lista = calcolaListaSpesa();

  if (lista.length === 0) {
    listaSpesaPrint.innerHTML = '<p class="vuoto">La dieta è vuota: nessun alimento da acquistare.</p>';
    return;
  }

  const righe = lista.map(voce => `
    <tr><td>${voce.nome}</td><td>${voce.grammi} g</td></tr>
  `).join("");

  listaSpesaPrint.innerHTML = `
    <table>
      <thead><tr><th>Alimento</th><th>Quantità totale settimanale</th></tr></thead>
      <tbody>${righe}</tbody>
    </table>
  `;
}

// ---------- Generazione PDF (stampa) ----------

function impostaIntestazionePdf(titolo) {
  printTitle.textContent = titolo;
  printPaziente.textContent = state.paziente || pazienteInput.value || "-";
  printDate.textContent = new Date().toLocaleDateString("it-IT");
}

function impostaModalitaStampa(modalita) {
  document.body.classList.remove("stampa-dieta", "stampa-nutrizionista", "stampa-spesa");
  document.body.classList.add(modalita);
}

function generaPdfDieta() {
  impostaModalitaStampa("stampa-dieta");
  impostaIntestazionePdf("🥗 Piano alimentare");
  window.print();
}

function generaPdfNutrizionista() {
  impostaModalitaStampa("stampa-nutrizionista");
  impostaIntestazionePdf("📊 Piano alimentare — Scheda nutrizionista");
  window.print();
}

function generaPdfSpesa() {
  renderListaSpesa();
  impostaModalitaStampa("stampa-spesa");
  impostaIntestazionePdf("🛒 Lista della spesa settimanale");
  window.print();
}

// ---------- Inizializzazione ----------

function inizializza() {
  caricaState();

  pazienteInput.value = state.paziente || "";
  maxKcalInput.value = state.maxKcal || "";

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

  draftContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-btn")) {
      rimuoviDaDraft(parseInt(e.target.dataset.draftIndex, 10));
    }
  });

  confermaPastoBtn.addEventListener("click", confermaPasto);
  svuotaPastoBtn.addEventListener("click", svuotaDraft);

  nuovoAlimentoBtn.addEventListener("click", () => {
    if (nuovoAlimentoForm.classList.contains("hidden")) apriFormNuovoAlimento();
    else chiudiFormNuovoAlimento();
  });
  annullaAlimentoBtn.addEventListener("click", chiudiFormNuovoAlimento);
  salvaAlimentoBtn.addEventListener("click", salvaNuovoAlimento);

  pazienteInput.addEventListener("input", () => {
    state.paziente = pazienteInput.value;
    salvaState();
  });

  maxKcalInput.addEventListener("input", () => {
    state.maxKcal = maxKcalInput.value;
    salvaState();
    renderDieta();
  });

  dietaContainer.addEventListener("click", (e) => {
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

  pdfDietaBtn.addEventListener("click", generaPdfDieta);
  pdfSpesaBtn.addEventListener("click", generaPdfSpesa);
  pdfNutrizionistaBtn.addEventListener("click", generaPdfNutrizionista);
  resetBtn.addEventListener("click", svuotaDieta);

  window.addEventListener("afterprint", () => {
    document.body.classList.remove("stampa-dieta", "stampa-nutrizionista", "stampa-spesa");
  });

  renderDraft();
  renderDieta();
  caricaAlimenti();
}

document.addEventListener("DOMContentLoaded", inizializza);
