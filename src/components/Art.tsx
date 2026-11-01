import type { CSSProperties } from 'react';
import type { ArtPiece } from '../lib/art';

export default function Art({
  piece,
  ratio,
  className = '',
  delay = 0,
}: {
  piece: ArtPiece;
  ratio?: string;
  className?: string;
  delay?: number;
}) {
  const style = { '--ar': ratio ?? `${piece.w} / ${piece.h}`, '--d': `${delay}ms` } as CSSProperties;
  return (
    <figure className={`art ${className}`} style={style} data-reveal>
      <div className="art-frame">
        <img src={piece.src} alt={piece.alt} width={piece.w} height={piece.h} loading="lazy" decoding="async" />
      </div>
      <figcaption className="art-cap">{piece.cap}</figcaption>
    </figure>
  );
}
