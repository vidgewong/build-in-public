import { useState } from 'react';
import { adminApi } from '../../lib/admin-api';

export default function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.login(password);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="admin-login" onSubmit={submit}>
      <span className="admin-login-label mono">BUILD IN PUBLIC</span>
      <h1 className="admin-login-title">后台</h1>

      <input
        className="admin-input"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="口令"
        autoFocus
        autoComplete="current-password"
        // 手机上别自作主张首字母大写
        autoCapitalize="off"
        autoCorrect="off"
      />

      {error && <p className="admin-login-error">{error}</p>}

      <button className="admin-btn is-primary" type="submit" disabled={busy || !password}>
        {busy ? '验证中…' : '进入'}
      </button>
    </form>
  );
}
