# Match Center LIVE Beta (G12 · 23 novembre 2026)

This directory is intentionally isolated within the Lega degli Eroi public GitHub Pages app. It does **not** replace `match.html`, `index.html`, `manifest.json`, the main `sw.js`, or any production services.

- Launch: https://ccezzionale.github.io/Test/match-center-beta/
- Mobile PWA installs under a distinct ID `/Test/match-center-beta/`, with its own scoped service worker.
- Original shared app icons are reused. The back links go to the official Arena home and Match Center.
- Static snapshot: real uploaded league G12 formations and already cached Highlightly Nov 23 player ratings, rounded to 0.5. Not automatic live updates; provisional 6* for unknown ratings.
- Incomplete Mantra substitutions, goalkeeper bonuses, defensive factor, and extra rules are deliberately excluded. Not official fantasy results.
- No Supabase key or API client is shipped. No writes, push notifications, or provider fetches.
- This is a **public, unlinked** test route on the main Pages deployment; do not upload credentials or confidential information here.
- For official launch, review the mobile UX, scoring/mappings, provider licensing and data access controls, then integrate separately into `match.html`.

## Bridge aggiornamenti snapshot (23 novembre 2026)

- `live-refresh.js` legge esclusivamente `./live-feed.json` da GitHub Pages ogni 120 secondi **quando la pagina è visibile**, oltre che su richiesta con il pulsante. Non legge API esterne, né chiama Supabase, né scrive dati.
- `live-feed.json` è un **esempio statico** con 5 record di rating già inclusi nella beta. Non è un aggiornamento live automatico del provider e non va presentato come tale.
- Formato feed: `{schema:1,season:'2026/27',gw:12,source:'highlightly-sandbox',as_of:'ISO-8601',votes:{'Nome|CLUB':{base,bonus,fantavote,...}}}`.
- I controlli rifiutano stagioni/giornate errate, timestamp invalidi, voti fuori scala e nomi non presenti nelle formazioni. La pagina mantiene lo snapshot precedente se il feed manca o è invalido e indica quando i dati sono vecchi.
- In Supabase Sandbox sono confermati 5 ulteriori mapping ID-nome: McTominay, Dimarco, Bastoni, Barella e Akanji. Il database ufficiale non è stato modificato.
- **Prossima dipendenza**: una fonte di voti live autorizzata e un processo che aggiorni il file; un refresh della pagina, da solo, non crea nuovi voti. Prima della pubblicazione alla lega va riesaminato il trattamento dei rating di terzi e l'accesso alla beta, che oggi è pubblica ma non collegata al menu.

## Confronto Fantazone (solo beta, opt-in)

- `fantazone-preview.js` aggiunge il pulsante "Prova voti Fantazone". Solo dopo il clic legge direttamente dal browser il file JSON **pubblico** `data/serie-a/votes/live/15/{gw}.json` sul GitHub raw del progetto `KeyserDSoze/Fantazone`. Nessun token, nessun bypass, niente salvataggio o mirroring dei dati, niente chiamate dirette a Fantacalcio.it o Supabase.
- Il file Fantazone può essere **stale** o non disponibile. Viene consultato di nuovo ogni **5 minuti solo se la modalità è attiva e la scheda è visibile**. L'ora mostrata è quella della lettura, non dell'aggiornamento effettivo di Fantazone. CORS/accessibilità dal browser di produzione da verificare sul dispositivo.
- Riconciliazione conservativa con nome normalizzato + squadra Serie A. Dati della giornata 12 ispezionati il 23 novembre: 246 righe, 128 nomi della beta abbinati, 121 con voto valido. I record senza voto non diventano SV ufficiali. I punteggi vengono ricalcolati SOLO in memoria nella beta.
- Voto base provvisorio e bonus/malus classici stimati (gol, rigori, assist, giallo, rosso, autogol, gol subiti). **Esclusi** sostituzioni Mantra, assist speciali, porta inviolata, fattore difensivo e regole non presenti nella fonte. Non confondere il fantavoto indicativo con il risultato ufficiale della redazione Napoli.
- Il pulsante "Ripristina Highlightly" reimposta lo snapshot originale. Le due fonti non vengono mescolate. La modalità Fantazone è disattivata di default e non modifica risultati, classifiche, notifiche né database.
- **Diritti**: la visibilità di dati in un repository GitHub non conferisce una licenza di riutilizzo; il repository esterno non presenta una licenza chiara per dati/codice. Per pubblicare un'integrazione stabile rivolta a tutta la lega occorre verificare autorizzazione, provenienza e termini d'uso del fornitore. Questa è un'anteprima tecnica reversibile, non una validazione dei permessi.
