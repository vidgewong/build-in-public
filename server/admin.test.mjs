#!/usr/bin/env node
/**
 * admin API 的端到端测试。跑在独立的测试库上，不碰真实数据。
 *
 *   node server/admin.test.mjs
 */

import { spawn } from 'node:child_process';
import { MongoClient } from 'mongodb';
import { existsSync, rmSync } from 'node:fs';

const DB = 'buildinpublic_test';
const URI = 'mongodb://127.0.0.1:27017';
const PORT = 8799;
const UPLOADS = '/tmp/bip-test-uploads';
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

async function upload(buf, opts = {}) {
  const headers = { 'content-type': 'application/octet-stream' };
  if (opts.cookie !== false && cookie) headers.cookie = cookie;
  const res = await fetch(`${BASE}/api/admin/upload`, { method: 'POST', headers, body: buf });
  let data = null;
  try { data = await res.json(); } catch { /* 空体 */ }
  return { status: res.status, data };
}

// 最小的合法图片头，够过格式嗅探
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);

const mongo = new MongoClient(URI);

async function main() {
  await mongo.connect();
  await mongo.db(DB).dropDatabase();
  rmSync(UPLOADS, { recursive: true, force: true });

  const api = spawn('node', ['server/api.mjs'], {
    env: {
      ...process.env,
      MONGODB_DB: DB,
      API_PORT: String(PORT),
      BIP_ADMIN_HASH: HASH,
      BIP_SESSION_SECRET: SECRET,
      BIP_INSECURE_COOKIE: '1',
      BIP_UPLOAD_DIR: UPLOADS,
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
      create: true, id: 'test-rule', title: '测试规则', cadence: 'daily', amount: 50, startDate: '2026-09-01',
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

    console.log('\n\x1b[1m图片上传\x1b[0m');
    eq('未登录不能上传', (await upload(PNG, { cookie: false })).status, 401);
    eq('非图片被拒', (await upload(Buffer.from('<script>alert(1)</script>'.repeat(5)))).status, 400);
    eq('改了后缀的文本被拒', (await upload(Buffer.from('not an image at all, just text'))).status, 400);
    const up1 = await upload(PNG);
    eq('PNG 上传成功', up1.status, 200);
    eq('key 是随机名+真实扩展名', /^[a-f0-9]{24}\.png$/.test(up1.data?.key ?? ''), true);
    const up2 = await upload(JPG);
    eq('JPG 上传成功', up2.status, 200);
    const pubImg = await fetch(`${BASE}/api/media/${up1.data.key}`);
    eq('匿名可读图片', pubImg.status, 200);
    eq('图片类型正确', pubImg.headers.get('content-type'), 'image/png');
    eq('图片可长缓存', /immutable/.test(pubImg.headers.get('cache-control') ?? ''), true);
    eq('读到的字节一致', Buffer.compare(Buffer.from(await pubImg.arrayBuffer()), PNG), 0);
    eq('路径穿越被拒', (await fetch(`${BASE}/api/media/..%2F..%2Fetc%2Fpasswd`)).status, 404);
    eq('不存在的 key 404', (await fetch(`${BASE}/api/media/${'0'.repeat(24)}.png`)).status, 404);

    console.log('\n\x1b[1m赔付与豁免\x1b[0m');
    eq('没附图不能记赔付',
      (await call('POST', '/api/admin/claim', { rule: 'test-rule', date: '2026-10-03', claimant: '老王' })).status, 400);
    eq('引用不存在的图被拒',
      (await call('POST', '/api/admin/claim', { rule: 'test-rule', date: '2026-10-03', proof: ['f'.repeat(24) + '.png'] })).status, 400);
    eq('引用乱写的 key 被拒',
      (await call('POST', '/api/admin/claim', { rule: 'test-rule', date: '2026-10-03', proof: ['../../etc/passwd'] })).status, 400);
    const claim = await call('POST', '/api/admin/claim', {
      rule: 'test-rule', date: '2026-10-03', claimant: '老王', proof: [up1.data.key],
    });
    eq('记赔付成功', claim.status, 200);
    eq('金额取规则单价', claim.data?.claim?.amount, 80);
    eq('赔付带着证明', claim.data?.claim?.proof?.[0]?.key, up1.data.key);
    eq('同周期重复领取被拒',
      (await call('POST', '/api/admin/claim', { rule: 'test-rule', date: '2026-10-03', claimant: '小李', proof: [up2.data.key] })).status, 400);
    const cid = claim.data.claim.id;
    const added = await call('POST', '/api/admin/claim/proof', { id: cid, proof: [up2.data.key] });
    eq('补图成功', added.data?.claim?.proof?.length, 2);
    eq('重复补同一张被拒',
      (await call('POST', '/api/admin/claim/proof', { id: cid, proof: [up2.data.key] })).status, 400);
    const pubSnap = await (await fetch(`${BASE}/api/snapshot`)).json();
    eq('游客快照里能看到证明', pubSnap.claims?.[0]?.proof?.length, 2);
    eq('删一张成功',
      (await call('POST', '/api/admin/claim/proof/remove', { id: cid, key: up2.data.key })).data?.claim?.proof?.length, 1);
    eq('被删的图文件也清掉了', (await fetch(`${BASE}/api/media/${up2.data.key}`)).status, 404);
    eq('最后一张不能删',
      (await call('POST', '/api/admin/claim/proof/remove', { id: cid, key: up1.data.key })).status, 400);

    console.log('\n\x1b[1m豁免赔付\x1b[0m');
    const w1 = await call('POST', '/api/admin/waiver', { rule: 'test-rule', date: '2026-10-10', reason: '生病' });
    eq('单日豁免成功', w1.data?.added?.length, 1);
    eq('重复豁免被拒', (await call('POST', '/api/admin/waiver', { rule: 'test-rule', date: '2026-10-10' })).status, 400);
    eq('已赔付的周期不能豁免',
      (await call('POST', '/api/admin/waiver', { rule: 'test-rule', date: '2026-10-03' })).status, 400);
    eq('周期格式不对被拒',
      (await call('POST', '/api/admin/waiver', { rule: 'test-rule', period: 'nope' })).status, 400);
    eq('范围反了被拒',
      (await call('POST', '/api/admin/waiver', { rule: 'test-rule', from: '2026-10-12', to: '2026-10-11' })).status, 400);
    eq('豁免后不能再记赔付',
      (await call('POST', '/api/admin/claim', { rule: 'test-rule', date: '2026-10-10', proof: [up1.data.key] })).status, 400);
    const range = await call('POST', '/api/admin/waiver', {
      rules: ['test-rule'], from: '2026-10-08', to: '2026-10-12', reason: '国庆后',
    });
    eq('范围豁免：跳过已豁免的，其余入库', range.data?.added?.length, 4);
    eq('范围豁免：说明跳过原因', range.data?.skipped?.[0]?.why, '已经豁免过了');
    eq('快照里带着豁免赔付',
      (await call('GET', '/api/admin/snapshot')).data?.calendar?.waivers?.length, 5);
    eq('取消单个',
      (await call('POST', '/api/admin/waiver', { rule: 'test-rule', period: '2026-10-10', remove: true })).data?.removed?.length, 1);
    eq('按范围取消',
      (await call('POST', '/api/admin/waiver', { rules: ['test-rule'], from: '2026-10-08', to: '2026-10-12', remove: true })).data?.removed?.length, 4);
    eq('旧的豁免日接口没了',
      (await call('POST', '/api/admin/exemption', { date: '2026-10-04' })).status, 404);

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

    console.log('\n\x1b[1m登录密码\x1b[0m');
    const GOOD = 'Correct-Horse-9-Battery';
    eq('初始状态没有登录密码', (await call('GET', '/api/admin/session')).data?.customPassword, false);
    eq('太短被拒', (await call('POST', '/api/admin/password', { current: PW, password: 'Ab1!' })).status, 400);
    eq('只有一类字符被拒', (await call('POST', '/api/admin/password', { current: PW, password: 'abcdefghijklmnop' })).status, 400);
    eq('两类字符被拒', (await call('POST', '/api/admin/password', { current: PW, password: 'abcdefghij12345' })).status, 400);
    eq('连续重复被拒', (await call('POST', '/api/admin/password', { current: PW, password: 'Aaaaaa-1234567' })).status, 400);
    eq('当前口令不对被拒', (await call('POST', '/api/admin/password', { current: 'nope', password: GOOD })).status, 400);
    const oldCookie = cookie;
    eq('设置登录密码成功', (await call('POST', '/api/admin/password', { current: PW, password: GOOD })).data?.customPassword, true);
    const newCookie = cookie;
    eq('设置后旧会话失效', (await (async () => {
      cookie = oldCookie; const r = await call('GET', '/api/admin/session'); cookie = newCookie; return r;
    })()).status, 401);
    eq('当前会话换成了新的', (await call('GET', '/api/admin/session')).status, 200);
    cookie = '';
    eq('新密码能登录', (await call('POST', '/api/admin/login', { password: GOOD })).status, 200);
    cookie = '';
    eq('初始码依然能登录', (await call('POST', '/api/admin/login', { password: PW })).status, 200);
    eq('Bearer 新密码可用',
      (await call('GET', '/api/admin/session', undefined, { cookie: false, bearer: GOOD })).status, 200);
    eq('移除登录密码', (await call('POST', '/api/admin/password/clear', { current: GOOD })).data?.customPassword, false);
    cookie = '';
    eq('移除后新密码不能登录', (await call('POST', '/api/admin/login', { password: GOOD })).status, 401);
    eq('移除后初始码仍可登录', (await call('POST', '/api/admin/login', { password: PW })).status, 200);

    console.log('\n\x1b[1m删除\x1b[0m');
    const before = await call('GET', '/api/admin/snapshot');
    eq('删除前有打卡', before.data?.entries?.length > 0, true);
    eq('级联删除规则', (await call('DELETE', '/api/admin/rule/test-rule')).status, 200);
    const after = await call('GET', '/api/admin/snapshot');
    eq('规则没了', after.data?.rules?.length, 0);
    eq('关联打卡一起删了', after.data?.entries?.length, 0);
    eq('关联赔付一起删了', after.data?.claims?.length, 0);
    eq('关联赔付的图片文件也删了', existsSync(`${UPLOADS}/${up1.data.key}`), false);
    eq('删不存在的记录报 400', (await call('DELETE', '/api/admin/entry/nope')).status, 400);

    console.log('\n\x1b[1m登出\x1b[0m');
    await call('POST', '/api/admin/logout', undefined, { keepCookie: false });
    cookie = '';
    eq('登出后写请求被拒', (await call('POST', '/api/admin/rule', { id: 'x' })).status, 401);
  } finally {
    api.kill();
    await mongo.db(DB).dropDatabase();
    rmSync(UPLOADS, { recursive: true, force: true });
    await mongo.close();
  }

  console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass} 通过，${fail} 失败\x1b[0m\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
