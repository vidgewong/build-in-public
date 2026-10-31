#!/usr/bin/env node
/**
 * API 服务。
 *
 *   公开只读：
 *     GET  /api/snapshot          站点需要的全部数据
 *     GET  /api/health
 *     GET  /api/media/:key        赔付证明图片（key 随机，内容不可变）
 *
 *   管理写入（需鉴权，见 server/auth.mjs）：
 *     POST   /api/admin/login     { password } → 下发会话 Cookie
 *     POST   /api/admin/logout
 *     GET    /api/admin/session   当前是否已登录
 *     GET    /api/admin/snapshot  含停用规则与指标历史
 *     POST   /api/admin/entry     打卡 / 补证明
 *     DELETE /api/admin/entry/:id
 *     POST   /api/admin/upload    原始图片字节 → { key }（赔付证明先传图再记账）
 *     POST   /api/admin/claim     记违约赔付（必须带 proof）
 *     POST   /api/admin/claim/proof        给已有赔付补图
 *     POST   /api/admin/claim/proof/remove 删一张图（至少留一张）
 *     DELETE /api/admin/claim/:id
 *     POST   /api/admin/password  设置登录密码（与初始码并存）
 *     POST   /api/admin/password/clear
 *     POST   /api/admin/rule      { create: true } 新建，否则更新
 *     DELETE /api/admin/rule/:id
 *     POST   /api/admin/metric
 *     DELETE /api/admin/metric/:key
 *     POST   /api/admin/waiver    { rule, period|date|from+to, reason, remove }  豁免赔付，仍算失约
 *     POST   /api/admin/profile
 *
 * 写入逻辑一概不在这里，全在 server/actions.mjs——CLI 调的是同一份。
 */

import http from 'node:http';
import * as actions from './actions.mjs';
import { ValidationError } from './actions.mjs';
import * as auth from './auth.mjs';
import { getAdminSnapshot, getAuthDoc, getSnapshot } from './repo.mjs';
import * as storage from './storage.mjs';
import { close, DB_NAME, URI } from './db.mjs';

const PORT = Number(process.env.API_PORT ?? 8787);
const HOST = process.env.API_HOST ?? '127.0.0.1';
/** 本地 http 调试时 Cookie 不能带 Secure，否则浏览器直接丢弃 */
const SECURE_COOKIE = process.env.BIP_INSECURE_COOKIE !== '1';
/** 请求体上限。只收 JSON 文本，1MB 绰绰有余 */
const MAX_BODY = 1024 * 1024;
/** 图片上传上限。前端会先压缩，正常远小于这个数；CLI 直传大图也放得下 */
const MAX_IMAGE = 12 * 1024 * 1024;

function send(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  res.end(payload);
}

/** 公开只读接口允许任意来源读取 */
const publicCors = { 'access-control-allow-origin': '*' };

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new ValidationError('请求体太大');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ValidationError('请求体不是合法 JSON');
  }
}

async function readRaw(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new ValidationError(`图片太大，上限 ${Math.round(limit / 1048576)}MB`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const clientIp = (req) =>
  (req.headers['x-real-ip'] ?? req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '?')
    .toString().split(',')[0].trim();

/**
 * admin 接口严格同源。
 * 公开接口是 allow-origin: *，如果 admin 也跟着放开，任何网站都能
 * 带着你的 Cookie 发写请求（CSRF）。这里一律不回 CORS 头，
 * 并显式拒掉带 Origin 且非本站的请求。
 */
function sameOriginOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // 同源请求通常不带 Origin；CLI 也不带
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/* ---------- admin 路由 ---------- */

async function handleAdmin(req, res, url) {
  const path = url.pathname.replace(/^\/api\/admin/, '') || '/';
  const ip = clientIp(req);

  if (!sameOriginOk(req)) return send(res, 403, { error: '跨站请求被拒绝' });

  if (!auth.isConfigured()) {
    return send(res, 503, {
      error: 'admin 未配置。服务器上设置 BIP_ADMIN_HASH 和 BIP_SESSION_SECRET 后重启。',
    });
  }

  // 登录是唯一不需要先鉴权的
  if (path === '/login' && req.method === 'POST') {
    if (auth.isLocked(ip)) {
      const mins = Math.ceil(auth.lockRemainingMs(ip) / 60000);
      return send(res, 429, { error: `失败次数过多，${mins} 分钟后再试` });
    }
    const { password } = await readJson(req);
    if (!auth.verifyPassword(password)) {
      auth.noteFailure(ip);
      console.warn(`[admin] 登录失败 ip=${ip}`);
      return send(res, 401, { error: '口令不对' });
    }
    auth.clearFailures(ip);
    const token = auth.issueToken();
    return send(res, 200, { ok: true }, {
      'set-cookie': auth.sessionCookie(token, { secure: SECURE_COOKIE }),
    });
  }

  if (path === '/logout' && req.method === 'POST') {
    return send(res, 200, { ok: true }, {
      'set-cookie': auth.clearCookie({ secure: SECURE_COOKIE }),
    });
  }

  if (!auth.authenticate(req)) {
    return send(res, 401, { error: '需要登录' });
  }

  if (path === '/session' && req.method === 'GET') {
    return send(res, 200, { ok: true, customPassword: auth.hasCustomPassword() });
  }

  if (path === '/upload' && req.method === 'POST') {
    return send(res, 200, await actions.uploadImage(await readRaw(req, MAX_IMAGE)));
  }

  if (path === '/snapshot' && req.method === 'GET') {
    return send(res, 200, await getAdminSnapshot(), { 'cache-control': 'no-store' });
  }

  // DELETE /xxx/:id
  const del = /^\/(entry|claim|rule|metric)\/(.+)$/.exec(path);
  if (del && req.method === 'DELETE') {
    const [, kind, raw] = del;
    const id = decodeURIComponent(raw);
    if (kind === 'entry') return send(res, 200, await actions.deleteEntry(id));
    if (kind === 'claim') return send(res, 200, await actions.deleteClaim(id));
    if (kind === 'metric') return send(res, 200, await actions.deleteMetric(id));
    return send(res, 200, await actions.deleteRule(id));
  }

  if (req.method !== 'POST') {
    return send(res, 405, { error: `${req.method} 不支持：${path}` });
  }

  const body = await readJson(req);

  switch (path) {
    case '/entry':
      return send(res, 200, await actions.checkIn(body));
    case '/claim':
      return send(res, 200, await actions.recordViolation(body));
    case '/claim/proof':
      return send(res, 200, await actions.addClaimProof(body));
    case '/claim/proof/remove':
      return send(res, 200, await actions.removeClaimProof(body));
    case '/password':
    case '/password/clear': {
      // 改完密码，所有旧会话（含当前这个）都作废，这里立刻给当前这位签一个新的
      const ipKey = `pw:${ip}`;
      if (auth.isLocked(ipKey)) return send(res, 429, { error: '失败次数过多，稍后再试' });
      try {
        if (path === '/password') await actions.setLoginPassword(body);
        else await actions.clearLoginPassword(body);
      } catch (err) {
        if (err instanceof ValidationError && err.message === '当前口令不对') auth.noteFailure(ipKey);
        throw err;
      }
      auth.clearFailures(ipKey);
      return send(res, 200, { ok: true, customPassword: auth.hasCustomPassword() }, {
        'set-cookie': auth.sessionCookie(auth.issueToken(), { secure: SECURE_COOKIE }),
      });
    }
    case '/rule': {
      const { create, ...rest } = body;
      return send(res, 200, create
        ? await actions.createRule(rest)
        : await actions.updateRule(rest.id ?? rest.rule, rest));
    }
    case '/rule/toggle':
      return send(res, 200, await actions.toggleRule(body.id ?? body.rule, body.active));
    case '/metric':
      return send(res, 200, await actions.saveMetric(body));
    case '/waiver':
      return send(res, 200, await actions.setWaiver(body));
    case '/profile':
      return send(res, 200, await actions.saveProfile(body));
    default:
      return send(res, 404, { error: `未知路径：${url.pathname}` });
  }
}

/* ---------- 服务 ---------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const isAdmin = url.pathname.startsWith('/api/admin');

  if (req.method === 'OPTIONS') {
    // admin 不回 CORS 头，预检自然失败——这正是我们要的
    if (isAdmin) return send(res, 403, { error: '跨站请求被拒绝' });
    res.writeHead(204, {
      ...publicCors,
      'access-control-allow-methods': 'GET, OPTIONS',
    });
    return res.end();
  }

  try {
    if (isAdmin) return await handleAdmin(req, res, url);

    if (req.method !== 'GET') return send(res, 405, { error: '只支持 GET' }, publicCors);

    if (url.pathname === '/api/health') {
      return send(res, 200, { ok: true, db: DB_NAME, admin: auth.isConfigured() }, publicCors);
    }

    const media = /^\/api\/media\/([^/]+)$/.exec(url.pathname);
    if (media) {
      const key = decodeURIComponent(media[1]);
      const file = await storage.openImage(key);
      if (!file) return send(res, 404, { error: '图片不存在' }, publicCors);
      res.writeHead(200, {
        'content-type': storage.contentTypeOf(key),
        'content-length': file.size,
        // key 是随机的，同一个 key 的内容永远不变，可以放心长缓存
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        ...publicCors,
      });
      return file.stream.pipe(res);
    }

    if (url.pathname === '/api/snapshot') {
      return send(res, 200, await getSnapshot(), {
        ...publicCors,
        // 数据变化不频繁，但也不能缓存太久——朋友补记录后应该很快可见
        'cache-control': 'public, max-age=30',
      });
    }

    return send(res, 404, { error: `未知路径：${url.pathname}` }, publicCors);
  } catch (err) {
    if (err instanceof ValidationError) {
      return send(res, 400, { error: err.message });
    }
    console.error('[api]', err);
    return send(res, 500, { error: err.message });
  }
});

// 库里的登录密码要在开始接请求前载入内存，鉴权才能保持同步
try {
  auth.loadCredential(await getAuthDoc());
} catch (err) {
  console.error('[api] 读取登录密码失败，仅初始码可用：', err.message);
}

server.listen(PORT, HOST, () => {
  console.log(`[api] http://${HOST}:${PORT}  →  ${URI}/${DB_NAME}`);
  console.log(`[api] 图片目录 ${storage.uploadDir()}`);
  console.log(`[api] admin ${auth.isConfigured() ? '已启用' : '未配置（设 BIP_ADMIN_HASH / BIP_SESSION_SECRET）'}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(async () => {
      await close();
      process.exit(0);
    });
  });
}
