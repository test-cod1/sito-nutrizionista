// Cloudflare Pages Function: cancellazione completa e irreversibile di un
// paziente (account Supabase Auth + tutti i dati collegati), a seguito
// dell'accettazione di una richiesta di cancellazione dati. Raggiungibile
// su /api/elimina-paziente. Stessa autenticazione admin di crea-utente.js
// (SUPABASE_SECRET_KEY, verifica che il chiamante sia in "amministratori"),
// perché cancellare un utente Auth richiede la service role key, che il
// client non deve mai avere in mano.

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
    return risposta(403, { error: "Solo un amministratore può eliminare i dati di un paziente." });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return risposta(400, { error: "Richiesta non valida." });
  }

  const richiestaId = body.richiestaId;
  if (!richiestaId) {
    return risposta(400, { error: "richiestaId obbligatorio." });
  }

  const richiesta = await leggiRiga(secretKey, "richieste_cancellazione", richiestaId);
  if (!richiesta) {
    return risposta(404, { error: "Richiesta non trovata." });
  }
  if (richiesta.stato !== "accettata") {
    return risposta(400, { error: "La richiesta deve prima essere accettata." });
  }
  if (!richiesta.paziente_id) {
    return risposta(400, { error: "Il paziente collegato a questa richiesta non esiste più." });
  }

  const paziente = await leggiRiga(secretKey, "pazienti", richiesta.paziente_id, "id,user_id");
  if (!paziente) {
    return risposta(404, { error: "Paziente non trovato." });
  }

  try {
    await eliminaRigheCollegate(secretKey, paziente.id);
    await chiamataRest(secretKey, "DELETE", `/rest/v1/pazienti?id=eq.${encodeURIComponent(paziente.id)}`);
    if (paziente.user_id) {
      await eliminaUtenteAuth(secretKey, paziente.user_id);
    }
  } catch (e) {
    return risposta(500, { error: "Errore durante la cancellazione: " + e.message });
  }

  await chiamataRest(secretKey, "PATCH", `/rest/v1/richieste_cancellazione?id=eq.${encodeURIComponent(richiestaId)}`, {
    stato: "completata",
    completata_il: new Date().toISOString()
  });

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

async function leggiRiga(secretKey, tabella, id, campi) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabella}?id=eq.${encodeURIComponent(id)}&select=${campi || "*"}`, {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`
    }
  });
  if (!res.ok) return null;
  const righe = await res.json();
  return righe[0] || null;
}

// Elimina tutte le righe collegate al paziente prima della riga "pazienti"
// stessa, così non restano dati orfani in nessuna delle tabelle che lo
// referenziano tramite paziente_id.
async function eliminaRigheCollegate(secretKey, pazienteId) {
  const tabelle = ["push_subscriptions", "checkin", "storico_peso", "diete", "appuntamenti", "log_accessi_admin"];
  for (const tabella of tabelle) {
    await chiamataRest(secretKey, "DELETE", `/rest/v1/${tabella}?paziente_id=eq.${encodeURIComponent(pazienteId)}`);
  }
}

async function eliminaUtenteAuth(secretKey, userId) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`
    }
  });
  if (!res.ok) {
    const dati = await res.json().catch(() => ({}));
    throw new Error(dati.msg || dati.message || `Errore nella cancellazione dell'account (${res.status}).`);
  }
}

async function chiamataRest(secretKey, metodo, percorso, corpo) {
  const opzioni = {
    method: metodo,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      Prefer: "return=minimal"
    }
  };
  if (corpo !== undefined) {
    opzioni.headers["Content-Type"] = "application/json";
    opzioni.body = JSON.stringify(corpo);
  }

  const res = await fetch(`${SUPABASE_URL}${percorso}`, opzioni);
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
