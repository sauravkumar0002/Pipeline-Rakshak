import { useEffect, useRef, useState } from 'react';
import { FiCalendar, FiCpu, FiBell, FiMenu, FiLogOut, FiCheck, FiTrash2, FiCheckCircle, FiUser } from 'react-icons/fi';
import { getCurrentModel } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import '../styles/navbar.css';

/* ── role label mapping ─────────────────────────────────────────────────────── */
const ROLE_LABELS = { admin: 'Administrator', operator: 'Operator', viewer: 'Viewer' };

/* ── single notification row ─────────────────────────────────────────────────── */
const NotifRow = ({ n, onRead, onClear }) => {
  const TYPE_COLORS = {
    inspection:   '#60a5fa',
    corrosion:    '#f87171',
    model:        '#a78bfa',
    retraining:   '#34d399',
    verification: '#fbbf24',
    settings:     '#94a3b8',
    info:         '#64748b',
  };
  const dot = TYPE_COLORS[n.type] ?? '#64748b';
  const ts  = new Date(n.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`notif-row${n.is_read ? ' notif-read' : ''}`}>
      <span className="notif-dot" style={{ background: dot }} />
      <div className="notif-body">
        <p className="notif-title">{n.title}</p>
        <p className="notif-msg">{n.message}</p>
        <span className="notif-time">{ts}</span>
      </div>
      <div className="notif-actions">
        {!n.is_read && (
          <button title="Mark read" onClick={() => onRead(n.id)} className="notif-btn">
            <FiCheck size={13} />
          </button>
        )}
        <button title="Remove" onClick={() => onClear(n.id)} className="notif-btn notif-btn-del">
          <FiTrash2 size={13} />
        </button>
      </div>
    </div>
  );
};

/* ── main component ─────────────────────────────────────────────────────────── */
const Navbar = ({ onMobileMenuToggle }) => {
  const [activeModel, setActiveModel] = useState('Loading...');
  const [bellOpen, setBellOpen]       = useState(false);
  const [profOpen, setProfOpen]       = useState(false);

  const bellRef = useRef(null);
  const profRef = useRef(null);

  const { user, logout } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead, clearNotif } = useNotifications();

  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  /* load active model */
  useEffect(() => {
    let mounted = true;
    getCurrentModel()
      .then((r) => {
        if (mounted) setActiveModel(r.data?.active_model ?? r.data?.model_name ?? 'No Model');
      })
      .catch(() => { if (mounted) setActiveModel('No Model'); });
    return () => { mounted = false; };
  }, []);

  /* close dropdowns on outside click */
  useEffect(() => {
    const handler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
      if (profRef.current && !profRef.current.contains(e.target)) setProfOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const avatarLetter = (user?.username ?? 'U')[0].toUpperCase();
  const roleLabel    = ROLE_LABELS[user?.role] ?? user?.role ?? 'Guest';

  return (
    <nav className="navbar">
      {/* ── left ── */}
      <div className="navbar-left">
        <button className="mobile-toggle" onClick={onMobileMenuToggle} aria-label="Toggle menu">
          <FiMenu />
        </button>
      </div>

      {/* ── right ── */}
      <div className="navbar-right">
        <div className="navbar-info">
          <FiCalendar className="info-icon" />
          <span>{currentDate}</span>
        </div>

        <div className="navbar-info">
          <FiCpu className="info-icon" />
          <span className="model-badge">{activeModel}</span>
        </div>

        {/* ── notification bell ── */}
        <div className="navbar-bell-wrap" ref={bellRef}>
          <button
            className={`navbar-bell-btn${bellOpen ? ' bell-active' : ''}`}
            onClick={() => { setBellOpen((p) => !p); setProfOpen(false); }}
            aria-label="Notifications"
          >
            <FiBell size={18} />
            {unreadCount > 0 && (
              <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </button>

          {bellOpen && (
            <div className="notif-dropdown">
              <div className="notif-header">
                <span>Notifications {unreadCount > 0 && <em className="notif-counter">{unreadCount} new</em>}</span>
                {unreadCount > 0 && (
                  <button className="notif-mark-all" onClick={markAllRead}>
                    <FiCheckCircle size={13} /> Mark all read
                  </button>
                )}
              </div>
              <div className="notif-list">
                {notifications.length === 0 ? (
                  <p className="notif-empty">No notifications yet</p>
                ) : (
                  notifications.map((n) => (
                    <NotifRow key={n.id} n={n} onRead={markRead} onClear={clearNotif} />
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── avatar / profile dropdown ── */}
        <div className="nav-profile-wrap" ref={profRef}>
          <button
            className={`nav-avatar-btn${profOpen ? ' avatar-active' : ''}`}
            onClick={() => { setProfOpen((p) => !p); setBellOpen(false); }}
            aria-label="Profile menu"
          >
            {avatarLetter}
          </button>

          {profOpen && (
            <div className="profile-dropdown">
              <div className="profile-dropdown-top">
                <div className="profile-avatar-lg">{avatarLetter}</div>
                <div>
                  <p className="profile-name">{user?.username ?? 'User'}</p>
                  <p className="profile-role">{roleLabel}</p>
                </div>
              </div>
              <hr className="profile-divider" />
              <button className="profile-logout" onClick={logout}>
                <FiLogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

