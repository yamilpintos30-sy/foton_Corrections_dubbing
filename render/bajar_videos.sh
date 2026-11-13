#!/bin/bash
# Copia los mp4 de la carpeta de Drive VIDEOS_DRIVE a VIDEOS_DIR con rclone.
# rclone se configura por variables de entorno (sin archivo de config):
#   RCLONE_CONFIG_GD_TYPE=drive   RCLONE_CONFIG_GD_SCOPE=drive.readonly
#   RCLONE_CONFIG_GD_TOKEN={"access_token":"...","token_type":"Bearer","refresh_token":"...","expiry":"..."}
# (el token se copia tal cual de la línea `token = ` del rclone.conf de la PC, remoto gdrive30).
set -e
cd "$(dirname "$0")/.."
: "${VIDEOS_DRIVE:?falta VIDEOS_DRIVE (ej. gd:Morbido correcciones 11-nov/web)}"
: "${VIDEOS_DIR:=videos}"
mkdir -p "$VIDEOS_DIR"
bin/rclone copy "$VIDEOS_DRIVE" "$VIDEOS_DIR" --include "*.mp4" --transfers 2 --drive-chunk-size 64M \
  --retries 10 --low-level-retries 50 --stats 30s --stats-one-line -v 2>&1
ls -la "$VIDEOS_DIR"
