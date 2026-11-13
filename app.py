# -*- coding: utf-8 -*-
"""Revisión de doblajes para los correctores de Foton.

Sirve las películas (doblada y original, con conmutación en el mismo instante), muestra los puntos marcados
y guarda lo que cada corrector marca (BIEN / MAL / OTRA COSA + nota, y puntos nuevos en cualquier tiempo).

Variables de entorno:
  VIDEOS_DIR   carpeta con los mp4 (por defecto ./videos; en Render, el disco persistente)
  DATOS_DIR    carpeta donde se guardan las correcciones (por defecto ./datos; en Render, el disco)
  CLAVE        clave de acceso para los correctores (vacía = sin clave)
  CLAVE_ADMIN  clave del panel /admin y de la descarga de correcciones (vacía = sin clave)
  VIDEOS_DRIVE ruta en Drive de donde bajar los videos con rclone (ver render/bajar_videos.sh)
"""
import json
import os
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from flask import (Flask, Response, abort, jsonify, make_response, redirect, render_template, request,
                   send_from_directory, url_for)

RAIZ = Path(__file__).resolve().parent
VIDEOS = Path(os.getenv("VIDEOS_DIR") or RAIZ / "videos")
DATOS = Path(os.getenv("DATOS_DIR") or RAIZ / "datos")
CLAVE = os.getenv("CLAVE", "")
CLAVE_ADMIN = os.getenv("CLAVE_ADMIN", "")
DATOS.mkdir(parents=True, exist_ok=True)
VIDEOS.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 1 << 20
_lock = threading.Lock()
# estado de la bajada de videos en archivos (gunicorn corre varios workers: la memoria no se comparte)
_BAJADA_LOG = DATOS / "bajada.log"
_BAJADA_LOCK = DATOS / "bajada.corriendo"


def _bajada_estado() -> dict:
    corriendo = _BAJADA_LOCK.exists() and (time.time() - _BAJADA_LOCK.stat().st_mtime) < 6 * 3600
    log = _BAJADA_LOG.read_text(encoding="utf-8", errors="replace") if _BAJADA_LOG.exists() else ""
    return {"corriendo": corriendo, "log": log[-20000:]}


def _bajada_escribir(linea: str):
    with open(_BAJADA_LOG, "a", encoding="utf-8") as f:
        f.write(linea if linea.endswith("\n") else linea + "\n")


def peliculas() -> dict:
    with open(RAIZ / "peliculas.json", encoding="utf-8") as f:
        return {p["slug"]: p for p in json.load(f)["peliculas"]}


def _archivo(slug: str) -> Path:
    return DATOS / f"{slug}.jsonl"


def leer(slug: str) -> list[dict]:
    p = _archivo(slug)
    if not p.exists():
        return []
    with open(p, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def guardar(slug: str, fila: dict):
    with _lock, open(_archivo(slug), "a", encoding="utf-8") as f:
        f.write(json.dumps(fila, ensure_ascii=False) + "\n")


def vigente(filas: list[dict]) -> list[dict]:
    """La última marca de cada corrector por punto; los puntos nuevos se conservan todos salvo los borrados."""
    ultimo: dict[tuple, dict] = {}
    for f in filas:
        k = (f["corrector"], f["punto"] if f.get("punto") is not None else "nuevo-" + str(f.get("nuevo_id")))
        ultimo[k] = f
    return [f for f in ultimo.values() if not f.get("borrado")]


def con_clave() -> bool:
    return not CLAVE or request.cookies.get("clave") == CLAVE


def es_admin() -> bool:
    return not CLAVE_ADMIN or request.cookies.get("admin") == CLAVE_ADMIN or request.args.get("clave") == CLAVE_ADMIN


def existe_video(nombre: str) -> bool:
    return nombre.startswith("http") or (VIDEOS / nombre).is_file()


@app.get("/")
def index():
    if not con_clave():
        return redirect(url_for("entrar"))
    pels = list(peliculas().values())
    for p in pels:
        p["lista"] = existe_video(p["doblada"]["archivo"]) and existe_video(p["original"]["archivo"])
        p["n_puntos"] = len(p["puntos"])
    return render_template("index.html", peliculas=pels)


@app.route("/entrar", methods=["GET", "POST"])
def entrar():
    if request.method == "POST":
        if request.form.get("clave", "") == CLAVE:
            r = make_response(redirect(url_for("index")))
            r.set_cookie("clave", CLAVE, max_age=90 * 86400, samesite="Lax")
            return r
        return render_template("entrar.html", error="Clave incorrecta", admin=False)
    return render_template("entrar.html", error="", admin=False)


@app.get("/pelicula/<slug>")
def pelicula(slug):
    if not con_clave():
        return redirect(url_for("entrar"))
    p = peliculas().get(slug) or abort(404)
    return render_template("pelicula.html", p=p, p_json=json.dumps(p, ensure_ascii=False))


@app.get("/videos/<path:nombre>")
def video(nombre):
    if not con_clave():
        abort(403)
    return send_from_directory(VIDEOS, nombre, conditional=True)


@app.get("/api/<slug>/correcciones")
def api_leer(slug):
    if not con_clave():
        abort(403)
    if slug not in peliculas():
        abort(404)
    quien = request.args.get("corrector", "").strip()
    filas = vigente(leer(slug))
    if quien and not es_admin():
        filas = [f for f in filas if f["corrector"] == quien]
    return jsonify(filas)


@app.post("/api/<slug>/correcciones")
def api_guardar(slug):
    if not con_clave():
        abort(403)
    if slug not in peliculas():
        abort(404)
    d = request.get_json(force=True, silent=True) or {}
    quien = (d.get("corrector") or "").strip()[:60]
    if not quien:
        return jsonify(error="falta el nombre del corrector"), 400
    fila = dict(
        corrector=quien,
        punto=d.get("punto") if isinstance(d.get("punto"), int) else None,
        nuevo_id=(d.get("nuevo_id") or "")[:40] or None,
        tiempo=float(d.get("tiempo") or 0),
        idioma=(d.get("idioma") or "dob")[:3],
        veredicto=(d.get("veredicto") or "")[:10],
        nota=(d.get("nota") or "").strip()[:1000],
        borrado=bool(d.get("borrado")),
        cuando=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
    )
    if fila["punto"] is None and not fila["nuevo_id"]:
        return jsonify(error="falta punto o nuevo_id"), 400
    guardar(slug, fila)
    return jsonify(ok=True, fila=fila)


# ---------- panel ----------
@app.route("/admin", methods=["GET", "POST"])
def admin():
    if request.method == "POST" and request.form.get("clave", "") == CLAVE_ADMIN:
        r = make_response(redirect(url_for("admin")))
        r.set_cookie("admin", CLAVE_ADMIN, max_age=90 * 86400, samesite="Lax")
        return r
    if not es_admin():
        return render_template("entrar.html", error="", admin=True)
    resumen = []
    for slug, p in peliculas().items():
        filas = vigente(leer(slug))
        resumen.append(dict(slug=slug, titulo=p["titulo"], n=len(filas),
                            correctores=sorted({f["corrector"] for f in filas}),
                            mal=sum(1 for f in filas if f["veredicto"] == "MAL"),
                            otra=sum(1 for f in filas if f["veredicto"] == "OTRA"),
                            nuevos=sum(1 for f in filas if f["punto"] is None),
                            videos={k: existe_video(p[k]["archivo"]) for k in ("doblada", "original")}))
    return render_template("admin.html", resumen=resumen, bajada=_bajada_estado(), drive=os.getenv("VIDEOS_DRIVE", ""))


def fmt_t(s: float) -> str:
    s = int(round(s))
    h, m, x = s // 3600, s % 3600 // 60, s % 60
    return (f"{h}:" if h else "") + f"{m:02d}:{x:02d}"


def _md(slug: str) -> str:
    p = peliculas()[slug]
    filas = vigente(leer(slug))
    md = f"# {p['titulo']} · correcciones de los correctores\n\n"
    for quien in sorted({f["corrector"] for f in filas}):
        md += f"## {quien}\n\n| Tiempo | Punto | Resultado | Nota | Cuándo (UTC) |\n|---|---|---|---|---|\n"
        mias = sorted((f for f in filas if f["corrector"] == quien), key=lambda f: f["tiempo"])
        for f in mias:
            que = p["puntos"][f["punto"]]["que"] if f["punto"] is not None else "NUEVO (marcado por el corrector)"
            md += f"| {fmt_t(f['tiempo'])} | {que} | {f['veredicto']} | {f['nota'].replace('|', '/')} | {f['cuando']} |\n"
        md += "\n"
    return md


@app.get("/admin/<slug>.md")
def admin_md(slug):
    if not es_admin():
        abort(403)
    if slug not in peliculas():
        abort(404)
    return Response(_md(slug), mimetype="text/markdown; charset=utf-8",
                    headers={"Content-Disposition": f"attachment; filename=CORRECCIONES-{slug}.md"})


@app.get("/admin/<slug>.json")
def admin_json(slug):
    if not es_admin():
        abort(403)
    if slug not in peliculas():
        abort(404)
    return jsonify(dict(pelicula=slug, vigente=vigente(leer(slug)), todo=leer(slug)))


def _bajar_videos():
    _BAJADA_LOCK.write_text(str(os.getpid()), encoding="utf-8")
    _BAJADA_LOG.write_text(f"{time.strftime('%H:%M:%S')} bajando videos de Drive a {VIDEOS}…\n", encoding="utf-8")
    try:
        proc = subprocess.Popen(["bash", str(RAIZ / "render" / "bajar_videos.sh")], stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True, env={**os.environ, "VIDEOS_DIR": str(VIDEOS)})
        for linea in proc.stdout:
            _bajada_escribir(linea)
            _BAJADA_LOCK.touch()
        proc.wait()
        _bajada_escribir(f"{time.strftime('%H:%M:%S')} terminó con código {proc.returncode}")
    except Exception as e:  # noqa: BLE001
        _bajada_escribir(f"ERROR: {e}")
    _BAJADA_LOCK.unlink(missing_ok=True)


@app.post("/admin/bajar")
def admin_bajar():
    if not es_admin():
        abort(403)
    if not _bajada_estado()["corriendo"]:
        threading.Thread(target=_bajar_videos, daemon=True).start()
    return redirect(url_for("admin"))


@app.get("/admin/log")
def admin_log():
    if not es_admin():
        abort(403)
    return Response(_bajada_estado()["log"], mimetype="text/plain; charset=utf-8")


@app.get("/salud")
def salud():
    return "ok"


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "8130")), debug=False)
