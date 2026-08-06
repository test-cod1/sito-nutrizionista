# Procedura per la gestione delle violazioni di dati personali (data breach)

**Ai sensi degli artt. 33-34 GDPR — Regolamento (UE) 2016/679**

> Documento interno dello studio. NON è una pagina del sito, non viene pubblicato.
> Compilare le parti tra parentesi quadre con i dati dello studio.

- **Titolare del trattamento:** [Nome Cognome], [P.IVA], [email], [telefono]
- **Responsabile della procedura (chi decide e coordina):** il Titolare
- **DPO:** [non nominato — presupposti non ricorrenti / oppure: contatti DPO]
- **Ultimo aggiornamento:** [data]

---

## 1. Cos'è una violazione di dati (esempi per questa app)

Una violazione è qualsiasi evento che comporti **distruzione, perdita, modifica, divulgazione non autorizzata o accesso** ai dati personali dei pazienti. Poiché l'app tratta **dati sanitari** (peso, circonferenze, allergie, piani, check-in), quasi ogni violazione va considerata **ad alto rischio** salvo prova contraria.

Scenari realistici:
- **Credenziali dell'amministratore compromesse** (password rubata/phishing): accesso a tutti i pazienti.
- **Dispositivo perso o rubato** con la sessione aperta o con il piano in cache offline.
- **Errore di configurazione RLS** su Supabase che espone dati tra pazienti.
- **Violazione presso un fornitore** (Supabase, Cloudflare, Brevo): comunicata dal fornitore.
- **Invio email a destinatario errato** (piano/allegato PDF alla persona sbagliata).
- **Chiave segreta (service key / API key) esposta** per errore.

---

## 2. Cosa fare — le prime azioni (subito, appena si scopre l'evento)

1. **Contenere.** Bloccare la fonte: cambiare la password admin e **revocare le sessioni** (Supabase → Authentication → Users), ruotare le chiavi compromesse (Supabase → API Keys; secret del Worker/Functions), attivare/rendere obbligatorio il 2FA. Se è un dispositivo perso: fare **logout da remoto** revocando la sessione dell'utente su Supabase.
2. **Registrare** data/ora della scoperta, cosa è successo, come si è scoperto.
3. **Valutare la portata:** quali dati, quanti pazienti, se ci sono dati sanitari (di norma sì).

> ⏱️ **Il conto delle 72 ore parte da quando si viene a conoscenza** della violazione (non da quando è avvenuta).

---

## 3. Valutazione del rischio e obblighi

| Situazione | Notifica al Garante (art. 33) | Comunicazione ai pazienti (art. 34) |
|---|---|---|
| Improbabile rischio per i diritti/libertà (es. dato cifrato e chiave non compromessa) | **No** (ma registrare comunque nel registro) | No |
| Rischio per i diritti/libertà | **Sì, entro 72h** | Solo se rischio elevato |
| **Rischio ELEVATO** (tipico per dati sanitari esposti in chiaro) | **Sì, entro 72h** | **Sì, senza ingiustificato ritardo, in modo chiaro** |

Nel dubbio, con dati sanitari, **notificare**.

---

## 4. Notifica al Garante — entro 72 ore (art. 33)

Canale: **Garante per la protezione dei dati personali** — procedura online su https://servizi.gdpr.garanteprivacy.it (oppure PEC [protocollo@pec.gpdp.it]).

Se non si riesce entro 72h, si notifica comunque **spiegando il ritardo**. È ammessa una notifica **per fasi** (prima le informazioni disponibili, poi il resto).

Contenuto minimo (art. 33(3)):
- **natura** della violazione (cosa è successo);
- **categorie e numero approssimativo** di interessati e di record coinvolti;
- **contatti** del Titolare/DPO;
- **conseguenze probabili**;
- **misure adottate o proposte** per rimediare e attenuare gli effetti.

---

## 5. Comunicazione ai pazienti — se rischio elevato (art. 34)

In **linguaggio chiaro e semplice**, includendo: cosa è successo, quali dati, possibili conseguenze, misure adottate, cosa può fare l'interessato (es. cambiare password), e i contatti dello studio.

Bozza riutilizzabile:

> Gentile [Nome],
> ti informiamo che il [data] si è verificato un incidente di sicurezza che potrebbe aver riguardato i tuoi dati ([es. peso, allergie, piano alimentare]). Abbiamo immediatamente [misure adottate: es. bloccato l'accesso, cambiato le credenziali]. Ti consigliamo di [es. cambiare la password]. Per qualsiasi domanda puoi contattarci a [email]/[telefono]. Ci scusiamo per l'accaduto.

Non è necessaria la comunicazione individuale se i dati erano cifrati/inintelligibili, se il rischio elevato è stato scongiurato, o se richiederebbe sforzi sproporzionati (in tal caso: comunicazione pubblica equivalente).

---

## 6. Registro delle violazioni (obbligatorio, art. 33(5)) — anche per quelle NON notificate

| Data scoperta | Descrizione | Dati/pazienti coinvolti | Rischio (basso/medio/alto) | Notificato al Garante? | Comunicato ai pazienti? | Misure adottate | Note |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

---

## 7. Contatti utili

- **Garante Privacy:** https://www.garanteprivacy.it — servizi online: https://servizi.gdpr.garanteprivacy.it
- **Supabase** (fornitore DB/Auth, UE): supporto dal dashboard; DPA e security su https://supabase.com/security
- **Cloudflare** (hosting/Functions/Worker): dashboard support; https://www.cloudflare.com/trust-hub/
- **Brevo** (invio email, UE-FR): supporto dal pannello; https://www.brevo.com/legal/

---

## 8. Prevenzione (già in essere in questa app)

- Isolamento dati per paziente (RLS Supabase) e accesso admin tracciato (`log_accessi_admin`).
- 2FA disponibile per l'amministratore (attivarlo!).
- Cifratura in transito (HTTPS) e a riposo (Supabase); DB in regione UE.
- La cache offline sul dispositivo contiene **solo il piano alimentare** e viene svuotata al logout.
- Chiavi segrete solo lato server (Cloudflare Functions/Worker), mai nel client.

**Azione consigliata:** rendere **obbligatorio** il 2FA sull'account admin (oggi è facoltativo) — è la principale difesa contro lo scenario "credenziali compromesse".
