import { useEffect, useState } from 'react';
import { adminApi, AuthError } from '../../lib/admin-api';

/** 和服务端 auth.passwordProblem 同一套规则，这里只是提前给出提示，最终以服务端为准 */
function problem(pw: string): string | null {
  if (pw.length < 12) return '至少 12 位';
  if (pw.length > 128) return '最多 128 位';
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) return '大写、小写、数字、符号至少要用到 3 类';
  if (/(.)\1{3,}/.test(pw)) return '不要连续重复同一个字符';
  return null;
}

export default function SecurityPanel({
  notify,
  onSessionLost,
}: {
  notify: (text: string, bad?: boolean) => void;
  onSessionLost: () => void;
}) {
  const [custom, setCustom] = useState<boolean | null>(null);
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi.session().then((r) => setCustom(r.customPassword)).catch(() => {});
  }, []);

  const hint = pw ? problem(pw) : null;
  const mismatch = again !== '' && again !== pw;
  const ready = !!current && !!pw && !hint && pw === again;

  const act = async (fn: () => Promise<{ customPassword: boolean }>, okText: string) => {
    setBusy(true);
    try {
      const r = await fn();
      setCustom(r.customPassword);
      setCurrent(''); setPw(''); setAgain('');
      notify(okText);
    } catch (err) {
      if (err instanceof AuthError) onSessionLost();
      else notify(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ws is-solo">
    <section className="ws-solo">
      <h1 className="ws-title">
        登录密码{' '}
        <span className={`admin-pw-state mono${custom ? ' is-on' : ''}`}>
          {custom === null ? '…' : custom ? '已设置' : '未设置'}
        </span>
      </h1>
      <p className="admin-hint">
        初始码永远有效，是兜底入口，这里改不了它。设了登录密码之后，两者任一都能登录。
        设置或移除时，所有设备上现有的登录都会失效，当前设备会自动保持登录。
      </p>

      <div className="admin-form">
        <label className="admin-field">
          <span className="admin-field-label">当前口令（初始码或现有登录密码）</span>
          <input
            className="admin-input"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>

        <label className="admin-field">
          <span className="admin-field-label">新的登录密码</span>
          <input
            className="admin-input"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
            autoCapitalize="off"
            autoCorrect="off"
          />
          <span className="admin-hint" style={{ color: hint ? 'var(--open)' : undefined }}>
            {hint ?? '至少 12 位，大写、小写、数字、符号至少 3 类'}
          </span>
        </label>

        <label className="admin-field">
          <span className="admin-field-label">再输一遍</span>
          <input
            className="admin-input"
            type="password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            autoComplete="new-password"
            autoCapitalize="off"
            autoCorrect="off"
          />
          {mismatch && <span className="admin-hint" style={{ color: 'var(--open)' }}>两次不一致</span>}
        </label>

        <div className="admin-actions">
          <button
            type="button"
            className="admin-btn is-primary"
            disabled={!ready || busy}
            onClick={() => void act(() => adminApi.setPassword(current, pw), custom ? '登录密码已更新' : '登录密码已设置')}
          >
            {custom ? '更新登录密码' : '设置登录密码'}
          </button>
          {custom && (
            <button
              type="button"
              className="admin-btn is-danger"
              disabled={!current || busy}
              onClick={() => {
                if (!confirm('移除登录密码？之后只能用初始码登录。')) return;
                void act(() => adminApi.clearPassword(current), '已移除登录密码');
              }}
            >
              移除
            </button>
          )}
        </div>
      </div>
    </section>
    </div>
  );
}
