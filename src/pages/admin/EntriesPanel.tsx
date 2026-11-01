import { useMemo, useState } from 'react';
import type { PanelProps } from './AdminApp';
import { adminApi } from '../../lib/admin-api';
import { formatPeriod, periodKeyFor, todayKey, type Rule } from '../../lib/domain';
import { todayBoard } from './derive';
import { Fold, MonthGroups, RuleFilter, Workspace } from './Workspace';

/**
 * 打卡工作台。左边做事（补今天的卡 / 补过去的卡），右边是按月分组的记录。
 * 桌面两栏同时可见，整页不滚；手机用一条分段在「今天 / 补打卡 / 记录」之间切。
 */
export default function EntriesPanel({ snap, run }: PanelProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const { today, checkinRules, todo, isWaived, owed } = todayBoard(snap);

  const groups = GROUPS.map((g) => ({ ...g, rules: todo.filter((r) => r.cadence === g.cadence) })).filter(
    (g) => g.rules.length > 0
  );

  const records = useMemo(
    () =>
      [...snap.entries]
        .filter((e) => !filter || e.ruleId === filter)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [snap.entries, filter]
  );
  const ruleOf = (id: string) => snap.rules.find((r) => r.id === id);

  const pending = (
    <>
      {todo.length === 0 ? (
        <p className="ws-hint">该打的卡都打完了。</p>
      ) : (
        groups.map((g) => (
          <div className="pgroup" key={g.cadence}>
            <h3 className="pgroup-h">
              {g.label}
              <span className="mono">{g.rules.filter((r) => !isWaived(r)).length}</span>
            </h3>
            <ul className="pending">
              {g.rules.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`pending-item${open === r.id ? ' is-open' : ''}${isWaived(r) ? ' is-waived' : ''}`}
                    aria-expanded={open === r.id}
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                  >
                    <span className="pending-title">{r.title}</span>
                    <span className="pending-meta mono">{isWaived(r) ? '已豁免' : `¥${r.amount}`}</span>
                  </button>
                  <Fold open={open === r.id}>
                    <CheckForm rule={r} date={today} run={run} onDone={() => setOpen(null)} />
                  </Fold>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </>
  );

  const list = (
    <>
      {records.length === 0 ? (
        <p className="ws-hint">{filter ? '这条约定还没有打卡记录。' : '还没有任何打卡记录。'}</p>
      ) : (
        <MonthGroups
          items={records}
          dateOf={(e) => e.date}
          render={(e) => {
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
          }}
        />
      )}
    </>
  );

  const tools = (
    <RuleFilter
      rules={snap.rules.filter((r) => r.type === 'checkin')}
      value={filter}
      onChange={setFilter}
    />
  );

  return (
    <Workspace
      title="打卡"
      stats={
        owed.length === 0 ? (
          <span className="stat is-ok">今天都打完了</span>
        ) : (
          <span className="stat">
            还差 <b className="mono">{owed.length}</b> 项
          </span>
        )
      }
      modes={[
        {
          key: 'today', label: '今天', actTitle: '今天还差', act: pending,
          listKey: 'records', listLabel: '记录', listTitle: <>记录 <span className="mono">{records.length}</span></>,
          listTools: tools, list,
        },
        {
          key: 'back', label: '补打卡', actTitle: '补过去的卡',
          act: <BackfillForm rules={checkinRules} run={run} />,
          listKey: 'records', listLabel: '记录', listTitle: <>记录 <span className="mono">{records.length}</span></>,
          listTools: tools, list,
        },
      ]}
    />
  );
}

const GROUPS = [
  { cadence: 'daily', label: '每天 · 今天' },
  { cadence: 'weekly', label: '每周 · 本周' },
  { cadence: 'monthly', label: '每月 · 本月' },
];

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
