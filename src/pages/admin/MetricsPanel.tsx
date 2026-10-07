import { useState } from 'react';
import type { PanelProps } from './AdminApp';
import { adminApi } from '../../lib/admin-api';
import type { Metric } from '../../lib/data';

const VISIBILITIES = [
  { value: 'public', label: '公开' },
  { value: 'masked', label: '打码（显示 ***）' },
  { value: 'hidden', label: '隐藏整行' },
];

/**
 * 指标面板。
 * 注意：数值型每次保存都会往 history 里压一条，所以这里不做「批量保存全部」——
 * 那会给没改过的指标凭空造出一堆重复历史点。只能一条条存。
 */
export default function MetricsPanel({ snap, run }: PanelProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <section className="admin-section">
        <div className="admin-section-head">
          <h2 className="admin-h2">
            共 <span className="mono">{snap.metrics.length}</span> 项
          </h2>
          <button type="button" className="admin-btn is-primary is-small" onClick={() => setCreating(!creating)}>
            {creating ? '收起' : '+ 新建'}
          </button>
        </div>

        {creating && (
          <MetricForm
            mode="create"
            onCancel={() => setCreating(false)}
            onSubmit={async (body) => {
              const okay = await run(() => adminApi.saveMetric(body), '已新建');
              if (okay) setCreating(false);
            }}
          />
        )}
      </section>

      <section className="admin-section">
        <ul className="admin-list">
          {snap.metrics.map((m) => (
            <li className="admin-row" key={m.key}>
              <div className="admin-row-main">
                <span className="admin-row-title">
                  {m.label}
                  {m.visibility !== 'public' && (
                    <span className="admin-tag">{VISIBILITIES.find((v) => v.value === m.visibility)?.label}</span>
                  )}
                </span>
                <span className="admin-row-sub mono">
                  {m.key} · {m.value ?? '—'}{m.unit}
                  {m.target != null ? ` · 目标 ${m.target}` : ''}
                  {m.history?.length ? ` · ${m.history.length} 个历史点` : ''}
                </span>
              </div>
              <div className="admin-row-actions">
                <button
                  type="button"
                  className="admin-btn is-small"
                  onClick={() => setEditing(editing === m.key ? null : m.key)}
                >
                  {editing === m.key ? '收起' : '改'}
                </button>
                <button
                  type="button"
                  className="admin-btn is-danger is-small"
                  onClick={() => {
                    if (!confirm(`删除指标「${m.label}」？历史数据会一起没有。`)) return;
                    void run(() => adminApi.deleteMetric(m.key), '已删除');
                  }}
                >
                  删
                </button>
              </div>

              {editing === m.key && (
                <MetricForm
                  mode="edit"
                  metric={m}
                  onCancel={() => setEditing(null)}
                  onSubmit={async (body) => {
                    const okay = await run(() => adminApi.saveMetric(body), '已保存');
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

type Body = {
  key: string; value: string; label: string; unit: string;
  visibility: string; target: string; hint: string;
};

function MetricForm({
  mode, metric, onSubmit, onCancel,
}: {
  mode: 'create' | 'edit';
  metric?: Metric;
  onSubmit: (body: { key: string; value: string | number | null; label?: string; unit?: string; visibility?: string; target?: string | number; hint?: string }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Body>({
    key: metric?.key ?? '',
    value: metric?.value == null ? '' : String(metric.value),
    label: metric?.label ?? '',
    unit: metric?.unit ?? '',
    visibility: metric?.visibility ?? 'public',
    target: metric?.target == null ? '' : String(metric.target),
    hint: metric?.hint ?? '',
  });

  const set = <K extends keyof Body>(k: K, v: Body[K]) => setD((p) => ({ ...p, [k]: v }));

  return (
    <div className="admin-subform">
      {mode === 'create' && (
        <label className="admin-field">
          <span className="admin-field-label">key（英文，建好不能改）</span>
          <input
            className="admin-input mono"
            value={d.key}
            onChange={(e) => set('key', e.target.value)}
            placeholder="weight"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>
      )}

      <div className="admin-field-row">
        <label className="admin-field">
          <span className="admin-field-label">数值</span>
          <input className="admin-input mono" value={d.value} onChange={(e) => set('value', e.target.value)} />
        </label>
        <label className="admin-field">
          <span className="admin-field-label">单位</span>
          <input className="admin-input" value={d.unit} onChange={(e) => set('unit', e.target.value)} placeholder="kg" />
        </label>
      </div>

      <p className="admin-hint">数值能解析成数字才会进历史曲线；像血型「O」这种会原样存成文字。</p>

      <label className="admin-field">
        <span className="admin-field-label">显示名</span>
        <input className="admin-input" value={d.label} onChange={(e) => set('label', e.target.value)} placeholder="体重" />
      </label>

      <div className="admin-field-row">
        <label className="admin-field">
          <span className="admin-field-label">可见性</span>
          <select className="admin-input" value={d.visibility} onChange={(e) => set('visibility', e.target.value)}>
            {VISIBILITIES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </label>
        <label className="admin-field">
          <span className="admin-field-label">目标值（可选）</span>
          <input className="admin-input mono" type="number" inputMode="decimal" value={d.target} onChange={(e) => set('target', e.target.value)} />
        </label>
      </div>

      <label className="admin-field">
        <span className="admin-field-label">补充说明（鼠标悬停时显示）</span>
        <input className="admin-input" value={d.hint} onChange={(e) => set('hint', e.target.value)} />
      </label>

      <div className="admin-actions">
        <button
          type="button"
          className="admin-btn is-primary"
          disabled={mode === 'create' && !d.key.trim()}
          onClick={() => {
            void onSubmit({
              key: (metric?.key ?? d.key).trim(),
              value: d.value === '' ? null : d.value,
              label: d.label.trim() || undefined,
              unit: d.unit,
              visibility: d.visibility,
              target: d.target === '' ? undefined : d.target,
              hint: d.hint,
            });
          }}
        >
          {mode === 'create' ? '新建' : '保存'}
        </button>
        <button type="button" className="admin-btn" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
