// Funzione server: crea/invita un nuovo utente (amministratore o paziente).
// Usa la chiave segreta di Supabase (mai esposta al browser) per poter creare
// account senza compromettere la sessione di chi chiama questa funzione.
// Può essere invocata solo da un amministratore già autenticato.

const { createClient } = require("@supabase/supabase-js");

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

  const supabaseAdmin = createClient(SUPABASE_URL, secretKey);

  const { data: chiamante, error: erroreChiamante } = await supabaseAdmin.auth.getUser(token);
  if (erroreChiamante || !chiamante || !chiamante.user) {
    return risposta(401, { error: "Sessione non valida." });
  }

  const { data: rigaAdmin, error: erroreAdmin } = await supabaseAdmin
    .from("amministratori")
    .select("user_id")
    .eq("user_id", chiamante.user.id)
    .maybeSingle();

  if (erroreAdmin || !rigaAdmin) {
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

  const { data: invitato, error: erroreInvito } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
  if (erroreInvito) {
    return risposta(400, { error: erroreInvito.message });
  }

  const nuovoUserId = invitato.user.id;

  if (ruolo === "admin") {
    const { error } = await supabaseAdmin.from("amministratori").insert({ user_id: nuovoUserId });
    if (error) return risposta(400, { error: error.message });
  } else {
    if (body.pazienteId) {
      const { error } = await supabaseAdmin
        .from("pazienti")
        .update({ user_id: nuovoUserId })
        .eq("id", body.pazienteId);
      if (error) return risposta(400, { error: error.message });
    } else {
      const { error } = await supabaseAdmin
        .from("pazienti")
        .insert({ nome: body.nomeNuovoPaziente.trim(), user_id: nuovoUserId });
      if (error) return risposta(400, { error: error.message });
    }
  }

  return risposta(200, { ok: true });
};

function risposta(statusCode, corpo) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo)
  };
}
