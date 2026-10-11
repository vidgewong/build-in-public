import { createContext, useContext } from 'react';
import type { SiteState } from './data';
import type { Rule, Slot } from './domain';

export interface SiteContextValue {
  state: SiteState;
  currency: string;
  /** 复制索赔话术到剪贴板并提示 */
  copyClaim: (rule: Rule, slot: Slot) => void;
  /** 把当前所有缺口打包成一份分条话术，一次复制 */
  copyAllClaims: () => void;
}

export const SiteContext = createContext<SiteContextValue | null>(null);

export function useSite(): SiteContextValue {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('useSite 必须在 SiteContext.Provider 内使用');
  return ctx;
}
