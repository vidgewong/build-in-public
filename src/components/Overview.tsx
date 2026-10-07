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

/**
 * 首页总览：一张表列出全部约定 —— 描述、价格、当前可领。
 * 规则再多也只是往下长一行，不改变信息结构。
 */
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

  const totalOpen = rows.reduce((a, r) => a + r.openAmount, 0);
  const liveRows = rows.filter((r) => r.openAmount > 0);

  return (
    <div className="overview">
      <div className="overview-banner">
        <div className="overview-banner-main">
          <span className="overview-banner-label">此刻可以从我身上拿走</span>
          <span className={`overview-banner-amount mono ${totalOpen > 0 ? 'is-open' : 'is-clear'}`}>
            {currency}
            {totalOpen}
          </span>
        </div>
        {totalOpen > 0 && (
          <p className="overview-banner-note mono">
            <b>{liveRows.length}</b> 条 · {rows.reduce((a, r) => a + r.openCount, 0)} 个缺口
          </p>
        )}
      </div>

      <table className="overview-table">
        <thead>
          <tr>
            <th className="col-rule">约定</th>
            <th className="col-cadence">周期</th>
            <th className="col-price">单价</th>
            <th className="col-keep">守约</th>
            <th className="col-open">当前可领</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { rule } = row;
            const isEvent = rule.cadence === 'event';
            const isOpen = expanded === rule.id;
            const ruleClaims = claims.filter((c) => c.ruleId === rule.id);

            return (
              <Fragment key={rule.id}>
                <tr
                  className={`overview-row${row.openAmount > 0 ? ' has-open' : ''}${isOpen ? ' is-expanded' : ''}`}
                  onClick={() => setExpanded(isOpen ? null : rule.id)}
                  tabIndex={0}
                  role="button"
                  aria-expanded={isOpen}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setExpanded(isOpen ? null : rule.id);
                    }
                  }}
                >
                  <td className="col-rule">
                    <span className="overview-rule-title">{rule.title}</span>
                  </td>
                  <td className="col-cadence mono">{CADENCE_LABEL[rule.cadence]}</td>
                  <td className="col-price mono">
                    {currency}
                    {rule.amount}
                  </td>
                  <td className="col-keep mono">
                    {isEvent ? (
                      <span className="overview-caught">
                        被抓 {row.caughtCount} 次
                      </span>
                    ) : (
                      <KeepBar rate={row.summary ? row.summary.keepRate : 1} />
                    )}
                  </td>
                  <td className="col-open mono">
                    {isEvent ? (
                      <span className="overview-anytime">看见就领</span>
                    ) : row.openAmount > 0 ? (
                      <Link
                        className="overview-open-amount"
                        to={`/records#rule-${rule.id}`}
                        onClick={(e) => e.stopPropagation()}
                        title={`${row.openCount} 个缺口 · 去看是哪几天`}
                      >
                        {currency}
                        {row.openAmount}
                      </Link>
                    ) : (
                      <span className="overview-clear">—</span>
                    )}
                  </td>
                </tr>

                {isOpen && (
                  <tr className="overview-detail-row">
                    <td colSpan={5}>
                      <div className="overview-detail">
                        {/* 有的规则不需要补充说明和证明，空的就别留个光标签在那儿 */}
                        {rule.detail && (
                          <div className="overview-detail-col is-wide">
                            <span className="overview-detail-label">约定全文</span>
                            <p>{rule.detail}</p>
                          </div>
                        )}
                        {rule.proof && (
                          <div className="overview-detail-col">
                            <span className="overview-detail-label">我要出示的证明</span>
                            <p>{rule.proof}</p>
                          </div>
                        )}
                        <div className="overview-detail-col">
                          <span className="overview-detail-label">累计赔付</span>
                          <p className="mono">
                            {currency}
                            {row.paidAmount}
                            {ruleClaims.length > 0 && (
                              <span className="overview-detail-sub">
                                {' '}· {ruleClaims.length} 笔 · 最近被{' '}
                                {ruleClaims[ruleClaims.length - 1].claimant} 领走
                              </span>
                            )}
                          </p>
                        </div>
                        {!isEvent && (
                          <div className="overview-detail-col">
                            <span className="overview-detail-label">记录</span>
                            <p className="mono">
                              {row.summary?.keptCount} / {row.summary?.settledCount} 个周期守住 ·
                              连续 {row.summary?.streak}（最长 {row.summary?.bestStreak}）
                            </p>
                          </div>
                        )}
                        <Link
                          className="overview-detail-jump"
                          to={isEvent ? '/records#events' : `/records#rule-${rule.id}`}
                        >
                          {isEvent ? '看抓现行规则 →' : '看完整记录 →'}
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
    </div>
  );
}

function KeepBar({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  return (
    <span className="keep-bar" title={`守约率 ${pct}%`}>
      <span className="keep-bar-track">
        <span className="keep-bar-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="keep-bar-num">{pct}%</span>
    </span>
  );
}
