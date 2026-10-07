import { useRef } from 'react';
import { Link } from 'react-router-dom';
import type { Metric } from '../lib/data';
import { useCountUp, useInView, usePrefersReducedMotion } from '../lib/hooks';

/**
 * 首页 hero 右侧的小号检视卡。
 * 和 /me 的 SubjectPanel 是同一套视觉语言，但只取前几项指标，
 * 不做拖拽旋转——这里是预告，不是主角。
 */
export default function SubjectCard({
  name,
  handle,
  level,
  metrics,
}: {
  name: string;
  handle: string;
  level: number;
  metrics: Metric[];
}) {
  const [ref, inView] = useInView<HTMLAnchorElement>(0.15);
  const reduced = usePrefersReducedMotion();
  const figRef = useRef<SVGSVGElement>(null);

  return (
    <Link className="subject-card" to="/me" ref={ref} aria-label={`查看 ${name} 的完整检视`}>
      <div className="subject-card-fig">
        <MiniFigure ref={figRef} name={name} scan={!reduced} />
      </div>

      <div className="subject-card-side">
        <div className="subject-card-head">
          <span className="subject-card-label mono">{handle} · LV.{level}</span>
        </div>

        <div className="subject-card-metrics">
          {metrics.map((m, i) => (
            <MiniMetric key={m.key} metric={m} active={inView} index={i} />
          ))}
        </div>

        <span className="subject-card-cta mono">完整检视 →</span>
      </div>
    </Link>
  );
}

function MiniMetric({ metric, active, index }: { metric: Metric; active: boolean; index: number }) {
  const numeric = typeof metric.value === 'number' ? metric.value : 0;
  const animated = useCountUp(numeric, active, 800 + index * 60);
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
    <div className="subject-card-metric">
      <span className="subject-card-metric-label">
        {metric.label}
        {metric.hint && <span className="subject-card-metric-hint">{metric.hint}</span>}
      </span>
      <span className={`subject-card-metric-value mono${masked ? ' is-masked' : ''}`}>
        {display}
        {!masked && metric.unit && (
          <span className="subject-card-metric-unit">{metric.unit}</span>
        )}
      </span>
    </div>
  );
}

/** 极简剪影，颜色跟随主题 token */
function MiniFigure({
  ref,
  name,
  scan,
}: {
  ref: React.Ref<SVGSVGElement>;
  name: string;
  scan: boolean;
}) {
  return (
    <svg
      ref={ref}
      viewBox="0 0 160 260"
      width="100%"
      height="100%"
      role="img"
      aria-label={`${name} 的人物占位图`}
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        <linearGradient id="minifig" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--figure-a)" />
          <stop offset="100%" stopColor="var(--figure-b)" />
        </linearGradient>
        {/* 脚下渐隐，让人像融进页面而不是悬空 */}
        <linearGradient id="minifade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="72%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="minimask">
          <rect x="0" y="0" width="160" height="260" fill="url(#minifade)" />
        </mask>
      </defs>

      <g mask="url(#minimask)">
        <ellipse cx="80" cy="38" rx="21" ry="25" fill="url(#minifig)" />
        <rect x="73" y="59" width="14" height="14" fill="url(#minifig)" />
        <path d="M80 70 L110 88 L106 162 L54 162 L50 88 Z" fill="url(#minifig)" />
        <path d="M53 89 L41 157 L50 159 L60 95 Z" fill="url(#minifig)" />
        <path d="M107 89 L119 157 L110 159 L100 95 Z" fill="url(#minifig)" />
        <path d="M57 162 L55 245 L68 245 L74 165 Z" fill="url(#minifig)" />
        <path d="M103 162 L105 245 L92 245 L86 165 Z" fill="url(#minifig)" />
      </g>

      {scan && (
        <rect x="24" y="0" width="112" height="1.2" fill="var(--gold)" opacity="0.5">
          <animate attributeName="y" values="12;210;12" dur="7s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.5;0.5;0" dur="7s" repeatCount="indefinite" />
        </rect>
      )}
    </svg>
  );
}
