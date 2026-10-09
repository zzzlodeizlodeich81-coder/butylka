#!/bin/bash
# Ставит двор на чистую Ubuntu в Яндекс Облаке. Запуск: sudo bash scripts/yandex-boot.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Нужен sudo."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl ca-certificates nginx git

if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if [ ! -d /opt/butylka/.git ]; then
  rm -rf /opt/butylka
  git clone --depth 1 https://github.com/zzzlodeizlodeich81-coder/butylka.git /opt/butylka
else
  git -C /opt/butylka pull --ff-only
fi

if ! id ubuntu >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" ubuntu
fi

cd /opt/butylka
npm ci
NITRO_PRESET=node npm run build
chown -R ubuntu:ubuntu /opt/butylka

cat > /etc/systemd/system/butylka.service << 'EOF'
[Unit]
Description=Butylka yard
After=network.target

[Service]
WorkingDirectory=/opt/butylka
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=NITRO_HOST=127.0.0.1
Environment=NITRO_PORT=3000
EnvironmentFile=-/opt/butylka/.env
ExecStart=/usr/bin/node /opt/butylka/.output/server/index.mjs
Restart=always
RestartSec=3
User=ubuntu

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/nginx/sites-available/butylka << 'EOF'
server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name _;
  client_max_body_size 64m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
  }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sfn /etc/nginx/sites-available/butylka /etc/nginx/sites-enabled/butylka
nginx -t
systemctl reload nginx
systemctl daemon-reload
systemctl enable butylka
systemctl restart butylka
echo "ГОТОВО. Открой http://$(hostname -I | awk '{print $1}')"
