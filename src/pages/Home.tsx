import { Link } from 'react-router-dom';
import Art from '../components/Art';
import Overview from '../components/Overview';
import Strip from '../components/Strip';
import SubjectCard from '../components/SubjectCard';
import { ART } from '../lib/art';
import { useCountUp, useInView } from '../lib/hooks';
import { useSite } from '../lib/site-context';

export default function Home() {
  const { state, currency: cur, copyAllClaims } = useSite();
  const { totals, overview, today, claims, claimWindowDays, profile, metrics } = state;

  const heroMetrics = metrics.filter((m) => m.visibility !== 'hidden').slice(0, 4);

  return (
    <>
      <header className="hero">
        <div className="shell hero-grid">
          <h1 className="hero-title display">
            <span className="line">
              <span>VIDGE 的人生公测</span>
            </span>
            <span className="line">
              <span>行为准则篇</span>
            </span>
          </h1>
          <div className="hero-aside">
            <p className="hero-sub">
              我做不到的事，就让它有成本。下面每一条约定后面都跟着一个价格，只要你发现我没做到，第一个找我，这笔钱就是你的。
            </p>
            <p className="hero-stamp">结算于 {today.replace(/-/g, '.')}</p>
          </div>
          <SubjectCard
            name={profile.name}
            handle={profile.handle}
            level={totals.level}
            metrics={heroMetrics}
          />
        </div>
      </header>

      <Ledger totals={totals} cur={cur} startDate={profile.startDate} onCopyAll={copyAllClaims} />

      <section className="section" aria-labelledby="ovw-h">
        <div className="shell">
          <div className="ovw-head">
            <div className="ovw-head-title">
              <h2 className="ovw-banner-label" id="ovw-h" data-reveal>
                此刻可以从我身上拿走
              </h2>
              <p className={`h2 num ovw-banner-amount${totals.openAmount > 0 ? ' is-open' : ''}`} data-reveal>
                {cur}
                {totals.openAmount}
              </p>
              {totals.openCount > 0 && (
                <p className="ovw-banner-note" data-reveal>
                  {overview.filter((r) => r.openAmount > 0).length} 条 · {totals.openCount} 个缺口
                </p>
              )}
            </div>
            <Art piece={ART.ledger} ratio="4 / 5" delay={120} />
          </div>
          <Overview rows={overview} currency={cur} claims={claims} />
        </div>
      </section>

      <section className="section is-alt" aria-label="下一步">
        <div className="shell pair">
          <div className="pair-item">
            <h2 className="h2 display" id="next-records" data-reveal>
              守约记录
            </h2>
            <p className="lead" data-reveal style={{ ['--d' as string]: '100ms' }}>
              一格一天。红色的那些，是我没有记录的日子。
            </p>
          </div>
          <div className="pair-item">
            <h2 className="h2 display" id="next-rules" data-reveal>
              怎么拿到这笔钱
            </h2>
            <p className="lead" data-reveal style={{ ['--d' as string]: '100ms' }}>
              滚动 {claimWindowDays} 天内的违约事件都还作数。
            </p>
            <Link className="link" to="/rules" data-reveal style={{ ['--d' as string]: '200ms' }}>
              看规则 <span className="btn-arrow" aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <Strip pieces={[ART.hourglass, ART.watch, ART.sundial]} label="账本里的旧物" />
    </>
  );
}

function Ledger({
  totals,
  cur,
  startDate,
  onCopyAll,
}: {
  totals: ReturnType<typeof useSite>['state']['totals'];
  cur: string;
  startDate: string;
  onCopyAll: () => void;
}) {
  const [ref, inView] = useInView<HTMLElement>(0.15);
  const open = Math.round(useCountUp(totals.openAmount, inView, 1300));
  const paid = Math.round(useCountUp(totals.paidAmount, inView, 1100));
  const kept = Math.round(useCountUp(totals.keptCount, inView, 900));
  const rate = useCountUp(totals.keepRate * 100, inView, 1000);
  const days = Math.round(useCountUp(totals.daysSinceStart, inView, 1000));
  const widest = `${cur}${totals.openAmount}`;

  return (
    <section className="band" ref={ref} aria-labelledby="band-h">
      <div className="shell band-grid">
        <div className="band-main">
          <h2 className="band-label" id="band-h">
            当前敞口
          </h2>
          <p
            className={`band-num num${totals.openAmount > 0 ? '' : ' is-clear'}`}
            style={{ ['--n' as string]: Math.max(3, widest.length) }}
          >
            {cur}
            {open}
          </p>
          <p className="band-note">{totals.openCount} 个缺口等人来领</p>
          {totals.openCount > 0 && (
            <div className="band-actions">
              <button
                type="button"
                className="btn"
                onClick={onCopyAll}
                title={`把这 ${totals.openCount} 个缺口一次性复制成索赔话术`}
              >
                一键复制全部索赔 <span className="btn-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          )}
        </div>

        <div className="band-stats">
          <Link className="stat" to="/bills" title="去账单页看每一笔赔付">
            <span className="stat-n num">
              {cur}
              {paid}
            </span>
            <span className="stat-l">已赔付 · {totals.paidCount} 笔已经发出去 →</span>
          </Link>
          <div className="stat">
            <span className="stat-n num">{rate.toFixed(1)}%</span>
            <span className="stat-l">守约率 · {kept} 个周期守住了</span>
          </div>
          <div className="stat">
            <span className="stat-n num">{days}</span>
            <span className="stat-l">开张天数 · 自 {startDate.replace(/-/g, '.')}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
