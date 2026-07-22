// Endpoint diagnostico temporaneo: mostra se BREVO_API_KEY e VAPID_CONTACT_EMAIL
// arrivano al runtime delle Pages Functions, senza mai rivelarne il valore
// (stesso approccio della rotta /diagnostica del worker-notifiche-checkin).
// Da rimuovere una volta risolto il problema di configurazione.

export async function onRequestGet(context) {
  const { env } = context;
  const richieste = ["SUPABASE_SECRET_KEY", "BREVO_API_KEY", "VAPID_CONTACT_EMAIL"];
  const dettaglio = {};
  for (const nome of richieste) {
    const v = env[nome];
    dettaglio[nome] = {
      tipo: typeof v,
      presente: v !== undefined && v !== null,
      vuoto: v === "",
      lunghezza: typeof v === "string" ? v.length : null
    };
  }
  return new Response(JSON.stringify(dettaglio, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
}
