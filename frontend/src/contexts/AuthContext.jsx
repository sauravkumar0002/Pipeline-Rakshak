// frontend/src/contexts/AuthContext.jsx
/**
 * Auth context — stores the current user + JWT token.
 * Persists to localStorage so sessions survive page refresh.
 * When "Remember Me" is NOT ticked the token lives in sessionStorage only.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import apiClient from '../api/axios';

const AuthContext = createContext(null);

const TOKEN_KEY = 'cdp_access_token';
const USER_KEY = 'cdp_user';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
function readStorage(key) {
  return localStorage.getItem(key) ?? sessionStorage.getItem(key) ?? null;
}

function writeStorage(key, value, persistent) {
  if (persistent) {
    localStorage.setItem(key, value);
  } else {
    sessionStorage.setItem(key, value);
  }
}

function clearStorage() {
  [TOKEN_KEY, USER_KEY].forEach((k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
}

function attachTokenToAxios(token) {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
}

// --------------------------------------------------------------------------
// Provider
// --------------------------------------------------------------------------
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = readStorage(USER_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => readStorage(TOKEN_KEY));
  const [loading, setLoading] = useState(false);

  // Attach token on first mount
  useEffect(() => {
    if (token) attachTokenToAxios(token);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Add a global 401 interceptor — auto-logout on token expiry
  useEffect(() => {
    const id = apiClient.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 401) {
          clearStorage();
          setUser(null);
          setToken(null);
          attachTokenToAxios(null);
        }
        return Promise.reject(err);
      }
    );
    return () => apiClient.interceptors.response.eject(id);
  }, []);

  const login = useCallback(async (username, password, remember = false) => {
    setLoading(true);
    try {
      const res = await apiClient.post('/v1/auth/login', { username, password });
      const { access_token, user: userData } = res.data;

      writeStorage(TOKEN_KEY, access_token, remember);
      writeStorage(USER_KEY, JSON.stringify(userData), remember);

      attachTokenToAxios(access_token);
      setToken(access_token);
      setUser(userData);
      return { success: true };
    } catch (err) {
      const detail = err.response?.data?.detail ?? 'Login failed';
      return { success: false, error: detail };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/v1/auth/logout');
    } catch {
      // ignore — always log out locally
    }
    clearStorage();
    attachTokenToAxios(null);
    setToken(null);
    setUser(null);
  }, []);

  const isAuthenticated = Boolean(token && user);

  const value = useMemo(
    () => ({ user, token, isAuthenticated, loading, login, logout }),
    [user, token, isAuthenticated, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// --------------------------------------------------------------------------
// Hook
// --------------------------------------------------------------------------
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
