import { Link } from 'react-router-dom';
import type { Metric } from '../lib/data';
import { useCountUp, useInView } from '../lib/hooks';
import ParallaxFigure from './ParallaxFigure';

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
        <h2 className="h2 display" id="subject-h">
          {handle} · LV.{level}
        </h2>

        <div className="subject-card-metrics">
          {metrics.map((m, i) => (
            <MiniMetric key={m.key} metric={m} active={inView} index={i} />
          ))}
        </div>

        <span className="link">
          完整检视 <span className="btn-arrow" aria-hidden="true">→</span>
        </span>
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
    <div className="metric">
      <span className="metric-label">
        {metric.label}
        {metric.hint && <span className="metric-hint">{metric.hint}</span>}
      </span>
      <span className={`metric-value num${masked ? ' metric-masked' : ''}`}>
        {display}
        {!masked && metric.unit && <span className="metric-unit">{metric.unit}</span>}
      </span>
    </div>
  );
}
