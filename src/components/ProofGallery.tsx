import { useEffect } from 'react';
import { mediaUrl } from '../lib/media';

/**
 * 赔付证明查看器。访客点「查看证明」弹出，图片纵向排开，点遮罩 / ✕ / Esc 关闭。
 * 存在的理由：账单上的每一笔钱，访客都能核对到转账截图。
 */
export default function ProofGallery({
  title,
  keys,
  onClose,
}: {
  title: string;
  keys: string[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="proof-backdrop" onClick={onClose} role="presentation">
      <div
        className="proof-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} 的赔付证明`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="proof-head">
          <span className="proof-title">{title}</span>
          <button type="button" className="slot-panel-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="proof-body">
          {keys.map((k) => (
            <a key={k} href={mediaUrl(k)} target="_blank" rel="noreferrer noopener" title="点开看原图">
              <img className="proof-img" src={mediaUrl(k)} alt="赔付证明" loading="lazy" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
