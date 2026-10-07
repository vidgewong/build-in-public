import { useMemo, useState } from 'react';
import type { PanelProps } from './AdminApp';
import { adminApi } from '../../lib/admin-api';
import { formatPeriod, periodKeyFor, todayKey, type Rule } from '../../lib/domain';

/**
 * 打卡面板。最常用的一屏——手机上进来就是它。
 * 默认列出今天还没打的卡，点一下就能补；下面是历史记录，可以加证明或删。
 */
export default function EntriesPanel({ snap, run }: PanelProps) {
  const [open, setOpen] = useState<string | null>(null);
  const today = todayKey();

  const checkinRules = snap.rules.filter((r) => r.active && r.type === 'checkin');

  const pending = checkinRules.filter(
    (r) => !snap.entries.some((e) => e.ruleId === r.id && e.period === periodKeyFor(r.cadence, today))
  );

  const recent = useMemo(
    () => [...snap.entries].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40),
    [snap.entries]
  );

  const ruleOf = (id: string) => snap.rules.find((r) => r.id === id);

  return (
    <>
      <section className="admin-section">
        <h2 className="admin-h2">
          今天还差 <span className="mono">{pending.length}</span> 项
        </h2>

        {pending.length === 0 ? (
          <p className="admin-empty">今天的卡都打完了。</p>
        ) : (
          <ul className="admin-pending">
            {pending.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={`admin-pending-item${open === r.id ? ' is-open' : ''}`}
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                >
                  <span className="admin-pending-title">{r.title}</span>
                  <span className="admin-pending-meta mono">
                    {CADENCE[r.cadence]} · ¥{r.amount}
                  </span>
                </button>
                {open === r.id && (
                  <CheckForm rule={r} date={today} run={run} onDone={() => setOpen(null)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-section">
        <h2 className="admin-h2">补打卡</h2>
        <BackfillForm rules={checkinRules} run={run} />
      </section>

      <section className="admin-section">
        <h2 className="admin-h2">最近记录</h2>
        {recent.length === 0 ? (
          <p className="admin-empty">还没有任何打卡记录。</p>
        ) : (
          <ul className="admin-list">
            {recent.map((e) => {
              const rule = ruleOf(e.ruleId);
              return (
                <li className="admin-row" key={e.id}>
                  <div className="admin-row-main">
                    <span className="admin-row-title">{rule?.title ?? e.ruleId}</span>
                    <span className="admin-row-sub mono">
                      {rule ? formatPeriod(rule.cadence, e.period) : e.period}
                      {e.media?.length ? ` · ${e.media.length} 份证明` : ' · 无证明'}
                      {e.note ? ` · ${e.note}` : ''}
                    </span>
                    {e.media && e.media.length > 0 && (
                      <div className="admin-media">
                        {e.media.map((m, i) => (
                          <a key={i} href={m.url} target="_blank" rel="noreferrer" className="admin-media-link mono">
                            {m.type}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="admin-row-actions">
                    <AddProofButton entryRule={rule} period={e.period} date={e.date} run={run} />
                    <button
                      type="button"
                      className="admin-btn is-danger is-small"
                      onClick={() => {
                        if (!confirm(`删除「${rule?.title ?? e.ruleId}」${e.period} 的记录？`)) return;
                        void run(() => adminApi.deleteEntry(e.id), '已删除');
                      }}
                    >
                      删
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

const CADENCE: Record<string, string> = {
  daily: '每天', weekly: '每周', monthly: '每月', event: '随时',
};

/**
 * 证明类型。站点对 image 渲染缩略图，其余渲染成一个方块
 * （src/components/RuleBlock.tsx）。服务端会从 URL 猜，
 * 但没有扩展名的 CDN 链接猜不准，所以留个手动挡。
 */
const MEDIA_TYPES = [
  { value: '', label: '自动判断' },
  { value: 'image', label: '图片' },
  { value: 'douyin', label: '抖音' },
  { value: 'link', label: '链接' },
];

/** 一行：证明链接 + 类型。type 为空时交给服务端猜。 */
function ProofInput({
  url, type, onUrl, onType, autoFocus,
}: {
  url: string; type: string;
  onUrl: (v: string) => void; onType: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="admin-field-row">
      <label className="admin-field">
        <span className="admin-field-label">证明链接</span>
        <input
          className="admin-input"
          value={url}
          onChange={(e) => onUrl(e.target.value)}
          placeholder="https://…"
          autoFocus={autoFocus}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </label>
      <label className="admin-field is-narrow">
        <span className="admin-field-label">类型</span>
        <select className="admin-input" value={type} onChange={(e) => onType(e.target.value)}>
          {MEDIA_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>
    </div>
  );
}

/** 把表单里的链接+类型拼成接口要的 media 数组 */
const mediaOf = (url: string, type: string) =>
  url.trim() ? [{ url: url.trim(), ...(type ? { type } : {}) }] : [];

/** 给已有记录补证明：复用打卡接口，同周期再提交就是追加 media */
function AddProofButton({
  entryRule, period, date, run,
}: {
  entryRule?: Rule; period: string; date: string; run: PanelProps['run'];
}) {
  const [show, setShow] = useState(false);
  const [url, setUrl] = useState('');
  const [type, setType] = useState('');

  if (!entryRule) return null;

  if (!show) {
    return (
      <button type="button" className="admin-btn is-small" onClick={() => setShow(true)}>
        加证明
      </button>
    );
  }

  return (
    <div className="admin-subform">
      <ProofInput url={url} type={type} onUrl={setUrl} onType={setType} autoFocus />
      <div className="admin-actions">
        <button
          type="button"
          className="admin-btn is-primary is-small"
          disabled={!url.trim()}
          onClick={async () => {
            const okay = await run(
              () => adminApi.saveEntry({ rule: entryRule.id, date, period, media: mediaOf(url, type) }),
              '证明已添加'
            );
            if (okay) { setUrl(''); setType(''); setShow(false); }
          }}
        >
          存
        </button>
        <button type="button" className="admin-btn is-small" onClick={() => setShow(false)}>
          取消
        </button>
      </div>
    </div>
  );
}

/** 今天的快速打卡 */
function CheckForm({
  rule, date, run, onDone,
}: {
  rule: Rule; date: string; run: PanelProps['run']; onDone: () => void;
}) {
  const [url, setUrl] = useState('');
  const [type, setType] = useState('');
  const [note, setNote] = useState('');

  return (
    <div className="admin-subform">
      {rule.proof && <p className="admin-hint">需要出示：{rule.proof}</p>}
      <ProofInput url={url} type={type} onUrl={setUrl} onType={setType} autoFocus />
      <label className="admin-field">
        <span className="admin-field-label">备注</span>
        <input
          className="admin-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="admin-actions">
        <button
          type="button"
          className="admin-btn is-primary"
          onClick={async () => {
            const okay = await run(
              () => adminApi.saveEntry({
                rule: rule.id, date,
                note: note.trim() || undefined,
                media: mediaOf(url, type),
              }),
              `「${rule.title}」已打卡`
            );
            if (okay) onDone();
          }}
        >
          打卡
        </button>
        <button type="button" className="admin-btn" onClick={onDone}>取消</button>
      </div>
    </div>
  );
}

/** 补过去某天的卡 */
function BackfillForm({ rules, run }: { rules: Rule[]; run: PanelProps['run'] }) {
  const [ruleId, setRuleId] = useState(rules[0]?.id ?? '');
  const [date, setDate] = useState(todayKey());
  const [url, setUrl] = useState('');
  const [type, setType] = useState('');
  const [note, setNote] = useState('');

  if (!rules.length) return <p className="admin-empty">还没有打卡类规则。</p>;

  const rule = rules.find((r) => r.id === ruleId);

  return (
    <div className="admin-form">
      <label className="admin-field">
        <span className="admin-field-label">规则</span>
        <select className="admin-input" value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
          {rules.map((r) => (
            <option key={r.id} value={r.id}>{r.title}</option>
          ))}
        </select>
      </label>

      <label className="admin-field">
        <span className="admin-field-label">日期</span>
        <input className="admin-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      {rule && (
        <p className="admin-hint mono">
          归入周期：{formatPeriod(rule.cadence, periodKeyFor(rule.cadence, date))}
        </p>
      )}

      <ProofInput url={url} type={type} onUrl={setUrl} onType={setType} />

      <label className="admin-field">
        <span className="admin-field-label">备注</span>
        <input className="admin-input" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <button
        type="button"
        className="admin-btn is-primary"
        disabled={!ruleId}
        onClick={async () => {
          const okay = await run(
            () => adminApi.saveEntry({
              rule: ruleId, date,
              note: note.trim() || undefined,
              media: mediaOf(url, type),
            }),
            '已记录'
          );
          if (okay) { setUrl(''); setType(''); setNote(''); }
        }}
      >
        记录
      </button>
    </div>
  );
}
