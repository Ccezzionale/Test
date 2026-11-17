# Collaudo Trade Condizionate · 17 novembre 2026

**Ambiente:** repository `Ccezzionale/Test`, Supabase di Lega degli Eroi.
**Metodo:** operazioni SQL eseguite con `SET LOCAL ROLE authenticated` e simulazione verificata di `auth.uid()` per due/tre profili reali già esistenti, più importazioni simulate da fonti ufficiali. Tutte le prove che alterano dati sono state eseguite con `BEGIN ... ROLLBACK`; non sono state inviate proposte, notifiche o push reali.

## Esito: PASS sui test eseguiti

| Area | Risultato verificato |
| --- | --- |
| Sicurezza con feature disabilitata | L'allenatore non può inviare proposte condizionate, modificare direttamente le tabelle dei contratti o abilitare il flag. |
| Offerte | Bartowski invia a Bayern, Bayern accetta o rifiuta, solo il mittente annulla; offerte cancellate/rifiutate non si accettano, nessuna doppia accettazione. |
| Autorizzazioni | Mittente e terza squadra non possono accettare; terza squadra non legge le offerte *pending* grazie a RLS e non può aggiornare una proposta direttamente; quelle accettate sono visibili alla lega. |
| Doppia promessa | Due offerte `pending` possono includere le stesse pick, ma dopo la prima accettazione la seconda viene respinta perché le candidate sono già vincolate. **Test sequenziale**, non carico simultaneo di due connessioni. |
| Pick protette | Anche un aggiornamento diretto dal proprietario del database è bloccato dal trigger finché la pick è candidata vincolata. |
| Contropartita 1:1 | All'accettazione della clausola, la pick di contropartita cambia proprietario una sola volta. |
| Verso contrario | Bartowski può richiedere un diritto posseduto da Bayern: Bayern accetta, il diritto arriva a Bartowski e la contropartita arriva a Bayern. |
| Rivendita | Bayern rivende a Desperados un diritto originato da Bartowski; cambia il titolare, resta il proprietario originario obbligato, rimangono vincolate le candidate; la rivendita scambia una pick 1:1 e produce una riga di storico. |
| Risoluzione dopo rivendita | Bartowski 7° in Conference assegna la propria R5 a Desperados, non a Bayern; R4 resta a Bartowski, entrambi i vincoli vengono rimossi; chiamare di nuovo il resolver non produce un nuovo trasferimento. |
| Draft migliore/peggiore | Tre R1 Golden Knights con posizioni finali ipotetiche 5, 2, 7: `best` assegna quella di posizione 2, `worst` quella di posizione 7. |
| Round Robin fascia centrale | Bartowski 9° su 16 nella simulazione: scatta la pick dedicata alle posizioni intermedie, non quella della fascia alta/bassa. |
| Trofeo specifico | Highlander/Playoff ancora in corso non risolve; dopo finalizzazione Hall of Fame la scelta corretta viene assegnata, tanto per vittoria quanto per sconfitta. |
| Qualsiasi trofeo | Una vittoria ufficiale basta per il ramo positivo; il ramo negativo resta **pending** con 6 trofei su 7 finalizzati e si risolve soltanto alla finalizzazione del settimo. |
| Rettifica Hall of Fame | La riapertura di un trofeo che ha già liquidato un diritto è bloccata, per evitare di invalidare una pick trasferita. |
| Frontend, test isolati | Dieci scenari sul generatore JS di clausole: Conference, verso inverso, migliore/peggiore, trofeo singolo/qualsiasi, rivendita, Round Robin e validazioni negative. Tutti passati. Sintassi JS e riferimenti DOM verificati. |
| Trade miste (test precedenti nella stessa sessione di sviluppo) | Due giocatori di movimento, pick future aggiuntive e chiamate waiver insieme a un diritto. Portiere bloccato con rollback completo della transazione. |

## Notifiche

Le Edge Functions `send-trade-notification`, `broadcast-trade-notification` e `send-conditional-trade-notification` risultano **ACTIVE**.
La tabella `app_notifications` ha i campi attesi (`user_id`, `team_id`, `type`, `title`, `body`, `url`, `event_key`) e indice unico `(user_id,event_key)` per evitare notifiche duplicate. La tabella `push_subscriptions` ha `endpoint`, `p256dh`, `auth` e `is_active`.
**Non sono state eseguite consegne push reali**: serviranno due sessioni browser autenticate, permessi di notifica e un test isolato/controllato quando sarà possibile provarlo senza allertare tutta la lega.

## Limiti dei test e blocchi al go-live

- I profili sono stati impersonati **solo nel contesto SQL della transazione**. Non è stato possibile aprire due sessioni browser effettive con le credenziali dei rispettivi allenatori, quindi **il collaudo end-to-end nell'app non è ancora concluso**.
- Mancano verifiche browser mobile, navigazione, login, contenuto effettivo delle notifiche ricevute e delivery push (e la risoluzione tramite classifica/ordine Draft per gli avvisi server-side).
- Il test del conflitto fra offerte è sequenziale, non è una prova di due accettazioni che gareggiano contemporaneamente su connessioni parallele.
- La modalità mista conserva le limitazioni note: mercato post-Draft, stessa Conference, giocatori con quantità bilanciata, portieri e svincoli differiti non supportati.
- Le RPC SECURITY DEFINER pubbliche per gli utenti autenticati sono intenzionali ma richiedono un audit approfondito dei permessi prima di attivare il mercato.
- Nessun avviso automatico è stato inviato agli allenatori per queste prove.

## Verifica integrità finale

`conditional_feature_settings.enabled = false`; zero offerte condizionate salvate, zero diritti salvati, zero candidate vincolate, zero rivendite registrate, zero finalizzazioni Hall of Fame fittizie per 2026-2027.

**Decisione:** Backend e generatore di clausole superano i test eseguiti, ma il mercato condizionato resta **DISABILITATO** finché non supera il test browser con due sessioni reali e gli avvisi push in ambiente controllato.


## Correzione UX rivendita · 17 novembre 2026

Il motore di rivendita eseguiva correttamente la cessione del diritto, ma la schermata privata dava due impressioni errate:
1. «Rivendi il diritto» precompilava soltanto una nuova proposta; non spiegava che doveva essere inviata e poi accettata dalla franchigia acquirente.
2. Il vecchio titolare perdeva la visibilità del diritto appena venduto, perché la lista mostrava soltanto proprietario obbligato e titolare attuale.

La modalità TEST ora illustra venditore, compratore, prezzo in pick, clausola originale invariata e quattro passaggi per confermare. Il venditore vede il diritto con badge «Venduto · ex titolare» e il suo storico, senza pulsanti per rivendere o liquidare un diritto che non possiede più. Sulle proposte di rivendita ricevute è riportata la clausola originale. La precompilazione svuota anche le vecchie selezioni dei giocatori per non includerle accidentalmente.

La modifica riguarda esclusivamente `trade-conditional-qa.html/js/css`. Nessuna RPC di mercato, nessuna tabella, nessuna notifica push o pick reale è stata toccata. Test isolato della sequenza Bartowski → Bayern → Desperados con diritto ancora vincolato: **11/11 asserzioni superate** (proprietà finale, storico dell'ex titolare, blocco dei pulsanti non autorizzati, clausola originale, contropartita e passaggi guida). L'esecuzione manuale nel browser dell'utente resta da verificare.
