/**
 * admin 鉴权。口令 + 无状态签名会话。
 *
 * 没有用户系统，也不打算有——这个站只有一个人能写。
 * 口令哈希和签名密钥都从环境变量读，不进 git：
 *
 *   BIP_ADMIN_HASH      scrypt 哈希，格式 scrypt$<salt-hex>$<key-hex>
 *   BIP_SESSION_SECRET  HMAC 密钥，随便一串长随机
 *
 * 两者都用 deploy/gen-admin-secret.mjs 生成。
 *
 * 环境变量里的那个叫「初始码」，永远有效，是兜底入口。
 * 另外可以在 admin 里设一个「登录密码」（复杂度有要求），哈希存在库里，
 * 两者任一通过都能登录。库里的那份在 API 启动时载入内存（loadCredential），
 * 之后改密码直接更新内存，所以鉴权依然是同步的。
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const HASH = process.env.BIP_ADMIN_HASH ?? '';
const SECRET = process.env.BIP_SESSION_SECRET ?? '';

export const COOKIE_NAME = 'bip_session';
/** 会话有效期 30 天。手机上别老让我重登。 */
const TTL_MS = 30 * 24 * 3600 * 1000;

export const isConfigured = () => Boolean(HASH && SECRET);

/* ---------- 库里的登录密码 ---------- */

let custom = { hash: '', version: 0 };

/**
 * version 写进会话令牌。改密码或移除密码时它会变，
 * 之前签发的所有会话随之失效——密码是因为怀疑泄漏才换的，旧会话不该继续有效。
 */
export function loadCredential(doc) {
  custom = { hash: doc?.hash ?? '', version: Number(doc?.version) || 0 };
}
export const hasCustomPassword = () => Boolean(custom.hash);

/* ---------- 口令 ---------- */

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${key}`;
}

/** 定长比较，别让响应时间泄漏口令前缀 */
function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function matchesHash(hash, password) {
  const [scheme, salt, key] = hash.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  let candidate;
  try {
    candidate = scryptSync(password, salt, 32).toString('hex');
  } catch {
    return false;
  }
  return safeEqual(candidate, key);
}

/** 初始码 */
export function verifyInitialCode(password) {
  if (!isConfigured() || typeof password !== 'string' || !password) return false;
  return matchesHash(HASH, password);
}

/** 初始码或登录密码，任一通过 */
export function verifyPassword(password) {
  if (!isConfigured() || typeof password !== 'string' || !password) return false;
  // 两个都算完再合并，不因为第一个命中就少算一次而让耗时泄漏「用的是哪个」
  const a = matchesHash(HASH, password);
  const b = custom.hash ? matchesHash(custom.hash, password) : false;
  return a || b;
}

/** 返回 null 表示合格，否则是给人看的原因 */
export function passwordProblem(password) {
  if (typeof password !== 'string') return '密码必须是字符串';
  if (password.length < 12) return '至少 12 位';
  // scrypt 故意很慢，不限长度的话一个超长密码就能拖住进程
  if (password.length > 128) return '最多 128 位';
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes < 3) return '大写、小写、数字、符号至少要用到 3 类';
  if (/(.)\1{3,}/.test(password)) return '不要连续重复同一个字符';
  if (verifyInitialCode(password)) return '不能和初始码相同';
  return null;
}

/** 生成存库用的哈希和新的会话版本 */
export function makeCredential(password) {
  return { hash: hashPassword(password), version: Date.now() };
}

/* ---------- 会话令牌 ---------- */

const sign = (payload) => createHmac('sha256', SECRET).update(payload).digest('base64url');

export function issueToken(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ exp: now + TTL_MS, v: custom.version })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token, now = Date.now()) {
  if (!isConfigured() || typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sign(payload), sig)) return false;
  try {
    const { exp, v } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    // 老令牌没有 v，按 0 算；从没设过密码时 version 也是 0，所以老会话不受影响
    return typeof exp === 'number' && exp > now && (v ?? 0) === custom.version;
  } catch {
    return false;
  }
}

/* ---------- 请求鉴权 ---------- */

function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/**
 * 网页走 Cookie，CLI 走 Authorization: Bearer <口令>。
 * CLI 每次带原始口令而不是会话令牌——它没有浏览器那样的存储，
 * 存在 ~/.bip-token（600）里，和会话令牌等价。
 */
export function authenticate(req) {
  const cookie = readCookie(req, COOKIE_NAME);
  if (cookie && verifyToken(cookie)) return true;

  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    // Bearer 既接受会话令牌，也接受原始口令
    return verifyToken(token) || verifyPassword(token);
  }
  return false;
}

export function sessionCookie(token, { secure = true } = {}) {
  const bits = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(TTL_MS / 1000)}`,
  ];
  // 本地 http://localhost 调试时不能加 Secure，否则浏览器直接丢弃
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

export function clearCookie({ secure = true } = {}) {
  const bits = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

/* ---------- 暴力破解限制 ---------- */

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const fails = new Map();

export function isLocked(ip, now = Date.now()) {
  const rec = fails.get(ip);
  if (!rec) return false;
  if (now - rec.at > LOCK_MS) {
    fails.delete(ip);
    return false;
  }
  return rec.n >= MAX_FAILS;
}

export function noteFailure(ip, now = Date.now()) {
  const rec = fails.get(ip);
  if (!rec || now - rec.at > LOCK_MS) fails.set(ip, { n: 1, at: now });
  else fails.set(ip, { n: rec.n + 1, at: now });
}

export function clearFailures(ip) {
  fails.delete(ip);
}

export function lockRemainingMs(ip, now = Date.now()) {
  const rec = fails.get(ip);
  return rec ? Math.max(0, LOCK_MS - (now - rec.at)) : 0;
}
