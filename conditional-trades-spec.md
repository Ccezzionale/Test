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

## Condizioni V1 aggiuntive: Premi e trofei (laboratorio)
3. **Vince almeno un trofeo**: una pick se la franchigia indicata vince almeno una delle competizioni ammissibili, un'altra se non vince nulla. Le competizioni in catalogo dell'Albo d'Oro: Playoff, Campionato, Crash Out Cup, Highlander Cup, Conference League, Conference Championship, Round Robin, Supercoppa degli Eroi. Per la franchigia si esclude l'altra Conference. Se una vittoria finale è già ufficiale, la clausola positiva è risolvibile anche con altre competizioni aperte. La clausola negativa è risolvibile **solo quando tutte le competizioni comprese nel contratto sono ufficialmente concluse**.
4. **Vince un trofeo specifico**: una pick in caso di vittoria di quella competizione, una pick in caso contrario. Il sì/no si può determinare solo una volta ufficialmente conclusa quella specifica competizione.
5. **Piazzamento a premio ma senza vittoria**: non confondere con «vince un trofeo». L'Albo d'Oro visualizza anche argento/bronzo, ma da questo non si deduce quali piazzamenti abbiano premi economici. Prima di implementare questa variante servono soglie e competizioni premiate definite dal regolamento.

### Fonte ufficiale da collegare
Al momento trofei e risultati si trovano in aree differenti: playoff_results, highlander_eliminations/highlander_state, crashout_playoff_games, supercoppa_settings, classifiche/risultati. L'Albo d'Oro medagliere.html elenca gli 8 trofei ma è soprattutto una presentazione storica, non un registro di risultati finali consultabile in modo uniforme.
Per la produzione serve un registro unico con stagione, competizione, stato (in corso/definitivo), squadra vincitrice, alimentato dalle sezioni ufficiali. Vietato inferire «non ha vinto» dalla semplice assenza di un risultato. L'insieme delle competizioni ammissibili e la stagione devono essere bloccati al momento dell'accettazione, non cambiare retroattivamente se si aggiungono nuovi tornei.
Il simulatore «Premi / trofei» crea esiti ipotetici solo in memoria. Nessun trofeo viene letto come realmente vinto e nessuna pick viene trasferita.

## Implementazione del 17 novembre 2026 · Stato tecnico
**Backend installato nel Supabase ufficiale, con feature flag DISABILITATO.** La conferma reale delle trade condizionate non è ancora aperta agli allenatori.
File migration versionati nella repository Test:
- sql/conditional_trade_backend_v1.sql: sette tabelle diritti, offerte, candidate, storico e risultati finali; RLS e trigger blocco pick.
- sql/conditional_trade_atomic_offers_v2.sql: RPC di proposta, accettazione atomica 1:1, rifiuto, annullamento e rivendita, compatibilità intra-Conference.
- sql/conditional_trade_feature_gate_v2b.sql: interruttore conditional_feature_settings.enabled=false che blocca tutte le scritture contrattuali.
- sql/conditional_trade_final_settlement_v3.sql: risoluzione automatica solo dopo snapshot definitivi, svincolo delle candidate non assegnate.
- sql/conditional_regular_results_bridge_v4.sql: completamento classifica Conference (14 risultati validi per ciascuna delle 16 squadre), Round Robin (15 per squadra), ordine Draft a serpentina quando entrambe le fasi sono complete.
- sql/conditional_highlander_outcomes_bridge_v5.sql: vincitore Highlander soltanto con N-1 eliminazioni e unica franchigia superstite.
UI introdotta: trade-conditional-addon.js/.css in trade-room.html con pulsanti Trade classica/condizionata, creazione clausole, proposte e diritti. conditional-draft-projections.js/.css in dinamico-draft.html con proiezione della scelta seguendo l'algoritmo di classifica ufficiale senza modificare la proprietà.
Test SQL TRANSACTION + ROLLBACK: Bartowski offre R4/R5, Bayern accetta, vengono vincolate 2 candidate; con posizione finale 7 in Conference viene assegnata R5 a Bayern e le candidate si sbloccano; la transazione viene annullata e non lascia alcuna trade nel database.
**DA COMPLETARE prima di abilitare**: import automatico e affidabile di finali Playoff, Crash Out, Supercoppa, Campionato e trofei Conference/Round Robin; tabelle esiti finali per quelle competizioni; end-to-end browser test autenticati per due squadre, permessi non autorizzati e doppia offerta; notifiche per le nuove proposte; eventuale traduzione delle trade condizionate tra diverse Conferences nel sistema bonus; esperienza di composizione mista con calciatori/chiamate; audit fonte dati di classifica e riconciliazione in caso di correzioni dopo una finale.
**Sicurezza**: funzione di mercato verifica esplicitamente conditional_feature_settings.enabled prima di ogni operazione; niente contratti effettivi finché false. Le tabelle hanno RLS e non consentono INSERT/UPDATE diretti ai coach. Le RPC SECURITY DEFINER sono intenzionalmente esposte solo agli autenticati con controlli espliciti di squadra, mercato, possesso; l'advisor segnala tali RPC come WARNING intenzionale.
