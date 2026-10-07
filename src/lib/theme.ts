import { useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

const KEY = 'bip-theme';

/** 没存过偏好就跟随系统 */
export function readPref(): ThemePref {
  if (typeof localStorage === 'undefined') return 'system';
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function systemTheme(): Theme {
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export const resolve = (pref: ThemePref): Theme =>
  pref === 'system' ? systemTheme() : pref;

/**
 * 主题偏好。三态存储（light / dark / system），但落到 DOM 上只有两态。
 * 首帧的 data-theme 由 index.html 里的内联脚本写好，这里只负责后续同步。
 */
export function useTheme(): {
  pref: ThemePref;
  theme: Theme;
  setPref: (p: ThemePref) => void;
  cycle: () => void;
} {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const [theme, setTheme] = useState<Theme>(() => resolve(readPref()));

  // 跟随系统时，系统切换要实时反映
  useEffect(() => {
    const apply = () => setTheme(resolve(pref));
    apply();
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // 让浏览器 UI（地址栏、滚动条）跟着走
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#faf8f5' : '#07080a');
  }, [theme]);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    if (p === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, p);
  };

  // 浅色 → 深色 → 跟随系统 → 浅色
  const cycle = () =>
    setPref(pref === 'light' ? 'dark' : pref === 'dark' ? 'system' : 'light');

  return { pref, theme, setPref, cycle };
}
