/* REAL LEGENDS - shared, presentation-only team image registry. */
(() => {
  'use strict';
  const aliases = {
    'team bartowski':'team-bartowski','bartowski':'team-bartowski',
    'golden knights':'golden-knights','golden':'golden-knights',
    'atletico leon':'atletico-leon','atletico leon fc':'atletico-leon','atlético leon':'atletico-leon',
    'bayern christiansen':'bayern-christiansen',
    'pandinicoccolosini':'pandini','pandinicoccolosini fc':'pandini','pandini':'pandini',
    'riverfilo':'riverfilo','fantaugusta':'fantaugusta','fantaaugusta':'fantaugusta',
    'athletic pongao':'athletic-pongao','athletic pongao fc':'athletic-pongao','pongao':'athletic-pongao',
    'desperados':'desperados','fc disoneste':'fc-disoneste','disoneste':'fc-disoneste',
    'minnesode timberland':'minnesode-timberland','minnesode':'minnesode-timberland',
    'minnesota snakes':'minnesota-snakes','minnesota snake':'minnesota-snakes','snakes':'minnesota-snakes',
    'wildboys':'wild-boys','wild boys':'wild-boys','wildboyz':'wild-boys','wildboys fc':'wild-boys','wild boys fc':'wild-boys',
    'pokermantra':'pokermantra','ibla':'ibla-fc','ibla fc':'ibla-fc',
    'eintracht franco':'eintracht-franco-126','eintracht franco 126':'eintracht-franco-126','eintracht':'eintracht-franco-126'
  };
  const palette = {
    'team-bartowski':'#e3344f','golden-knights':'#efb948','atletico-leon':'#30a37b',
    'bayern-christiansen':'#36a9ff','pandini':'#65ba78','riverfilo':'#45c5e9',
    'fantaugusta':'#36b78c','athletic-pongao':'#f66b55','desperados':'#b9bcba',
    'fc-disoneste':'#d96aff','minnesode-timberland':'#ff9644','minnesota-snakes':'#ad75ef',
    'wild-boys':'#74b9ff','pokermantra':'#d15dff','ibla-fc':'#dab177','eintracht-franco-126':'#f46b68'
  };
  function clean(v) {
    return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/^\s*#?\d+\s*[°º]?\s*/,'').replace(/[^a-z0-9 ]/gi,' ')
      .replace(/\s+/g,' ').trim().toLowerCase();
  }
  function slug(team) {
    const c=clean(team);
    if (/wild\s*boy(?:s|z)?/.test(c)) return 'wild-boys';
    return aliases[c] || null;
  }
  const image = name => {
    const key = slug(name);
    return key ? 'img/playoff-real-legends/'+key+'.webp' : null;
  };
  window.PlayoffRealLegends={slug,image,palette,color:name=>palette[slug(name)]||'#33b6ff'};
})();
