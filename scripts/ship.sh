#!/bin/bash
# Вечерняя заливка двора. Днём сайт сам не обновляется.
set -euo pipefail
cd /opt/butylka
git -c safe.directory=/opt/butylka pull --ff-only origin main
export NITRO_PRESET=node
npm run build
chown -R ubuntu:ubuntu /opt/butylka
systemctl restart butylka
echo "Залито $(date -Is)"
