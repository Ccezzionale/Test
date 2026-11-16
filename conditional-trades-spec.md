# Trade Condizionate · Specifica tecnica (laboratorio)

Stato: **simulatore read-only** su \`trade-conditions-lab.html\`. Nessuna tabella o RPC della produzione è stata modificata.

## Concetti concordati
- Una condizione dà diritto a **una sola pick futura**, anche quando sono coinvolte più candidate.
- Il diritto può essere rivenduto a terzi (esempio: Bayern → Desperados) senza cambiare l'obbligo originario né richiedere il permesso del debitore.
- Ogni vendita del diritto **conta come una pick** ai fini del rapporto futuro-pick 1:1; una contropartita in pick/diritti è obbligatoria.
- Le candidate non possono essere promesse o trasferite individualmente ad altri mentre il diritto è attivo.
- Una volta disponibile il risultato ufficiale si trasferisce **la sola pick dovuta** al titolare corrente, e si liberano le altre.
- Nessuna approvazione del Commissioner nella normale esecuzione.
- Le restrizioni di Conference sono le stesse degli scambi tradizionali.

## Condizioni V1
1. **Classifica**: top N → pick A; bottom M → pick B; posizioni intermedie → pick esplicita. Fasce sovrapposte non consentite senza regola di precedenza. La classifica di riferimento (totale/conference, stagione) dev'essere identificabile e definitiva.
2. **Migliore/peggiore del gruppo**: insieme di pick della stessa stagione, round e titolare iniziale; si valuta la posizione **assoluta nel Draft del relativo round**, non la posizione in campionato del titolare. Vincente = minimo, peggiore = massimo. Parità impossibile se le posizioni ufficiali sono univoche.

## Database attuale verificato
- \`future_draft_picks\`: \`id\`, \`season\`, \`draft_name\`, \`round\`, \`original_team_id\`, \`owner_team_id\`, \`pick_kind\`, \`status\`.
- \`trade_proposals\` e \`trade_assets\` conservano le trade. \`accept_trade(uuid)\` verifica 1:1 contando oggi solo \`asset_type='future_pick'\`.
- \`complete_trade_after_cuts(uuid)\` chiama \`move_future_pick_for_trade(...)\`, gestendo conversione inter-Conference.
- I risultati sono in \`fantacalcio_results\`; la pagina classifiche usa \`results-source.js\` e \`classifiche-auto.js\`. Non esiste oggi una tabella \`final_standings\` nel database.
- Golden Knights ha tre pick R1 per il Draft 2027, di origine Golden, Eintracht Franco 126 e Riverfilo.
- Bartowski ha una propria R4 e una propria R5 2027.
- La versione classica della Trade Room è disponibile come rollback.

## Modello necessario prima della produzione
- \`conditional_rights\`: ID, stagione, draft, squadra che promette, titolare corrente, tipo, clausole strutturate, stato, \`source_trade_id\`, \`resolved_pick_id\`.
- \`conditional_right_candidates\`: legame ID diritto ↔ ID pick, ramo della condizione, data di svincolo. Vincolo **UNIQUE parziale sui pick_id ancora impegnati**.
- \`conditional_right_transfers\`: traccia immutabile di ogni rivendita collegata alla trade accettata.
- \`official_outcomes\` o adattatore alla fonte ufficiale della classifica/ordine Draft, con versione definitiva e data di chiusura.
- Trigger su \`future_draft_picks\` che impedisce modifiche incompatibili alla proprietà delle candidate finché vincolate.
- RPC transazionali di accettazione, trasferimento e risoluzione con controlli sull'utente autenticato e idempotenza. Non concedere client-side INSERT/UPDATE diretti alle tabelle dei diritti.
- Protezioni per offerte simultanee, possesso cambiato prima dell'accettazione e doppia promessa dello stesso ID pick.
- Integrare i diritti nella funzione ufficiale \`accept_trade\` e nel completamento svincoli, anziché duplicare le regole su U21/portieri/P6/waiver.

## Test obbligatori prima dell'attivazione
- Creazione Barton/Bayern con fasce di classifica e contropartita 1:1; posizioni alte, basse e intermedie.
- Tre pick Golden, migliore e peggiore, confronto su ordine Draft definitivo.
- Due offerte concorrenti sulla stessa pick: solo una deve poter essere accettata.
- Revendita Bayern → Desperados con tracciamento e contropartita.
- Trasferimento singolo pick candidato bloccato mentre il diritto è attivo.
- Risoluzione una volta sola; candidato non scelto torna libero.
- Conference, stato mercato, deadline, svincoli, notifiche, eventuale conversione di una pick inter-Conference.
- Esito fonte non definitivo: **nessuna risoluzione**, nessuna approvazione fittizia.

## Limiti dell'attuale simulatore
- Legge le pick reali dal database ma **non scrive** su Supabase.
- Le posizioni finali sono impostate manualmente nell'interfaccia come **dati ipotetici**. Il simulatore non dichiara finali i risultati.
- Le protezioni mostrate sono visive/in memoria e non incidono sul mercato reale.
- Le contropartite 1:1 sono verificate nella simulazione; nessuna proposta reale è inviata.
