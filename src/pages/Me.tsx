import { useMemo } from 'react';
import SubjectPanel, { type Buff } from '../components/SubjectPanel';
import { useSite } from '../lib/site-context';

export default function Me() {
  const { state, currency: cur } = useSite();
  const { summaries, totals, metrics, profile } = state;

  const buffs: Buff[] = useMemo(() => {
    const out: Buff[] = [];
    const daily = summaries.find((s) => s.rule.cadence === 'daily');
    if (daily) {
      out.push({
        label: `连续早起 ${daily.streak} 天`,
        tone: daily.streak >= 7 ? 'good' : 'neutral',
      });
    }
    out.push({ label: `开张第 ${totals.daysSinceStart} 天`, tone: 'neutral' });
    out.push({
      label: totals.openCount > 0 ? `${totals.openCount} 个缺口待领` : '当前无缺口',
      tone: totals.openCount > 0 ? 'bad' : 'good',
    });
    if (totals.paidAmount > 0) {
      out.push({ label: `累计赔付 ${cur}${totals.paidAmount}`, tone: 'bad' });
    }
    return out;
  }, [summaries, totals, cur]);

  return (
    <section className="section">
      <div className="shell">
        <div className="section-head">
          <span className="section-index">本人</span>
          <h2 className="section-title">检视</h2>
        </div>
        <SubjectPanel
          name={profile.name}
          handle={profile.handle}
          metrics={metrics}
          buffs={buffs}
          level={totals.level}
        />
      </div>
    </section>
  );
}
