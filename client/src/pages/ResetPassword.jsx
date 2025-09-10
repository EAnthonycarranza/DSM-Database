import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => (params.get('token') || '').trim(), [params]);

  const [status, setStatus] = useState({ kind: 'checking', msg: 'Validating link…' });
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!token) {
        setStatus({ kind: 'error', msg: 'Missing reset token.' });
        return;
      }
      try {
        const r = await fetch(`/api/auth/password/reset/check?token=${encodeURIComponent(token)}`);
        const data = await r.json();
        if (!ignore) {
          if (r.ok && data?.valid) setStatus({ kind: 'ok', msg: 'Token valid. Enter a new password.' });
          else setStatus({ kind: 'error', msg: data?.error || 'This reset link is invalid or expired.' });
        }
      } catch (e) {
        if (!ignore) setStatus({ kind: 'error', msg: 'Could not reach server.' });
      }
    })();
    return () => { ignore = true; };
  }, [token]);

  const canSubmit = pw1 && pw2 && pw1 === pw2 && pw1.length >= 6 && status.kind === 'ok' && !submitting;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/auth/password/reset/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: pw1 }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data?.success) {
        setStatus({ kind: 'done', msg: 'Password has been reset.' });
  setTimeout(() => navigate('/admin/login'), 1200);
      } else {
        setStatus({ kind: 'error', msg: data?.error || 'Reset failed.' });
      }
    } catch (e) {
      setStatus({ kind: 'error', msg: 'Network error.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '64px auto', padding: 24, background: '#111827', borderRadius: 12, color: '#F9FAFB' }}>
      <h1 style={{ marginTop: 0 }}>Reset Password</h1>
      {status.kind === 'checking' && <p>{status.msg}</p>}
      {status.kind === 'error' && <p style={{ color: '#FCA5A5' }}>{status.msg}</p>}
      {status.kind === 'ok' && (
        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label>New password</label>
            <input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #374151', background: '#0B1220', color: '#E5E7EB' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Confirm password</label>
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #374151', background: '#0B1220', color: '#E5E7EB' }} />
          </div>
          <button type="submit" disabled={!canSubmit} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: 0, background: canSubmit ? '#10B981' : '#1F2937', color: '#fff', cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
            {submitting ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      )}
      {status.kind === 'done' && <p style={{ color: '#34D399' }}>{status.msg} Redirecting…</p>}
    </div>
  );
}
