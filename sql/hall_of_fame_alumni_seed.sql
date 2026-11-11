-- Importazione non distruttiva: franchigie storiche documentate nell'Albo d'Oro
-- e non più presenti nella Lega secondo l'elenco storico aggiornato.
-- Non inserisce le franchigie attualmente in attività e non duplica quelle già salvate.
-- Il campo stagioni di partecipazione resta NULL perché il solo Albo non ne prova la durata.
WITH alumni_seed(name, logo_url, description, epitaph, sort_order) AS (
  VALUES
  ('Costantinobull', 'img/Costantinobull.png', 'Nel 2023–24 ha conquistato Campionato, Conference Championship e Playoff: tre titoli che ne fanno una delle franchigie più decorate della storia degli Eroi.', 'Tre titoli in una stagione. Una traccia difficile da cancellare.', 0),
  ('Pollisti', 'img/Pollisti.png', 'Nel 2022/23 conquistarono Campionato e Playoff. Anche nel 2023/24 tornarono sul podio, confermandosi tra i protagonisti delle prime stagioni.', 'La doppietta è finita. La bacheca no.', 10),
  ('Real Mimmo', 'img/Real Mimmo.png', 'Campione Highlander nel 2023/24, con cinque piazzamenti sul podio registrati nell''Albo d''Oro. Sopravvivere era diventata un''arte.', 'L''ultimo superstite, almeno una volta.', 20),
  ('Rubinkebab', 'img/Rubinkebab.png', 'Quattro titoli ufficiali: Campionato, Conference Championship, Round Robin e Supercoppa degli Eroi. Una franchigia che ha lasciato una bacheca tutt''altro che vuota.', 'Il kebab se ne va. Le coppe restano.', 30),
  ('I Cugini di Zampagna', 'img/I Cugini di Zampagna.png', 'Nel 2022/23 conquistarono il terzo posto in Campionato e il secondo nei Playoff. Due podi in una stagione da ricordare.', 'I cugini se ne sono andati. L''argento è rimasto.', 50),
  ('Union Librino', 'img/Union Librino.png', 'Terzo posto nell''Highlander 2024/25: un podio conquistato nella competizione in cui sopravvivere vale tutto.', 'Non l''ultimo superstite, ma uno degli ultimi tre.', 60),
  ('3 Amici al Var', 'img/3 Amici al Var.png', 'Secondo posto nella Conference League 2023/24. Il titolo sfuggì, ma l''argento rimane nell''Albo d''Oro.', 'Tre amici, un argento, nessuna revisione possibile.', 70),
  ('Giody', 'img/Giody.png', 'Terzo nella Conference Championship 2024/25. Una medaglia nell''archivio della Lega degli Eroi che merita di essere ricordata.', 'Non tutti i podi hanno bisogno di una coppa.', 90)
),
honours AS (
  SELECT lower(btrim(team_name)) AS normalized_name,
         count(*) FILTER (WHERE position=1)::integer AS gold,
         min(position)::integer AS best_position,
         string_agg(
           competition_name || ' (' || season || '): ' || position || '° posto',
           '; ' ORDER BY season, competition_name
         ) AS history
  FROM public.hall_of_fame_honours
  GROUP BY lower(btrim(team_name))
)
INSERT INTO public.hall_of_fame_alumni
  (name, seasons, trophy_count, best_finish, logo_url, description,
   epitaph, story, sort_order, published)
SELECT s.name,
       NULL,
       h.gold,
       CASE h.best_position WHEN 1 THEN '1° posto' WHEN 2 THEN '2° posto'
            WHEN 3 THEN '3° posto' ELSE h.best_position::text || '° posto' END,
       s.logo_url,
       s.description,
       s.epitaph,
       'Risultati ufficiali registrati nell’Albo d’Oro: ' || h.history || '.',
       s.sort_order,
       true
FROM alumni_seed s
JOIN honours h ON h.normalized_name=lower(s.name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hall_of_fame_alumni a
  WHERE lower(btrim(a.name))=lower(btrim(s.name))
)
RETURNING name, trophy_count, best_finish, logo_url, published;
