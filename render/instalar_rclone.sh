#!/bin/bash
# Baja rclone (binario estático) a ./bin para poder traer los videos de Drive desde el panel /admin.
set -e
cd "$(dirname "$0")/.."
mkdir -p bin
if [ ! -x bin/rclone ]; then
  curl -fsSL https://downloads.rclone.org/rclone-current-linux-amd64.zip -o /tmp/rclone.zip
  python3 - <<'PY'
import zipfile
z = zipfile.ZipFile("/tmp/rclone.zip")
for n in z.namelist():
    if n.endswith("/rclone"):
        open("bin/rclone", "wb").write(z.read(n))
PY
  chmod +x bin/rclone
fi
bin/rclone version | head -1
