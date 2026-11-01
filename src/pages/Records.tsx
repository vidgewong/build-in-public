import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Art from '../components/Art';
import Strip from '../components/Strip';
import RuleBlock from '../components/RuleBlock';
import { ART } from '../lib/art';
import { useSite } from '../lib/site-context';

export default function Records() {
  const { state, currency: cur, copyClaim } = useSite();
  const { summaries, eventRules, claims } = state;
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) requestAnimationFrame(() => el.scrollIntoView());
  }, [hash]);

  return (
    <>
      <header className="shell page-head">
        <div className="page-head-main">
          <h1 className="page-title display">我的守约记录</h1>
        </div>
        <Art piece={ART.watch} ratio="1 / 1" />
      </header>

      <Strip pieces={[ART.sundial, ART.hourglass, ART.purse]} label="账本里的旧物" />

      <div>
        {summaries.map((s) => (
          <RuleBlock key={s.rule.id} summary={s} currency={cur} onClaimCopy={copyClaim} />
        ))}
      </div>

      {eventRules.length > 0 && (
        <section className="events" id="events" aria-labelledby="events-h">
          <div className="shell">
            <h2 className="h2 display" id="events-h">
              抓现行
            </h2>
            <div className="events-list">
              {eventRules.map((r) => {
                const n = claims.filter((c) => c.ruleId === r.id).length;
                return (
                  <article className="event" key={r.id}>
                    <h3 className="event-title">{r.title}</h3>
                    <p className="event-price num">
                      {cur}
                      {r.amount}
                    </p>
                    <p className="event-note">
                      已被抓 {n} 次
                      {r.detail && ` · ${r.detail.slice(0, 40)}${r.detail.length > 40 ? '…' : ''}`}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

    </>
  );
}
