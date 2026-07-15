const GIORNI = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const PASTI = ["Colazione", "Spuntino mattina", "Pranzo", "Merenda", "Cena"];
const STORAGE_KEY = "dieta-nutrizionista-state";

let foodMap = new Map();
let foodNames = [];
let currentCalc = null;
let suggestionIndex = -1;

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
  dieta: creaDietaVuota()
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
const preview = document.getElementById("preview");
const previewKcal = document.getElementById("preview-kcal");
const previewProt = document.getElementById("preview-prot");
const previewFat = document.getElementById("preview-fat");
const previewCarb = document.getElementById("preview-carb");
const giornoSelect = document.getElementById("giorno-select");
const pastoSelect = document.getElementById("pasto-select");
const addBtn = document.getElementById("add-btn");
const pazienteInput = document.getElementById("paziente-input");
const maxKcalInput = document.getElementById("max-kcal-input");
const dietaContainer = document.getElementById("dieta-container");
const pdfBtn = document.getElementById("pdf-btn");
const resetBtn = document.getElementById("reset-btn");
const printPaziente = document.getElementById("print-paziente");
const printDate = document.getElementById("print-date");

function round1(n) {
  return Math.round(n * 10) / 10;
}

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
    addBtn.disabled = true;
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
  addBtn.disabled = false;
}

function totaleGiornoKcal(giorno) {
  return PASTI.reduce((somma, pasto) => {
    return somma + state.dieta[giorno][pasto].reduce((s, item) => s + item.kcal, 0);
  }, 0);
}

function controllaLimite(giorno) {
  const max = parseFloat(state.maxKcal);
  if (!max || max <= 0) return false;
  return totaleGiornoKcal(giorno) > max;
}

function renderDieta() {
  dietaContainer.innerHTML = "";

  GIORNI.forEach(giorno => {
    const totaleGiorno = totaleGiornoKcal(giorno);
    const superato = controllaLimite(giorno);

    const blocco = document.createElement("div");
    blocco.className = "giorno-block";

    const titolo = document.createElement("div");
    titolo.className = "giorno-titolo";
    titolo.innerHTML = `<span>${giorno}</span><span class="no-print">${superato ? '<span class="totale-warning">⚠ ' : ''}Totale: ${round1(totaleGiorno)} kcal${superato ? '</span>' : ''}</span>`;
    blocco.appendChild(titolo);

    if (superato) {
      const max = parseFloat(state.maxKcal);
      const banner = document.createElement("div");
      banner.className = "alert-banner no-print";
      banner.textContent = `Attenzione: ${giorno} supera il limite di ${max} kcal impostato (${round1(totaleGiorno)} kcal totali).`;
      blocco.appendChild(banner);
    }

    PASTI.forEach(pasto => {
      const items = state.dieta[giorno][pasto];
      const pastoDiv = document.createElement("div");
      pastoDiv.className = "pasto-blocco";

      if (items.length === 0) {
        pastoDiv.innerHTML = `<h4>🍴 ${pasto}</h4><p class="vuoto">Nessun alimento inserito.</p>`;
      } else {
        const subtotaleKcal = round1(items.reduce((s, i) => s + i.kcal, 0));
        let righe = items.map((item, index) => `
          <tr>
            <td>${item.alimento}</td>
            <td>${item.grammi} g</td>
            <td class="no-print">${item.kcal} kcal</td>
            <td class="no-print">${item.proteine} g</td>
            <td class="no-print">${item.grassi} g</td>
            <td class="no-print">${item.carboidrati} g</td>
            <td class="no-print"><button class="remove-btn" data-giorno="${giorno}" data-pasto="${pasto}" data-index="${index}" title="Rimuovi">✕</button></td>
          </tr>
        `).join("");

        pastoDiv.innerHTML = `
          <h4>🍴 ${pasto} <span class="no-print">— ${subtotaleKcal} kcal</span></h4>
          <table>
            <thead>
              <tr>
                <th>Alimento</th><th>Quantità</th><th class="no-print">Calorie</th><th class="no-print">Proteine</th><th class="no-print">Grassi</th><th class="no-print">Carboidrati</th><th class="no-print"></th>
              </tr>
            </thead>
            <tbody>${righe}</tbody>
          </table>
        `;
      }

      blocco.appendChild(pastoDiv);
    });

    dietaContainer.appendChild(blocco);
  });
}

function aggiungiAllaDieta() {
  if (!currentCalc) return;
  const giorno = giornoSelect.value;
  const pasto = pastoSelect.value;

  state.dieta[giorno][pasto].push({ ...currentCalc });
  salvaState();
  renderDieta();

  if (controllaLimite(giorno)) {
    alert(`Attenzione: il totale calorico di ${giorno} supera il limite massimo giornaliero impostato.`);
  }

  foodInput.value = "";
  gramsInput.value = "";
  aggiornaPreview();
  foodInput.focus();
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

function generaPdf() {
  printPaziente.textContent = state.paziente || pazienteInput.value || "-";
  printDate.textContent = new Date().toLocaleDateString("it-IT");
  window.print();
}

async function caricaAlimenti() {
  const risposta = await fetch("foods.json");
  const alimenti = await risposta.json();
  alimenti.forEach(a => foodMap.set(a.nome, a));
  foodNames = alimenti.map(a => a.nome).sort((a, b) => a.localeCompare(b, "it"));
}

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
  suggestions.innerHTML = elenco
    .map((nome, i) => `<div class="suggestion-item" data-index="${i}">${nome}</div>`)
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

  addBtn.addEventListener("click", aggiungiAllaDieta);

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
    if (e.target.classList.contains("remove-btn")) {
      const { giorno, pasto, index } = e.target.dataset;
      rimuoviElemento(giorno, pasto, parseInt(index, 10));
    }
  });

  pdfBtn.addEventListener("click", generaPdf);
  resetBtn.addEventListener("click", svuotaDieta);

  renderDieta();
  caricaAlimenti();
}

document.addEventListener("DOMContentLoaded", inizializza);
