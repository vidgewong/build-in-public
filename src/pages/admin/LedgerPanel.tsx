import { useState } from 'react';
import type { PanelProps } from './AdminApp';
import { adminApi } from '../../lib/admin-api';
import { formatPeriod, todayKey } from '../../lib/domain';

/**
 * 赔付与豁免。
 * 赔付是「朋友在微信上抓到我违约、我付了钱」之后的记账，所以默认日期是今天，
 * 但可以往回改——抓到和付钱之间经常隔一天。
 */
export default function LedgerPanel({ snap, run }: PanelProps) {
  return (
    <>
      <section className="admin-section">
        <h2 className="admin-h2">记一笔赔付</h2>
        <ClaimForm snap={snap} run={run} />
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
            {[...snap.claims].sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1)).map((c) => {
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
      </section>

      <section className="admin-section">
        <h2 className="admin-h2">豁免日</h2>
        <p className="admin-hint">标记后，当天所有「法定节假日豁免」的规则都不计缺勤。</p>
        <ExemptionForm run={run} />

        {snap.calendar.manualExemptions.length === 0 ? (
          <p className="admin-empty">还没有手动豁免。</p>
        ) : (
          <ul className="admin-list">
            {[...snap.calendar.manualExemptions].sort((a, b) => (a.date < b.date ? 1 : -1)).map((x) => (
              <li className="admin-row" key={x.date}>
                <div className="admin-row-main">
                  <span className="admin-row-title mono">{x.date}</span>
                  <span className="admin-row-sub">{x.reason}</span>
                </div>
                <div className="admin-row-actions">
                  <button
                    type="button"
                    className="admin-btn is-danger is-small"
                    onClick={() => void run(() => adminApi.setExemption(x.date, undefined, true), '已取消豁免')}
                  >
                    取消
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function ClaimForm({ snap, run }: PanelProps) {
  const rules = snap.rules.filter((r) => r.active);
  const [ruleId, setRuleId] = useState(rules[0]?.id ?? '');
  const [date, setDate] = useState(todayKey());
  const [claimant, setClaimant] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

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

      <button
        type="button"
        className="admin-btn is-primary"
        disabled={!ruleId}
        onClick={async () => {
          const okay = await run(
            () => adminApi.saveClaim({
              rule: ruleId, date,
              claimant: claimant.trim() || undefined,
              amount: amount === '' ? undefined : Number(amount),
              note: note.trim() || undefined,
            }),
            '已记账'
          );
          if (okay) { setClaimant(''); setAmount(''); setNote(''); }
        }}
      >
        记账
      </button>
    </div>
  );
}

function ExemptionForm({ run }: { run: PanelProps['run'] }) {
  const [date, setDate] = useState(todayKey());
  const [reason, setReason] = useState('');

  return (
    <div className="admin-form">
      <div className="admin-field-row">
        <label className="admin-field">
          <span className="admin-field-label">日期</span>
          <input className="admin-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="admin-field">
          <span className="admin-field-label">理由</span>
          <input className="admin-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="手动豁免" />
        </label>
      </div>
      <button
        type="button"
        className="admin-btn is-primary"
        onClick={async () => {
          const okay = await run(() => adminApi.setExemption(date, reason.trim() || undefined), '已豁免');
          if (okay) setReason('');
        }}
      >
        标记豁免
      </button>
    </div>
  );
}
