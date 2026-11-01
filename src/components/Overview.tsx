import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Claim } from '../lib/domain';
import type { OverviewRow } from '../lib/data';

const CADENCE_LABEL: Record<string, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  event: '随时',
};

/** 一张表列出全部约定：描述、价格、当前可领。规则再多也只是往下长一行。 */
export default function Overview({
  rows,
  currency,
  claims,
}: {
  rows: OverviewRow[];
  currency: string;
  claims: Claim[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <table className="ovw">
      <thead>
        <tr>
          <th>约定</th>
          <th>周期</th>
          <th>单价</th>
          <th>守约</th>
          <th>当前可领</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => {
          const { rule } = row;
          const isEvent = rule.cadence === 'event';
          const isOpen = expanded === rule.id;
          const ruleClaims = claims.filter((c) => c.ruleId === rule.id);
          const toggle = () => setExpanded(isOpen ? null : rule.id);

          return (
            <Fragment key={rule.id}>
              <tr
                className={`ovw-row${isOpen ? ' is-expanded' : ''}`}
                onClick={toggle}
                tabIndex={0}
                role="button"
                aria-expanded={isOpen}
                data-reveal
                style={{ ['--d' as string]: `${Math.min(idx, 6) * 40}ms` }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle();
                  }
                }}
              >
                <td className="col-rule ovw-title">{rule.title}</td>
                <td className="col-cadence ovw-cad">{CADENCE_LABEL[rule.cadence]}</td>
                <td className="col-price ovw-price">
                  {currency}
                  {rule.amount}
                </td>
                <td className="col-keep">
                  {isEvent ? (
                    <span className="ovw-cad">被抓 {row.caughtCount} 次</span>
                  ) : (
                    <KeepBar rate={row.summary ? row.summary.keepRate : 1} />
                  )}
                </td>
                <td className="col-open ovw-open">
                  {isEvent ? (
                    <span className="ovw-anytime">看见就领</span>
                  ) : row.openAmount > 0 ? (
                    <Link
                      className="ovw-open-amount"
                      to={`/records#rule-${rule.id}`}
                      onClick={(e) => e.stopPropagation()}
                      title={`${row.openCount} 个缺口 · 去看是哪几天`}
                    >
                      {currency}
                      {row.openAmount}
                    </Link>
                  ) : (
                    <span className="ovw-clear">—</span>
                  )}
                </td>
              </tr>

              {isOpen && (
                <tr className="ovw-detail-row">
                  <td colSpan={5}>
                    <div className="ovw-detail">
                      {rule.detail && (
                        <div className="ovw-detail-col is-wide">
                          <span className="ovw-detail-label">约定全文</span>
                          <p>{rule.detail}</p>
                        </div>
                      )}
                      {rule.proof && (
                        <div className="ovw-detail-col">
                          <span className="ovw-detail-label">我要出示的证明</span>
                          <p>{rule.proof}</p>
                        </div>
                      )}
                      <div className="ovw-detail-col">
                        <span className="ovw-detail-label">累计赔付</span>
                        <p>
                          {currency}
                          {row.paidAmount}
                          {ruleClaims.length > 0 &&
                            ` · ${ruleClaims.length} 笔 · 最近被 ${ruleClaims[ruleClaims.length - 1].claimant} 领走`}
                        </p>
                      </div>
                      {!isEvent && (
                        <div className="ovw-detail-col">
                          <span className="ovw-detail-label">记录</span>
                          <p>
                            {row.summary?.keptCount} / {row.summary?.settledCount} 个周期守住 · 连续{' '}
                            {row.summary?.streak}（最长 {row.summary?.bestStreak}）
                          </p>
                        </div>
                      )}
                      <Link
                        className="link ovw-detail-jump"
                        to={isEvent ? '/records#events' : `/records#rule-${rule.id}`}
                      >
                        {isEvent ? '看抓现行规则' : '看完整记录'}{' '}
                        <span className="btn-arrow" aria-hidden="true">→</span>
                      </Link>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function KeepBar({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  return (
    <span className="keep" title={`守约率 ${pct}%`}>
      <span className="keep-track">
        <span className="keep-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="keep-num">{pct}%</span>
    </span>
  );
}
