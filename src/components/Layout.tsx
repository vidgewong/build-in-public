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
    const copyClaim = (rule: Rule, slot: Slot) => {
      const text =
        `我发现你 ${formatPeriod(rule.cadence, slot.period)} 没有「${rule.title}」的记录，` +
        `按约定你该给我 ${cur}${rule.amount}。` +
        `（${location.origin}/records）`;
      navigator.clipboard
        ?.writeText(text)
        .then(() => showToast('索赔话术已复制，直接发给我即可'))
        .catch(() => showToast(text));
    };
    return { state, currency: cur, copyClaim };
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
