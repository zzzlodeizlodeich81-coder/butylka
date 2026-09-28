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
    if (d.op === "yard") return yardDispatch(d);
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

function yardSheet(name, header) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function yardRows(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, Math.max(sheet.getLastColumn(), 1)).getValues();
}

function yardDispatch(d) {
  const songs = yardSheet("songs", ["id", "kind", "url", "author", "vk", "at", "hook", "lyric", "music", "orig", "n"]);
  const rates = yardSheet("rates", ["song", "vk", "hook", "lyric", "music", "orig"]);
  const hears = yardSheet("hears", ["song", "vk"]);
  const chat = yardSheet("chat", ["id", "time", "vk", "name", "text"]);
  const vkId = String(d.vkId || "guest");
  const name = String(d.name || "Гость").slice(0, 32);
  const action = String(d.action || "list");

  function pack() {
    const songRows = yardRows(songs);
    const chatRows = yardRows(chat);
    return {
      ok: true,
      shared: true,
      songs: songRows.slice(-40).reverse().map(function (r) {
        return {
          id: String(r[0]),
          kind: r[1] === "release" ? "release" : "draft",
          url: String(r[2]),
          author: String(r[3]),
          vk: String(r[4]),
          at: Number(r[5] || 0),
          hook: Number(r[6] || 0),
          lyric: Number(r[7] || 0),
          music: Number(r[8] || 0),
          orig: Number(r[9] || 0),
          n: Number(r[10] || 0),
        };
      }),
      chat: chatRows.slice(-30).map(function (r) {
        return { id: String(r[0]), at: Number(r[1] || 0), name: String(r[3]), text: String(r[4]) };
      }),
    };
  }

  if (action === "list") return json(pack());

  if (action === "add") {
    const url = String(d.url || "").trim().slice(0, 300);
    if (!/^https:\/\/\S+$/i.test(url)) return json({ ok: false, error: "Нужна ссылка https://…" });
    const kind = d.kind === "release" ? "release" : "draft";
    const id = Utilities.getUuid();
    songs.appendRow([id, kind, url, name, vkId, Date.now(), 0, 0, 0, 0, 0]);
    return json(pack());
  }

  if (action === "rate") {
    const id = String(d.songId || "");
    const hook = Math.round(Number(d.hook));
    const lyric = Math.round(Number(d.lyric));
    const music = Math.round(Number(d.music));
    const orig = Math.round(Number(d.orig));
    if (!id || [hook, lyric, music, orig].some(function (n) { return n < 1 || n > 5; })) {
      return json({ ok: false, error: "Оценка от 1 до 5." });
    }
    const rateRows = yardRows(rates);
    for (var i = 0; i < rateRows.length; i++) {
      if (String(rateRows[i][0]) === id && String(rateRows[i][1]) === vkId) {
        return json({ ok: false, error: "Ты уже оценил." });
      }
    }
    const songRows = yardRows(songs);
    var found = 0;
    for (var s = 0; s < songRows.length; s++) {
      if (String(songRows[s][0]) === id && songRows[s][1] !== "release") found = s + 2;
    }
    if (!found) return json({ ok: false, error: "Черновика нет." });
    const cur = songs.getRange(found, 7, 1, 5).getValues()[0];
    songs.getRange(found, 7, 1, 5).setValues([[Number(cur[0]) + hook, Number(cur[1]) + lyric, Number(cur[2]) + music, Number(cur[3]) + orig, Number(cur[4]) + 1]]);
    rates.appendRow([id, vkId, hook, lyric, music, orig]);
    return json(pack());
  }

  if (action === "hear") {
    const id = String(d.songId || "");
    const songRows = yardRows(songs);
    var release = null;
    for (var h = 0; h < songRows.length; h++) {
      if (String(songRows[h][0]) === id && songRows[h][1] === "release") release = songRows[h];
    }
    if (!release) return json({ ok: false, error: "Песни нет." });
    if (String(release[4]) === vkId) return json({ ok: false, error: "Своя песня нот не даёт." });
    const hearRows = yardRows(hears);
    for (var j = 0; j < hearRows.length; j++) {
      if (String(hearRows[j][0]) === id && String(hearRows[j][1]) === vkId) {
        return json({ ok: false, error: "Уже засчитано." });
      }
    }
    hears.appendRow([id, vkId]);
    return json({ ok: true, shared: true, credit: 0.5 });
  }

  const text = String(d.text || "").trim().slice(0, 200);
  if (!text) return json({ ok: false, error: "Пусто." });
  chat.appendRow([Utilities.getUuid(), Date.now(), vkId, name, text]);
  return json(pack());
}

function doGet() {
  return json({ ok: true, service: "balalaechka-notes" });
}
