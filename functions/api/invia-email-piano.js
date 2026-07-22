// Cloudflare Pages Function: invia via email al paziente selezionato il piano
// alimentare e la lista della spesa (contenuto HTML già pronto, costruito
// lato client riusando gli stessi generatori della stampa/PDF).
// Riusa la stessa API HTTP di Brevo già impiegata dal worker-notifiche-checkin
// per i promemoria appuntamento: BREVO_API_KEY e VAPID_CONTACT_EMAIL vanno
// configurati anche qui, nelle Environment variables/secrets del progetto
// Cloudflare Pages (sono un prodotto separato dal Worker, non condividono i
// secret automaticamente).

const SUPABASE_URL = "https://scckmrmgbpvqqcungrsj.supabase.co";

export async function onRequestPost(context) {
  const { request, env } = context;

  const secretKey = env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    return risposta(500, { error: "Configurazione mancante sul server (SUPABASE_SECRET_KEY)." });
  }

  const brevoKey = env.BREVO_API_KEY;
  const mittenteEmail = env.VAPID_CONTACT_EMAIL;
  if (!brevoKey || !mittenteEmail) {
    return risposta(500, { error: "Invio email non configurato sul server (BREVO_API_KEY o VAPID_CONTACT_EMAIL mancanti)." });
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
    return risposta(403, { error: "Solo un amministratore può inviare email ai pazienti." });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return risposta(400, { error: "Richiesta non valida." });
  }

  const pazienteId = body.pazienteId;
  const html = (body.html || "").trim();

  if (!pazienteId || !html) {
    return risposta(400, { error: "pazienteId e html sono obbligatori." });
  }

  const paziente = await recuperaPaziente(secretKey, pazienteId);
  if (!paziente) {
    return risposta(404, { error: "Paziente non trovato." });
  }
  if (!paziente.email) {
    return risposta(400, { error: "Il paziente non ha un'email registrata nel profilo." });
  }

  try {
    await inviaEmailBrevo(brevoKey, mittenteEmail, {
      destinatarioEmail: paziente.email,
      destinatarioNome: paziente.nome || "",
      oggetto: "Il tuo piano alimentare e lista della spesa",
      html
    });
  } catch (e) {
    return risposta(502, { error: e.message });
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

async function recuperaPaziente(secretKey, pazienteId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/pazienti?id=eq.${encodeURIComponent(pazienteId)}&select=nome,email`, {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`
    }
  });
  if (!res.ok) return null;
  const righe = await res.json();
  return righe[0] || null;
}

async function inviaEmailBrevo(brevoKey, mittenteEmail, { destinatarioEmail, destinatarioNome, oggetto, html }) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": brevoKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sender: { email: mittenteEmail, name: "NutriPlan" },
      to: [{ email: destinatarioEmail, name: destinatarioNome || undefined }],
      subject: oggetto,
      htmlContent: html
    })
  });
  if (!res.ok) {
    throw new Error(`Errore invio email (${res.status}): ${await res.text()}`);
  }
}

function risposta(statusCode, corpo) {
  return new Response(JSON.stringify(corpo), {
    status: statusCode,
    headers: { "Content-Type": "application/json" }
  });
}
