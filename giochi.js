// Giochi didattici (alimentazione e fake news). Pagina standalone: nessun dato
// viene salvato, i punteggi esistono solo per la sessione corrente del browser.

function escapeHtml(testo) {
  return String(testo).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function mescolaArray(originale) {
  const copia = [...originale];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// ---------- Navigazione hub ----------

const giochiHub = document.getElementById("giochi-hub");
const giochiPanello = document.getElementById("giochi-panello");
const giochiIndietroBtn = document.getElementById("giochi-indietro-btn");

function apriGioco(nome) {
  giochiHub.classList.add("hidden");
  giochiPanello.classList.remove("hidden");
  document.querySelectorAll(".giochi-tab").forEach(tab => tab.classList.toggle("hidden", tab.id !== `giochi-${nome}-tab`));
}

function tornaHub() {
  giochiPanello.classList.add("hidden");
  giochiHub.classList.remove("hidden");
}

document.querySelectorAll("[data-apri]").forEach(card => {
  card.addEventListener("click", () => apriGioco(card.dataset.apri));
});
giochiIndietroBtn.addEventListener("click", tornaHub);

// ---------- Quiz vero o falso su fake news alimentari ----------

const GIOCHI_QUIZ_DOMANDE = [
  { testo: "Mangiare più verdura e frutta ogni giorno aiuta a raggiungere il senso di sazietà con meno calorie.", risposta: true, spiegazione: "Verdura e frutta hanno un alto contenuto di acqua e fibre: aumentano il volume del pasto e la sazietà a parità di calorie assunte." },
  { testo: "Il pane integrale ha sempre molte meno calorie del pane bianco.", risposta: false, spiegazione: "A parità di peso le calorie sono simili: l'integrale ha più fibre (e quindi sazia di più e ha un impatto diverso sulla glicemia), ma non è automaticamente 'meno calorico'." },
  { testo: "Saltare i pasti è un buon modo per dimagrire più in fretta.", risposta: false, spiegazione: "Saltare i pasti spesso porta a maggiore fame nei pasti successivi e scelte alimentari peggiori: conta l'equilibrio complessivo della giornata, non l'eliminazione di un pasto." },
  { testo: "Bere a sufficienza durante il giorno aiuta a distinguere meglio la sete dalla fame.", risposta: true, spiegazione: "La sete viene talvolta percepita come fame: mantenersi idratati aiuta a riconoscere i reali segnali di fame." },
  { testo: "I prodotti 'senza glutine' sono automaticamente più sani o meno calorici, anche per chi non è celiaco.", risposta: false, spiegazione: "Sono formulati per chi non tollera il glutine, ma spesso non sono meno calorici: a volte contengono più grassi o zuccheri per compensare la consistenza." },
  { testo: "Esistono alimenti o bevande 'brucia grassi' che fanno dimagrire da soli.", risposta: false, spiegazione: "Nessun alimento fa dimagrire da solo: il dimagrimento dipende dal bilancio energetico complessivo tra calorie assunte e consumate." },
  { testo: "Leggere le etichette nutrizionali aiuta a confrontare due prodotti simili e scegliere quello più adatto.", risposta: true, spiegazione: "Le etichette permettono di confrontare in modo oggettivo calorie, zuccheri, grassi e sale tra prodotti simili." },
  { testo: "Le diete 'detox' a base di soli succhi eliminano le tossine dal corpo meglio di fegato e reni.", risposta: false, spiegazione: "Fegato e reni svolgono già naturalmente questa funzione: non ci sono prove scientifiche che succhi o tisane 'detox' abbiano un effetto aggiuntivo." },
  { testo: "Le proteine si trovano non solo nella carne, ma anche in legumi, uova, pesce e latticini.", risposta: true, spiegazione: "Le fonti proteiche sono molte e diverse: anche chi mangia poca carne può coprire il proprio fabbisogno proteico con altri alimenti." },
  { testo: "Mangiare dopo le 20:00 fa ingrassare indipendentemente da quante calorie assumi in totale nella giornata.", risposta: false, spiegazione: "Conta soprattutto il totale calorico e la qualità della dieta nell'arco della giornata, non l'orario preciso in cui si mangia." },
  { testo: "Il sale rosa dell'Himalaya o il sale integrale contengono molto meno sodio del sale da cucina comune.", risposta: false, spiegazione: "Il contenuto di sodio è praticamente lo stesso: cambia solo la presenza in tracce di altri minerali." },
  { testo: "Un'etichetta 'senza zuccheri aggiunti' può comunque contenere molte calorie o grassi.", risposta: true, spiegazione: "'Senza zuccheri aggiunti' non significa 'povero di calorie': il prodotto può comunque essere ricco di grassi o zuccheri naturalmente presenti." },
];

const giochiQuizContenuto = document.getElementById("giochi-quiz-contenuto");
let giochiQuizOrdine = [];
let giochiQuizIndice = 0;
let giochiQuizPunteggio = 0;
let giochiQuizRisposto = false;

function renderGiochiQuiz() {
  if (giochiQuizIndice >= giochiQuizOrdine.length) {
    giochiQuizContenuto.innerHTML = `
      <p class="giochi-risultato">🏁 Hai risposto a tutte le domande!<br>Punteggio: <strong>${giochiQuizPunteggio} / ${giochiQuizOrdine.length}</strong></p>
      <button type="button" class="giochi-rigioca-btn" data-azione="quiz-ricomincia">Rigioca</button>
    `;
    return;
  }
  const domanda = GIOCHI_QUIZ_DOMANDE[giochiQuizOrdine[giochiQuizIndice]];
  giochiQuizContenuto.innerHTML = `
    <p class="hint">Domanda ${giochiQuizIndice + 1} di ${giochiQuizOrdine.length} — Punteggio: ${giochiQuizPunteggio}</p>
    <p class="giochi-quiz-affermazione">${escapeHtml(domanda.testo)}</p>
    <div class="giochi-quiz-bottoni">
      <button type="button" data-azione="quiz-rispondi" data-valore="true">✅ Vero</button>
      <button type="button" data-azione="quiz-rispondi" data-valore="false">❌ Falso</button>
    </div>
    <div id="giochi-quiz-feedback"></div>
  `;
}

function rispondiQuiz(valoreScelto) {
  if (giochiQuizRisposto) return;
  giochiQuizRisposto = true;
  const domanda = GIOCHI_QUIZ_DOMANDE[giochiQuizOrdine[giochiQuizIndice]];
  const corretto = valoreScelto === domanda.risposta;
  if (corretto) giochiQuizPunteggio++;
  giochiQuizContenuto.querySelectorAll('[data-azione="quiz-rispondi"]').forEach(b => b.disabled = true);
  const feedback = document.getElementById("giochi-quiz-feedback");
  feedback.innerHTML = `
    <p class="${corretto ? "giochi-corretto" : "giochi-sbagliato"}">${corretto ? "✅ Esatto!" : `❌ Sbagliato — la risposta corretta è "${domanda.risposta ? "Vero" : "Falso"}".`}</p>
    <p class="hint">${escapeHtml(domanda.spiegazione)}</p>
    <button type="button" class="giochi-prossimo-btn" data-azione="quiz-avanti">Prossima domanda →</button>
  `;
}

giochiQuizContenuto.addEventListener("click", (e) => {
  const bottone = e.target.closest("button[data-azione]");
  if (!bottone) return;
  if (bottone.dataset.azione === "quiz-rispondi") {
    rispondiQuiz(bottone.dataset.valore === "true");
  } else if (bottone.dataset.azione === "quiz-avanti") {
    giochiQuizIndice++;
    giochiQuizRisposto = false;
    renderGiochiQuiz();
  } else if (bottone.dataset.azione === "quiz-ricomincia") {
    giochiQuizOrdine = mescolaArray(GIOCHI_QUIZ_DOMANDE.map((_, i) => i));
    giochiQuizIndice = 0;
    giochiQuizPunteggio = 0;
    giochiQuizRisposto = false;
    renderGiochiQuiz();
  }
});

// ---------- Abbina alimento-categoria ----------

const GIOCHI_CATEGORIE = [
  { id: "proteine", label: "Proteine" },
  { id: "carboidrati", label: "Carboidrati" },
  { id: "verdura-frutta", label: "Verdura e frutta" },
  { id: "grassi", label: "Grassi buoni" },
  { id: "zuccheri", label: "Dolci e zuccheri" },
];

const GIOCHI_ABBINA_ALIMENTI = [
  { nome: "Petto di pollo", categoria: "proteine" },
  { nome: "Uova", categoria: "proteine" },
  { nome: "Lenticchie", categoria: "proteine" },
  { nome: "Pasta", categoria: "carboidrati" },
  { nome: "Pane", categoria: "carboidrati" },
  { nome: "Riso", categoria: "carboidrati" },
  { nome: "Broccoli", categoria: "verdura-frutta" },
  { nome: "Mela", categoria: "verdura-frutta" },
  { nome: "Insalata", categoria: "verdura-frutta" },
  { nome: "Olio extravergine d'oliva", categoria: "grassi" },
  { nome: "Noci", categoria: "grassi" },
  { nome: "Avocado", categoria: "grassi" },
  { nome: "Merendina confezionata", categoria: "zuccheri" },
  { nome: "Bibita zuccherata", categoria: "zuccheri" },
  { nome: "Caramelle", categoria: "zuccheri" },
];

const giochiAbbinaContenuto = document.getElementById("giochi-abbina-contenuto");
let giochiAbbinaAssegnazioni = {};
let giochiAbbinaSelezionato = null;
let giochiAbbinaVerificato = false;

function renderGiochiAbbina() {
  const assegnati = new Set(Object.keys(giochiAbbinaAssegnazioni));
  const nonAssegnati = GIOCHI_ABBINA_ALIMENTI.filter(a => !assegnati.has(a.nome));

  const poolHtml = nonAssegnati.length
    ? nonAssegnati.map(a => `
        <button type="button" class="giochi-chip ${giochiAbbinaSelezionato === a.nome ? "selezionato" : ""}" data-azione="abbina-seleziona" data-nome="${escapeHtml(a.nome)}" ${giochiAbbinaVerificato ? "disabled" : ""}>${escapeHtml(a.nome)}</button>
      `).join("")
    : `<span class="hint">Tutti gli alimenti sono stati assegnati.</span>`;

  const categorieHtml = GIOCHI_CATEGORIE.map(cat => {
    const alimentiCategoria = GIOCHI_ABBINA_ALIMENTI.filter(a => giochiAbbinaAssegnazioni[a.nome] === cat.id);
    const chips = alimentiCategoria.map(a => {
      const classeExtra = giochiAbbinaVerificato ? (a.categoria === cat.id ? "corretto" : "sbagliato") : "";
      return `<button type="button" class="giochi-chip ${classeExtra}" data-azione="abbina-rimuovi" data-nome="${escapeHtml(a.nome)}" ${giochiAbbinaVerificato ? "disabled" : ""}>${escapeHtml(a.nome)}</button>`;
    }).join("");
    return `
      <div class="giochi-categoria-box" data-azione="abbina-categoria" data-categoria="${cat.id}">
        <h4>${escapeHtml(cat.label)}</h4>
        <div class="giochi-categoria-chips">${chips || '<span class="hint">Nessun alimento qui</span>'}</div>
      </div>`;
  }).join("");

  let punteggioHtml = "";
  if (giochiAbbinaVerificato) {
    const corretti = GIOCHI_ABBINA_ALIMENTI.filter(a => giochiAbbinaAssegnazioni[a.nome] === a.categoria).length;
    punteggioHtml = `<p class="giochi-risultato">Punteggio: <strong>${corretti} / ${GIOCHI_ABBINA_ALIMENTI.length}</strong></p>`;
  }

  giochiAbbinaContenuto.innerHTML = `
    <p class="hint">Tocca un alimento, poi tocca la categoria giusta per abbinarlo. Quando hai assegnato tutti gli alimenti, verifica le risposte.</p>
    <div class="giochi-abbina-pool">${poolHtml}</div>
    <div class="giochi-categorie-griglia">${categorieHtml}</div>
    ${punteggioHtml}
    <div>
      ${!giochiAbbinaVerificato
        ? `<button type="button" class="giochi-verifica-btn" data-azione="abbina-verifica" ${nonAssegnati.length ? "disabled" : ""}>Verifica abbinamenti</button>`
        : `<button type="button" class="giochi-rigioca-btn" data-azione="abbina-ricomincia">Rigioca</button>`}
    </div>
  `;
}

giochiAbbinaContenuto.addEventListener("click", (e) => {
  if (giochiAbbinaVerificato) {
    if (e.target.closest('[data-azione="abbina-ricomincia"]')) {
      giochiAbbinaAssegnazioni = {};
      giochiAbbinaSelezionato = null;
      giochiAbbinaVerificato = false;
      renderGiochiAbbina();
    }
    return;
  }
  const chipSeleziona = e.target.closest('[data-azione="abbina-seleziona"]');
  if (chipSeleziona) {
    const nome = chipSeleziona.dataset.nome;
    giochiAbbinaSelezionato = giochiAbbinaSelezionato === nome ? null : nome;
    renderGiochiAbbina();
    return;
  }
  const chipRimuovi = e.target.closest('[data-azione="abbina-rimuovi"]');
  if (chipRimuovi) {
    delete giochiAbbinaAssegnazioni[chipRimuovi.dataset.nome];
    renderGiochiAbbina();
    return;
  }
  const categoriaBox = e.target.closest('[data-azione="abbina-categoria"]');
  if (categoriaBox && giochiAbbinaSelezionato) {
    giochiAbbinaAssegnazioni[giochiAbbinaSelezionato] = categoriaBox.dataset.categoria;
    giochiAbbinaSelezionato = null;
    renderGiochiAbbina();
    return;
  }
  if (e.target.closest('[data-azione="abbina-verifica"]')) {
    giochiAbbinaVerificato = true;
    renderGiochiAbbina();
  }
});

// ---------- Componi il pasto ----------

const GIOCHI_PASTO_OPZIONI = [
  { nome: "Petto di pollo alla griglia", categoria: "proteine" },
  { nome: "Salmone al forno", categoria: "proteine" },
  { nome: "Riso integrale", categoria: "carboidrati" },
  { nome: "Pane integrale", categoria: "carboidrati" },
  { nome: "Insalata mista", categoria: "verdura" },
  { nome: "Verdure grigliate", categoria: "verdura" },
  { nome: "Olio extravergine d'oliva (1 cucchiaio)", categoria: "grassi" },
  { nome: "Frutta fresca di stagione", categoria: "frutta" },
  { nome: "Patatine fritte", categoria: "junk" },
  { nome: "Bibita zuccherata", categoria: "junk" },
  { nome: "Merendina confezionata", categoria: "junk" },
  { nome: "Maionese abbondante", categoria: "junk" },
];

const giochiPastoContenuto = document.getElementById("giochi-pasto-contenuto");
let giochiPastoSelezionati = new Set();
let giochiPastoVerificato = false;

function valutaPasto(selezionati) {
  const haProteine = selezionati.some(o => o.categoria === "proteine");
  const haCarboidrati = selezionati.some(o => o.categoria === "carboidrati");
  const haVerduraFrutta = selezionati.some(o => o.categoria === "verdura" || o.categoria === "frutta");
  const junk = selezionati.filter(o => o.categoria === "junk");

  const messaggi = [];
  messaggi.push(haProteine ? "✅ Hai incluso una fonte di proteine." : "⚠️ Manca una fonte di proteine (es. carne, pesce, uova, legumi).");
  messaggi.push(haCarboidrati ? "✅ Hai incluso una fonte di carboidrati." : "⚠️ Manca una fonte di carboidrati (es. pane, pasta, riso).");
  messaggi.push(haVerduraFrutta ? "✅ Hai incluso verdura o frutta." : "⚠️ Manca verdura o frutta nel pasto.");
  messaggi.push(junk.length === 0
    ? "✅ Nessun alimento extra poco equilibrato."
    : `⚠️ Hai incluso ${junk.length} alimento/i poco equilibrato/i per un pasto quotidiano: ${junk.map(j => j.nome).join(", ")}.`);

  const positivo = haProteine && haCarboidrati && haVerduraFrutta && junk.length === 0;
  messaggi.unshift(positivo ? "🎉 Ottimo lavoro! Questo è un pasto equilibrato." : "Ecco una valutazione del tuo pasto:");

  return { messaggi, positivo };
}

function renderGiochiPasto() {
  const opzioniHtml = GIOCHI_PASTO_OPZIONI.map(op => {
    const selezionato = giochiPastoSelezionati.has(op.nome);
    let classeExtra = selezionato ? "selezionato" : "";
    if (giochiPastoVerificato && selezionato) classeExtra += op.categoria === "junk" ? " sbagliato" : " corretto";
    return `<button type="button" class="giochi-chip ${classeExtra}" data-azione="pasto-toggle" data-nome="${escapeHtml(op.nome)}" ${giochiPastoVerificato ? "disabled" : ""}>${escapeHtml(op.nome)}</button>`;
  }).join("");

  const selezionati = GIOCHI_PASTO_OPZIONI.filter(o => giochiPastoSelezionati.has(o.nome));

  let valutazioneHtml = "";
  if (giochiPastoVerificato) {
    const { messaggi, positivo } = valutaPasto(selezionati);
    valutazioneHtml = `<div class="giochi-valutazione ${positivo ? "giochi-corretto" : "giochi-sbagliato"}">${messaggi.map(m => `<p>${escapeHtml(m)}</p>`).join("")}</div>`;
  }

  giochiPastoContenuto.innerHTML = `
    <p class="hint">Scegli gli alimenti per comporre un pranzo equilibrato tra i macronutrienti, poi verifica il risultato.</p>
    <div class="giochi-pasto-opzioni">${opzioniHtml}</div>
    ${valutazioneHtml}
    <div>
      ${!giochiPastoVerificato
        ? `<button type="button" class="giochi-verifica-btn" data-azione="pasto-verifica" ${selezionati.length === 0 ? "disabled" : ""}>Verifica il pasto</button>`
        : `<button type="button" class="giochi-nuovo-btn" data-azione="pasto-ricomincia">Nuovo pasto</button>`}
    </div>
  `;
}

giochiPastoContenuto.addEventListener("click", (e) => {
  const toggleBtn = e.target.closest('[data-azione="pasto-toggle"]');
  if (toggleBtn && !giochiPastoVerificato) {
    const nome = toggleBtn.dataset.nome;
    if (giochiPastoSelezionati.has(nome)) giochiPastoSelezionati.delete(nome);
    else giochiPastoSelezionati.add(nome);
    renderGiochiPasto();
    return;
  }
  if (e.target.closest('[data-azione="pasto-verifica"]')) {
    giochiPastoVerificato = true;
    renderGiochiPasto();
    return;
  }
  if (e.target.closest('[data-azione="pasto-ricomincia"]')) {
    giochiPastoSelezionati = new Set();
    giochiPastoVerificato = false;
    renderGiochiPasto();
  }
});

// ---------- Avvio ----------

giochiQuizOrdine = mescolaArray(GIOCHI_QUIZ_DOMANDE.map((_, i) => i));
renderGiochiQuiz();
renderGiochiAbbina();
renderGiochiPasto();
