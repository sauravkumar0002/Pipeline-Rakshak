import React, {
  createContext, useCallback, useContext,
  useEffect, useRef, useState,
} from 'react';
import apiClient from '../api/axios';

const NotificationCtx = createContext({
  notifications: [],
  unreadCount: 0,
  push: () => {},
  markRead: () => {},
  markAllRead: () => {},
  clearNotif: () => {},
  refresh: () => {},
});

export const useNotifications = () => useContext(NotificationCtx);

// Module-level flag to prevent re-entrant notification creation loops
let _isSendingNotif = false;

// How long to suspend polling after a 404 or repeated failures (5 min)
const SUSPEND_MS = 5 * 60 * 1000;

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const interceptorRef = useRef(null);

  // Failure-tracking refs — never trigger re-renders
  const failCount   = useRef(0);   // consecutive failure count
  const loggedOnce  = useRef(false); // has the error been logged?
  const suspended   = useRef(false); // polling & push suspended flag
  const retryTimer  = useRef(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Re-enable polling after suspend period (called by timer)
  const resumePolling = useCallback(() => {
    suspended.current  = false;
    failCount.current  = 0;
    loggedOnce.current = false;
  }, []);

  // Schedule an automatic resume after SUSPEND_MS
  const scheduleSuspend = useCallback(() => {
    suspended.current = true;
    clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(resumePolling, SUSPEND_MS);
  }, [resumePolling]);

  // Fetch notifications from backend
  const refresh = useCallback(async () => {
    if (suspended.current) return;
    try {
      const res = await apiClient.get('/v1/notifications', { params: { limit: 60 } });
      setNotifications(Array.isArray(res.data) ? res.data : []);
      // Clear failure state on success
      failCount.current  = 0;
      loggedOnce.current = false;
    } catch (err) {
      failCount.current += 1;
      const status = err?.response?.status;

      // Log only once per suspend window — no console spam
      if (!loggedOnce.current) {
        if (status === 404) {
          console.warn('[Notifications] Endpoint not available (404) — polling suspended for 5 min.');
        } else {
          console.warn('[Notifications] Fetch failed:', err?.message ?? String(err));
        }
        loggedOnce.current = true;
      }

      // Suspend on 404 (endpoint truly missing) OR after 5 consecutive failures
      if (status === 404 || failCount.current >= 5) {
        scheduleSuspend();
        setNotifications([]);
      }
    }
  }, [scheduleSuspend]);

  // Create a notification in the backend (called by the interceptor)
  const push = useCallback(async (type, title, message) => {
    if (_isSendingNotif || suspended.current) return; // skip if suspended or re-entrant
    _isSendingNotif = true;
    try {
      await apiClient.post('/v1/notifications', { type, title, message });
      // Optimistic prepend — replaced by real id on next refresh
      setNotifications((prev) => [{
        id: Date.now(),
        type, title, message,
        is_read: false,
        created_at: new Date().toISOString(),
      }, ...prev].slice(0, 60));
    } catch (_) { /* silent — server issues are tracked via refresh() */ }
    finally {
      _isSendingNotif = false;
    }
  }, []);

  const markRead = useCallback(async (id) => {
    // Optimistic update first, then sync
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    try { await apiClient.post(`/v1/notifications/${id}/read`); }
    catch (_) { /* silent */ }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try { await apiClient.post('/v1/notifications/read-all'); }
    catch (_) { /* silent */ }
  }, []);

  const clearNotif = useCallback(async (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try { await apiClient.delete(`/v1/notifications/${id}`); }
    catch (_) { /* silent */ }
  }, []);

  // ── Axios interceptor: generate notifications from real platform events ──────
  // Triggers: inspection results, model switch, verification, retraining,
  //           model version promotion, user CRUD, backup export.
  // NOT triggered: settings saves (too noisy, not a meaningful event).
  useEffect(() => {
    const id = apiClient.interceptors.response.use(
      (response) => {
        if (_isSendingNotif) return response; // avoid loops
        const url  = response.config?.url  ?? '';
        const meth = (response.config?.method ?? '').toLowerCase();
        const d    = response.data;

        if (url.includes('/notifications')) return response; // skip self

        if (meth === 'post' && url.includes('/predict') && d?.prediction_class) {
          const conf = ((d.confidence ?? 0) * 100).toFixed(0);
          const cls  = d.prediction_class === 'corrosion' ? '⚠️ Corrosion' : '✓ Healthy';
          push('inspection', 'Inspection Completed', `${cls} · ${conf}% confidence`);
        } else if (meth === 'post' && url.includes('/models/select')) {
          push('model', 'Active Model Changed',
            d?.message ?? 'Model switched successfully.');
        } else if (meth === 'post' && /\/verify\/\d+/.test(url)) {
          push('verification', 'Inspection Verified',
            'Prediction label manually confirmed.');
        } else if (meth === 'post' && url.includes('/retraining/start')) {
          push('retraining', 'Retraining Job Started',
            `Job queued for model: ${d?.model_name ?? '—'}`);
        } else if (meth === 'post' && /\/retraining\/model-versions\/\d+\/promote/.test(url)) {
          push('model', 'Model Version Promoted',
            'New version promoted to active deployment.');
        } else if (meth === 'post' && url.includes('/settings/users') && d?.id) {
          push('user', 'User Created',
            `New user "${d.username ?? '—'}" added to the platform.`);
        } else if (meth === 'delete' && url.includes('/settings/users/')) {
          push('user', 'User Deleted',
            'A user account was removed from the platform.');
        } else if (meth === 'get' && url.includes('/settings/backup/export')) {
          push('backup', 'Backup Exported',
            'Platform database exported successfully.');
        }

        return response;
      },
      (error) => Promise.reject(error),
    );
    interceptorRef.current = id;
    return () => apiClient.interceptors.response.eject(id);
  }, [push]);

  // Cleanup retry timer on unmount
  useEffect(() => () => clearTimeout(retryTimer.current), []);

  // Initial load + 30 s poll
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <NotificationCtx.Provider
      value={{ notifications, unreadCount, push, markRead, markAllRead, clearNotif, refresh }}
    >
      {children}
    </NotificationCtx.Provider>
  );
};
