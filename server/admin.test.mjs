#!/usr/bin/env node
/**
 * admin API 的端到端测试。跑在独立的测试库上，不碰真实数据。
 *
 *   node server/admin.test.mjs
 */

import { spawn } from 'node:child_process';
import { MongoClient } from 'mongodb';

const DB = 'buildinpublic_test';
const URI = 'mongodb://127.0.0.1:27017';
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const PW = 'test-pw-12345';
const HASH = 'scrypt$d6b2367074ec2ac03252a19d740bafdc$3820867d110159923880a7dfd1d7e622eefbcc2ac17ace97c0ecc25e1c45d636';
const SECRET = 'kkVRdQz_bkWVqyRqJcxvqUMqajdJbiCvp8JNQc-4Eec';

let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); };
const no = (name, detail) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${detail}`); };

function eq(name, actual, expected) {
  if (actual === expected) ok(name);
  else no(name, `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

let cookie = '';
async function call(method, path, body, opts = {}) {
  const headers = { 'content-type': 'application/json' };
  if (opts.cookie !== false && cookie) headers.cookie = cookie;
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  if (opts.origin) headers.origin = opts.origin;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie && opts.keepCookie !== false) cookie = setCookie.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch { /* 空体 */ }
  return { status: res.status, data };
}

const mongo = new MongoClient(URI);

async function main() {
  await mongo.connect();
  await mongo.db(DB).dropDatabase();

  const api = spawn('node', ['server/api.mjs'], {
    env: {
      ...process.env,
      MONGODB_DB: DB,
      API_PORT: String(PORT),
      BIP_ADMIN_HASH: HASH,
      BIP_SESSION_SECRET: SECRET,
      BIP_INSECURE_COOKIE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  api.stderr.on('data', (d) => process.stderr.write(`[api] ${d}`));

  // 等端口起来
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${BASE}/api/health`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }

  try {
    console.log('\n\x1b[1m鉴权\x1b[0m');
    eq('未登录写请求被拒', (await call('POST', '/api/admin/rule', { id: 'x' })).status, 401);
    eq('未登录读 snapshot 被拒', (await call('GET', '/api/admin/snapshot')).status, 401);
    eq('错口令被拒', (await call('POST', '/api/admin/login', { password: 'wrong' })).status, 401);
    eq('跨站 Origin 被拒',
      (await call('POST', '/api/admin/login', { password: PW }, { origin: 'https://evil.com' })).status, 403);
    eq('对口令登录成功', (await call('POST', '/api/admin/login', { password: PW })).status, 200);
    eq('登录后 session 有效', (await call('GET', '/api/admin/session')).status, 200);
    eq('Bearer 口令也能写',
      (await call('GET', '/api/admin/session', undefined, { cookie: false, bearer: PW })).status, 200);
    eq('伪造 Cookie 被拒', (await (async () => {
      const saved = cookie; cookie = 'bip_session=forged.sig';
      const r = await call('GET', '/api/admin/session'); cookie = saved; return r;
    })()).status, 401);

    console.log('\n\x1b[1m规则\x1b[0m');
    const created = await call('POST', '/api/admin/rule', {
      create: true, id: 'test-rule', title: '测试规则', cadence: 'daily', amount: 50,
    });
    eq('新建规则', created.status, 200);
    eq('规则字段正确', created.data?.amount, 50);
    eq('重复 id 被拒',
      (await call('POST', '/api/admin/rule', { create: true, id: 'test-rule', title: 'x' })).status, 400);
    eq('非法 cadence 被拒',
      (await call('POST', '/api/admin/rule', { create: true, id: 'bad-c', cadence: 'yearly' })).status, 400);
    eq('非法 type 被拒',
      (await call('POST', '/api/admin/rule', { create: true, id: 'bad-t', type: 'nope' })).status, 400);
    eq('未知字段被拒',
      (await call('POST', '/api/admin/rule', { create: true, id: 'bad-f', titel: '拼错了' })).status, 400);
    eq('更新规则', (await call('POST', '/api/admin/rule', { id: 'test-rule', amount: 80 })).data?.amount, 80);
    eq('中文名定位规则', (await call('POST', '/api/admin/rule', { id: '测试规则', detail: '改了' })).data?.detail, '改了');
    eq('停用规则', (await call('POST', '/api/admin/rule/toggle', { id: 'test-rule', active: false })).data?.active, false);
    await call('POST', '/api/admin/rule/toggle', { id: 'test-rule', active: true });

    console.log('\n\x1b[1m打卡\x1b[0m');
    const entry = await call('POST', '/api/admin/entry', {
      rule: 'test-rule', date: '2026-10-05',
      media: [{ type: 'image', url: 'https://example.com/a.jpg' }],
      note: '第一次',
    });
    eq('打卡成功', entry.status, 200);
    eq('周期推导正确', entry.data?.period, '2026-10-05');
    eq('新建而非更新', entry.data?.created, true);
    const again = await call('POST', '/api/admin/entry', {
      rule: 'test-rule', date: '2026-10-05', media: [{ url: 'https://example.com/b.jpg' }],
    });
    eq('同周期重复打卡是补充证明', again.data?.created, false);
    eq('证明累加到 2 条', again.data?.entry?.media?.length, 2);
    eq('日期简写 yesterday 可用',
      (await call('POST', '/api/admin/entry', { rule: 'test-rule', date: 'yesterday' })).status, 200);
    eq('非法日期被拒',
      (await call('POST', '/api/admin/entry', { rule: 'test-rule', date: '乱写' })).status, 400);
    eq('找不到的规则被拒',
      (await call('POST', '/api/admin/entry', { rule: 'no-such-rule' })).status, 400);

    console.log('\n\x1b[1m赔付与豁免\x1b[0m');
    const claim = await call('POST', '/api/admin/claim', {
      rule: 'test-rule', date: '2026-10-03', claimant: '老王',
    });
    eq('记赔付成功', claim.status, 200);
    eq('金额取规则单价', claim.data?.claim?.amount, 80);
    eq('同周期重复领取被拒',
      (await call('POST', '/api/admin/claim', { rule: 'test-rule', date: '2026-10-03', claimant: '小李' })).status, 400);
    eq('标豁免日', (await call('POST', '/api/admin/exemption', { date: '2026-10-04', reason: '出差' })).data?.added, true);
    eq('重复豁免被拒', (await call('POST', '/api/admin/exemption', { date: '2026-10-04' })).status, 400);
    eq('撤销豁免',
      (await call('POST', '/api/admin/exemption', { date: '2026-10-04', remove: true })).data?.removed, true);

    console.log('\n\x1b[1m指标\x1b[0m');
    eq('新建指标', (await call('POST', '/api/admin/metric', { key: 'weight', value: 60.5, label: '体重', unit: 'kg' })).status, 200);
    const m2 = await call('POST', '/api/admin/metric', { key: 'weight', value: 60.1 });
    eq('更新保留 label', m2.data?.metric?.label, '体重');
    eq('记录前值', m2.data?.prev, 60.5);
    eq('非法 visibility 被拒',
      (await call('POST', '/api/admin/metric', { key: 'weight', value: 60, visibility: 'secret' })).status, 400);
    const snap = await call('GET', '/api/admin/snapshot');
    const w = snap.data?.metrics?.find((m) => m.key === 'weight');
    eq('历史累计 2 条', w?.history?.length, 2);

    console.log('\n\x1b[1m公开接口不受影响\x1b[0m');
    const pub = await fetch(`${BASE}/api/snapshot`);
    eq('匿名可读 snapshot', pub.status, 200);
    eq('公开接口有 CORS 头', pub.headers.get('access-control-allow-origin'), '*');
    const pubData = await pub.json();
    eq('公开 snapshot 不含 settings', pubData.settings, undefined);
    eq('公开接口拒绝写', (await fetch(`${BASE}/api/snapshot`, { method: 'POST' })).status, 405);

    console.log('\n\x1b[1m删除\x1b[0m');
    const before = await call('GET', '/api/admin/snapshot');
    eq('删除前有打卡', before.data?.entries?.length > 0, true);
    eq('级联删除规则', (await call('DELETE', '/api/admin/rule/test-rule')).status, 200);
    const after = await call('GET', '/api/admin/snapshot');
    eq('规则没了', after.data?.rules?.length, 0);
    eq('关联打卡一起删了', after.data?.entries?.length, 0);
    eq('关联赔付一起删了', after.data?.claims?.length, 0);
    eq('删不存在的记录报 400', (await call('DELETE', '/api/admin/entry/nope')).status, 400);

    console.log('\n\x1b[1m登出\x1b[0m');
    await call('POST', '/api/admin/logout', undefined, { keepCookie: false });
    cookie = '';
    eq('登出后写请求被拒', (await call('POST', '/api/admin/rule', { id: 'x' })).status, 401);
  } finally {
    api.kill();
    await mongo.db(DB).dropDatabase();
    await mongo.close();
  }

  console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass} 通过，${fail} 失败\x1b[0m\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
