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

## Aggiornamento 17/11/2026: Hall of Fame come fonte ufficiale dei trofei
Questa sezione sostituisce le note precedenti sulla mancanza di un registro unico dei vincitori.
- La pagina Hall of Fame ha **già** il flusso amministrativo RPC `hof_finalize_competition` → tabella `hall_of_fame_finalizations` (stagione `YYYY-YYYY`, `competition_key`, podio JSON con `position=1`, timestamp). La finalizzazione viene effettuata dal Commissioner/Admin e aggiorna contestualmente `hall_of_fame_honours`.
- Il nuovo bridge SQL `conditional_hall_of_fame_authority_v7.sql`, con correzioni v7b/v7c, legge quelle finalizzazioni e sincronizza `conditional_official_trophies`. La stagione `2026-2027` alimenta i diritti per il Draft 2027; anche dopo il cambio di stagione mercato, i diritti precedenti non vengono abbandonati.
- Mappatura integrale degli 8 trofei: Playoff, Campionato, Crash Out Cup (`crash_out_cup` → `crash_out`), Highlander, Conference League/Championship, Round Robin, Supercoppa.
- Sono stati DISATTIVATI i precedenti trigger di pubblicazione automatica dei trofei dalla classifica e dalle eliminazioni Highlander, per evitare verdetti concorrenti. Le classifiche e il Draft Dinamico restano fonti delle **proiezioni**, ma il trofeo diventa definitivo soltanto alla finalizzazione Hall of Fame.
- Riapertura Hall of Fame prima del regolamento del diritto: il registro torna `in_progress` con vincitore nullo. Se un diritto trofeo ha **già** liquidato una pick, la riapertura/correzione viene impedita per evitare di invalidare retroattivamente scambi conclusi; serve rettifica amministrativa documentata.
- Test eseguito con transazione e ROLLBACK: Bartowski offre a Bayern R4 in caso di vittoria Highlander e R5 in caso contrario; Bayern accetta, Hall of Fame conferma Bartowski vincitore Highlander, il diritto si risolve e la R4 viene trasferita a Bayern, liberando i vincoli. Nessun dato di test rimane memorizzato.
- Il flag `conditional_feature_settings.enabled` resta **false**. Le trade condizionate non sono ancora operative per le franchigie. Da completare test browser autenticati, notifiche e compatibilità con scambi misti/cross-Conference prima dell'abilitazione.

## Integrazione Trade Room e notifiche · 17/11/2026
- Le notifiche delle trade standard erano già operative nelle Edge Functions `send-trade-notification` e `broadcast-trade-notification`: **non modificate**.
- Nuova Edge Function isolata `send-conditional-trade-notification` (sorgente in `supabase/functions/send-conditional-trade-notification/index.ts`) che verifica utente, franchigia, stato del contratto e feature flag. Usa `app_notifications`, `push_subscriptions` e `trade-room.html` come destinazione.
- `trade-conditional-addon.js` avvia gli avvisi dopo `conditional_create_offer`, `conditional_respond_offer` e `conditional_cancel_offer`: proposta (al destinatario), accettazione (broadcast di lega), rifiuto (al mittente), annullamento (al destinatario). La notifica non modifica lo stato della trade e non deve impedire la riuscita dell'operazione.
- La finalizzazione nella Hall of Fame (`hall-of-fame-live.js`) richiede, solo con flag attivo, gli avvisi di risoluzione relativi ai diritti liquidati dall'ultima finalizzazione del trofeo. Gli avvisi dei diritti liquidati dalle sole classifiche/ordine del Draft sono ancora da coprire con una consegna server-side affidabile.
- La compilazione del contratto è raggiungibile direttamente dalle colonne `TU OFFRI` / `TU CHIEDI` nella Trade Room (pulsanti `Pick condizionata`), con verso già selezionato. La proposta e la schermata del destinatario mostrano le scelte dovute per ciascun esito.
- Le **trade miste** (giocatori, chiamate, pick condizionate nello stesso contratto) non sono ancora supportate dal backend transazionale. La UI segnala il limite esplicitamente: il cambio di modalità non fonde gli asset già selezionati nelle trade classiche.
- **Flag di attivazione ancora false**. Non eseguire test con invii reali né promettere avvisi push consegnati finché non sono stati collaudati con due account di franchigia.

## Trade miste condizionate · implementazione 17/11/2026
**Implementate in modalità collaudo con feature flag DISABILITATO.** Il diritto condizionato può essere confezionato nello stesso contratto con giocatori di movimento, altre pick future e chiamate waiver. Nell'app la Trade Room presenta due selettori di asset aggiuntivi (da chi propone / dall'altra squadra), filtri per tipo e ricerca, un riepilogo completo prima dell'invio, una sola voce in Movimenti e le notifiche del contratto.
Le nuove RPC e migration versionate in repository:
- `conditional_trade_mixed_assets_v8.sql`: colonna `conditional_trade_offers.mixed_assets` e collegamento a `mixed_legacy_trade_id`, RPC `conditional_create_mixed_offer` e funzione che riusa il motore classico `accept_trade` senza riscriverne le regole.
- `conditional_respond_mixed_atomic_v8b.sql`: la conferma del destinatario esegue la gamba classica e la gamba condizionata nella medesima transazione; errori e svincoli non immediatamente eseguibili annullano tutto.
- `conditional_trade_mixed_postconditions_v8c.sql`: verifica il cambio del proprietario effettivo dopo il motore classico; un portiere in un test rimaneva presso la squadra precedente per via delle regole speciali di blocco. Ora è un errore transazionale anziché un falso successo.
- `conditional_trade_waiver_picker_v8d.sql`: RPC lettura delle chiamate negoziabili di entrambe le squadre, autorizzata solo fra squadre della stessa Conference.
- `conditional_trade_mixed_concurrency_v8e.sql`: lock dei giocatori e delle pick extra prima della convalida, più advisory lock delle chiamate waiver, per evitare che un'altra trade modifichi il possesso durante il controllo.
Limiti di questa versione: **solo mercato post-Draft**, **solo intra-Conference**, **numero giocatori uguale sui due lati (nessuno svincolo differito)**, portieri esclusi dal picker misto fino all'integrazione dei blocchi portieri. Il singolo diritto condizionato e la sua contropartita contano sempre 1:1; eventuali altre pick future hanno un 1:1 aggiuntivo. Le chiamate seguono le validazioni waiver già esistenti.
Test Supabase con `BEGIN`/`ROLLBACK`: (1) Bartowski e Bayern: due giocatori di movimento + R4/R5 condizionate + contropartita, tutto trasferito/bloccato correttamente; (2) due ulteriori pick future scambiate 1:1 insieme al diritto; (3) chiamata waiver ceduta insieme al diritto; (4) portiere Butez non trasferito dal motore classico: il nuovo controllo blocca l'intero contratto e non lascia dati. Nessun test ha modificato rose, chiamate, trade o pick reali.
**Non si può ancora attivare il flag** senza test end-to-end da browser con due coach, verifica di invio push su contratto reale, collaudo di revoca/riapertura e completamento delle regole su svincoli, portieri e fase Draft se richieste.

## Attivazione monitorata · 17/11/2026

La Trade Room reale adesso ha il flag `conditional_feature_settings.enabled = true` durante la finestra ufficiale del mercato (attualmente fino al 21/11/2026, 12:00 CET). La sezione condizionata è disponibile agli allenatori **della stessa Conference**, con 4 condizioni e accordi misti bilanciati. Le trade classiche non sono state sostituite. L'accesso TEST con simulazione rimane separato.

- Venditore: può vendere un diritto acquisito. Acquirente: può scoprire un diritto attivo di un'altra franchigia e **proporne l'acquisto**; la controparte deve accettare. La contropartita 1:1 viene sempre dal compratore.
- Tutte le accettazioni attraversano la nuova verifica transazionale `conditional_trade_review_after_accept` (migrazioni `conditional_trade_live_review_v9*`): controllo proprietario contropartita, identità del titolare, numero e proprietà delle candidate vincolate, e storico della rivendita. Le incongruenze annullano l'operazione atomica.
- Per ogni offerta **accettata**, il trigger crea `conditional_trade_reviews` con snapshot della clausola, stato `pending` e controllo `ok`. Gli admin ricevono una notifica nel centro notifiche (non un push garantito). Il pannello **Controllo iniziale delle trade condizionate** nella Trade Room mostra ogni contratto; la revisione manuale viene registrata dall'RPC `conditional_mark_offer_reviewed` con ruolo admin/commissioner, senza modificare asset o titolari.
- Le notifiche commerciali di offerta, accettazione, rifiuto e annullamento usano la Edge Function già attiva `send-conditional-trade-notification`, con identità e stato verificati sul server. La consegna push ai dispositivi reali non è stata collaudata in questa sessione.
- Test SQL con `BEGIN ... ROLLBACK` eseguiti per creazione/accettazione, proposta di acquisto Desperados→Bayern, rivendita Bayern→Desperados, scambio misto con pick aggiuntive, blocchi delle candidate e registro di controllo con conferma admin. Zero proposte/pick vincolate di prova persistite.
- Rimane **da verificare il flusso completo su due sessioni browser reali** e la consegna push. La revisione admin è un monitoraggio successivo alla conclusione, non un'autorizzazione preventiva; il trigger automatico è il controllo di sicurezza vincolante.
- Restrizioni iniziali: niente inter-Conference; niente portieri o svincoli differiti negli scambi misti; il sistema segue sempre l'apertura e chiusura del mercato classico.

Le indicazioni di collaudo e di feature disabilitata nelle sezioni storiche precedenti di questo documento descrivono lo **stato antecedente al 17/11/2026**.

## Correzione 19/11/2026: giocatori sempre secondo il mercato normale

**Regola confermata:** soltanto la pick futura assegnata dalla clausola è condizionata. Giocatori, altre pick scambiabili e chiamate waiver seguono le procedure del mercato classico. Le trade miste possono essere 3↔2, 2↔1 ecc. Senza svincoli i giocatori passano immediatamente all'accettazione; con svincoli obbligatori seguono lo stato `accepted_pending_cuts` del motore classico, si trasferiscono automaticamente alla chiusura degli svincoli e generano le chiamate compensative previste.

- SQL: `conditional_mixed_classic_cuts_bridge_v10.sql` + fix trigger `conditional_mixed_classic_cuts_bridge_v10b_fix_guard.sql`. Il contratto condizionato entra in `accepted_pending_cuts`, il diritto resta `pending_cuts`, le pick candidate sono bloccate e la contropartita è riservata. Il diritto non può essere liquidato o rivenduto mentre si attendono svincoli.
- App: se è richiesta una cessione di giocatori con numeri differenti, il destinatario accetta e chi deve svincolare può aprire direttamente il modal della trade normale da «Proposte»; l'UI del mercato classico mostra anche la procedura e aggiorna entrambe le sezioni quando lo svincolo termina.
- Chiusura atomica: `cut_trade_players` richiama `complete_trade_after_cuts`; il nuovo trigger collega l'accettazione del mercato classico con trasferimento della R di contropartita, attivazione del diritto, audit admin e sblocco solo futuro della pick condizionata. L'esito concreto della scelta attende ancora la classifica, il Draft o la Hall of Fame.
- **Test rollback**: dati reali Golden Knights→PokerMantra 3 giocatori contro 2 (Ederson D.S., Simeone, Conceição / Calò, Thuram), migliore fra tre R1 contro R4, svincolo PokerMantra; risultato **PASS** con 3 giocatori Golden trasferiti, 2 Poker trasferiti, compensativa Golden, 3 R1 vincolate, R4 assegnata al venditore e audit, nessuna modifica persistita. **PASS** anche scegliendo come svincolato un giocatore appena ricevuto, come nel mercato classico. Test 2↔2 immediato **PASS**, senza svincoli o compensative. File rollback: `sql/qa_conditional_mixed_3v2_rollback_v10.sql`.

Il blocco «niente svincoli differiti» descritto in `conditional_trade_mixed_assets_v8.sql` è uno stato storico superato da v10. La sicurezza delle trade ufficiali resta transazionale, con verifiche automatiche e revisione admin già presente.
