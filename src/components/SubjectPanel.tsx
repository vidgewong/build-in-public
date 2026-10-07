import { useEffect, useRef, useState } from 'react';
import type { Metric } from '../lib/data';
import { useCountUp, useInView, usePrefersReducedMotion } from '../lib/hooks';

export interface Buff {
  label: string;
  tone: 'good' | 'bad' | 'neutral';
}

/**
 * 人物检视面板。
 * 人像使用序列帧（frames）时可拖拽旋转；没有素材时退化为占位剪影 + 视差呼吸。
 */
export default function SubjectPanel({
  name,
  handle,
  metrics,
  buffs,
  level,
}: {
  name: string;
  handle: string;
  metrics: Metric[];
  buffs: Buff[];
  level: number;
}) {
  const [stageRef, inView] = useInView<HTMLDivElement>(0.2);
  const reduced = usePrefersReducedMotion();
  const figureRef = useRef<HTMLDivElement>(null);
  const [angle, setAngle] = useState(0);
  const drag = useRef<{ x: number; a: number } | null>(null);

  // 鼠标视差 + 常驻呼吸
  useEffect(() => {
    if (reduced) return;
    const stage = stageRef.current;
    const fig = figureRef.current;
    if (!stage || !fig) return;

    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const t0 = performance.now();

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onLeave = () => { tx = 0; ty = 0; };

    const loop = (now: number) => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      const breath = Math.sin((now - t0) / 1800) * 4;
      fig.style.transform =
        `translate3d(${cx * 14}px, ${cy * 10 + breath}px, 0) ` +
        `rotateY(${cx * 7 + angle}deg) rotateX(${-cy * 4}deg)`;
      raf = requestAnimationFrame(loop);
    };

    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(loop);
    return () => {
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, [reduced, angle, stageRef]);

  // 拖拽旋转
  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, a: angle };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setAngle(drag.current.a + (e.clientX - drag.current.x) * 0.4);
  };
  const onPointerUp = () => { drag.current = null; };

  return (
    <div className="subject">
      <div
        className="subject-stage"
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className="subject-corner tl" />
        <span className="subject-corner tr" />
        <span className="subject-corner bl" />
        <span className="subject-corner br" />
        <span className="subject-stage-label">
          {handle} · LV.{level}
        </span>

        <div className="subject-figure" ref={figureRef}>
          <PlaceholderFigure name={name} />
        </div>

        <span className="subject-hint">拖拽旋转 · 素材就位后替换为真人序列帧</span>
      </div>

      <div className="subject-panel">
        {metrics
          .filter((m) => m.visibility !== 'hidden')
          .map((m, i) => (
            <MetricRow key={m.key} metric={m} active={inView} index={i} />
          ))}

        <div className="subject-buffs">
          {buffs.map((b) => (
            <span
              key={b.label}
              className={`buff${b.tone === 'good' ? ' is-good' : b.tone === 'bad' ? ' is-bad' : ''}`}
            >
              {b.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricRow({ metric, active, index }: { metric: Metric; active: boolean; index: number }) {
  const numeric = typeof metric.value === 'number' ? metric.value : 0;
  const animated = useCountUp(numeric, active, 900 + index * 60);
  const masked = metric.visibility === 'masked';

  const decimals = Number.isInteger(numeric) ? 0 : 1;
  const display = masked
    ? '***'
    : metric.value === null
      ? '—'
      : typeof metric.value === 'number'
        ? animated.toFixed(decimals)
        : metric.value;

  return (
    <div className="metric-row">
      <span className="metric-label" title={metric.hint}>
        {metric.label}
        {metric.hint && <span className="metric-hint">{metric.hint}</span>}
      </span>
      <span className="metric-value mono">
        {masked ? (
          <>
            <span className="metric-masked">***</span>
            <span className="metric-masked-hint">{metric.maskedHint ?? '暂不可见'}</span>
          </>
        ) : (
          <>
            {display}
            {metric.unit && <span className="metric-unit">{metric.unit}</span>}
          </>
        )}
      </span>
    </div>
  );
}

/** 占位剪影：一个克制的几何人形，等真人素材替换 */
function PlaceholderFigure({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 300 500" width="100%" height="100%" aria-label={`${name} 的人物占位图`} role="img">
      <defs>
        <linearGradient id="fig" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--figure-a)" />
          <stop offset="100%" stopColor="var(--figure-b)" />
        </linearGradient>
        <filter id="soft">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* 地面投影 */}
      <ellipse
        cx="150"
        cy="486"
        rx="68"
        ry="9"
        fill="var(--figure-b)"
        opacity="var(--figure-shadow)"
        filter="url(#soft)"
      />

      {/* 头 */}
      <ellipse cx="150" cy="74" rx="40" ry="48" fill="url(#fig)" />
      {/* 颈 */}
      <rect x="138" y="114" width="24" height="26" fill="url(#fig)" />
      {/* 躯干 */}
      <path d="M150 136 L206 170 L198 310 L102 310 L94 170 Z" fill="url(#fig)" />
      {/* 手臂 */}
      <path d="M100 172 L78 300 L94 304 L112 184 Z" fill="url(#fig)" />
      <path d="M200 172 L222 300 L206 304 L188 184 Z" fill="url(#fig)" />
      {/* 腿 */}
      <path d="M108 310 L104 470 L128 470 L140 316 Z" fill="url(#fig)" />
      <path d="M192 310 L196 470 L172 470 L160 316 Z" fill="url(#fig)" />

      {/* 扫描线 */}
      <rect x="60" y="0" width="180" height="1.5" fill="var(--gold)" opacity="0.55">
        <animate attributeName="y" values="20;470;20" dur="7s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0.55;0.55;0" dur="7s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}
