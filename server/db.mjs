/**
 * MongoDB 连接与集合访问。
 * CLI 和 API 共用这一份，保证两边读写的是同一套集合。
 *
 * 集合：
 *   rules    规则定义
 *   entries  打卡记录（含证明）
 *   claims   赔付记录
 *   metrics  人物指标
 *   config   单文档配置：_id = 'profile' | 'calendar' | 'settings'
 */

import { MongoClient } from 'mongodb';

export const URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
export const DB_NAME = process.env.MONGODB_DB ?? 'buildinpublic';

let client = null;
let db = null;

export async function connect() {
  if (db) return db;
  client = new MongoClient(URI, {
    // 本地库不需要长等待，连不上就赶紧报错
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  db = client.db(DB_NAME);
  return db;
}

export async function close() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

export function collections(database) {
  return {
    rules: database.collection('rules'),
    entries: database.collection('entries'),
    claims: database.collection('claims'),
    metrics: database.collection('metrics'),
    config: database.collection('config'),
  };
}

/** 索引。每次启动调一次，Mongo 对已存在的索引是幂等的。 */
export async function ensureIndexes(database) {
  const c = collections(database);
  await Promise.all([
    c.rules.createIndex({ id: 1 }, { unique: true }),
    c.entries.createIndex({ id: 1 }, { unique: true }),
    // 一个规则的一个周期只能有一条打卡
    c.entries.createIndex({ ruleId: 1, period: 1 }, { unique: true }),
    c.entries.createIndex({ date: 1 }),
    c.claims.createIndex({ id: 1 }, { unique: true }),
    c.claims.createIndex({ ruleId: 1, period: 1 }),
    c.claims.createIndex({ paidAt: 1 }),
    c.metrics.createIndex({ key: 1 }, { unique: true }),
  ]);
}

export const DEFAULT_SETTINGS = { claimWindowDays: 30, currency: '¥' };
export const DEFAULT_CALENDAR = { legalHolidays: {}, manualExemptions: [] };
