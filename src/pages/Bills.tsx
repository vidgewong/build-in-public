import { useState } from 'react';
import Art from '../components/Art';
import Strip from '../components/Strip';
import ProofGallery from '../components/ProofGallery';
import { ART } from '../lib/art';
import { useSite } from '../lib/site-context';

export default function Bills() {
  const { state, currency: cur } = useSite();
  const { totals, claims } = state;
  const [viewing, setViewing] = useState<{ title: string; keys: string[] } | null>(null);

  const sorted = [...claims].sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));

  const byClaimant = Object.entries(
    claims.reduce<Record<string, { n: number; sum: number }>>((acc, c) => {
      const prev = acc[c.claimant] ?? { n: 0, sum: 0 };
      acc[c.claimant] = { n: prev.n + 1, sum: prev.sum + c.amount };
      return acc;
    }, {})
  ).sort((a, b) => b[1].sum - a[1].sum);

  return (
    <>
      <header className="shell page-head">
        <div className="page-head-main">
          <h1 className="page-title display">已付出去的钱</h1>
        </div>
        <Art piece={ART.ledger} ratio="4 / 5" />
      </header>

      {claims.length === 0 ? (
        <div className="shell">
          <p className="empty">还没有人领走过钱。这不代表我守住了——也可能只是你们还没发现。</p>
        </div>
      ) : (
        <section className="section is-alt" aria-labelledby="board-h">
          <div className="shell">
            <div className="figs section-head">
              <div className="stat" data-reveal>
                <span className="stat-n num">
                  {cur}
                  {totals.paidAmount}
                </span>
                <span className="stat-l">累计赔付 · {totals.paidCount} 笔</span>
              </div>
              <div className="stat" data-reveal style={{ ['--d' as string]: '80ms' }}>
                <span className="stat-n num">{byClaimant.length}</span>
                <span className="stat-l">领走的人</span>
              </div>
              <div className="stat" data-reveal style={{ ['--d' as string]: '160ms' }}>
                <span className="stat-n num">
                  {cur}
                  {Math.round(totals.paidAmount / Math.max(1, totals.paidCount))}
                </span>
                <span className="stat-l">平均每笔 · 单次违约的代价</span>
              </div>
            </div>

            {byClaimant.length > 0 && (
              <>
                <h2 className="board-title display" id="board-h" data-reveal>
                  领取榜
                </h2>
                <ul className="board">
                  {byClaimant.map(([name, v], i) => (
                    <li className="board-row" key={name} data-reveal style={{ ['--d' as string]: `${i * 60}ms` }}>
                      <span className="board-name">{name}</span>
                      <span className="board-count">{v.n} 笔</span>
                      <span className="board-sum num">
                        {cur}
                        {v.sum}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      )}

      {claims.length > 0 && (
        <section className="section" aria-label="逐笔明细">
          <div className="shell">
            <table className="claims">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>领取人</th>
                  <th>事由</th>
                  <th className="r">金额</th>
                  <th className="r">证明</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id}>
                    <td className="c-date">{c.paidAt.slice(0, 10).replace(/-/g, '/')}</td>
                    <td className="claimant">{c.claimant}</td>
                    <td className="c-note">{c.note ?? c.period}</td>
                    <td className="amount">
                      {cur}
                      {c.amount}
                    </td>
                    <td className="proof-cell r">
                      {c.proof?.length ? (
                        <button
                          type="button"
                          className="proof-btn"
                          onClick={() =>
                            setViewing({
                              title: `${c.claimant} · ${cur}${c.amount}`,
                              keys: c.proof!.map((p) => p.key),
                            })
                          }
                        >
                          看图 {c.proof.length > 1 ? `×${c.proof.length}` : ''}
                        </button>
                      ) : (
                        <span className="proof-none">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <Strip pieces={[ART.hourglass, ART.sundial, ART.purse]} label="账本里的旧物" />
      {viewing && (
        <ProofGallery title={viewing.title} keys={viewing.keys} onClose={() => setViewing(null)} />
      )}
    </>
  );
}
