import { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSnapshot } from '../lib/api';
import { buildSiteState } from '../lib/data';
import { formatPeriod, type Rule, type Slot } from '../lib/domain';
import { useToast } from '../lib/hooks';
import { SiteContext } from '../lib/site-context';
import ThemeToggle from './ThemeToggle';

const NAV = [
  { to: '/', label: '约定' },
  { to: '/records', label: '记录' },
  { to: '/me', label: '本人' },
  { to: '/bills', label: '账单' },
  { to: '/rules', label: '规则' },
];

export default function Layout() {
  const snapshot = useSnapshot();
  const [toast, showToast] = useToast();
  const { pathname } = useLocation();

  const state = useMemo(
    () => (snapshot.status === 'ready' ? buildSiteState(snapshot.data) : null),
    [snapshot]
  );

  const ctx = useMemo(() => {
    if (!state) return null;
    const cur = state.currency;

    const write = (text: string, ok: string) => {
      navigator.clipboard
        ?.writeText(text)
        .then(() => showToast(ok))
        // 复制失败（没授权／非 HTTPS）就把话术本身弹出来，至少能手动选
        .catch(() => showToast(text));
    };

    const copyClaim = (rule: Rule, slot: Slot) => {
      const text =
        `我发现你 ${formatPeriod(rule.cadence, slot.period)} 没有「${rule.title}」的记录，` +
        `按约定你该给我 ${cur}${rule.amount}。` +
        `（${location.origin}/records）`;
      write(text, '索赔话术已复制，直接发给我即可');
    };

    /**
     * 把当前所有缺口打包成一份话术。
     *
     * 逐个点格子复制太碎了：十几个缺口要来回十几趟。这里一次拿全，
     * 朋友在微信里粘一次就是完整的一笔账。
     *
     * 按规则分组而不是一个缺口一行——同一条规则漏十天就是十行几乎一样的字，
     * 在微信里没法读。每条规则一行，日期列在后面，行数跟着规则数走，
     * 不跟着缺口数走，缺口再多也不会糊成一屏。
     */
    const copyAllClaims = () => {
      const groups: { title: string; amount: number; periods: string[] }[] = [];
      let total = 0;
      let gaps = 0;

      for (const s of state.summaries) {
        const periods = s.slots
          .filter((slot) => slot.status === 'open')
          .map((slot) => formatPeriod(s.rule.cadence, slot.period));
        if (!periods.length) continue;
        groups.push({ title: s.rule.title, amount: s.rule.amount, periods });
        total += s.rule.amount * periods.length;
        gaps += periods.length;
      }

      if (!gaps) {
        showToast('现在没有缺口可领');
        return;
      }

      const lines = groups.map((g, i) => {
        const sum = g.amount * g.periods.length;
        const head =
          g.periods.length > 1
            ? `${i + 1}.「${g.title}」漏了 ${g.periods.length} 次 · ${cur}${g.amount} × ${g.periods.length} = ${cur}${sum}`
            : `${i + 1}.「${g.title}」${cur}${sum}`;
        return `${head}\n   ${g.periods.join('、')}`;
      });

      const text = [
        `我查了一下，你有 ${gaps} 个缺口没记录：`,
        ...lines,
        `合计 ${cur}${total}。`,
        `（${location.origin}/records）`,
      ].join('\n');
      write(text, `${gaps} 个缺口 · ${cur}${total} 已复制，直接发给我`);
    };

    return { state, currency: cur, copyClaim, copyAllClaims };
  }, [state, showToast]);

  // 当前敞口放在导航栏右侧常驻，每一页都能看到还欠多少
  const cur = state?.currency ?? '¥';
  const openAmount = state?.totals.openAmount ?? 0;
  const openCount = state?.totals.openCount ?? 0;

  return (
    <>
      <nav className="topnav">
        <div className="shell topnav-inner">
          <NavLink to="/" className="topnav-brand">
            BUILD IN PUBLIC
          </NavLink>

          <ul className="topnav-links">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.to === '/'}
                  className={({ isActive }) => `topnav-link${isActive ? ' is-active' : ''}`}
                >
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="topnav-right">
            <ThemeToggle />
            <NavLink
              to="/"
              className={`topnav-open mono${openAmount > 0 ? ' is-open' : ''}`}
              aria-label={
                openAmount > 0 ? `当前可领 ${cur}${openAmount}，${openCount} 个缺口` : '当前没有缺口'
              }
            >
              {openAmount > 0 ? (
                <>
                  <span className="topnav-open-dot" aria-hidden="true" />
                  {cur}
                  {openAmount}
                </>
              ) : (
                <>{cur}0</>
              )}
            </NavLink>
          </div>
        </div>
      </nav>

      {ctx ? (
        <SiteContext.Provider value={ctx}>
          <main className="page" key={pathname}>
            <Outlet />
          </main>

          <footer className="footer">
            <div className="shell footer-inner">
              <span>{ctx.state.profile.handle}</span>
              <span>{ctx.state.profile.contact}</span>
              <span className="footer-spacer">
                更新于 {ctx.state.today.replace(/-/g, '.')}
              </span>
            </div>
          </footer>
        </SiteContext.Provider>
      ) : (
        <main className="page">
          <Boot snapshot={snapshot} />
        </main>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

/** 数据还没到位时占住整屏，不让访客看见半截页面 */
function Boot({ snapshot }: { snapshot: ReturnType<typeof useSnapshot> }) {
  if (snapshot.status === 'error') {
    return (
      <div className="boot">
        <span className="boot-label mono">连不上账本</span>
        <p className="boot-note">{snapshot.error}</p>
        <p className="boot-note">
          数据服务没在跑。本地请先 <code>npm run api</code>。
        </p>
      </div>
    );
  }

  return (
    <div className="boot">
      <span className="boot-label mono">
        <span className="boot-dot" aria-hidden="true" />
        正在结算
      </span>
      <p className="boot-note">把账本拉出来给你看。</p>
    </div>
  );
}
