/**
 * 仓储层：所有对 Mongo 的读写都经过这里。
 * CLI (bin/bip.mjs) 与 API (server/api.mjs) 共用，避免两边逻辑漂移。
 */

import {
  collections,
  connect,
  ensureIndexes,
  DEFAULT_CALENDAR,
  DEFAULT_SETTINGS,
} from './db.mjs';

/** 去掉 Mongo 的 _id，让文档形状和 src/lib/domain.ts 的类型完全一致 */
const strip = ({ _id, ...rest }) => rest;

let ready = null;
async function cols() {
  if (!ready) {
    ready = (async () => {
      const db = await connect();
      await ensureIndexes(db);
      return collections(db);
    })();
  }
  return ready;
}

/* ---------- 读 ---------- */

export async function getRules({ activeOnly = false } = {}) {
  const c = await cols();
  const filter = activeOnly ? { active: true } : {};
  // order 控制站点上的展示顺序，没有就退回按 id
  const docs = await c.rules.find(filter).sort({ order: 1, id: 1 }).toArray();
  return docs.map(strip);
}

export async function getEntries() {
  const c = await cols();
  const docs = await c.entries.find({}).sort({ date: 1 }).toArray();
  return docs.map(strip);
}

export async function getClaims() {
  const c = await cols();
  const docs = await c.claims.find({}).sort({ paidAt: 1 }).toArray();
  return docs.map(strip);
}

export async function getMetrics() {
  const c = await cols();
  const docs = await c.metrics.find({}).sort({ order: 1, key: 1 }).toArray();
  return docs.map(strip);
}

export async function getConfig() {
  const c = await cols();
  const [profile, calendar, settings] = await Promise.all([
    c.config.findOne({ _id: 'profile' }),
    c.config.findOne({ _id: 'calendar' }),
    c.config.findOne({ _id: 'settings' }),
  ]);
  return {
    profile: profile ? strip(profile) : null,
    calendar: calendar ? strip(calendar) : { ...DEFAULT_CALENDAR },
    settings: { ...DEFAULT_SETTINGS, ...(settings ? strip(settings) : {}) },
  };
}

/** 站点一次性需要的全部数据 */
export async function getSnapshot() {
  const [rules, entries, claims, metrics, config] = await Promise.all([
    getRules(),
    getEntries(),
    getClaims(),
    getMetrics(),
    getConfig(),
  ]);
  return {
    rules,
    entries,
    claims,
    metrics,
    calendar: config.calendar,
    profile: config.profile,
    claimWindowDays: config.settings.claimWindowDays,
    currency: config.settings.currency,
  };
}

/**
 * admin 用的快照：包含停用的规则和指标历史，站点快照不给这些。
 */
export async function getAdminSnapshot() {
  const [rules, entries, claims, metrics, config] = await Promise.all([
    getRules(),
    getEntries(),
    getClaims(),
    getMetrics(),
    getConfig(),
  ]);
  return {
    rules,
    entries,
    claims,
    metrics,
    calendar: config.calendar,
    profile: config.profile,
    settings: config.settings,
  };
}

export async function findRuleById(id) {
  const c = await cols();
  const doc = await c.rules.findOne({ id });
  return doc ? strip(doc) : null;
}

export async function findEntry(ruleId, period) {
  const c = await cols();
  const doc = await c.entries.findOne({ ruleId, period });
  return doc ? strip(doc) : null;
}

export async function hasClaim(ruleId, period) {
  const c = await cols();
  return (await c.claims.countDocuments({ ruleId, period }, { limit: 1 })) > 0;
}

/* ---------- 写 ---------- */

export async function upsertRule(rule) {
  const c = await cols();
  await c.rules.updateOne({ id: rule.id }, { $set: rule }, { upsert: true });
  return rule;
}

export async function patchRule(id, patch) {
  const c = await cols();
  const doc = await c.rules.findOneAndUpdate(
    { id },
    { $set: patch },
    { returnDocument: 'after' }
  );
  return doc ? strip(doc) : null;
}

/**
 * 打卡：同一规则同一周期只保留一条，重复提交视为补充证明。
 */
export async function putEntry(entry) {
  const c = await cols();
  const { ruleId, period, media = [], note, date, id, createdAt } = entry;
  const existing = await c.entries.findOne({ ruleId, period });

  if (existing) {
    const update = { $set: { date } };
    if (note) update.$set.note = note;
    if (media.length) update.$push = { media: { $each: media } };
    await c.entries.updateOne({ _id: existing._id }, update);
    return { created: false, entry: strip(await c.entries.findOne({ _id: existing._id })) };
  }

  const doc = {
    id,
    ruleId,
    period,
    date,
    ...(note ? { note } : {}),
    ...(media.length ? { media } : {}),
    createdAt: createdAt ?? new Date().toISOString(),
  };
  await c.entries.insertOne({ ...doc });
  return { created: true, entry: doc };
}

export async function addClaim(claim) {
  const c = await cols();
  await c.claims.insertOne({ ...claim });
  return claim;
}

export async function deleteEntry(id) {
  const c = await cols();
  const res = await c.entries.deleteOne({ id });
  return res.deletedCount > 0;
}

export async function deleteClaim(id) {
  const c = await cols();
  const res = await c.claims.deleteOne({ id });
  return res.deletedCount > 0;
}

/** 删规则时连它的打卡和赔付一起删，不然会留下找不到归属的孤儿数据 */
export async function deleteRuleCascade(ruleId) {
  const c = await cols();
  const [entries, claims] = await Promise.all([
    c.entries.deleteMany({ ruleId }),
    c.claims.deleteMany({ ruleId }),
  ]);
  await c.rules.deleteOne({ id: ruleId });
  return { entries: entries.deletedCount, claims: claims.deletedCount };
}

export async function deleteMetric(key) {
  const c = await cols();
  const res = await c.metrics.deleteOne({ key });
  return res.deletedCount > 0;
}

export async function saveProfile(patch) {
  const c = await cols();
  const doc = await c.config.findOneAndUpdate(
    { _id: 'profile' },
    { $set: patch },
    { returnDocument: 'after', upsert: true }
  );
  return doc ? strip(doc) : null;
}

export async function setMetric(key, patch) {
  const c = await cols();
  const doc = await c.metrics.findOneAndUpdate(
    { key },
    { $set: patch },
    { returnDocument: 'after' }
  );
  return doc ? strip(doc) : null;
}

export async function upsertMetric(metric) {
  const c = await cols();
  await c.metrics.updateOne({ key: metric.key }, { $set: metric }, { upsert: true });
  return metric;
}

export async function pushMetricHistory(key, point, cap = 200) {
  const c = await cols();
  await c.metrics.updateOne(
    { key },
    { $push: { history: { $each: [point], $slice: -cap } } }
  );
}

export async function addExemption(date, reason) {
  const c = await cols();
  // 先保证 calendar 文档存在（分两步，避免 upsert 撞上 _id 唯一键）
  await c.config.updateOne(
    { _id: 'calendar' },
    { $setOnInsert: { ...DEFAULT_CALENDAR } },
    { upsert: true }
  );
  const res = await c.config.updateOne(
    { _id: 'calendar', 'manualExemptions.date': { $ne: date } },
    { $push: { manualExemptions: { $each: [{ date, reason }], $sort: { date: 1 } } } }
  );
  return res.modifiedCount > 0;
}

export async function removeExemption(date) {
  const c = await cols();
  const res = await c.config.updateOne(
    { _id: 'calendar' },
    { $pull: { manualExemptions: { date } } }
  );
  return res.modifiedCount > 0;
}
