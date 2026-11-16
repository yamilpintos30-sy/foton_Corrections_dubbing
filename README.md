# Revisión de doblajes para los correctores (Foton)

Web chica (Flask) para que los correctores escuchen cada punto marcado de una película doblada, conmuten al
original en el mismo instante (tecla **O**), marquen BIEN / MAL / OTRA COSA con una nota, agreguen puntos nuevos
(tecla **M**) y todo quede guardado en el servidor para bajarlo desde la PC.

## Qué hay

- `app.py` — la web. Páginas: `/` (lista de películas), `/pelicula/<slug>` (reproductor), `/admin` (panel: marcas por corrector, bajar `.md`/`.json`, traer los videos de Drive).
- `peliculas.json` — las películas: archivos de video, cortes de la limpieza (para conmutar al original en el instante correcto) y los puntos marcados antes de la primera versión de arreglo.
- `videos/` — los mp4 (no van al repo). `datos/` — las correcciones, un `.jsonl` por película (no van al repo).
- `render.yaml` — servicio para Render con disco persistente de 100 GB montado en `/var/data` (videos y datos).
- `render/` — instala rclone en el build y baja los videos de Drive desde el panel.
- `herramientas/bajar_correcciones.py` — desde la PC: `python herramientas/bajar_correcciones.py https://<servicio>.onrender.com <CLAVE_ADMIN> <carpeta>`.

## Ponerlo en Render

1. Nuevo **Blueprint** desde este repo (Render lee `render.yaml`) o un Web Service a mano con el mismo build/start.
2. Variables de entorno a cargar (las que tienen `sync: false`):
   - `CLAVE`: clave que les das a los correctores (vacía = sin clave).
   - `CLAVE_ADMIN`: clave del panel `/admin`.
   - `RCLONE_CONFIG_GD_TOKEN`: el valor de la línea `token = {...}` del remoto de Drive en el `rclone.conf` de la PC (la cuenta que tiene la carpeta con los videos). Todo el JSON, en una sola línea.
3. Subir los 4 mp4 a la carpeta de Drive `VIDEOS_DRIVE` (por defecto `Morbido correcciones 11-nov/web`): `night_doblada.mp4`, `night_original.mp4`, `badtaste_doblada.mp4`, `badtaste_original.mp4`.
4. Entrar a `/admin` → **Bajar los videos de Drive**. El log se ve en la misma página. Cuando la lista de películas deje de decir «los videos todavía no están cargados», se puede pasar el link a los correctores.

Las correcciones se guardan en el disco persistente; sobreviven a los deploys.

## Local

```
pip install -r requirements.txt
python app.py        # http://127.0.0.1:8130/  (videos en ./videos, datos en ./datos)
```

## Cómo se guardan las marcas

Cada marca es una línea JSON: corrector, punto (índice en `peliculas.json`, o `null` si es un punto nuevo del
corrector), tiempo (del video doblado), idioma en el que estaba escuchando, veredicto, nota y fecha UTC.
Vale la última marca de cada corrector por punto. El `.md` del panel las ordena por corrector y tiempo.
