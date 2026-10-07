import { useTheme, type ThemePref } from '../lib/theme';

const NEXT_LABEL: Record<ThemePref, string> = {
  light: '切换到深色',
  dark: '切换到跟随系统',
  system: '切换到浅色',
};

/** 三态主题切换：浅色 → 深色 → 跟随系统 */
export default function ThemeToggle() {
  const { pref, theme, cycle } = useTheme();

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      title={NEXT_LABEL[pref]}
      aria-label={`当前主题${pref === 'system' ? `跟随系统（${theme === 'light' ? '浅色' : '深色'}）` : pref === 'light' ? '浅色' : '深色'}，点击${NEXT_LABEL[pref]}`}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {pref === 'system' ? <IconAuto /> : theme === 'light' ? <IconSun /> : <IconMoon />}
      </span>
    </button>
  );
}

function IconSun() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="8" cy="8" r="3.1" />
      <path
        strokeLinecap="round"
        d="M8 1.2v1.6M8 13.2v1.6M14.8 8h-1.6M2.8 8H1.2M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1M12.8 12.8l-1.1-1.1M4.3 4.3L3.2 3.2"
      />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path strokeLinejoin="round" d="M13.4 9.6A5.8 5.8 0 0 1 6.4 2.6a5.9 5.9 0 1 0 7 7Z" />
    </svg>
  );
}

/** 跟随系统：半明半暗的圆 */
function IconAuto() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="8" cy="8" r="5.4" />
      <path d="M8 2.6a5.4 5.4 0 0 1 0 10.8Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
