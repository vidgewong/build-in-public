import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePrefersReducedMotion } from '../lib/hooks';

/** 换页回到顶部；带锚点时滚到锚点 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }

    // 跨页跳转时目标区块可能还没挂载，下一帧再试一次
    let raf = 0;
    const go = (retry: boolean) => {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      } else if (retry) {
        raf = requestAnimationFrame(() => go(false));
      } else {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    };
    go(true);
    return () => cancelAnimationFrame(raf);
  }, [pathname, hash, reduced]);

  return null;
}
