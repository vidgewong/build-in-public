import RuleBlock from '../components/RuleBlock';
import { useSite } from '../lib/site-context';

export default function Records() {
  const { state, currency: cur, copyClaim } = useSite();
  const { summaries, eventRules, claims } = state;

  return (
    <>
      <section className="section">
        <div className="shell">
          <div className="section-head">
            <span className="section-index">记录</span>
            <h2 className="section-title">我的守约记录</h2>
          </div>

          {summaries.map((s) => (
            <RuleBlock key={s.rule.id} summary={s} currency={cur} onClaimCopy={copyClaim} />
          ))}
        </div>
      </section>

      {eventRules.length > 0 && (
        <section className="section" id="events">
          <div className="shell">
            <div className="section-head">
              <span className="section-index">现行</span>
              <h2 className="section-title">抓现行</h2>
            </div>
            <div className="hero-ledger">
              {eventRules.map((r) => {
                const n = claims.filter((c) => c.ruleId === r.id).length;
                return (
                  <div className="ledger-cell" key={r.id}>
                    <span className="ledger-label">{r.title}</span>
                    <span className="ledger-value is-gold mono">
                      {cur}
                      {r.amount}
                    </span>
                    <span className="ledger-hint">
                      已被抓 {n} 次
                      {r.detail && ` · ${r.detail.slice(0, 40)}${r.detail.length > 40 ? '…' : ''}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
