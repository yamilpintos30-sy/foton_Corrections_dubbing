/* Modo «ver entera»: la película completa con el audio doblado; O conmuta al audio original (un <audio> aparte,
   sincronizado al mismo instante, sin recargar). Al pausar aparece un cuadro para marcar lo que está mal con el
   tiempo ya puesto. Las marcas se guardan en el servidor (API de correcciones, como puntos nuevos del corrector). */
(function () {
  const P = PELICULA;
  const CATS = ['eco', 'se oye inglés', 'acento España', 'desfasado', 'texto mal', 'volumen', 'otro'];
  const KEY = 'foton-corrector', KPOS = 'foton-pos-' + P.slug;
  const $ = id => document.getElementById(id);
  const v = $('v'), a = $('a'), lista = $('lista'), marca = $('marca'), nota = $('nota');
  const fmt = s => { const neg = s < 0; s = Math.max(0, s); const t = Math.floor(s), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), x = t % 60;
    return (neg ? '-' : '') + (h ? h + ':' : '') + String(m).padStart(h ? 2 : 1, '0') + ':' + String(x).padStart(2, '0'); };
  const fmtD = s => fmt(s) + '.' + Math.floor((s % 1) * 10);
  let quien = ''; try { quien = localStorage.getItem(KEY) || ''; } catch (e) {}
  let lang = 'dob', silencioso = false, esperando = false, cat = null;
  const marcas = [];                      // {nuevo_id, tiempo, categoria, nota, idioma}

  function estado(m, mal) { const e = $('estado'); e.textContent = m; e.className = 'k' + (mal ? ' mal' : ''); if (!mal) setTimeout(() => { if (e.textContent === m) e.textContent = ''; }, 3000); }
  async function enviar(fila) {
    try {
      const r = await fetch('/api/' + P.slug + '/correcciones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ corrector: quien }, fila)) });
      if (!r.ok) throw new Error(await r.text());
      estado('guardado ✓'); return true;
    } catch (e) { estado('NO SE GUARDÓ: ' + e.message, true); return false; }
  }
  async function cargarMarcas() {
    try {
      const r = await fetch('/api/' + P.slug + '/correcciones?corrector=' + encodeURIComponent(quien));
      for (const f of await r.json()) {
        if (f.corrector !== quien || !f.nuevo_id) continue;
        marcas.push({ nuevo_id: f.nuevo_id, tiempo: f.tiempo, categoria: f.categoria || '', nota: f.nota || '', idioma: f.idioma });
      }
    } catch (e) { estado('no pude leer tus marcas anteriores', true); }
  }

  // ---------- audio: doblada (el del video) / original (el <audio>) ----------
  function pintarIdioma() {
    const e = $('a-idioma'); e.textContent = lang === 'dob' ? P.doblada.nombre : P.original.nombre; e.className = 'idioma ' + lang;
    $('conm').textContent = lang === 'dob' ? 'O · Conmutar a ORIGINAL' : 'O · Conmutar a DOBLADA';
    $('m-idioma').textContent = 'escuchando: ' + (lang === 'dob' ? 'DOBLADA' : 'ORIGINAL');
  }
  function conmutar() {
    lang = lang === 'dob' ? 'ori' : 'dob';
    if (lang === 'ori') { a.currentTime = v.currentTime; a.playbackRate = v.playbackRate; v.muted = true; if (!v.paused) a.play().catch(() => {}); }
    else { a.pause(); v.muted = false; }
    pintarIdioma();
  }
  // reposicionar el original SÓLO si se corrió: cada salto lo hace esperar (waiting) y eso pausa el video
  const alinear = () => { if (Math.abs(a.currentTime - v.currentTime) > 0.3) a.currentTime = v.currentTime; };
  // desfase chico (40-300 ms): se corrige con la velocidad del original (±5 %), sin saltar
  function afinar() {
    const d = a.currentTime - v.currentTime;
    if (Math.abs(d) > 0.3) { a.currentTime = v.currentTime; a.playbackRate = v.playbackRate; }
    else if (Math.abs(d) > 0.04) a.playbackRate = v.playbackRate * (d > 0 ? 0.95 : 1.05);
    else if (a.playbackRate !== v.playbackRate) a.playbackRate = v.playbackRate;
  }
  v.addEventListener('play', () => { cerrarPanel(); if (lang === 'ori') { alinear(); a.play().catch(() => {}); } });
  // el evento «pause» llega DESPUÉS de v.pause(): la bandera la consume el evento, no el que pausa
  v.addEventListener('pause', () => { a.pause(); if (silencioso) { silencioso = false; return; } if (!v.ended) abrirPanel(); });
  v.addEventListener('seeked', () => { if (lang === 'ori') alinear(); if (!marca.hidden) $('m-t').textContent = fmtD(v.currentTime); });
  v.addEventListener('ratechange', () => { a.playbackRate = v.playbackRate; });
  v.addEventListener('volumechange', () => { a.volume = v.volume; });
  v.addEventListener('error', () => estado('No se pudo abrir el video ' + P.doblada.archivo, true));
  a.addEventListener('error', () => estado('No se pudo abrir el audio original ' + P.original.archivo, true));
  // el original se quedó cargando: se espera con el video quieto (sin abrir el cuadro) y se sigue solo
  a.addEventListener('waiting', () => { if (lang === 'ori' && !v.paused) { esperando = true; silencioso = true; v.pause(); estado('cargando el original…'); } });
  a.addEventListener('canplay', () => { if (esperando) { esperando = false; v.play().catch(() => {}); } });
  setInterval(() => {
    if (lang === 'ori' && !v.paused && !a.paused && !a.seeking) afinar();
    if (!v.paused && v.currentTime > 5) { try { localStorage.setItem(KPOS, String(Math.floor(v.currentTime))); } catch (e) {} }
  }, 250);

  // ---------- cuadro de marca (al pausar) ----------
  const cats = $('cats');
  CATS.forEach((c, i) => { const b = document.createElement('button'); b.className = 'cat'; b.dataset.c = c; b.textContent = (i + 1) + ' · ' + c;
    b.onclick = () => elegir(c); cats.appendChild(b); });
  function elegir(c) { cat = cat === c ? null : c; cats.querySelectorAll('.cat').forEach(b => b.classList.toggle('sel', b.dataset.c === cat)); nota.focus(); }
  function abrirPanel() {
    cat = null; nota.value = ''; cats.querySelectorAll('.cat').forEach(b => b.classList.remove('sel'));
    $('m-t').textContent = fmtD(v.currentTime); marca.hidden = false; pintarIdioma(); nota.focus();
  }
  function cerrarPanel() { marca.hidden = true; nota.blur(); }
  async function guardar() {
    const t = Math.round(v.currentTime * 10) / 10, n = nota.value.trim();
    if (!cat && !n) { cerrarPanel(); v.play().catch(() => {}); return; }      // Enter vacío = seguir sin marcar
    const m = { nuevo_id: Date.now().toString(36), tiempo: t, categoria: cat || '', nota: n, idioma: lang };
    marcas.push(m); pintarLista();
    await enviar({ nuevo_id: m.nuevo_id, tiempo: t, idioma: lang, veredicto: 'MAL', categoria: m.categoria, nota: n });
    v.play().catch(() => {});
  }
  function mover(d) { v.currentTime = Math.max(0, Math.min(v.duration || 1e9, v.currentTime + d)); }
  $('m-guardar').onclick = guardar; $('m-cerrar').onclick = cerrarPanel;
  $('m-menos').onclick = () => mover(-1); $('m-mas').onclick = () => mover(1);
  nota.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); guardar(); }
    else if (e.key === 'Escape') { cerrarPanel(); }
    else if (!nota.value && /^[1-7]$/.test(e.key)) { e.preventDefault(); elegir(CATS[+e.key - 1]); }
    e.stopPropagation();
  });

  // ---------- lista de mis marcas ----------
  function pintarLista() {
    marcas.sort((x, y) => x.tiempo - y.tiempo);
    lista.innerHTML = ''; const h = document.createElement('h2'); h.textContent = 'Mis marcas'; lista.appendChild(h);
    if (!marcas.length) { const p = document.createElement('p'); p.className = 'k vacio'; p.textContent = 'Todavía ninguna. Pausá donde oigas algo mal.'; lista.appendChild(p); }
    marcas.forEach(m => {
      const d = document.createElement('div'); d.className = 'item';
      const tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = fmt(m.tiempo);
      const tx = document.createElement('span'); tx.className = 'tx';
      if (m.categoria) { const c = document.createElement('b'); c.textContent = m.categoria; tx.appendChild(c); }
      if (m.nota) tx.appendChild(document.createTextNode((m.categoria ? ' · ' : '') + m.nota));
      const x = document.createElement('button'); x.className = 'mini borrar'; x.title = 'borrar esta marca'; x.textContent = '✕';
      x.onclick = async ev => { ev.stopPropagation(); if (!confirm('¿Borrar la marca de ' + fmt(m.tiempo) + '?')) return;
        marcas.splice(marcas.indexOf(m), 1); pintarLista(); await enviar({ nuevo_id: m.nuevo_id, tiempo: m.tiempo, veredicto: 'MAL', borrado: true }); };
      d.append(tm, tx, x);
      d.onclick = () => { v.currentTime = Math.max(0, m.tiempo - 3); v.play().catch(() => {}); };
      lista.appendChild(d);
    });
    $('prog').textContent = marcas.length + (marcas.length === 1 ? ' marca' : ' marcas');
  }

  // ---------- teclado ----------
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); v.paused ? v.play().catch(() => {}) : v.pause(); }
    else if (k === 'o') conmutar();
    else if (e.key === 'ArrowLeft') { e.preventDefault(); mover(-5); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); mover(5); }
    else if (e.key === 'Escape') cerrarPanel();
    else if (e.key === 'Home') { e.preventDefault(); v.currentTime = 0; }
  });
  $('conm').onclick = conmutar;

  // ---------- inicio ----------
  v.src = '/videos/' + P.doblada.archivo; a.src = '/videos/' + P.original.archivo;
  $('nombre').value = quien;
  $('empezar').onclick = async () => {
    quien = $('nombre').value.trim(); if (!quien) { $('nombre').focus(); return; }
    try { localStorage.setItem(KEY, quien); } catch (e) {}
    $('quien').textContent = 'Corrector: ' + quien; $('inicio').remove();
    await cargarMarcas(); pintarLista();
    let pos = 0; try { pos = +(localStorage.getItem(KPOS) || 0); } catch (e) {}
    const arrancar = () => { if (pos > 10) { v.currentTime = pos; estado('seguís donde quedaste (' + fmt(pos) + ') · tecla Inicio = desde el principio'); } v.play().catch(() => {}); };
    if (v.readyState >= 1) arrancar(); else v.addEventListener('loadedmetadata', arrancar, { once: true });
  };
  $('nombre').addEventListener('keydown', e => { if (e.key === 'Enter') $('empezar').click(); e.stopPropagation(); });
  pintarLista(); pintarIdioma();
})();
