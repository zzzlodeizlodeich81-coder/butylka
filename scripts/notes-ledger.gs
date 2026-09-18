/**
 * Балалаечка — учёт нот в Google Таблице.
 *
 * 1. Создай таблицу, Вставки → Apps Script, вставь этот файл целиком.
 * 2. Файл → Свойства проекта → Свойства скрипта:
 *      SECRET = длинная случайная строка (та же, что NOTES_SHEET_SECRET на Vercel)
 * 3. Развертывание → Новое развертывание → Веб-приложение
 *      Кто имеет доступ: Все
 *      Выполнить от имени: меня
 * 4. URL развертывания → Vercel env NOTES_SHEET_WEBHOOK
 *    SECRET → Vercel env NOTES_SHEET_SECRET
 *
 * Листы wallets и ledger создаются сами.
 */

const WALLETS = "wallets";
const LEDGER = "ledger";

function json(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function secretOk(d) {
  const want = PropertiesService.getScriptProperties().getProperty("SECRET") || "";
  if (!want) return true;
  return d && d.secret === want;
}

function book() {
  const ss = SpreadsheetApp.getActive();
  let wallets = ss.getSheetByName(WALLETS);
  if (!wallets) {
    wallets = ss.insertSheet(WALLETS);
    wallets.appendRow(["vk_id", "name", "notes", "updated"]);
    wallets.setFrozenRows(1);
  }
  let ledger = ss.getSheetByName(LEDGER);
  if (!ledger) {
    ledger = ss.insertSheet(LEDGER);
    ledger.appendRow(["time", "vk_id", "name", "op", "item", "votes", "delta", "balance", "order_id"]);
    ledger.setFrozenRows(1);
  }
  return { wallets: wallets, ledger: ledger };
}

function findWalletRow(sheet, vkId) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(vkId)) return i + 2;
  }
  return 0;
}

function orderExists(sheet, orderId) {
  if (!orderId) return false;
  const last = sheet.getLastRow();
  if (last < 2) return false;
  const ids = sheet.getRange(2, 9, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(orderId)) return true;
  }
  return false;
}

function touchWallet(wallets, vkId, name, notes) {
  const now = new Date();
  const row = findWalletRow(wallets, vkId);
  if (row) {
    const curName = String(wallets.getRange(row, 2).getValue() || "");
    wallets.getRange(row, 2, 1, 3).setValues([[name || curName, notes, now]]);
    return notes;
  }
  wallets.appendRow([vkId, name || "", notes, now]);
  return notes;
}

function readNotes(wallets, vkId, name) {
  const row = findWalletRow(wallets, vkId);
  if (!row) {
    touchWallet(wallets, vkId, name, 0);
    return 0;
  }
  if (name) {
    const cur = String(wallets.getRange(row, 2).getValue() || "");
    if (name && name !== cur) wallets.getRange(row, 2).setValue(name);
  }
  return Number(wallets.getRange(row, 3).getValue() || 0);
}

function writeLedger(ledger, vkId, name, op, item, votes, delta, balance, orderId) {
  ledger.appendRow([new Date(), vkId, name || "", op, item || "", votes || 0, delta, balance, orderId || ""]);
}

function doPost(e) {
  var d = {};
  try {
    d = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return json({ ok: false, error: "bad json" });
  }
  if (!secretOk(d)) return json({ ok: false, error: "forbidden" });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheets = book();
    const vkId = String(d.vkId || "");
    const name = String(d.name || "");
    if (!vkId) return json({ ok: false, error: "no vk" });

    if (d.op === "read") {
      const notes = readNotes(sheets.wallets, vkId, name);
      return json({ ok: true, notes: notes, name: name });
    }

    if (d.op === "credit") {
      const orderId = String(d.orderId || "");
      const add = Number(d.notes || 0);
      if (add <= 0) return json({ ok: false, error: "bad pack" });
      if (orderId && orderExists(sheets.ledger, orderId)) {
        return json({ ok: true, notes: readNotes(sheets.wallets, vkId, name), duplicate: true });
      }
      const notes = readNotes(sheets.wallets, vkId, name) + add;
      touchWallet(sheets.wallets, vkId, name, notes);
      writeLedger(sheets.ledger, vkId, name, "buy", d.item || "", Number(d.votes || 0), add, notes, orderId);
      return json({ ok: true, notes: notes });
    }

    if (d.op === "spend" || d.op === "refund") {
      const cost = Number(d.cost || 0);
      const delta = d.op === "refund" ? cost : -cost;
      if (!cost) return json({ ok: false, error: "bad cost" });
      const cur = readNotes(sheets.wallets, vkId, name);
      if (delta < 0 && cur < cost) {
        return json({ ok: false, error: "need " + cost, notes: cur, needNotes: cost });
      }
      const notes = cur + delta;
      touchWallet(sheets.wallets, vkId, name, notes);
      writeLedger(
        sheets.ledger,
        vkId,
        name,
        d.op === "refund" ? "refund:" + (d.kind || "") : d.kind || "spend",
        d.kind || "",
        0,
        delta,
        notes,
        "",
      );
      return json({ ok: true, notes: notes });
    }

    return json({ ok: false, error: "unknown op" });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json({ ok: true, service: "balalaechka-notes" });
}
