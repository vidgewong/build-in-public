import { useSite } from '../lib/site-context';

export default function Bills() {
  const { state, currency: cur } = useSite();
  const { totals, claims } = state;

  const sorted = [...claims].sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));

  // 谁从我这儿拿走的钱最多
  const byClaimant = Object.entries(
    claims.reduce<Record<string, { n: number; sum: number }>>((acc, c) => {
      const cur = acc[c.claimant] ?? { n: 0, sum: 0 };
      acc[c.claimant] = { n: cur.n + 1, sum: cur.sum + c.amount };
      return acc;
    }, {})
  ).sort((a, b) => b[1].sum - a[1].sum);

  return (
    <section className="section">
      <div className="shell">
        <div className="section-head">
          <span className="section-index">账单</span>
          <h2 className="section-title">已付出去的钱</h2>
        </div>

        {claims.length === 0 ? (
          <div className="empty-state">
            还没有人领走过钱。这不代表我守住了——也可能只是你们还没发现。
          </div>
        ) : (
          <>
            <div className="hero-ledger">
              <div className="ledger-cell">
                <span className="ledger-label">累计赔付</span>
                <span className="ledger-value is-gold mono">
                  {cur}
                  {totals.paidAmount}
                </span>
                <span className="ledger-hint">{totals.paidCount} 笔</span>
              </div>
              <div className="ledger-cell">
                <span className="ledger-label">领走的人</span>
                <span className="ledger-value mono">{byClaimant.length}</span>
              </div>
              <div className="ledger-cell">
                <span className="ledger-label">平均每笔</span>
                <span className="ledger-value mono">
                  {cur}
                  {Math.round(totals.paidAmount / Math.max(1, totals.paidCount))}
                </span>
                <span className="ledger-hint">单次违约的代价</span>
              </div>
            </div>

            {byClaimant.length > 0 && (
              <div className="bills-board">
                <span className="bills-board-label">领取榜</span>
                <ul className="bills-board-list">
                  {byClaimant.map(([name, v], i) => (
                    <li key={name}>
                      <span className="bills-rank mono">{String(i + 1).padStart(2, '0')}</span>
                      <span className="bills-name">{name}</span>
                      <span className="bills-count mono">{v.n} 笔</span>
                      <span className="bills-sum mono">
                        {cur}
                        {v.sum}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <table className="claims-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>领取人</th>
                  <th>事由</th>
                  <th style={{ textAlign: 'right' }}>金额</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id}>
                    <td>{c.paidAt.slice(0, 10).replace(/-/g, '/')}</td>
                    <td className="claimant">{c.claimant}</td>
                    <td>{c.note ?? c.period}</td>
                    <td className="amount">
                      {cur}
                      {c.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  );
}
