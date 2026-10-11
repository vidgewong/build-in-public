import { Link } from 'react-router-dom';
import Overview from '../components/Overview';
import SubjectCard from '../components/SubjectCard';
import { useCountUp, useInView } from '../lib/hooks';
import { useSite } from '../lib/site-context';

export default function Home() {
  const { state, currency: cur, copyAllClaims } = useSite();
  const { totals, overview, today, claims, claimWindowDays, profile, metrics } = state;

  // hero 里只放 4 项，太多会跟左边的大标题抢
  // 先滤掉隐藏的再取前 4 个，否则隐藏项会占掉首页名额
  const heroMetrics = metrics.filter((m) => m.visibility !== 'hidden').slice(0, 4);

  return (
    <>
      <header className="hero">
        <div className="shell hero-main">
          <div className="hero-copy">
            <h1 className="hero-title">
              <span className="line">
                <span>VIDGE 的</span>
              </span>
              <span className="line">
                <span>人生公测</span>
              </span>
              <span className="line">
                <span className="hero-chapter">
                  <em>行为准则</em>篇
                </span>
              </span>
            </h1>
            <p className="hero-sub">
              {/* 中文不能靠换行断句：JSX 会把换行折成空格，渲染出来就是个突兀的空格 */}
              我做不到的事，就让它有成本。下面每一条约定后面都跟着一个价格，只要你发现我没做到，第一个找我，这笔钱就是你的。
            </p>
            <p className="hero-stamp mono">结算于 {today.replace(/-/g, '.')}</p>
          </div>

          <SubjectCard
            name={profile.name}
            handle={profile.handle}
            level={totals.level}
            metrics={heroMetrics}
          />
        </div>

        <Ledger
          totals={totals}
          cur={cur}
          startDate={profile.startDate}
          onCopyAll={copyAllClaims}
        />
      </header>

      <section className="section is-tight">
        <div className="shell">
          <Overview rows={overview} currency={cur} claims={claims} />
        </div>
      </section>

      <section className="section is-tight">
        <div className="shell">
          <div className="home-next">
            <Link className="home-next-card" to="/records">
              <span className="home-next-title">守约记录</span>
              <span className="home-next-note">
                一格一天。红色的那些，是我没有记录的日子。
              </span>
              <span className="home-next-cta">去找红格子 →</span>
            </Link>
            <Link className="home-next-card" to="/rules">
              <span className="home-next-title">怎么拿到这笔钱</span>
              <span className="home-next-note">
                滚动 {claimWindowDays} 天内的违约事件都还作数。
              </span>
              <span className="home-next-cta">看规则 →</span>
            </Link>
          </div>
        </div>
      </section>
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
  const [ref, inView] = useInView<HTMLDivElement>(0.1);
  const open = useCountUp(totals.openAmount, inView, 1100);
  const paid = useCountUp(totals.paidAmount, inView, 1100);
  const kept = useCountUp(totals.keptCount, inView, 900);
  const rate = useCountUp(totals.keepRate * 100, inView, 1000);

  return (
    <div className="shell" ref={ref}>
      <div className="hero-ledger">
        <div className="ledger-cell">
          <span className="ledger-label">当前敞口</span>
          <span className={`ledger-value mono ${totals.openAmount > 0 ? 'is-open' : 'is-kept'}`}>
            {cur}
            {Math.round(open)}
          </span>
          <span className="ledger-hint">{totals.openCount} 个缺口等人来领</span>
          {/* 没有缺口时不渲染：一个按下去说「现在没有缺口」的按钮是在浪费点击 */}
          {totals.openCount > 0 && (
            <button
              type="button"
              className="ledger-claim-all"
              onClick={onCopyAll}
              title={`把这 ${totals.openCount} 个缺口一次性复制成索赔话术`}
            >
              一键复制全部索赔 →
            </button>
          )}
        </div>
        <div className="ledger-cell">
          <span className="ledger-label">已赔付</span>
          <span className="ledger-value is-gold mono">
            {cur}
            {Math.round(paid)}
          </span>
          <span className="ledger-hint">{totals.paidCount} 笔已经发出去</span>
        </div>
        <div className="ledger-cell">
          <span className="ledger-label">守约率</span>
          <span className="ledger-value mono">{rate.toFixed(1)}%</span>
          <span className="ledger-hint">{Math.round(kept)} 个周期守住了</span>
        </div>
        <div className="ledger-cell">
          <span className="ledger-label">开张天数</span>
          <span className="ledger-value mono">{totals.daysSinceStart}</span>
          <span className="ledger-hint">自 {startDate.replace(/-/g, '.')}</span>
        </div>
      </div>
    </div>
  );
}
