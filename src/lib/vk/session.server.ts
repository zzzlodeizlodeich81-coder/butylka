import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";

export type VkUser = { vkId: string; name: string };

const COOKIE = "vk_session";
const PREVIEW_ID = "preview";

function appId() {
  return (process.env.VK_APP_ID || process.env.VITE_VK_APP_ID || "").trim();
}

function secret() {
  return (process.env.VK_SECURE_KEY || "").trim();
}

function sessionSecret() {
  return secret() || process.env.DATABASE_URL || "butylka-preview-session";
}

export function vkConfigured() {
  return Boolean(appId() && secret());
}

export function verifyLaunchParams(search: string): { vkId: string; name: string } | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const sign = params.get("sign") ?? "";
  const key = secret();
  if (!key || !sign) return null;
  const vkPairs = [...params.entries()]
    .filter(([k]) => k.startsWith("vk_"))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const payload = vkPairs.map(([k, v]) => `${k}=${v}`).join("&");
  const digest = createHmac("sha256", key)
    .update(payload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  if (!safeEqual(digest, sign)) return null;
  const vkId = params.get("vk_user_id") ?? "";
  if (!/^\d{1,16}$/.test(vkId)) return null;
  return { vkId, name: "" };
}

export function verifyPaymentSig(fields: Record<string, string>): boolean {
  const key = secret();
  if (!key) return false;
  const sig = fields.sig ?? "";
  const base =
    Object.keys(fields)
      .filter((k) => k !== "sig")
      .sort()
      .map((k) => `${k}=${fields[k]}`)
      .join("") + key;
  const got = createHash("md5").update(base).digest("hex");
  return safeEqual(got, sig);
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function signToken(user: VkUser, exp: number) {
  const body = `${user.vkId}|${user.name}|${exp}`;
  const mac = createHmac("sha256", sessionSecret()).update(body).digest("hex");
  return `${body}|${mac}`;
}

export function parseToken(token: string | null | undefined): VkUser | null {
  if (!token) return null;
  const parts = token.split("|");
  if (parts.length !== 4) return null;
  const [vkId, name, expRaw, mac] = parts;
  const exp = Number(expRaw);
  if (!vkId || !Number.isFinite(exp) || Date.now() > exp) return null;
  const expect = createHmac("sha256", sessionSecret())
    .update(`${vkId}|${name}|${exp}`)
    .digest("hex");
  if (!safeEqual(expect, mac)) return null;
  if (vkId !== PREVIEW_ID && !/^\d{1,16}$/.test(vkId)) return null;
  return { vkId, name: decodeURIComponent(name) };
}

export function mintToken(user: VkUser) {
  return signToken(
    { vkId: user.vkId, name: encodeURIComponent(user.name).slice(0, 80) },
    Date.now() + 14 * 24 * 60 * 60 * 1000,
  );
}

export function sessionCookie(token: string) {
  const secure = true;
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${14 * 24 * 3600}${secure ? "; Secure" : ""}`;
}

function onVercel() {
  try {
    return Boolean(process.env.VERCEL);
  } catch {
    return false;
  }
}

function previewAllowed() {
  return !onVercel() && !vkConfigured() && !dbUrl();
}

function dbUrl() {
  try {
    return process.env.DATABASE_URL?.trim() || "";
  } catch {
    return "";
  }
}

export async function resolveVkUser(bearer?: string): Promise<VkUser | null> {
  const fromBearer = parseToken(bearer);
  if (fromBearer) return fromBearer;
  try {
    const req = getRequest();
    const header = req.headers.get("x-vk-session");
    const fromHeader = parseToken(header);
    if (fromHeader) return fromHeader;
    const cookie = req.headers.get("cookie") ?? "";
    const match = cookie.match(/(?:^|;\s*)vk_session=([^;]+)/);
    const fromCookie = parseToken(match ? decodeURIComponent(match[1]) : null);
    if (fromCookie) return fromCookie;
  } catch {
    /* no request */
  }
  if (previewAllowed()) return { vkId: PREVIEW_ID, name: "превью" };
  return null;
}

export function isPreviewUser(vkId: string) {
  return vkId === PREVIEW_ID;
}
