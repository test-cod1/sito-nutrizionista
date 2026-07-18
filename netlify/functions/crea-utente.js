// Funzione server: crea/invita un nuovo utente (amministratore o paziente).
// Usa la chiave segreta di Supabase (mai esposta al browser) per poter creare
// account senza compromettere la sessione di chi chiama questa funzione.
// Può essere invocata solo da un amministratore già autenticato.
//
// Chiama le API REST di Supabase direttamente (fetch nativo di Node), senza
// dipendenze esterne da installare: evita problemi di bundling della funzione.

const SUPABASE_URL = "https://scckmrmgbpvqqcungrsj.supabase.co";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return risposta(405, { error: "Metodo non consentito." });
  }

  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    return risposta(500, { error: "Configurazione mancante sul server (SUPABASE_SECRET_KEY)." });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return risposta(401, { error: "Sessione mancante." });
  }

  const chiamante = await recuperaUtenteDaToken(secretKey, token);
  if (!chiamante) {
    return risposta(401, { error: "Sessione non valida." });
  }

  const eAdmin = await verificaAmministratore(secretKey, chiamante.id);
  if (!eAdmin) {
    return risposta(403, { error: "Solo un amministratore può creare nuovi account." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return risposta(400, { error: "Richiesta non valida." });
  }

  const email = (body.email || "").trim();
  const ruolo = body.ruolo;

  if (!email || (ruolo !== "admin" && ruolo !== "paziente")) {
    return risposta(400, { error: "Email e ruolo (admin o paziente) sono obbligatori." });
  }

  if (ruolo === "paziente" && !body.pazienteId && !(body.nomeNuovoPaziente || "").trim()) {
    return risposta(400, { error: "Specifica un paziente esistente oppure il nome del nuovo paziente." });
  }

  let nuovoUserId;
  try {
    nuovoUserId = await invitaUtente(secretKey, email);
  } catch (e) {
    return risposta(400, { error: e.message });
  }

  try {
    if (ruolo === "admin") {
      await chiamataRest(secretKey, "POST", "/rest/v1/amministratori", { user_id: nuovoUserId });
    } else if (body.pazienteId) {
      await chiamataRest(secretKey, "PATCH", `/rest/v1/pazienti?id=eq.${encodeURIComponent(body.pazienteId)}`, { user_id: nuovoUserId });
    } else {
      await chiamataRest(secretKey, "POST", "/rest/v1/pazienti", { nome: body.nomeNuovoPaziente.trim(), user_id: nuovoUserId });
    }
  } catch (e) {
    return risposta(400, { error: e.message });
  }

  return risposta(200, { ok: true });
};

async function recuperaUtenteDaToken(secretKey, token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${token}`
    }
  });
  if (!res.ok) return null;
  const dati = await res.json();
  return dati && dati.id ? dati : null;
}

async function verificaAmministratore(secretKey, userId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/amministratori?user_id=eq.${encodeURIComponent(userId)}&select=user_id`, {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`
    }
  });
  if (!res.ok) return false;
  const righe = await res.json();
  return Array.isArray(righe) && righe.length > 0;
}

async function invitaUtente(secretKey, email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
    method: "POST",
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email })
  });
  const dati = await res.json();
  if (!res.ok) {
    throw new Error(dati.msg || dati.message || dati.error_description || "Invito non riuscito.");
  }
  return dati.id;
}

async function chiamataRest(secretKey, metodo, percorso, corpo) {
  const res = await fetch(`${SUPABASE_URL}${percorso}`, {
    method: metodo,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(corpo)
  });
  if (!res.ok) {
    const dati = await res.json().catch(() => ({}));
    throw new Error(dati.message || dati.error_description || `Errore database (${res.status}).`);
  }
}

function risposta(statusCode, corpo) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo)
  };
}
