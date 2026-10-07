import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatPeriod,
  periodEnd,
  type Rule,
  type RuleSummary,
  type Slot,
  type SlotStatus,
} from '../lib/domain';
import { useInView, useElementWidth, useMediaQuery } from '../lib/hooks';

const STATUS_TEXT: Record<SlotStatus, string> = {
  kept: '守约',
  open: '没有记录',
  claimed: '已赔付',
  expired: '已过期',
  exempt: '豁免',
  future: '未开始',
  pending: '进行中',
};

const LEGEND: { status: SlotStatus; label: string }[] = [
  { status: 'kept', label: '守约' },
  { status: 'open', label: '缺口 · 可领取' },
  { status: 'claimed', label: '已赔付' },
  { status: 'expired', label: '超期作废' },
  { status: 'exempt', label: '豁免' },
  { status: 'pending', label: '进行中' },
];

interface TipState {
  slot: Slot;
  x: number;
  y: number;
}

/**
 * 格子被点开后固定住的详情面板。
 * hover 的 tooltip 有 pointer-events: none，鼠标根本移不进去，
 * 证明链接在里面点不到——所以证明只在这个面板里给。
 */
interface PanelState {
  slot: Slot;
}

export default function RuleBlock({
  summary,
  currency,
  onClaimCopy,
}: {
  summary: RuleSummary;
  currency: string;
  onClaimCopy: (rule: Rule, slot: Slot) => void;
}) {
  const { rule, slots } = summary;
  const [ref, inView] = useInView<HTMLElement>(0.1);
  const [tip, setTip] = useState<TipState | null>(null);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [scrollRef, availWidth] = useElementWidth<HTMLDivElement>();
  const narrow = useMediaQuery('(max-width: 760px)');

  // daily 用 7 行（周）排布；weekly/monthly 格子少，用单行大格
  const coarse = rule.cadence !== 'daily';
  const gap = coarse ? 8 : narrow ? 4 : 6;

  // daily：在矩阵前补空格，让第一列从周一开始对齐
  const leadingBlanks = useMemo(() => {
    if (coarse || slots.length === 0) return 0;
    const first = new Date(slots[0].date);
    return (first.getDay() + 6) % 7;
  }, [coarse, slots]);

  // 按容器宽度自适应格子尺寸：数据少时填满，数据多时收缩到下限后横向滚动
  const cell = useMemo(() => {
    const cols = coarse ? slots.length : Math.ceil((slots.length + leadingBlanks) / 7);
    const min = coarse ? 26 : narrow ? 11 : 13;
    const max = coarse ? 56 : narrow ? 16 : 34;
    if (!availWidth || cols === 0) return narrow ? 13 : 22;
    const fit = Math.floor((availWidth - (cols - 1) * gap) / cols);
    return Math.max(min, Math.min(max, fit));
  }, [availWidth, slots.length, leadingBlanks, coarse, narrow, gap]);

  const showTip = useCallback((slot: Slot, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ slot, x: r.left + r.width / 2, y: r.top });
  }, []);

  const hideTip = useCallback(() => setTip(null), []);

  // 面板打开时锁住 hover tooltip，两层浮层叠在一起会打架
  const openPanel = useCallback((slot: Slot) => {
    setTip(null);
    setPanel({ slot });
  }, []);

  const closePanel = useCallback(() => setPanel(null), []);

  const monthMarks = useMemo(() => {
    if (coarse) return [];
    const marks: { label: string; col: number }[] = [];
    let lastMonth = '';
    slots.forEach((s, i) => {
      const m = s.date.slice(0, 7);
      if (m !== lastMonth) {
        lastMonth = m;
        const col = Math.floor((i + leadingBlanks) / 7);
        // 同一列里只保留第一个月份标记，避免重叠
        if (marks.length === 0 || marks[marks.length - 1].col < col) {
          marks.push({ label: `${Number(m.slice(5))}月`, col });
        }
      }
    });
    return marks;
  }, [coarse, slots, leadingBlanks]);

  const rate = Math.round(summary.keepRate * 100);

  return (
    <article className="rule-block" id={`rule-${rule.id}`} ref={ref}>
      <header className="rule-head">
        <div className="rule-title-group">
          <span className="rule-cadence">
            {rule.cadence === 'daily' ? 'DAILY · 每天' : rule.cadence === 'weekly' ? 'WEEKLY · 每周' : 'MONTHLY · 每月'}
          </span>
          <h3 className="rule-title">{rule.title}</h3>
        </div>
        <div className="rule-price">
          <span className="amount mono">
            {currency}
            {rule.amount}
          </span>
          <span className="per">违约一次</span>
        </div>
      </header>

      {rule.detail && <p className="rule-detail">{rule.detail}</p>}

      <div className="rule-stats mono">
        <span>
          守约率 <b>{rate}%</b>
        </span>
        <span>
          已守约 <b>{summary.keptCount}</b> / {summary.settledCount}
        </span>
        <span>
          连续 <b>{summary.streak}</b>（最长 {summary.bestStreak}）
        </span>
        {summary.totalDue > 0 && (
          <span>
            已赔付 <b>
              {currency}
              {summary.totalDue}
            </b>
          </span>
        )}
        {summary.openCount > 0 && (
          <span className="danger">
            缺口{' '}
            <b>
              {summary.openCount} 个 · 可领 {currency}
              {summary.openAmount}
            </b>
          </span>
        )}
      </div>

      <div className="rule-body">
        <div className="rule-main" ref={scrollRef}>
        <div className="grid-scroll">
        {monthMarks.length > 1 && (
          <div
            className="grid-ruler"
            style={{
              ['--cell' as string]: `${cell}px`,
              ['--cell-gap' as string]: `${gap}px`,
            }}
          >
            {monthMarks.map((m, i) => (
              <span key={m.label + i} style={{ gridColumnStart: m.col + 1 }}>
                {m.label}
              </span>
            ))}
          </div>
        )}

        <div
          className={`slot-grid${coarse ? ' is-coarse' : ''}`}
          style={{
            ['--cell' as string]: `${cell}px`,
            ['--cell-gap' as string]: `${gap}px`,
          }}
          role="grid"
          aria-label={`${rule.title} 的守约记录`}
        >
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <div key={`blank-${i}`} aria-hidden="true" />
          ))}
          {slots.map((slot, i) => (
            <SlotCell
              key={slot.period}
              slot={slot}
              rule={rule}
              currency={currency}
              index={i}
              animate={inView}
              onShow={showTip}
              onHide={hideTip}
              onActivate={onClaimCopy}
              onOpenPanel={openPanel}
            />
          ))}
          </div>
          </div>

          <div className="legend">
            {LEGEND.map((l) => (
              <span className="legend-item" key={l.status}>
                <i className={`legend-swatch slot is-${l.status}`} style={{ animation: 'none' }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        <aside className="rule-aside">
          <OpenList
            rule={rule}
            slots={slots}
            currency={currency}
            onClaimCopy={onClaimCopy}
          />
        </aside>
      </div>

      {tip && !panel && <Tooltip tip={tip} rule={rule} currency={currency} />}
      {panel && (
        <SlotPanel
          slot={panel.slot}
          rule={rule}
          currency={currency}
          onClose={closePanel}
          onClaimCopy={onClaimCopy}
        />
      )}
    </article>
  );
}

/** 右侧焦点栏：把可领取的缺口直接列成待办，不用在矩阵里找 */
function OpenList({
  rule,
  slots,
  currency,
  onClaimCopy,
}: {
  rule: Rule;
  slots: Slot[];
  currency: string;
  onClaimCopy: (rule: Rule, slot: Slot) => void;
}) {
  const open = slots.filter((s) => s.status === 'open').reverse();
  const recentKept = slots.filter((s) => s.status === 'kept').slice(-1)[0];

  if (open.length === 0) {
    return (
      <div className="aside-clear">
        <span className="aside-clear-mark" aria-hidden="true">
          ✓
        </span>
        <p className="aside-clear-title">这条规则目前没有缺口</p>
        <p className="aside-clear-note">
          {recentKept
            ? `最近一次记录 ${recentKept.date.replace(/-/g, '/')}。`
            : '还没有记录。'}
          {rule.cadence === 'daily' ? '明天继续。' : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="aside-open">
      <div className="aside-head">
        <span className="aside-label">可领取</span>
        <span className="aside-total mono">
          {currency}
          {open.length * rule.amount}
        </span>
      </div>
      <ul className="aside-list">
        {open.slice(0, 6).map((s) => (
          <li key={s.period}>
            <button type="button" className="aside-item" onClick={() => onClaimCopy(rule, s)}>
              <span className="aside-item-date mono">
                {formatPeriod(rule.cadence, s.period)}
              </span>
              <span className="aside-item-amount mono">
                {currency}
                {rule.amount}
              </span>
              <span className="aside-item-cta">复制索赔</span>
            </button>
          </li>
        ))}
      </ul>
      {open.length > 6 && (
        <p className="aside-more mono">还有 {open.length - 6} 个 · 在左侧矩阵里</p>
      )}
      {rule.proof && <p className="aside-proof">需要我出示：{rule.proof}</p>}
    </div>
  );
}

function SlotCell({
  slot,
  rule,
  currency,
  index,
  animate,
  onShow,
  onHide,
  onActivate,
  onOpenPanel,
}: {
  slot: Slot;
  rule: Rule;
  currency: string;
  index: number;
  animate: boolean;
  onShow: (slot: Slot, el: HTMLElement) => void;
  onHide: () => void;
  onActivate: (rule: Rule, slot: Slot) => void;
  onOpenPanel: (slot: Slot) => void;
}) {
  // open 的格子点了是复制索赔话术；有证据的格子点了是打开证明面板
  const claimable = slot.status === 'open';
  const hasProof = Boolean(slot.entry?.media?.length || slot.entry?.note);
  const clickable = claimable || hasProof || slot.status === 'claimed';

  const label = `${formatPeriod(rule.cadence, slot.period)}，${STATUS_TEXT[slot.status]}${
    claimable ? `，可领取 ${currency}${rule.amount}` : ''
  }${hasProof ? '，有证明，点击查看' : ''}`;

  const common = {
    className: `slot is-${slot.status}${hasProof ? ' has-proof' : ''}`,
    style: {
      animationDelay: animate ? `${Math.min(index * 8, 900)}ms` : '0ms',
      animationPlayState: animate ? ('running' as const) : ('paused' as const),
    },
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => onShow(slot, e.currentTarget),
    onMouseLeave: onHide,
    onFocus: (e: React.FocusEvent<HTMLElement>) => onShow(slot, e.currentTarget),
    onBlur: onHide,
    'aria-label': label,
  };

  if (clickable) {
    return (
      <button
        type="button"
        {...common}
        role="gridcell"
        onClick={(e) => {
          if (claimable) {
            onShow(slot, e.currentTarget);
            onActivate(rule, slot);
          } else {
            onOpenPanel(slot);
          }
        }}
      />
    );
  }

  return <div {...common} role="gridcell" tabIndex={slot.status === 'kept' ? 0 : -1} />;
}

function Tooltip({ tip, rule, currency }: { tip: TipState; rule: Rule; currency: string }) {
  const { slot } = tip;
  const open = slot.status === 'open';
  const end = periodEnd(rule.cadence, slot.period);

  return (
    <div className="tooltip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      <div className="tooltip-date">
        {slot.date.replace(/-/g, '/')}
        {rule.cadence !== 'daily' && ` – ${end.slice(5).replace('-', '/')}`}
      </div>

      <div className={`tooltip-status${open ? ' is-open' : ''}`}>
        {STATUS_TEXT[slot.status]}
        {slot.status === 'exempt' && slot.exemptReason && ` · ${slot.exemptReason}`}
      </div>

      {open && (
        <>
          <div className="tooltip-money mono">
            {currency}
            {rule.amount}
          </div>
          <div className="tooltip-cta">点击复制索赔话术 →</div>
        </>
      )}

      {slot.status === 'claimed' && slot.claim && (
        <div className="tooltip-note">
          已被 {slot.claim.claimant} 领走 {currency}
          {slot.claim.amount}
        </div>
      )}

      {slot.status === 'expired' && (
        <div className="tooltip-note">超出 30 天追溯期，这笔钱作废了。</div>
      )}

      {slot.entry?.note && <div className="tooltip-note">{slot.entry.note}</div>}

      {/* 证明只在点开的面板里给——这个 tooltip 有 pointer-events: none，链接点不到 */}
      {slot.entry?.media && slot.entry.media.length > 0 && (
        <div className="tooltip-cta">
          {slot.entry.media.length} 份证明 · 点击查看 →
        </div>
      )}
    </div>
  );
}

/** 从 URL 里取个能让人一眼认出来源的短标签 */
function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url.slice(0, 32);
  }
}

const MEDIA_LABEL: Record<string, string> = {
  image: '图片',
  douyin: '抖音',
  link: '链接',
};

/**
 * 点开格子后的详情面板。固定住，点遮罩或 ✕ 才关。
 * 存在的理由：访客要能真的点开证明去核对，而不是只看到「这里有份证明」。
 */
function SlotPanel({
  slot,
  rule,
  currency,
  onClose,
  onClaimCopy,
}: {
  slot: Slot;
  rule: Rule;
  currency: string;
  onClose: () => void;
  onClaimCopy: (rule: Rule, slot: Slot) => void;
}) {
  const media = slot.entry?.media ?? [];
  const end = periodEnd(rule.cadence, slot.period);

  // Esc 关闭。面板是 fixed 全屏遮罩，键盘用户也得有退路。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="slot-panel-backdrop" onClick={onClose} role="presentation">
      <div
        className="slot-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${formatPeriod(rule.cadence, slot.period)} 的记录`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="slot-panel-head">
          <div>
            <div className="slot-panel-date mono">
              {slot.date.replace(/-/g, '/')}
              {rule.cadence !== 'daily' && ` – ${end.slice(5).replace('-', '/')}`}
            </div>
            <div className={`slot-panel-status is-${slot.status}`}>
              {STATUS_TEXT[slot.status]}
              {slot.status === 'exempt' && slot.exemptReason && ` · ${slot.exemptReason}`}
            </div>
          </div>
          <button type="button" className="slot-panel-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        {slot.status === 'claimed' && slot.claim && (
          <p className="slot-panel-note">
            已被 {slot.claim.claimant} 领走 {currency}
            {slot.claim.amount}
            {slot.claim.note && ` · ${slot.claim.note}`}
          </p>
        )}

        {slot.entry?.note && <p className="slot-panel-note">{slot.entry.note}</p>}

        <div className="slot-panel-section">
          <span className="slot-panel-label">证明</span>
          {media.length === 0 ? (
            <p className="slot-panel-empty">
              这一格没有留下证明{rule.proof ? `。按约定我该出示：${rule.proof}` : '。'}
            </p>
          ) : (
            <ul className="slot-panel-media">
              {media.map((m, i) => (
                <li key={i}>
                  <a
                    className="slot-panel-link"
                    href={m.url}
                    target="_blank"
                    // noopener 防止新开的页面拿到 window.opener 反向操作本站
                    rel="noreferrer noopener"
                  >
                    <span className="slot-panel-link-type mono">
                      {MEDIA_LABEL[m.type] ?? m.type}
                    </span>
                    <span className="slot-panel-link-url">{hostOf(m.url)}</span>
                    <span className="slot-panel-link-go" aria-hidden="true">
                      ↗
                    </span>
                  </a>
                  {m.type === 'image' && (
                    <img className="slot-panel-img" src={m.url} alt="" loading="lazy" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {slot.status === 'open' && (
          <button
            type="button"
            className="slot-panel-claim"
            onClick={() => {
              onClaimCopy(rule, slot);
              onClose();
            }}
          >
            复制索赔话术 · {currency}
            {rule.amount}
          </button>
        )}
      </div>
    </div>
  );
}
