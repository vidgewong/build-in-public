import { useState } from 'react';
import type { PanelProps } from './AdminApp';
import { adminApi, type RuleInput } from '../../lib/admin-api';
import { todayKey, type Rule } from '../../lib/domain';

const CADENCES = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'event', label: '随时（撞见即赔）' },
];

const TYPES = [
  { value: 'checkin', label: '打卡：没做到就赔' },
  { value: 'violation', label: '违约：做了就赔' },
];

/** 约定面板：新建、改、启停、删。删除是级联的，所以确认框写清楚会连带删掉什么。 */
export default function RulesPanel({ snap, run }: PanelProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const rules = [...snap.rules].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return (a.order ?? 0) - (b.order ?? 0);
  });

  return (
    <>
      <section className="admin-section">
        <div className="admin-section-head">
          <h2 className="admin-h2">
            共 <span className="mono">{rules.length}</span> 条
          </h2>
          <button
            type="button"
            className="admin-btn is-primary is-small"
            onClick={() => { setCreating(!creating); setEditing(null); }}
          >
            {creating ? '收起' : '+ 新建'}
          </button>
        </div>

        {creating && (
          <RuleForm
            mode="create"
            onCancel={() => setCreating(false)}
            onSubmit={async (patch) => {
              const okay = await run(() => adminApi.createRule(patch as RuleInput), '已新建');
              if (okay) setCreating(false);
            }}
          />
        )}
      </section>

      <section className="admin-section">
        <ul className="admin-list">
          {rules.map((r) => (
            <li className={`admin-row${r.active ? '' : ' is-off'}`} key={r.id}>
              <div className="admin-row-main">
                <span className="admin-row-title">
                  {r.title}
                  {!r.active && <span className="admin-tag">已停用</span>}
                </span>
                <span className="admin-row-sub mono">
                  {r.id} · {CADENCES.find((c) => c.value === r.cadence)?.label ?? r.cadence} · ¥{r.amount} ·{' '}
                  {r.type === 'checkin' ? '打卡' : '违约'}
                  {r.holidayExempt ? ' · 节假日豁免' : ''}
                </span>
              </div>
              <div className="admin-row-actions">
                <button
                  type="button"
                  className="admin-btn is-small"
                  onClick={() => { setEditing(editing === r.id ? null : r.id); setCreating(false); }}
                >
                  {editing === r.id ? '收起' : '改'}
                </button>
                <button
                  type="button"
                  className="admin-btn is-small"
                  onClick={() => void run(() => adminApi.toggleRule(r.id, !r.active), r.active ? '已停用' : '已启用')}
                >
                  {r.active ? '停' : '启'}
                </button>
                <button
                  type="button"
                  className="admin-btn is-danger is-small"
                  onClick={() => {
                    const n = snap.entries.filter((e) => e.ruleId === r.id).length;
                    const c = snap.claims.filter((x) => x.ruleId === r.id).length;
                    if (!confirm(`删除「${r.title}」？\n会连带删掉 ${n} 条打卡、${c} 笔赔付，且无法撤销。`)) return;
                    void run(() => adminApi.deleteRule(r.id), '已删除');
                  }}
                >
                  删
                </button>
              </div>

              {editing === r.id && (
                <RuleForm
                  mode="edit"
                  rule={r}
                  onCancel={() => setEditing(null)}
                  onSubmit={async (patch) => {
                    const okay = await run(() => adminApi.updateRule({ ...patch, id: r.id }), '已保存');
                    if (okay) setEditing(null);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

type Draft = {
  id: string; title: string; short: string; cadence: string; type: string;
  amount: string; proof: string; detail: string; startDate: string; holidayExempt: boolean;
};

function RuleForm({
  mode, rule, onSubmit, onCancel,
}: {
  mode: 'create' | 'edit';
  rule?: Rule;
  onSubmit: (patch: Partial<RuleInput> & { id?: string }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>({
    id: rule?.id ?? '',
    title: rule?.title ?? '',
    short: rule?.short ?? '',
    cadence: rule?.cadence ?? 'daily',
    type: rule?.type ?? 'checkin',
    amount: String(rule?.amount ?? 28),
    proof: rule?.proof ?? '',
    detail: rule?.detail ?? '',
    startDate: rule?.startDate ?? todayKey(),
    holidayExempt: rule?.holidayExempt ?? false,
  });

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const submit = () => {
    const base = {
      title: d.title.trim(),
      short: d.short.trim(),
      cadence: d.cadence,
      type: d.type,
      amount: Number(d.amount),
      proof: d.proof.trim(),
      detail: d.detail.trim(),
      startDate: d.startDate,
      holidayExempt: d.holidayExempt,
    };
    void onSubmit(mode === 'create' ? { ...base, id: d.id.trim() } : base);
  };

  return (
    <div className="admin-subform">
      {mode === 'create' && (
        <label className="admin-field">
          <span className="admin-field-label">id（英文，建好不能改）</span>
          <input
            className="admin-input mono"
            value={d.id}
            onChange={(e) => set('id', e.target.value)}
            placeholder="meditate"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>
      )}

      <label className="admin-field">
        <span className="admin-field-label">标题</span>
        <input className="admin-input" value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="每天冥想 10 分钟" />
      </label>

      <label className="admin-field">
        <span className="admin-field-label">简称（表格里显示，建议 2–4 字）</span>
        <input className="admin-input" value={d.short} onChange={(e) => set('short', e.target.value)} placeholder="冥想" />
      </label>

      <div className="admin-field-row">
        <label className="admin-field">
          <span className="admin-field-label">周期</span>
          <select className="admin-input" value={d.cadence} onChange={(e) => {
            const v = e.target.value;
            // event 只可能是「撞见即赔」，顺手把 type 带过去，免得提交被打回
            setD((p) => ({ ...p, cadence: v, type: v === 'event' ? 'violation' : p.type }));
          }}>
            {CADENCES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>

        <label className="admin-field">
          <span className="admin-field-label">金额</span>
          <input className="admin-input mono" type="number" inputMode="decimal" value={d.amount} onChange={(e) => set('amount', e.target.value)} />
        </label>
      </div>

      <label className="admin-field">
        <span className="admin-field-label">类型</span>
        <select className="admin-input" value={d.type} onChange={(e) => set('type', e.target.value)} disabled={d.cadence === 'event'}>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>

      <label className="admin-field">
        <span className="admin-field-label">要拿出什么证明</span>
        <input className="admin-input" value={d.proof} onChange={(e) => set('proof', e.target.value)} placeholder="当天的冥想 App 截图" />
      </label>

      <label className="admin-field">
        <span className="admin-field-label">细则</span>
        <textarea className="admin-input admin-textarea" rows={3} value={d.detail} onChange={(e) => set('detail', e.target.value)} />
      </label>

      <div className="admin-field-row">
        <label className="admin-field">
          <span className="admin-field-label">起算日</span>
          <input className="admin-input" type="date" value={d.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </label>

        <label className="admin-check">
          <input type="checkbox" checked={d.holidayExempt} onChange={(e) => set('holidayExempt', e.target.checked)} />
          <span>法定节假日豁免</span>
        </label>
      </div>

      <div className="admin-actions">
        <button type="button" className="admin-btn is-primary" onClick={submit} disabled={mode === 'create' && !d.id.trim()}>
          {mode === 'create' ? '新建' : '保存'}
        </button>
        <button type="button" className="admin-btn" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
