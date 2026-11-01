import { useState } from 'react';
import type { PanelProps } from './AdminApp';
import { adminApi, type RuleInput } from '../../lib/admin-api';
import { todayKey, type Rule } from '../../lib/domain';
import { MasterDetail } from './Workspace';

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

/** 约定面板：左边是全部约定，右边编辑。删除是级联的，所以确认框写清楚会连带删掉什么。 */
export default function RulesPanel({ snap, run }: PanelProps) {
  /** 'new' = 新建；规则 id = 编辑；null = 没在编辑 */
  const [sel, setSel] = useState<string | null>(null);

  const rules = [...snap.rules].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return (a.order ?? 0) - (b.order ?? 0);
  });
  const current = sel && sel !== 'new' ? rules.find((r) => r.id === sel) : undefined;

  return (
    <MasterDetail
      title="约定"
      stats={(() => {
        const on = rules.filter((r) => r.active).length;
        return on === rules.length ? (
          <span className="stat"><b className="mono">{on}</b> 条约定</span>
        ) : (
          <span className="stat"><b className="mono">{on}</b> 条生效 · {rules.length - on} 条已停</span>
        );
      })()}
      listTitle="全部约定"
      listTools={
        <button type="button" className="admin-btn is-primary is-small" onClick={() => setSel('new')}>
          + 新建
        </button>
      }
      list={
        <ul className="lrows">
          {rules.map((r) => (
            <li className={`admin-row is-pick${r.active ? '' : ' is-off'}${sel === r.id ? ' is-sel' : ''}`} key={r.id}>
              <button type="button" className="admin-row-main row-hit" onClick={() => setSel(r.id)}>
                <span className="admin-row-title">
                  {r.title}
                  {!r.active && <span className="admin-tag">已停用</span>}
                </span>
                <span className="admin-row-sub mono">
                  {r.id} · {CADENCES.find((c) => c.value === r.cadence)?.label ?? r.cadence} · ¥{r.amount} ·{' '}
                  {r.type === 'checkin' ? '打卡' : '违约'}
                </span>
              </button>
              <div className="admin-row-actions">
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
                    if (sel === r.id) setSel(null);
                    void run(() => adminApi.deleteRule(r.id), '已删除');
                  }}
                >
                  删
                </button>
              </div>
            </li>
          ))}
        </ul>
      }
      open={sel === 'new' || !!current}
      onClose={() => setSel(null)}
      empty="选一条约定来编辑，或新建一条。"
      detailTitle={sel === 'new' ? '新建约定' : current?.title ?? ''}
      detail={
        sel === 'new' ? (
          <RuleForm
            key="new"
            mode="create"
            onCancel={() => setSel(null)}
            onSubmit={async (patch) => {
              const okay = await run(() => adminApi.createRule(patch as RuleInput), '已新建');
              if (okay) setSel(null);
            }}
          />
        ) : current ? (
          <RuleForm
            key={current.id}
            mode="edit"
            rule={current}
            onCancel={() => setSel(null)}
            onSubmit={async (patch) => {
              const okay = await run(() => adminApi.updateRule({ ...patch, id: current.id }), '已保存');
              if (okay) setSel(null);
            }}
          />
        ) : null
      }
    />
  );
}

type Draft = {
  id: string; title: string; short: string; cadence: string; type: string;
  amount: string; proof: string; detail: string; startDate: string;
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
