# -*- coding: utf-8 -*-
"""Baja a la PC las correcciones que dejaron los correctores en la web.

    python bajar_correcciones.py https://foton-correcciones.onrender.com CLAVE_ADMIN [carpeta_destino]

Deja CORRECCIONES-<pelicula>.md y .json por película en la carpeta destino (por defecto, la carpeta actual).
"""
import json
import sys
import urllib.request
from pathlib import Path

base, clave = sys.argv[1].rstrip("/"), sys.argv[2]
destino = Path(sys.argv[3]) if len(sys.argv) > 3 else Path(".")
destino.mkdir(parents=True, exist_ok=True)
pels = json.load(open(Path(__file__).resolve().parents[1] / "peliculas.json", encoding="utf-8"))["peliculas"]
for p in pels:
    for ext in ("md", "json"):
        with urllib.request.urlopen(f"{base}/admin/{p['slug']}.{ext}?clave={clave}", timeout=60) as r:
            (destino / f"CORRECCIONES-{p['slug']}.{ext}").write_bytes(r.read())
    d = json.loads((destino / f"CORRECCIONES-{p['slug']}.json").read_text(encoding="utf-8"))
    print(f"{p['slug']}: {len(d['vigente'])} marcas vigentes de {sorted({f['corrector'] for f in d['vigente']})}")
print(f"en {destino.resolve()}")
