# Полигон двора на своём компьютере. Боевой сайт это не трогает.
$ErrorActionPreference = "Stop"
$root = Join-Path $env:USERPROFILE "xxv-kadr"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Нет Node.js. Поставь версию 22 с https://nodejs.org и запусти скрипт ещё раз."
  exit 1
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "Нет Git. Поставь с https://git-scm.com и запусти скрипт ещё раз."
  exit 1
}

if (-not (Test-Path $root)) {
  git clone https://github.com/zzzlodeizlodeich81-coder/butylka.git $root
}
Set-Location $root
git pull --ff-only

if (-not (Test-Path ".env")) {
  @"
DOOR_PASSWORD=local-door
ADMIN_LOGIN=zzzlodeizlodeich
ADMIN_PASSWORD=local-yard
"@ | Set-Content -Encoding utf8 ".env"
  Write-Host "Локальный вход: логин zzzlodeizlodeich, пароль local-yard. Это не пароль боевого сайта."
}

if (-not (Test-Path "node_modules")) {
  npm ci
}
Write-Host "Полигон: http://localhost:8080"
npm run dev
