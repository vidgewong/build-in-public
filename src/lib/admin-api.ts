/**
 * admin 的接口客户端。
 * 会话靠 HttpOnly Cookie，所以每个请求都要 credentials: 'include'——
 * 漏了它浏览器不带 Cookie，服务端一律看成未登录。
 */

const BASE = import.meta.env.VITE_API_BASE ?? '';

export class AuthError extends Error {}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api/admin${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* 可能是空体 */
  }

  if (res.status === 401) throw new AuthError('需要登录');
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `接口返回 ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export const adminApi = {
  login: (password: string) => call<{ ok: true }>('POST', '/login', { password }),
  logout: () => call<{ ok: true }>('POST', '/logout'),
  session: () => call<{ ok: true }>('GET', '/session'),
  snapshot: () => call<AdminSnapshot>('GET', '/snapshot'),

  saveEntry: (body: EntryInput) => call<unknown>('POST', '/entry', body),
  deleteEntry: (id: string) => call<unknown>('DELETE', `/entry/${encodeURIComponent(id)}`),

  saveClaim: (body: ClaimInput) => call<unknown>('POST', '/claim', body),
  deleteClaim: (id: string) => call<unknown>('DELETE', `/claim/${encodeURIComponent(id)}`),

  createRule: (body: RuleInput) => call<unknown>('POST', '/rule', { ...body, create: true }),
  updateRule: (body: RuleInput) => call<unknown>('POST', '/rule', body),
  toggleRule: (id: string, active: boolean) => call<unknown>('POST', '/rule/toggle', { id, active }),
  deleteRule: (id: string) => call<unknown>('DELETE', `/rule/${encodeURIComponent(id)}`),

  saveMetric: (body: MetricInput) => call<unknown>('POST', '/metric', body),
  deleteMetric: (key: string) => call<unknown>('DELETE', `/metric/${encodeURIComponent(key)}`),

  setExemption: (date: string, reason?: string, remove?: boolean) =>
    call<unknown>('POST', '/exemption', { date, reason, remove }),

  saveProfile: (body: Partial<Profile>) => call<unknown>('POST', '/profile', body),
};

/* ---------- 类型 ---------- */

import type { Calendar, Claim, Entry, Rule } from './domain';
import type { Metric, Profile } from './data';

export interface AdminSnapshot {
  rules: Rule[];
  entries: Entry[];
  claims: Claim[];
  metrics: Metric[];
  calendar: Calendar;
  profile: Profile | null;
  settings: { claimWindowDays: number; currency: string };
}

export interface EntryInput {
  rule: string;
  date?: string;
  period?: string;
  note?: string;
  media?: { type?: string; url: string }[];
}

export interface ClaimInput {
  rule: string;
  date?: string;
  claimant?: string;
  amount?: number;
  note?: string;
}

export interface RuleInput {
  id: string;
  title?: string;
  short?: string;
  cadence?: string;
  type?: string;
  amount?: number;
  proof?: string;
  detail?: string;
  startDate?: string;
  holidayExempt?: boolean;
  active?: boolean;
  order?: number;
}

export interface MetricInput {
  key: string;
  value: string | number | null;
  label?: string;
  unit?: string;
  visibility?: string;
  target?: number | string;
  hint?: string;
}
