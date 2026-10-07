#!/usr/bin/env node
/**
 * 初始化数据库。
 *
 *   node server/seed.mjs                只写入 profile / settings 骨架，规则留空
 *   node server/seed.mjs --from-json    额外导入 data/*.json 的测试数据
 *   node server/seed.mjs --reset        先清空再写
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { close, collections, connect, ensureIndexes, DB_NAME, DEFAULT_CALENDAR, DEFAULT_SETTINGS, URI } from './db.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');

const argv = process.argv.slice(2);
const fromJson = argv.includes('--from-json');
const reset = argv.includes('--reset');

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const SKELETON_PROFILE = {
  name: 'Vidge',
  handle: '@vidge',
  birthday: '1994-11-18',
  startDate: new Date().toISOString().slice(0, 10),
  tagline: '我愿意用钱来规范自己的行为，直到这些习惯成为我的一部分。',
  contact: '微信好友都可以参与',
};

async function main() {
  const db = await connect();
  await ensureIndexes(db);
  const c = collections(db);

  if (reset) {
    await Promise.all([
      c.rules.deleteMany({}),
      c.entries.deleteMany({}),
      c.claims.deleteMany({}),
      c.metrics.deleteMany({}),
      c.config.deleteMany({}),
    ]);
    console.log('已清空所有集合');
  }

  if (fromJson) {
    const rules = readJson('rules.json');
    const entries = readJson('entries.json');
    const claims = readJson('claims.json');
    const calendar = readJson('calendar.json');
    const profileFile = readJson('profile.json');

    // order 保留 JSON 里的顺序，站点展示顺序才和原来一致
    await bulkUpsert(c.rules, rules.map((r, i) => ({ ...r, order: i })), 'id');
    await bulkUpsert(c.entries, entries, 'id');
    await bulkUpsert(c.claims, claims, 'id');
    await bulkUpsert(c.metrics, profileFile.metrics.map((m, i) => ({ ...m, order: i })), 'key');

    await c.config.updateOne(
      { _id: 'profile' },
      { $set: profileFile.profile },
      { upsert: true }
    );
    await c.config.updateOne(
      { _id: 'calendar' },
      { $set: calendar },
      { upsert: true }
    );
    await c.config.updateOne(
      { _id: 'settings' },
      {
        $set: {
          claimWindowDays: profileFile.claimWindowDays ?? DEFAULT_SETTINGS.claimWindowDays,
          currency: profileFile.currency ?? DEFAULT_SETTINGS.currency,
        },
      },
      { upsert: true }
    );

    console.log(
      `已导入测试数据：规则 ${rules.length} · 打卡 ${entries.length} · 赔付 ${claims.length} · 指标 ${profileFile.metrics.length}`
    );
  } else {
    // 骨架：有 profile 和 settings 站点就能正常渲染，规则由 bip rule add 慢慢加
    await c.config.updateOne({ _id: 'profile' }, { $setOnInsert: SKELETON_PROFILE }, { upsert: true });
    await c.config.updateOne({ _id: 'calendar' }, { $setOnInsert: DEFAULT_CALENDAR }, { upsert: true });
    await c.config.updateOne({ _id: 'settings' }, { $setOnInsert: DEFAULT_SETTINGS }, { upsert: true });
    console.log('已写入 profile / calendar / settings 骨架（规则为空）');
  }

  const counts = await Promise.all(
    ['rules', 'entries', 'claims', 'metrics', 'config'].map(async (k) => `${k}=${await c[k].countDocuments()}`)
  );
  console.log(`${URI}/${DB_NAME}  ${counts.join('  ')}`);

  await close();
}

async function bulkUpsert(col, docs, key) {
  if (!docs.length) return;
  await col.bulkWrite(
    docs.map((d) => ({
      updateOne: { filter: { [key]: d[key] }, update: { $set: d }, upsert: true },
    }))
  );
}

main().catch(async (err) => {
  console.error('✗', err.message);
  if (/ECONNREFUSED|ServerSelection/.test(err.message)) {
    console.error(`  连不上 MongoDB（${URI}）。先跑：npm run db:up`);
  }
  await close();
  process.exit(1);
});
