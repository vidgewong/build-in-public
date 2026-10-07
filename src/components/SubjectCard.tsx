import { Link } from 'react-router-dom';
import type { Metric } from '../lib/data';
import { useCountUp, useInView } from '../lib/hooks';
import ParallaxFigure from './ParallaxFigure';

/**
 * 首页 hero 右侧的小号检视卡。
 * 和 /me 的 SubjectPanel 是同一套视觉语言，但只取前几项指标，
 * 视差幅度也压得更小——这里是预告，不是主角。
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

  return (
    <Link className="subject-card" to="/me" ref={ref} aria-label={`查看 ${name} 的完整检视`}>
      <div className="subject-card-fig">
        <ParallaxFigure
          src="/figure.webp"
          depthSrc="/figure-depth.webp"
          alt={`${name} 的人物检视`}
          scale={0.03}
        />
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
