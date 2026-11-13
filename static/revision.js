/* Reproductor de revisión: puntos marcados, conmutación doblada/original en el mismo instante,
   marcas guardadas en el servidor por corrector. */
(function () {
  const P = PELICULA, PAD = 5;
  const SEC = { A: 'A · debería estar arreglado', B: 'B · para mirar', C: 'C · ya sabemos que suena así', D: 'D · agregado después', N: 'N · marcado por el corrector' };
  const SRC = { dob: { nombre: P.doblada.nombre, archivo: '/videos/' + P.doblada.archivo, cls: 'dob' },
                ori: { nombre: P.original.nombre, archivo: '/videos/' + P.original.archivo, cls: 'ori' } };
  // cortes de la limpieza (tiempos del original): doblada -> original y original -> doblada
  const CORTES = P.cortes || [];
  function aOriginal(t) { let acc = 0; for (const [a, b] of CORTES) { if (t + acc >= a) acc += b - a; else break; } return t + acc; }
  function aDoblada(t) { let acc = 0; for (const [a, b] of CORTES) { if (t >= b) acc += b - a; else if (t > a) { t = a; break; } else break; } return Math.max(0, t - acc); }

  const items = P.puntos.map((p, i) => ({ id: i, sec: p.sec, desde: p.desde, hasta: p.hasta ?? (p.desde + 3), que: p.que, esp: p.esp, nuevo: false }));
  const nuevos = [];                      // puntos marcados por el corrector: {nuevo_id, tiempo, nota, veredicto}
  const KEY = 'foton-corrector';
  let quien = ''; try { quien = localStorage.getItem(KEY) || ''; } catch (e) {}
  const res = {};                         // id de punto -> {v, nota}
  const fmt = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' : '') + String(m).padStart(h ? 2 : 1, '0') + ':' + String(x).padStart(2, '0'); };
  const $ = id => document.getElementById(id);
  const v = $('v'), lista = $('lista');
  let cur = -1, lang = 'dob', fin = 0, pasando = false, archivoActual = '';

  function estado(m, mal) { const e = $('estado'); e.textContent = m; e.className = 'k' + (mal ? ' mal' : ''); if (!mal) setTimeout(() => { if (e.textContent === m) e.textContent = ''; }, 2500); }
  async function enviar(fila) {
    try {
      const r = await fetch('/api/' + P.slug + '/correcciones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ corrector: quien }, fila)) });
      if (!r.ok) throw new Error(await r.text());
      estado('guardado ✓');
    } catch (e) { estado('NO SE GUARDÓ: ' + e.message, true); }
  }
  async function cargarMarcas() {
    try {
      const r = await fetch('/api/' + P.slug + '/correcciones?corrector=' + encodeURIComponent(quien));
      for (const f of await r.json()) {
        if (f.corrector !== quien) continue;
        if (f.punto !== null && f.punto !== undefined) res[f.punto] = { v: f.veredicto, nota: f.nota };
        else nuevos.push({ nuevo_id: f.nuevo_id, tiempo: f.tiempo, nota: f.nota, veredicto: f.veredicto });
      }
    } catch (e) { estado('no pude leer tus marcas anteriores', true); }
  }
  function todos() { return items.concat(nuevos.map((n, j) => ({ id: 'n' + j, sec: 'N', desde: n.tiempo, hasta: n.tiempo + 3, que: n.nota || '(sin nota)', esp: '', nuevo: n }))); }

  function pintarLista() {
    lista.innerHTML = ''; const h = document.createElement('h2'); h.textContent = 'Puntos'; lista.appendChild(h);
    const t = todos();
    t.forEach(it => {
      const d = document.createElement('div'); d.className = 'item' + (it.id === cur ? ' cur' : ''); const r = it.nuevo ? { v: it.nuevo.veredicto } : res[it.id];
      d.innerHTML = `<span class="tm">${fmt(it.desde)}</span><span>${it.sec} · ${it.que}</span><span class="v ${r ? r.v : ''}">${r ? r.v : ''}</span>`;
      d.onclick = () => ir(it.id); lista.appendChild(d);
    });
    $('prog').textContent = `${Object.keys(res).length} de ${items.length} marcados` + (nuevos.length ? ` · ${nuevos.length} nuevos` : '');
  }
  function pintarIdioma() { const s = SRC[lang]; const e = $('a-idioma'); e.textContent = s.nombre; e.className = 'idioma ' + s.cls; $('conm').textContent = lang === 'dob' ? 'O · Conmutar a ORIGINAL' : 'O · Conmutar a DOBLADA'; }
  function cargar(t) {
    const s = SRC[lang]; const arrancar = () => { v.currentTime = Math.max(0, lang === 'ori' ? aOriginal(t) : t); v.play().catch(() => {}); };
    if (archivoActual !== s.archivo) { archivoActual = s.archivo; v.src = s.archivo; v.addEventListener('loadedmetadata', arrancar, { once: true }); } else arrancar();
    pintarIdioma();
  }
  function buscar(id) { return todos().find(x => x.id === id); }
  function ir(id) {
    const t = todos(); let idx = t.findIndex(x => x.id === id); if (typeof id === 'number' && (id < 0 || id >= items.length) && idx < 0) return; if (idx < 0) return;
    const it = t[idx]; cur = it.id;
    $('a-sec').textContent = SEC[it.sec]; $('a-t').textContent = `${fmt(it.desde)}${it.hasta > it.desde + 3 ? '-' + fmt(it.hasta) : ''}`;
    $('a-q').textContent = it.que; $('a-e').textContent = it.esp ? 'Esperado: ' + it.esp : (it.nuevo ? 'Punto tuyo: podés cambiar la nota y guardar con Enter' : '');
    $('nota').value = it.nuevo ? (it.nuevo.nota || '') : ((res[it.id] && res[it.id].nota) || '');
    fin = it.hasta + PAD; pasando = false; cargar(it.desde - PAD);
    pintarLista(); const el = lista.querySelector('.item.cur'); if (el) el.scrollIntoView({ block: 'nearest' });
  }
  function siguiente(d) { const t = todos(); const i = t.findIndex(x => x.id === cur); const n = t[i + d]; if (n) ir(n.id); }
  function conmutar() {
    const t = lang === 'ori' ? aDoblada(v.currentTime) : v.currentTime; const estaba = !v.paused; lang = lang === 'dob' ? 'ori' : 'dob'; pasando = false;
    const s = SRC[lang]; archivoActual = s.archivo; v.src = s.archivo;
    v.addEventListener('loadedmetadata', () => { v.currentTime = lang === 'ori' ? aOriginal(t) : t; if (estaba) v.play().catch(() => {}); }, { once: true }); pintarIdioma();
  }
  v.addEventListener('timeupdate', () => { if (cur !== -1 && !pasando && v.currentTime >= fin && (lang === 'dob' || aDoblada(v.currentTime) >= fin)) { pasando = true; v.pause(); setTimeout(() => siguiente(1), 600); } });
  v.addEventListener('error', () => { $('a-e').textContent = 'No se pudo abrir el video ' + archivoActual; });

  function marcar(val) {
    if (cur === -1) return; const it = buscar(cur); const nota = $('nota').value.trim();
    if (it.nuevo) { it.nuevo.veredicto = val; it.nuevo.nota = nota; enviar({ nuevo_id: it.nuevo.nuevo_id, tiempo: it.nuevo.tiempo, idioma: lang, veredicto: val, nota }); pintarLista(); return; }
    res[it.id] = { v: val, nota }; enviar({ punto: it.id, tiempo: it.desde, idioma: lang, veredicto: val, nota }); pintarLista();
    if (val === 'BIEN' && !nota) siguiente(1);
  }
  function marcarNuevo() {
    const t = lang === 'ori' ? aDoblada(v.currentTime) : v.currentTime; v.pause();
    const nota = prompt('¿Qué pasa en ' + fmt(t) + '? (qué se oye y qué debería decir)'); if (nota === null) return;
    const n = { nuevo_id: Date.now().toString(36), tiempo: Math.round(t * 10) / 10, nota: nota.trim(), veredicto: 'MAL' };
    nuevos.push(n); enviar({ nuevo_id: n.nuevo_id, tiempo: n.tiempo, idioma: lang, veredicto: 'MAL', nota: n.nota }); pintarLista();
  }
  document.querySelectorAll('button[data-v]').forEach(b => b.onclick = () => marcar(b.dataset.v));
  $('nota').addEventListener('keydown', e => {
    if (e.key === 'Enter') { const it = buscar(cur); if (it) { const val = it.nuevo ? it.nuevo.veredicto : (res[it.id] ? res[it.id].v : 'OTRA'); marcar(val); } e.target.blur(); }
    e.stopPropagation();
  });
  $('conm').onclick = conmutar; $('rep').onclick = () => ir(cur); $('sig').onclick = () => siguiente(1); $('ant').onclick = () => siguiente(-1); $('nuevo').onclick = marcarNuevo;
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return; const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); v.paused ? v.play() : v.pause(); }
    else if (k === 'o') conmutar(); else if (k === 'r') ir(cur); else if (k === 'n') siguiente(1); else if (k === 'p') siguiente(-1); else if (k === 'm') marcarNuevo();
    else if (k === '1') marcar('BIEN'); else if (k === '2') marcar('MAL'); else if (k === '3') marcar('OTRA');
  });
  $('nombre').value = quien;
  $('empezar').onclick = async () => {
    quien = $('nombre').value.trim(); if (!quien) { $('nombre').focus(); return; }
    try { localStorage.setItem(KEY, quien); } catch (e) {}
    $('quien').textContent = 'Corrector: ' + quien; $('inicio').remove();
    await cargarMarcas(); pintarLista();
    const pend = items.findIndex(i => !res[i.id]); ir(pend < 0 ? 0 : pend);
  };
  $('nombre').addEventListener('keydown', e => { if (e.key === 'Enter') $('empezar').click(); e.stopPropagation(); });
  pintarLista(); pintarIdioma();
})();
