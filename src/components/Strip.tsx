import type { ArtPiece } from '../lib/art';
import Art from './Art';

const RATIOS = ['3 / 2', '4 / 5', '1 / 1'];

export default function Strip({ pieces, label }: { pieces: ArtPiece[]; label: string }) {
  return (
    <section className="section strip-sec" aria-label={label}>
      <div className={`shell strip is-${pieces.length}`}>
        {pieces.map((p, i) => (
          <Art key={p.src} piece={p} ratio={RATIOS[i % RATIOS.length]} delay={i * 110} />
        ))}
      </div>
    </section>
  );
}
