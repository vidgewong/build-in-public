import type { Metric } from '../lib/data';
import { useCountUp, useInView } from '../lib/hooks';
import ParallaxFigure from './ParallaxFigure';

export interface Buff {
  label: string;
  tone: 'good' | 'bad' | 'neutral';
}

/**
 * 人物检视面板。
 * 人像是 2.5D 视差渲染：一张抠图 + 一张深度图，跟着指针在正面小幅摆动。
 * 不做整圈旋转——深度图只有正面信息，转过去就穿帮。
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

  return (
    <div className="subject">
      <div className="subject-stage" ref={stageRef}>
        <div className="subject-figure">
          <ParallaxFigure
            src="/figure.webp"
            depthSrc="/figure-depth.webp"
            alt={`${name} 的人物检视`}
            scale={0.042}
          />
        </div>
        <span className="subject-hint">移动指针，换个角度看</span>
      </div>

      <div className="subject-panel">
        <h2 className="vh">{handle} · 第 {level} 级</h2>
        {metrics
          .filter((m) => m.visibility !== 'hidden')
          .map((m, i) => (
            <MetricRow key={m.key} metric={m} active={inView} index={i} />
          ))}

        <div className="buffs">
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
    <div className="metric">
      <span className="metric-label" title={metric.hint}>
        {metric.label}
        {metric.hint && <span className="metric-hint">{metric.hint}</span>}
      </span>
      <span className={`metric-value num${masked ? ' metric-masked' : ''}`}>{masked ? '***' : display}</span>
      <span className="metric-unit">{!masked && metric.unit}</span>
      {masked && <span className="metric-masked-hint">{metric.maskedHint ?? '暂不可见'}</span>}
    </div>
  );
}
