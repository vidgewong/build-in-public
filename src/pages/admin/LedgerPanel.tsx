import { useMemo, useState } from 'react';
import type { PanelProps } from './AdminApp';
import { adminApi } from '../../lib/admin-api';
import { formatPeriod, periodKeyFor, periodsInRange, periodStart, todayKey } from '../../lib/domain';
import ImagePicker from './ImagePicker';
import Pager, { usePaged } from './Pager';

/**
 * 赔付与豁免赔付。
 * 赔付是「朋友在微信上抓到我违约、我付了钱」之后的记账，所以默认日期是今天，
 * 但可以往回改——抓到和付钱之间经常隔一天。
 */
export default function LedgerPanel({ snap, run, notify }: PanelProps) {
  const sortedClaims = useMemo(
    () => [...snap.claims].sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1)),
    [snap.claims]
  );
  const { rows: claimRows, pager } = usePaged(sortedClaims);
  const waivers = useMemo(
    () => [...(snap.calendar.waivers ?? [])].sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0)),
    [snap.calendar.waivers]
  );
  const { rows: waiverRows, pager: waiverPager } = usePaged(waivers);

  return (
    <>
      <section className="admin-section">
        <h2 className="admin-h2">记一笔赔付</h2>
        <ClaimForm snap={snap} run={run} notify={notify} />
      </section>

      <section className="admin-section">
        <h2 className="admin-h2">
          已赔 <span className="mono">{snap.claims.length}</span> 笔 · 合计 ¥
          <span className="mono">{snap.claims.reduce((s, c) => s + (c.amount ?? 0), 0)}</span>
        </h2>
        {snap.claims.length === 0 ? (
          <p className="admin-empty">一笔都还没赔出去。</p>
        ) : (
          <ul className="admin-list">
            {claimRows.map((c) => {
              const rule = snap.rules.find((r) => r.id === c.ruleId);
              return (
                <li className="admin-row" key={c.id}>
                  <div className="admin-row-main">
                    <span className="admin-row-title">
                      {rule?.title ?? c.ruleId} <span className="mono">¥{c.amount}</span>
                    </span>
                    <span className="admin-row-sub mono">
                      {c.claimant} · {rule ? formatPeriod(rule.cadence, c.period) : c.period} · 付于 {c.paidAt.slice(0, 10)}
                      {c.note ? ` · ${c.note}` : ''}
                    </span>
                    {!c.proof?.length && (
                      <span className="admin-badge-warn mono">缺图片证明，请补上</span>
                    )}
                    <ImagePicker
                      keys={(c.proof ?? []).map((p) => p.key)}
                      onError={(m) => notify(m, true)}
                      // 补图：选完即上传，立刻挂到这笔赔付上
                      onChange={(next) => {
                        const have = new Set((c.proof ?? []).map((p) => p.key));
                        const fresh = next.filter((k) => !have.has(k));
                        if (fresh.length) void run(() => adminApi.addClaimProof(c.id, fresh), '证明已补上');
                      }}
                      onRemove={(key) => {
                        if (!confirm('删除这张证明图？')) return;
                        void run(() => adminApi.removeClaimProof(c.id, key), '已删除这张图');
                      }}
                    />
                  </div>
                  <div className="admin-row-actions">
                    <button
                      type="button"
                      className="admin-btn is-danger is-small"
                      onClick={() => {
                        if (!confirm(`删除「${rule?.title ?? c.ruleId}」¥${c.amount} 这笔赔付？`)) return;
                        void run(() => adminApi.deleteClaim(c.id), '已删除');
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
        <Pager {...pager} />
      </section>

      <section className="admin-section">
        <h2 className="admin-h2">
          豁免赔付 <span className="mono">{waivers.length}</span> 期
        </h2>
        <p className="admin-hint">
          生病、节假日等确实做不到的周期：不赔钱，但<b>仍然算失约</b>——计入总次数，守约率照常下降。
        </p>
        <WaiverForm snap={snap} run={run} />

        {waivers.length === 0 ? (
          <p className="admin-empty">还没有豁免赔付。</p>
        ) : (
          <>
            <ul className="admin-list">
              {waiverRows.map((w) => {
                const rule = snap.rules.find((r) => r.id === w.ruleId);
                return (
                  <li className="admin-row" key={`${w.ruleId}:${w.period}`}>
                    <div className="admin-row-main">
                      <span className="admin-row-title">{rule?.title ?? w.ruleId}</span>
                      <span className="admin-row-sub mono">
                        {rule ? formatPeriod(rule.cadence, w.period) : w.period} · {w.reason}
                      </span>
                    </div>
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        className="admin-btn is-danger is-small"
                        onClick={() =>
                          void run(
                            () => adminApi.setWaiver({ rule: w.ruleId, period: w.period, remove: true }),
                            '已取消豁免赔付'
                          )
                        }
                      >
                        取消
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pager {...waiverPager} />
          </>
        )}
      </section>
    </>
  );
}

function ClaimForm({ snap, run, notify }: PanelProps) {
  const rules = snap.rules.filter((r) => r.active);
  const [ruleId, setRuleId] = useState(rules[0]?.id ?? '');
  const [date, setDate] = useState(todayKey());
  const [claimant, setClaimant] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [proof, setProof] = useState<string[]>([]);

  if (!rules.length) return <p className="admin-empty">还没有启用中的规则。</p>;

  const rule = rules.find((r) => r.id === ruleId);

  return (
    <div className="admin-form">
      <label className="admin-field">
        <span className="admin-field-label">规则</span>
        <select
          className="admin-input"
          value={ruleId}
          onChange={(e) => { setRuleId(e.target.value); setAmount(''); }}
        >
          {rules.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
      </label>

      <div className="admin-field-row">
        <label className="admin-field">
          <span className="admin-field-label">违约日期</span>
          <input className="admin-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="admin-field">
          <span className="admin-field-label">金额</span>
          <input
            className="admin-input mono"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={rule ? String(rule.amount) : ''}
          />
        </label>
      </div>

      <label className="admin-field">
        <span className="admin-field-label">领取人</span>
        <input className="admin-input" value={claimant} onChange={(e) => setClaimant(e.target.value)} placeholder="谁抓到的" />
      </label>

      <label className="admin-field">
        <span className="admin-field-label">备注</span>
        <input className="admin-input" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <div className="admin-field">
        <span className="admin-field-label">图片证明（必填，比如转账截图）</span>
        <ImagePicker keys={proof} onChange={setProof} onError={(m) => notify(m, true)} />
      </div>

      <button
        type="button"
        className="admin-btn is-primary"
        disabled={!ruleId || proof.length === 0}
        onClick={async () => {
          const okay = await run(
            () => adminApi.saveClaim({
              rule: ruleId, date,
              claimant: claimant.trim() || undefined,
              amount: amount === '' ? undefined : Number(amount),
              note: note.trim() || undefined,
              proof,
            }),
            '已记账'
          );
          if (okay) { setClaimant(''); setAmount(''); setNote(''); setProof([]); }
        }}
      >
        {proof.length === 0 ? '先传一张图片证明' : '记账'}
      </button>
    </div>
  );
}

function WaiverForm({ snap, run }: { snap: PanelProps['snap']; run: PanelProps['run'] }) {
  const rules = snap.rules.filter((r) => r.active && r.cadence !== 'event');
  const [picked, setPicked] = useState<string[]>([]);
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());
  const [reason, setReason] = useState('');

  const waived = useMemo(
    () => new Set((snap.calendar.waivers ?? []).map((w) => `${w.ruleId}:${w.period}`)),
    [snap.calendar.waivers]
  );

  // 预览：哪些周期会被豁免。已打卡、已赔付、已豁免、早于起算日的会被跳过，这里提前标出来
  const preview = useMemo(() => {
    if (!from || !to || from > to) return [];
    return rules
      .filter((r) => picked.includes(r.id))
      .map((rule) => {
        const periods = periodsInRange(rule.cadence, from, to).map((p) => {
          let skip = '';
          if (periodStart(rule.cadence, p) < periodStart(rule.cadence, periodKeyFor(rule.cadence, rule.startDate))) skip = '早于起算日';
          else if (snap.entries.some((e) => e.ruleId === rule.id && e.period === p)) skip = '已打卡';
          else if (snap.claims.some((c) => c.ruleId === rule.id && c.period === p)) skip = '已赔付';
          else if (waived.has(`${rule.id}:${p}`)) skip = '已豁免';
          return { period: p, skip };
        });
        return { rule, periods };
      });
  }, [rules, picked, from, to, snap.entries, snap.claims, waived]);

  if (!rules.length) return <p className="admin-empty">还没有周期类规则。</p>;

  const total = preview.reduce((n, g) => n + g.periods.filter((p) => !p.skip).length, 0);
  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <div className="admin-form">
      <div className="admin-field">
        <span className="admin-field-label">
          规则（可多选）{' '}
          <button
            type="button"
            className="admin-btn is-small"
            onClick={() => setPicked(picked.length === rules.length ? [] : rules.map((r) => r.id))}
          >
            {picked.length === rules.length ? '全不选' : '全选'}
          </button>
        </span>
        <div className="admin-checks">
          {rules.map((r) => (
            <label className="admin-check" key={r.id}>
              <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} />
              <span>
                {r.title}
                <span className="admin-row-sub mono"> {r.cadence === 'daily' ? '每日' : r.cadence === 'weekly' ? '每周' : '每月'}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="admin-field-row">
        <label className="admin-field">
          <span className="admin-field-label">从</span>
          <input
            className="admin-input"
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }}
          />
        </label>
        <label className="admin-field">
          <span className="admin-field-label">到（含）</span>
          <input className="admin-input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <p className="admin-hint">
        每周 / 每月的规则，范围碰到哪一周（月）就豁免那一整周（月）——选周内任意一天即可。
      </p>

      <label className="admin-field">
        <span className="admin-field-label">理由</span>
        <input className="admin-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="比如：生病 / 国庆" />
      </label>

      {preview.length > 0 && (
        <ul className="admin-list">
          {preview.map(({ rule, periods }) => (
            <li className="admin-row" key={rule.id}>
              <div className="admin-row-main">
                <span className="admin-row-title">{rule.title}</span>
                <span className="admin-row-sub mono">
                  {periods.length > 8
                    ? `${periods.filter((p) => !p.skip).length} / ${periods.length} 期将被豁免`
                    : periods
                        .map((p) => `${formatPeriod(rule.cadence, p.period)}${p.skip ? `（跳过：${p.skip}）` : ''}`)
                        .join('  ')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="admin-btn is-primary"
        disabled={total === 0 || !reason.trim()}
        onClick={async () => {
          const okay = await run(
            () => adminApi.setWaiver({ rules: picked, from, to, reason: reason.trim() }),
            `已豁免 ${total} 期赔付（仍计为失约）`
          );
          if (okay) setReason('');
        }}
      >
        {total === 0 ? '没有可豁免的周期' : !reason.trim() ? '请填写理由' : `豁免 ${total} 期赔付`}
      </button>
    </div>
  );
}
