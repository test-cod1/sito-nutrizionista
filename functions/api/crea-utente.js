// Cloudflare Pages Function: crea/invita un nuovo utente (amministratore o paziente).
// Equivalente della funzione server già usata su Netlify, adattata al runtime
// Workers (fetch nativo, nessuna dipendenza da installare).
// Raggiungibile su /api/crea-utente.

const SUPABASE_URL = "https://scckmrmgbpvqqcungrsj.supabase.co";

export async function onRequestPost(context) {
  const { request, env } = context;

  const secretKey = env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    return risposta(500, { error: "Configurazione mancante sul server (SUPABASE_SECRET_KEY)." });
  }

  const authHeader = request.headers.get("authorization") || "";
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
    body = await request.json();
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
}

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
  return new Response(JSON.stringify(corpo), {
    status: statusCode,
    headers: { "Content-Type": "application/json" }
  });
}
