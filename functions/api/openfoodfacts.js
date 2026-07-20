// Cloudflare Pages Function: proxy di sola consultazione verso Open Food Facts.
// Usata sia dalla ricerca admin che dallo scanner barcode paziente: nessun dato
// del paziente viene mai inoltrato a Open Food Facts, solo termini di ricerca
// o il codice a barre del prodotto. Raggiungibile su:
//   /api/openfoodfacts?query=<nome o marca>
//   /api/openfoodfacts?barcode=<codice a barre>
//
// Le risposte con esito positivo vengono messe in cache (Cache API di Cloudflare)
// per un'ora, per evitare di interrogare ripetutamente Open Food Facts per lo
// stesso prodotto (richiesto dalle linee guida d'uso dell'API).

const USER_AGENT = "NutriPlan - Calcolatore Piano Alimentare - Contatto: jacopo.ravaiolicri@gmail.com";
const CAMPI = "code,product_name,product_name_it,brands,quantity,nutriments,ingredients_text,ingredients_text_it,allergens,nutriscore_grade,nova_group,image_front_small_url,image_small_url,image_url";

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const query = (url.searchParams.get("query") || "").trim();
  const barcode = (url.searchParams.get("barcode") || "").trim();

  if (!query && !barcode) {
    return risposta(400, { errore: "Specifica un nome prodotto oppure un codice a barre." });
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url);
  const cachata = await cache.match(cacheKey);
  if (cachata) return cachata;

  let risultato;
  try {
    risultato = barcode ? await cercaPerBarcode(barcode) : await cercaPerTesto(query);
  } catch (e) {
    return risposta(502, { errore: "Open Food Facts non è raggiungibile al momento. Riprova tra poco." });
  }

  const res = risposta(risultato.statusCode, risultato.corpo);
  if (risultato.statusCode === 200) {
    res.headers.set("Cache-Control", "public, max-age=3600");
    context.waitUntil(cache.put(cacheKey, res.clone()));
  }
  return res;
}

async function cercaPerBarcode(barcode) {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${CAMPI}`, {
    headers: { "User-Agent": USER_AGENT }
  });
  if (!r.ok) throw new Error("Errore rete Open Food Facts");
  const dati = await r.json();
  if (!dati || dati.status !== 1 || !dati.product) {
    return { statusCode: 404, corpo: { errore: "Prodotto non trovato su Open Food Facts." } };
  }
  return { statusCode: 200, corpo: { prodotti: [normalizzaProdotto(dati.product)] } };
}

// La ricerca testuale di Open Food Facts si è dimostrata poco affidabile su
// un solo endpoint (sia il motore "search-a-licious" nuovo che il vecchio
// /cgi/search.pl danno saltuariamente 502/503): proviamo prima quello nuovo
// e, solo se fallisce, ripieghiamo sul vecchio, prima di arrendersi.
async function cercaPerTesto(query) {
  let grezzi;
  try {
    grezzi = await risultatiSearchALicious(query);
  } catch (e) {
    grezzi = await risultatiRicercaLegacy(query);
  }

  if (grezzi.length === 0) {
    return { statusCode: 404, corpo: { errore: "Nessun prodotto trovato per questa ricerca." } };
  }
  return { statusCode: 200, corpo: { prodotti: grezzi.map(normalizzaProdotto) } };
}

async function risultatiSearchALicious(query) {
  const r = await fetch(
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=15&fields=${CAMPI}`,
    { headers: { "User-Agent": USER_AGENT } }
  );
  if (!r.ok) throw new Error("search-a-licious non disponibile");
  const dati = await r.json();
  if (!Array.isArray(dati.hits)) throw new Error("Formato di risposta inatteso");
  return dati.hits;
}

async function risultatiRicercaLegacy(query) {
  const r = await fetch(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=15&fields=${CAMPI}`,
    { headers: { "User-Agent": USER_AGENT } }
  );
  if (!r.ok) throw new Error("Ricerca legacy non disponibile");
  const dati = await r.json();
  return Array.isArray(dati.products) ? dati.products : [];
}

function normalizzaProdotto(p) {
  const n = p.nutriments || {};
  return {
    codice: p.code || null,
    nome: p.product_name_it || p.product_name || null,
    marca: p.brands || null,
    quantita: p.quantity || null,
    kcal100g: n["energy-kcal_100g"] ?? null,
    proteine100g: n.proteins_100g ?? null,
    grassi100g: n.fat_100g ?? null,
    carboidrati100g: n.carbohydrates_100g ?? null,
    ingredienti: p.ingredients_text_it || p.ingredients_text || null,
    allergeni: p.allergens || null,
    nutriscore: (p.nutriscore_grade || "").toLowerCase() || null,
    nova: p.nova_group || null,
    immagine: p.image_front_small_url || p.image_small_url || null,
    immagineGrande: p.image_url || p.image_front_small_url || p.image_small_url || null
  };
}

function risposta(statusCode, corpo) {
  return new Response(JSON.stringify(corpo), {
    status: statusCode,
    headers: { "Content-Type": "application/json" }
  });
}
