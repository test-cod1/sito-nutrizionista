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

// ---------- Caccia alla fake news (swipe) ----------

const GIOCHI_FAKENEWS_NOTIZIE = [
  { testo: "🔥 TREND VIRALE: aggiungi bicarbonato all'acqua al mattino per 'alcalinizzare' il corpo e dimagrire più in fretta.", risposta: false, spiegazione: "Il corpo regola da solo il proprio pH tramite polmoni e reni: bere acqua e bicarbonato non cambia la composizione corporea né fa dimagrire." },
  { testo: "📢 Le etichette 'ad alto contenuto di fibre' indicano davvero un contenuto di fibre superiore alla media, perché è un claim regolamentato.", risposta: true, spiegazione: "Claim come 'fonte di fibre' o 'alto contenuto di fibre' sono regolamentati e richiedono di superare soglie minime stabilite dalla legge." },
  { testo: "💊 Gli integratori 'brucia grassi' venduti online possono sostituire l'attività fisica per perdere peso.", risposta: false, spiegazione: "Nessun integratore sostituisce l'attività fisica: il dimagrimento dipende dal bilancio energetico complessivo, non da una pillola." },
  { testo: "🥑 Post virale: 'L'avocado ha troppi grassi, va eliminato del tutto se vuoi dimagrire.'", risposta: false, spiegazione: "I grassi dell'avocado sono in gran parte monoinsaturi (salutari): non serve eliminarlo, conta la quantità nel contesto della dieta complessiva." },
  { testo: "🍋 'Bere acqua e limone al mattino a digiuno depura il fegato dalle tossine.'", risposta: false, spiegazione: "Il fegato non ha bisogno di alimenti 'depurativi' per funzionare: svolge già autonomamente questo compito." },
  { testo: "🧊 'Le bibite ghiacciate fanno dimagrire perché il corpo consuma calorie extra per riscaldarle.'", risposta: false, spiegazione: "L'effetto termico di una bevanda fredda è trascurabile rispetto alle calorie che la bevanda stessa apporta." },
  { testo: "🌾 'Tutti i carboidrati mangiati la sera si trasformano subito in grasso.'", risposta: false, spiegazione: "Conta il bilancio energetico complessivo della giornata, non l'orario in cui si assumono i carboidrati." },
  { testo: "🧴 Un integratore multivitaminico può essere utile in caso di carenze specifiche accertate da un professionista.", risposta: true, spiegazione: "In presenza di carenze diagnosticate, un supplemento mirato può essere indicato; non sostituisce comunque una dieta varia ed equilibrata." },
  { testo: "🍬 'I dolcificanti senza calorie fanno ingrassare più dello zucchero.'", risposta: false, spiegazione: "Non apportano calorie significative: l'effetto sul peso dipende dal contesto complessivo della dieta, non dal dolcificante in sé." },
  { testo: "🥛 'Il latte scremato ha circa le stesse proteine di quello intero: cambia soprattutto il contenuto di grassi.'", risposta: true, spiegazione: "Scremare il latte riduce i grassi ma lascia pressoché invariato il contenuto proteico." },
];

const giochiFakenewsContenuto = document.getElementById("giochi-fakenews-contenuto");
let giochiFakenewsOrdine = [];
let giochiFakenewsIndice = 0;
let giochiFakenewsPunteggio = 0;
let giochiFakenewsRisposto = false;

function renderGiochiFakenews() {
  if (giochiFakenewsIndice >= giochiFakenewsOrdine.length) {
    giochiFakenewsContenuto.innerHTML = `
      <p class="giochi-risultato">🏁 Hai scorso tutti i post!<br>Punteggio: <strong>${giochiFakenewsPunteggio} / ${giochiFakenewsOrdine.length}</strong></p>
      <button type="button" class="giochi-rigioca-btn" data-azione="fakenews-ricomincia">Rigioca</button>
    `;
    return;
  }
  const notizia = GIOCHI_FAKENEWS_NOTIZIE[giochiFakenewsOrdine[giochiFakenewsIndice]];
  giochiFakenewsContenuto.innerHTML = `
    <div class="fakenews-progresso">
      <span class="hint">Post ${giochiFakenewsIndice + 1} di ${giochiFakenewsOrdine.length}</span>
      <span class="hint">Punteggio: ${giochiFakenewsPunteggio}</span>
    </div>
    <div class="fakenews-pila">
      <div class="fakenews-card" id="fakenews-card-corrente">
        <span class="fakenews-etichetta-post">📱 Visto sui social</span>
        <p class="fakenews-testo">${escapeHtml(notizia.testo)}</p>
      </div>
    </div>
    <p class="fakenews-swipe-hint">👉 Trascina la card oppure tocca un pulsante 👇</p>
    <div class="fakenews-azioni">
      <button type="button" class="fakenews-bufala-btn" data-azione="fakenews-rispondi" data-valore="false">👈 Bufala</button>
      <button type="button" class="fakenews-vero-btn" data-azione="fakenews-rispondi" data-valore="true">Vero 👉</button>
    </div>
    <div id="giochi-fakenews-feedback"></div>
  `;
  abilitaSwipeFakenews(document.getElementById("fakenews-card-corrente"));
}

function abilitaSwipeFakenews(card) {
  if (!card) return;
  let stato = null;

  card.addEventListener("pointerdown", (e) => {
    if (giochiFakenewsRisposto) return;
    stato = { startX: e.clientX, dx: 0 };
    card.setPointerCapture(e.pointerId);
  });

  card.addEventListener("pointermove", (e) => {
    if (!stato) return;
    stato.dx = e.clientX - stato.startX;
    card.style.transform = `translateX(${stato.dx}px) rotate(${stato.dx / 18}deg)`;
    card.style.setProperty("--tint-opacity", Math.min(Math.abs(stato.dx) / 120, 0.35));
    card.style.setProperty("--tint-color", stato.dx > 0 ? "var(--g-abbina)" : "var(--g-danger)");
  });

  const rilascia = () => {
    if (!stato) return;
    const dx = stato.dx;
    stato = null;
    if (Math.abs(dx) > 90) {
      rispondiFakenews(dx > 0);
    } else {
      card.style.transform = "";
      card.style.setProperty("--tint-opacity", 0);
    }
  };

  card.addEventListener("pointerup", rilascia);
  card.addEventListener("pointercancel", rilascia);
}

function rispondiFakenews(valoreScelto) {
  if (giochiFakenewsRisposto) return;
  giochiFakenewsRisposto = true;
  const notizia = GIOCHI_FAKENEWS_NOTIZIE[giochiFakenewsOrdine[giochiFakenewsIndice]];
  const corretto = valoreScelto === notizia.risposta;
  if (corretto) giochiFakenewsPunteggio++;

  const card = document.getElementById("fakenews-card-corrente");
  if (card) {
    card.style.transform = `translateX(${valoreScelto ? 400 : -400}px) rotate(${valoreScelto ? 20 : -20}deg)`;
    card.style.setProperty("--tint-opacity", 0.35);
    card.style.setProperty("--tint-color", valoreScelto ? "var(--g-abbina)" : "var(--g-danger)");
  }
  giochiFakenewsContenuto.querySelectorAll('[data-azione="fakenews-rispondi"]').forEach(b => b.disabled = true);

  const feedback = document.getElementById("giochi-fakenews-feedback");
  feedback.innerHTML = `
    <p class="${corretto ? "giochi-corretto" : "giochi-sbagliato"}">${corretto ? "✅ Esatto!" : `❌ Sbagliato — in realtà è ${notizia.risposta ? "Vero" : "Bufala"}.`}</p>
    <p class="hint">${escapeHtml(notizia.spiegazione)}</p>
    <button type="button" class="giochi-prossimo-btn" data-azione="fakenews-avanti">Prossimo post →</button>
  `;
}

giochiFakenewsContenuto.addEventListener("click", (e) => {
  const bottone = e.target.closest("button[data-azione]");
  if (!bottone) return;
  if (bottone.dataset.azione === "fakenews-rispondi") {
    rispondiFakenews(bottone.dataset.valore === "true");
  } else if (bottone.dataset.azione === "fakenews-avanti") {
    giochiFakenewsIndice++;
    giochiFakenewsRisposto = false;
    renderGiochiFakenews();
  } else if (bottone.dataset.azione === "fakenews-ricomincia") {
    giochiFakenewsOrdine = mescolaArray(GIOCHI_FAKENEWS_NOTIZIE.map((_, i) => i));
    giochiFakenewsIndice = 0;
    giochiFakenewsPunteggio = 0;
    giochiFakenewsRisposto = false;
    renderGiochiFakenews();
  }
});

// ---------- Decodifica l'etichetta ----------

const GIOCHI_ETICHETTE_PRODOTTI = [
  {
    prodotto: "Fette biscottate \"BenEssere\"",
    ingredienti: "Farina di frumento, zucchero, olio di palma, sciroppo di glucosio-fruttosio, emulsionante: lecitina di soia, sale.",
    claim: [
      { testo: "🌿 100% Naturale", fuorviante: true, spiegazione: "Contiene sciroppo di glucosio-fruttosio ed emulsionanti: 'naturale' non è un termine regolamentato ed è fuorviante su un prodotto così trasformato." },
      { testo: "🍬 Senza zuccheri aggiunti", fuorviante: true, spiegazione: "Lo zucchero e lo sciroppo di glucosio-fruttosio sono a tutti gli effetti zuccheri aggiunti: il claim è contraddetto dagli ingredienti." },
      { testo: "🌾 A base di cereali", fuorviante: false, spiegazione: "La farina di frumento è realmente il primo ingrediente: il claim corrisponde alla lista ingredienti." },
    ],
  },
  {
    prodotto: "Yogurt alla frutta \"FruttaViva\"",
    ingredienti: "Latte parzialmente scremato, zucchero, preparato di fragola (10%: fragole, zucchero, aromi), fermenti lattici, addensante: pectina.",
    claim: [
      { testo: "🍓 Con vera frutta", fuorviante: false, spiegazione: "Il preparato di fragola è effettivamente presente tra gli ingredienti, anche se in quantità limitata (10%)." },
      { testo: "💪 Ricco di proteine", fuorviante: true, spiegazione: "Non è indicato alcun contenuto proteico elevato negli ingredienti: è un normale yogurt, non uno yogurt proteico arricchito." },
      { testo: "🥛 Fonte di calcio", fuorviante: false, spiegazione: "Essendo a base di latte, contiene naturalmente calcio: il claim è plausibile." },
    ],
  },
  {
    prodotto: "Barretta \"EnergyFit\"",
    ingredienti: "Sciroppo di glucosio, cioccolato (24%), cereali soffiati, olio di girasole, zucchero, aromi.",
    claim: [
      { testo: "⚡ Energia naturale", fuorviante: true, spiegazione: "L'energia proviene principalmente da sciroppo di glucosio e zucchero raffinato: definirla 'naturale' è fuorviante." },
      { testo: "🍫 Con vero cioccolato", fuorviante: false, spiegazione: "Il cioccolato è effettivamente presente e quantificato (24%) nella lista ingredienti." },
      { testo: "🏃 Ideale per lo sport", fuorviante: true, spiegazione: "È principalmente uno snack zuccherato: non ci sono elementi (proteine, elettroliti) che la rendano specificamente 'sportiva'." },
    ],
  },
  {
    prodotto: "Succo \"FrescoSole\"",
    ingredienti: "Acqua, zucchero, succo di arancia da concentrato (12%), acido citrico, aromi, colorante: beta-carotene.",
    claim: [
      { testo: "🍊 100% Frutta", fuorviante: true, spiegazione: "Il succo di arancia è solo il 12% e l'ingrediente principale è acqua con zucchero aggiunto: non è '100% frutta'." },
      { testo: "🎨 Con coloranti", fuorviante: false, spiegazione: "Il beta-carotene come colorante è effettivamente elencato tra gli ingredienti: il claim è corretto (anche se non è un vanto salutistico)." },
      { testo: "💧 Dissetante", fuorviante: false, spiegazione: "Essendo composto per lo più da acqua, l'effetto dissetante è plausibile: non è un claim nutrizionale fuorviante." },
    ],
  },
  {
    prodotto: "Cracker \"LeggerezzaOro\"",
    ingredienti: "Farina di frumento raffinata, olio di palma, sale, lievito, estratto di malto.",
    claim: [
      { testo: "🪶 Leggero", fuorviante: true, spiegazione: "'Leggero' non è un claim regolamentato come 'light': a parità di porzione le calorie possono essere simili a un cracker normale." },
      { testo: "🌾 Con farina di frumento", fuorviante: false, spiegazione: "La farina di frumento è realmente il primo ingrediente: il claim corrisponde alla realtà." },
      { testo: "🌿 Senza conservanti", fuorviante: false, spiegazione: "Nella lista ingredienti non compaiono conservanti: il claim è verificabile e corretto." },
    ],
  },
  {
    prodotto: "Bevanda \"VitaBoost\"",
    ingredienti: "Acqua, zucchero, anidride carbonica, acidificante: acido citrico, aromi, vitamina C, caffeina.",
    claim: [
      { testo: "💊 Con vitamine", fuorviante: false, spiegazione: "La vitamina C è effettivamente presente tra gli ingredienti: il claim è corretto." },
      { testo: "🚫 Senza zuccheri", fuorviante: true, spiegazione: "Lo zucchero è il secondo ingrediente in lista: il claim 'senza zuccheri' è direttamente smentito dagli ingredienti." },
      { testo: "🔋 Energizzante", fuorviante: false, spiegazione: "La presenza di zucchero e caffeina rende plausibile un effetto energizzante a breve termine." },
    ],
  },
];

const giochiEtichetteContenuto = document.getElementById("giochi-etichette-contenuto");
let giochiEtichetteOrdine = [];
let giochiEtichetteIndice = 0;
let giochiEtichettePunteggioTotale = 0;
let giochiEtichetteSelezionati = new Set();
let giochiEtichetteVerificato = false;

function renderGiochiEtichette() {
  if (giochiEtichetteIndice >= giochiEtichetteOrdine.length) {
    const totaleClaim = GIOCHI_ETICHETTE_PRODOTTI.reduce((s, p) => s + p.claim.length, 0);
    giochiEtichetteContenuto.innerHTML = `
      <p class="giochi-risultato">🏁 Hai analizzato tutte le etichette!<br>Claim riconosciuti correttamente: <strong>${giochiEtichettePunteggioTotale} / ${totaleClaim}</strong></p>
      <button type="button" class="giochi-rigioca-btn" data-azione="etichette-ricomincia">Rigioca</button>
    `;
    return;
  }

  const prodotto = GIOCHI_ETICHETTE_PRODOTTI[giochiEtichetteOrdine[giochiEtichetteIndice]];
  const badgeHtml = prodotto.claim.map((c, i) => {
    const selezionato = giochiEtichetteSelezionati.has(i);
    let classeExtra = selezionato ? "selezionato" : "";
    if (giochiEtichetteVerificato) {
      const corretto = selezionato === c.fuorviante;
      classeExtra = corretto ? "corretto" : "sbagliato";
    }
    return `<button type="button" class="etichetta-badge ${classeExtra}" data-azione="etichetta-toggle" data-indice="${i}" ${giochiEtichetteVerificato ? "disabled" : ""}>${escapeHtml(c.testo)}</button>`;
  }).join("");

  let spiegazioniHtml = "";
  if (giochiEtichetteVerificato) {
    spiegazioniHtml = `<div class="etichetta-spiegazioni">${prodotto.claim.map(c => `<p>${c.fuorviante ? "🚩" : "✅"} ${escapeHtml(c.testo)}: ${escapeHtml(c.spiegazione)}</p>`).join("")}</div>`;
  }

  giochiEtichetteContenuto.innerHTML = `
    <p class="hint">Prodotto ${giochiEtichetteIndice + 1} di ${giochiEtichetteOrdine.length} — tocca i claim che ti sembrano fuorvianti rispetto agli ingredienti, poi verifica.</p>
    <div class="etichetta-card">
      <p class="etichetta-prodotto-nome">${escapeHtml(prodotto.prodotto)}</p>
      <p class="etichetta-ingredienti"><strong>Ingredienti:</strong> ${escapeHtml(prodotto.ingredienti)}</p>
      <div>${badgeHtml}</div>
    </div>
    ${spiegazioniHtml}
    <div>
      ${!giochiEtichetteVerificato
        ? `<button type="button" class="giochi-verifica-btn" data-azione="etichetta-verifica">Verifica etichetta</button>`
        : `<button type="button" class="giochi-prossimo-btn" data-azione="etichetta-avanti">Prodotto successivo →</button>`}
    </div>
  `;
}

giochiEtichetteContenuto.addEventListener("click", (e) => {
  const toggleBtn = e.target.closest('[data-azione="etichetta-toggle"]');
  if (toggleBtn && !giochiEtichetteVerificato) {
    const indice = Number(toggleBtn.dataset.indice);
    if (giochiEtichetteSelezionati.has(indice)) giochiEtichetteSelezionati.delete(indice);
    else giochiEtichetteSelezionati.add(indice);
    renderGiochiEtichette();
    return;
  }
  if (e.target.closest('[data-azione="etichetta-verifica"]')) {
    giochiEtichetteVerificato = true;
    const prodotto = GIOCHI_ETICHETTE_PRODOTTI[giochiEtichetteOrdine[giochiEtichetteIndice]];
    prodotto.claim.forEach((c, i) => {
      if (giochiEtichetteSelezionati.has(i) === c.fuorviante) giochiEtichettePunteggioTotale++;
    });
    renderGiochiEtichette();
    return;
  }
  if (e.target.closest('[data-azione="etichetta-avanti"]')) {
    giochiEtichetteIndice++;
    giochiEtichetteSelezionati = new Set();
    giochiEtichetteVerificato = false;
    renderGiochiEtichette();
    return;
  }
  if (e.target.closest('[data-azione="etichette-ricomincia"]')) {
    giochiEtichetteOrdine = mescolaArray(GIOCHI_ETICHETTE_PRODOTTI.map((_, i) => i));
    giochiEtichetteIndice = 0;
    giochiEtichettePunteggioTotale = 0;
    giochiEtichetteSelezionati = new Set();
    giochiEtichetteVerificato = false;
    renderGiochiEtichette();
  }
});

// ---------- Avvio ----------

giochiQuizOrdine = mescolaArray(GIOCHI_QUIZ_DOMANDE.map((_, i) => i));
renderGiochiQuiz();
renderGiochiAbbina();
renderGiochiPasto();

giochiFakenewsOrdine = mescolaArray(GIOCHI_FAKENEWS_NOTIZIE.map((_, i) => i));
renderGiochiFakenews();

giochiEtichetteOrdine = mescolaArray(GIOCHI_ETICHETTE_PRODOTTI.map((_, i) => i));
renderGiochiEtichette();
