import { useCallback, useEffect, useState } from 'react';
import { adminApi, AuthError, type AdminSnapshot } from '../../lib/admin-api';
import EntriesPanel from './EntriesPanel';
import LedgerPanel from './LedgerPanel';
import Login from './Login';
import MetricsPanel from './MetricsPanel';
import RulesPanel from './RulesPanel';

const TABS = [
  { key: 'entries', label: '打卡' },
  { key: 'rules', label: '约定' },
  { key: 'metrics', label: '指标' },
  { key: 'ledger', label: '赔付 / 豁免' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/**
 * /admin 的壳。不套站点的 Layout——这里不该出现导航栏、页脚和「当前可领」。
 * 数据一次拉完放在这里，各面板写完后调 reload 重新拉，避免各自维护局部状态。
 */
export default function AdminApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [snap, setSnap] = useState<AdminSnapshot | null>(null);
  const [tab, setTab] = useState<TabKey>('entries');
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);

  const notify = useCallback((text: string, bad = false) => {
    setToast({ text, bad });
    setTimeout(() => setToast(null), bad ? 4500 : 2200);
  }, []);

  const reload = useCallback(async () => {
    try {
      setSnap(await adminApi.snapshot());
      setAuthed(true);
    } catch (err) {
      if (err instanceof AuthError) setAuthed(false);
      else notify(err instanceof Error ? err.message : String(err), true);
    }
  }, [notify]);

  useEffect(() => {
    document.title = 'admin · build in public';
    void reload();
  }, [reload]);

  /** 面板统一通过这里写：成功就刷新 + 提示，失败只提示不刷新 */
  const run = useCallback(
    async (fn: () => Promise<unknown>, okText: string) => {
      try {
        await fn();
        await reload();
        notify(okText);
        return true;
      } catch (err) {
        if (err instanceof AuthError) {
          setAuthed(false);
          return false;
        }
        notify(err instanceof Error ? err.message : String(err), true);
        return false;
      }
    },
    [reload, notify]
  );

  if (authed === null) {
    return (
      <div className="admin admin-boot">
        <span className="mono">正在确认身份…</span>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="admin">
        <Login
          onDone={() => {
            setAuthed(true);
            void reload();
          }}
        />
      </div>
    );
  }

  const panelProps = { snap, run };

  return (
    <div className="admin">
      <header className="admin-top">
        <div className="admin-top-inner">
          <span className="admin-brand mono">ADMIN</span>
          <div className="admin-top-right">
            <a className="admin-link mono" href="/" target="_blank" rel="noreferrer">
              看站点 ↗
            </a>
            <button
              type="button"
              className="admin-link mono"
              onClick={async () => {
                await adminApi.logout();
                setAuthed(false);
                setSnap(null);
              }}
            >
              登出
            </button>
          </div>
        </div>

        <nav className="admin-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`admin-tab${tab === t.key ? ' is-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="admin-body">
        {!snap ? (
          <p className="admin-empty">正在加载…</p>
        ) : tab === 'entries' ? (
          <EntriesPanel {...panelProps} snap={snap} />
        ) : tab === 'rules' ? (
          <RulesPanel {...panelProps} snap={snap} />
        ) : tab === 'metrics' ? (
          <MetricsPanel {...panelProps} snap={snap} />
        ) : (
          <LedgerPanel {...panelProps} snap={snap} />
        )}
      </main>

      {toast && <div className={`admin-toast${toast.bad ? ' is-bad' : ''}`}>{toast.text}</div>}
    </div>
  );
}

export type PanelProps = {
  snap: AdminSnapshot;
  run: (fn: () => Promise<unknown>, okText: string) => Promise<boolean>;
};
