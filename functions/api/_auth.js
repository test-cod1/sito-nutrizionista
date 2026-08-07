// Helper condiviso di autorizzazione per le Pages Functions amministrative.
// Il prefisso "_" fa sì che Cloudflare NON lo pubblichi come route (/api/_auth):
// è un modulo importato dalle altre function, non un endpoint.
//
// Perché esiste: le function usano la SUPABASE_SECRET_KEY (service role), che
// bypassa la Row Level Security. Le policy RESTRICTIVE mfa_soddisfatta() — che
// sul DB impediscono a una sessione aal1 di toccare le tabelle sensibili — NON
// si applicano quindi a queste chiamate. Senza un controllo qui, un token admin
// "aal1" (2FA non ancora completato, o rubato via XSS prima del challenge TOTP)
// potrebbe creare account, cancellare pazienti o inviare email saltando il 2FA.
// autorizzaAdmin() replica server-side lo stesso gate del client
// (verificaSeServe2FA): se l'admin ha un fattore MFA verificato, pretende aal2.

const SUPABASE_URL = "https://scckmrmgbpvqqcungrsj.supabase.co";

export function risposta(statusCode, corpo) {
  return new Response(JSON.stringify(corpo), {
    status: statusCode,
    headers: { "Content-Type": "application/json" }
  });
}

// Autorizza il chiamante come amministratore e, salvo diversa indicazione,
// pretende che abbia soddisfatto il 2FA quando ne possiede uno attivo.
// Ritorna { errore: Response } se la richiesta va respinta, altrimenti
// { secretKey, chiamante } con i dati utili al resto della function.
export async function autorizzaAdmin(env, request, opzioni = {}) {
  const { messaggioNonAdmin = "Solo un amministratore può eseguire questa azione.", richiediMfa = true } = opzioni;

  const secretKey = env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    return { errore: risposta(500, { error: "Configurazione mancante sul server (SUPABASE_SECRET_KEY)." }) };
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { errore: risposta(401, { error: "Sessione mancante." }) };
  }

  const chiamante = await recuperaUtenteDaToken(secretKey, token);
  if (!chiamante) {
    return { errore: risposta(401, { error: "Sessione non valida." }) };
  }

  const eAdmin = await verificaAmministratore(secretKey, chiamante.id);
  if (!eAdmin) {
    return { errore: risposta(403, { error: messaggioNonAdmin }) };
  }

  if (richiediMfa) {
    // Il token è già stato validato (firma/scadenza) da /auth/v1/user qui sopra,
    // quindi il claim "aal" al suo interno è autentico: lo leggiamo senza dover
    // ri-verificare la firma.
    const payload = decodificaPayloadJwt(token);
    const aal = payload && payload.aal;
    if (aal !== "aal2") {
      const haFattore = await haFattoreMfaVerificato(secretKey, chiamante.id);
      // Fail-closed: se l'admin HA un fattore verificato (haFattore === true)
      // deve completare il 2FA; se non riusciamo a determinarlo (null) neghiamo
      // comunque, per non aprire una scappatoia su un errore transitorio. Solo
      // l'admin senza alcun fattore (2FA facoltativo, mai attivato) prosegue.
      if (haFattore !== false) {
        return {
          errore: risposta(403, {
            error: "Verifica in due passaggi richiesta: completa il 2FA e riprova.",
            codice: "MFA_RICHIESTA"
          })
        };
      }
    }
  }

  return { secretKey, chiamante };
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

// true = ha almeno un fattore MFA verificato; false = nessuno; null = non
// determinabile (errore) → il chiamante tratta null come fail-closed.
async function haFattoreMfaVerificato(secretKey, userId) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`
    }
  });
  if (!res.ok) return null;
  const dati = await res.json().catch(() => null);
  if (!dati) return null;
  const fattori = Array.isArray(dati.factors) ? dati.factors : [];
  return fattori.some(f => f && f.status === "verified");
}

function decodificaPayloadJwt(token) {
  try {
    const parte = token.split(".")[1];
    if (!parte) return null;
    const base64 = parte.replace(/-/g, "+").replace(/_/g, "/");
    const binario = atob(base64);
    const json = decodeURIComponent(
      binario
        .split("")
        .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}
