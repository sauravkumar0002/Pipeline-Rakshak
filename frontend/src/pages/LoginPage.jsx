// frontend/src/pages/LoginPage.jsx
/**
 * Login page — professional dark-theme matching the existing platform UI.
 */

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiLock, FiUser, FiLogIn, FiEye, FiEyeOff } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import logoImg from '../assets/logo.png';

/* ── Design tokens matching platform theme ── */
const S = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0d1b2a 0%, #1b263b 60%, #162033 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  card: {
    background: '#1b263b',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '2.5rem',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '2rem',
  },
  logoIcon: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    overflow: 'hidden',
    background: '#fff',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 0 0 2px rgba(59,130,246,0.4)',
  },
  logoText: {
    color: '#e2e8f0',
    fontSize: '1.1rem',
    fontWeight: 700,
    lineHeight: 1.2,
  },
  logoSub: {
    color: '#64748b',
    fontSize: '0.75rem',
    fontWeight: 400,
  },
  heading: {
    color: '#f1f5f9',
    fontSize: '1.5rem',
    fontWeight: 700,
    margin: '0 0 0.35rem',
  },
  sub: {
    color: '#64748b',
    fontSize: '0.875rem',
    margin: '0 0 2rem',
  },
  fieldWrap: {
    marginBottom: '1.25rem',
  },
  label: {
    display: 'block',
    color: '#94a3b8',
    fontSize: '0.8rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.5rem',
  },
  inputWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: '0.875rem',
    color: '#475569',
    fontSize: '1rem',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    padding: '0.75rem 0.875rem 0.75rem 2.5rem',
    background: '#0f1f33',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontSize: '0.95rem',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  eyeBtn: {
    position: 'absolute',
    right: '0.875rem',
    background: 'none',
    border: 'none',
    color: '#475569',
    cursor: 'pointer',
    padding: 0,
    fontSize: '1rem',
    display: 'flex',
    alignItems: 'center',
  },
  rememberRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '1.75rem',
  },
  rememberLabel: {
    color: '#94a3b8',
    fontSize: '0.875rem',
    cursor: 'pointer',
    userSelect: 'none',
  },
  btn: {
    width: '100%',
    padding: '0.875rem',
    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'opacity 0.2s, transform 0.1s',
  },
  btnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  hint: {
    marginTop: '1.5rem',
    padding: '0.875rem',
    background: 'rgba(59,130,246,0.08)',
    border: '1px solid rgba(59,130,246,0.2)',
    borderRadius: '8px',
    color: '#93c5fd',
    fontSize: '0.8rem',
    lineHeight: 1.5,
  },
};

export default function LoginPage() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname ?? '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error('Please enter both username and password.');
      return;
    }
    const result = await login(username.trim(), password.trim(), remember);
    if (result.success) {
      toast.success('Login successful!');
      navigate(from, { replace: true });
    } else {
      toast.error(result.error ?? 'Login failed. Please try again.');
    }
  };

  const borderStyle = (field) => ({
    ...S.input,
    borderColor: focusedField === field
      ? '#3b82f6'
      : 'rgba(255,255,255,0.1)',
  });

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* Logo */}
        <div style={S.logo}>
          <div style={S.logoIcon}>
            <img
              src={logoImg}
              alt="Pipeline Rakshak"
              style={{ width: 56, height: 56, objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
            />
          </div>
          <div>
            <div style={S.logoText}>Pipeline Rakshak</div>
            <div style={S.logoSub}>AI Corrosion Detection & Monitoring Platform</div>
          </div>
        </div>

        <h1 style={S.heading}>Sign in</h1>
        <p style={S.sub}>Enter your credentials to access the platform.</p>

        <form onSubmit={handleSubmit} autoComplete="on">
          {/* Username */}
          <div style={S.fieldWrap}>
            <label style={S.label} htmlFor="login-username">Username</label>
            <div style={S.inputWrap}>
              <FiUser style={S.inputIcon} />
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onFocus={() => setFocusedField('username')}
                onBlur={() => setFocusedField(null)}
                style={borderStyle('username')}
                maxLength={64}
              />
            </div>
          </div>

          {/* Password */}
          <div style={S.fieldWrap}>
            <label style={S.label} htmlFor="login-password">Password</label>
            <div style={S.inputWrap}>
              <FiLock style={S.inputIcon} />
              <input
                id="login-password"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                style={{ ...borderStyle('password'), paddingRight: '2.75rem' }}
                maxLength={128}
              />
              <button
                type="button"
                style={S.eyeBtn}
                onClick={() => setShowPw((v) => !v)}
                tabIndex={-1}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </div>

          {/* Remember me */}
          <div style={S.rememberRow}>
            <input
              id="remember"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ accentColor: '#3b82f6', cursor: 'pointer' }}
            />
            <label htmlFor="remember" style={S.rememberLabel}>
              Remember me
            </label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            style={{ ...S.btn, ...(loading ? S.btnDisabled : {}) }}
            disabled={loading}
          >
            {loading ? (
              'Signing in…'
            ) : (
              <>
                <FiLogIn />
                Sign in
              </>
            )}
          </button>
        </form>

        {/* Default credentials hint */}
        <div style={S.hint}>
          <strong>Default credentials:</strong>&nbsp; username&nbsp;<code>admin</code>,
          password&nbsp;<code>admin123</code>
        </div>
      </div>
    </div>
  );
}
