import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { todayKey } from '../../lib/domain';

const WIDE = '(min-width: 900px)';

/** 桌面：左右分栏、各自滚动；手机：一次只显示一个视图 */
export function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const m = window.matchMedia(WIDE);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/** 分段切换，滑块用 CSS transform 过渡 */
export function Seg<T extends string>({
  items, value, onChange, label,
}: {
  items: { key: T; label: ReactNode }[];
  value: T;
  onChange: (k: T) => void;
  label: string;
}) {
  const i = Math.max(0, items.findIndex((x) => x.key === value));
  return (
    <div
      className="seg"
      role="tablist"
      aria-label={label}
      style={{ '--n': items.length, '--i': i } as CSSProperties}
    >
      <span className="seg-thumb" aria-hidden />
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          role="tab"
          aria-selected={it.key === value}
          className="seg-btn"
          onClick={() => onChange(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** 折叠区：展开 / 收起带高度过渡。收起后才卸载内容，避免表单状态在动画中途丢失 */
export function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(t);
  }, [open]);
  return (
    <div className={`fold${shown ? ' is-open' : ''}`}>
      <div>{mounted && children}</div>
    </div>
  );
}

export type Mode = {
  key: string;
  /** 桌面顶部分段、手机分段里「操作」那一项的文字 */
  label: ReactNode;
  actTitle: ReactNode;
  act: ReactNode;
  /** 多个 mode 共用同一份记录时给同一个 listKey */
  listKey?: string;
  /** 手机分段里「记录」那一项的文字 */
  listLabel: ReactNode;
  listTitle: ReactNode;
  listTools?: ReactNode;
  list: ReactNode;
};

/**
 * 工作台：左边操作、右边记录。
 * 桌面两栏同时可见、各自滚动，整页不滚；手机把操作和记录并进同一条分段，一次只看一个。
 */
export function Workspace({
  title, stats, modes,
}: {
  title: string;
  stats?: ReactNode;
  modes: Mode[];
}) {
  const wide = useWide();
  const [modeKey, setModeKey] = useState(modes[0].key);
  const [showList, setShowList] = useState(false);
  const mode = modes.find((m) => m.key === modeKey) ?? modes[0];
  const lk = (m: Mode) => m.listKey ?? m.key;

  const mobileItems: { key: string; label: ReactNode }[] = modes.map((m) => ({
    key: `act:${m.key}`,
    label: m.label,
  }));
  const seen = new Set<string>();
  for (const m of modes) {
    if (seen.has(lk(m))) continue;
    seen.add(lk(m));
    mobileItems.push({ key: `list:${lk(m)}`, label: m.listLabel });
  }
  const mobileValue = showList ? `list:${lk(mode)}` : `act:${mode.key}`;
  const onMobile = (k: string) => {
    if (k.startsWith('act:')) {
      setModeKey(k.slice(4));
      setShowList(false);
      return;
    }
    const id = k.slice(5);
    if (lk(mode) !== id) setModeKey(modes.find((m) => lk(m) === id)?.key ?? modeKey);
    setShowList(true);
  };

  return (
    <div className="ws">
      <header className="ws-head">
        <h1 className="ws-title">{title}</h1>
        {wide ? (
          modes.length > 1 && (
            <Seg
              label={title}
              items={modes.map((m) => ({ key: m.key, label: m.label }))}
              value={mode.key}
              onChange={setModeKey}
            />
          )
        ) : (
          <Seg label={title} items={mobileItems} value={mobileValue} onChange={onMobile} />
        )}
        {stats && <div className="ws-stats">{stats}</div>}
      </header>

      <div className={`ws-body ${showList ? 'is-list' : 'is-act'}`}>
        <section className="ws-pane ws-act" key={`a-${mode.key}`}>
          <div className="ws-pane-head"><h2>{mode.actTitle}</h2></div>
          <div className="ws-pane-body">{mode.act}</div>
        </section>
        <section className="ws-pane ws-list" key={`l-${lk(mode)}`}>
          <div className="ws-pane-head">
            <h2>{mode.listTitle}</h2>
            {mode.listTools}
          </div>
          <div className="ws-pane-body">{mode.list}</div>
        </section>
      </div>
    </div>
  );
}

/**
 * 主从：左列表、右编辑器。手机上编辑器是从底部滑出的整屏抽屉。
 */
export function MasterDetail({
  title, stats, listTitle, listTools, list, detailTitle, detail, open, onClose, empty,
}: {
  title: string;
  stats?: ReactNode;
  listTitle: ReactNode;
  listTools?: ReactNode;
  list: ReactNode;
  detailTitle: ReactNode;
  detail: ReactNode;
  open: boolean;
  onClose: () => void;
  empty: string;
}) {
  const wide = useWide();

  useEffect(() => {
    if (!open || wide) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, wide]);

  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [open, onClose]);

  return (
    <div className="ws">
      <header className="ws-head">
        <h1 className="ws-title">{title}</h1>
        {stats && <div className="ws-stats">{stats}</div>}
      </header>

      <div className="ws-body is-md">
        <section className="ws-pane ws-list">
          <div className="ws-pane-head">
            <h2>{listTitle}</h2>
            {listTools}
          </div>
          <div className="ws-pane-body">{list}</div>
        </section>

        <section className={`ws-pane md-detail${open ? ' is-open' : ''}`} aria-hidden={!open && !wide}>
          <div className="ws-pane-head">
            <button type="button" className="md-back" onClick={onClose}>‹ 返回</button>
            <h2>{open ? detailTitle : '编辑'}</h2>
          </div>
          <div className="ws-pane-body">
            {open ? detail : <p className="ws-hint">{empty}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

/** 按月分组的账本行。items 必须已按日期倒序 */
export function MonthGroups<T>({
  items, dateOf, render,
}: {
  items: T[];
  dateOf: (t: T) => string;
  render: (t: T) => ReactNode;
}) {
  const groups: { key: string; rows: T[] }[] = [];
  for (const it of items) {
    const key = dateOf(it).slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(it);
    else groups.push({ key, rows: [it] });
  }
  const thisYear = todayKey().slice(0, 4);
  return (
    <>
      {groups.map((g) => {
        const [y, m] = g.key.split('-');
        return (
          <div className="mgroup" key={g.key}>
            <div className="mhead">
              <span>{y === thisYear ? `${Number(m)} 月` : `${y} 年 ${Number(m)} 月`}</span>
              <span className="mono">{g.rows.length}</span>
            </div>
            <ul className="lrows">{g.rows.map(render)}</ul>
          </div>
        );
      })}
    </>
  );
}

/** 记录列表右上角的「按约定筛选」 */
export function RuleFilter({
  rules, value, onChange,
}: {
  rules: { id: string; title: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      className="admin-input is-small ws-filter"
      aria-label="按约定筛选"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">全部约定</option>
      {rules.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
    </select>
  );
}
