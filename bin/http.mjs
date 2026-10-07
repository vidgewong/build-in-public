/**
 * CLI 的数据层。
 *
 * 以前 bip 直连 MongoDB。现在生产库是唯一真相源，而它只监听 127.0.0.1
 * 且没开认证（靠网络隔离），本地连不上也不该连上——所以改走 /api/admin/*，
 * 和网页 admin 完全同一条写路径，校验逻辑不可能漂移。
 *
 * 口令存 ~/.bip-token（权限 600），用 bip login 写入。
 */

import { chmodSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export const BASE = process.env.BIP_API ?? 'https://open.vidge.me';
const TOKEN_FILE = path.join(homedir(), '.bip-token');

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function readToken() {
  if (process.env.BIP_TOKEN) return process.env.BIP_TOKEN;
  if (!existsSync(TOKEN_FILE)) return null;
  return readFileSync(TOKEN_FILE, 'utf8').trim() || null;
}

export function writeToken(token) {
  writeFileSync(TOKEN_FILE, `${token}\n`, { mode: 0o600 });
  chmodSync(TOKEN_FILE, 0o600); // 文件已存在时 mode 不生效，显式再设一次
  return TOKEN_FILE;
}

export function clearToken() {
  if (existsSync(TOKEN_FILE)) unlinkSync(TOKEN_FILE);
}

export const tokenPath = () => TOKEN_FILE;

async function request(method, path, body, { token = readToken(), auth = true } = {}) {
  if (auth && !token) {
    throw new ApiError('还没登录。先跑：bip login', 401);
  }

  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError(`连不上 ${BASE}（${err.message}）。检查网络，或用 BIP_API 指向本地：BIP_API=http://127.0.0.1:8787 bip ...`, 0);
  }

  let data = null;
  try { data = await res.json(); } catch { /* 可能是空体 */ }

  if (!res.ok) {
    if (res.status === 401) {
      throw new ApiError('口令无效或已过期。重新跑：bip login', 401);
    }
    throw new ApiError(data?.error ?? `接口返回 ${res.status}`, res.status);
  }
  return data;
}

export const get = (p, opts) => request('GET', p, undefined, opts);
export const post = (p, body, opts) => request('POST', p, body, opts);
export const del = (p, opts) => request('DELETE', p, undefined, opts);

/** 登录：验一次口令，对了就存盘 */
export async function login(password) {
  await request('GET', '/api/admin/session', undefined, { token: password, auth: false });
  return writeToken(password);
}

/** admin 快照：含停用规则和指标历史 */
export const snapshot = () => get('/api/admin/snapshot');
