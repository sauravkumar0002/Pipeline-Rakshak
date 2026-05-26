import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FiActivity, FiAlertTriangle, FiCheck, FiCpu,
  FiDatabase, FiDownload, FiEdit2, FiInfo,
  FiLock, FiRefreshCw, FiSave, FiServer, FiSettings,
  FiShield, FiTrash2, FiUpload, FiUser, FiUserPlus,
  FiUsers, FiX, FiZap,
} from 'react-icons/fi';
import { toast } from 'react-toastify';
import apiClient from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import './settings.css';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const API = '/v1/settings';

const TABS = [
  { id: 'system',    label: 'System',      Icon: FiSettings, accent: '#3b82f6' },
  { id: 'model',     label: 'Model',       Icon: FiCpu,      accent: '#8b5cf6' },
  { id: 'detection', label: 'Detection',   Icon: FiActivity, accent: '#10b981' },
  { id: 'security',  label: 'Security',    Icon: FiShield,   accent: '#ef4444' },
  { id: 'users',     label: 'Users',       Icon: FiUsers,    accent: '#f59e0b' },
  { id: 'info',      label: 'System Info', Icon: FiInfo,     accent: '#06b6d4' },
  { id: 'backup',    label: 'Backup',      Icon: FiDatabase, accent: '#f97316' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(date) {
  if (!date) return null;
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function dirtyTabNames(dirty) {
  return TABS.filter((t) => dirty[t.id]).map((t) => t.label).join(', ');
}

// ─────────────────────────────────────────────────────────────────────────────
// useSettings hook
// ─────────────────────────────────────────────────────────────────────────────

function useSettings(path) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const refresh = useCallback(() => {
    setLoading(true);
    apiClient.get(`${API}/${path}`)
      .then((r)  => { setData(r.data); setError(null); })
      .catch((e) => setError(e?.response?.data?.detail || e.message))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, error, refresh };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared atoms
// ─────────────────────────────────────────────────────────────────────────────

function SettField({ label, help, children }) {
  return (
    <div className="sett-field">
      {label && <label className="sett-label">{label}</label>}
      {children}
      {help && <span className="sett-help">{help}</span>}
    </div>
  );
}

function SettInput({ value, onChange, placeholder, disabled, type = 'text', min, max }) {
  return (
    <input
      type={type} value={value ?? ''} min={min} max={max}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} disabled={disabled}
      className="sett-input"
    />
  );
}

function SettSelect({ value, onChange, options, disabled }) {
  return (
    <select
      value={value ?? ''} onChange={(e) => onChange(e.target.value)}
      disabled={disabled} className="sett-select"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function SettToggle({ checked, onChange, label, description }) {
  return (
    <div className="sett-toggle-row" onClick={() => onChange(!checked)}>
      <div className="sett-toggle-info">
        <p className="sett-toggle-label">{label}</p>
        {description && <p className="sett-toggle-desc">{description}</p>}
      </div>
      <div className={`sett-toggle${checked ? ' on' : ''}`}>
        <div className="sett-toggle-thumb" />
      </div>
    </div>
  );
}

function SettCard({ title, subtitle, icon, iconColor, iconBg, children, footer }) {
  return (
    <div className="sett-card">
      <div className="sett-card-header">
        <div className="sett-card-header-left">
          {icon && (
            <div
              className="sett-card-icon"
              style={{ background: iconBg || 'rgba(59,130,246,0.1)', color: iconColor || '#60a5fa' }}
            >
              {icon}
            </div>
          )}
          <div>
            <p className="sett-card-title">{title}</p>
            {subtitle && <p className="sett-card-subtitle">{subtitle}</p>}
          </div>
        </div>
      </div>
      <div className="sett-card-body">{children}</div>
      {footer && <div className="sett-card-footer">{footer}</div>}
    </div>
  );
}

function SettSkel({ height = 40, count = 3 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="sett-skel" style={{ height }} />
      ))}
    </div>
  );
}

function SaveBtn({ onClick, saving, label = 'Save Changes' }) {
  return (
    <button
      className={`sett-btn primary${saving ? ' spinning' : ''}`}
      onClick={onClick}
      disabled={saving}
    >
      {saving ? <FiRefreshCw size={14} /> : <FiSave size={14} />}
      {saving ? 'Saving…' : label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SystemTab
// ─────────────────────────────────────────────────────────────────────────────

function SystemTab({ onDirty, onSaved }) {
  const { data, loading } = useSettings('system');
  const [form, setForm]   = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setForm({ ...data }); }, [data]);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); onDirty(); };

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiClient.put(`${API}/system`, {
        app_name:      form.app_name,
        company_name:  form.company_name,
        default_theme: form.default_theme,
        timezone:      form.timezone,
      });
      setForm(res.data);
      toast.success('System settings saved.');
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return (
      <SettCard title="System Configuration" icon={<FiSettings size={15} />}
        iconBg="rgba(59,130,246,0.1)" iconColor="#60a5fa">
        <SettSkel />
      </SettCard>
    );
  }

  return (
    <SettCard
      title="System Configuration"
      subtitle="Core platform identity and regional settings"
      icon={<FiSettings size={15} />}
      iconBg="rgba(59,130,246,0.1)"
      iconColor="#60a5fa"
      footer={<SaveBtn onClick={save} saving={saving} />}
    >
      <div className="sett-grid-2">
        <SettField label="Application Name" help="Displayed in the platform header and exported reports.">
          <SettInput value={form.app_name} onChange={(v) => set('app_name', v)} placeholder="Pipeline Rakshak" />
        </SettField>
        <SettField label="Organization Name" help="Appears on PDF reports and settings backup files.">
          <SettInput value={form.company_name} onChange={(v) => set('company_name', v)} placeholder="Your organization" />
        </SettField>
        <SettField label="Default Theme" help="Visual theme applied to the UI.">
          <SettSelect
            value={form.default_theme || 'dark'}
            onChange={(v) => set('default_theme', v)}
            options={[
              { value: 'dark',  label: 'Dark (Default)' },
              { value: 'light', label: 'Light (Coming Soon)' },
            ]}
          />
        </SettField>
        <SettField label="Timezone" help="Timestamps across the platform will use this timezone.">
          <SettSelect
            value={form.timezone || 'Asia/Kolkata'}
            onChange={(v) => set('timezone', v)}
            options={[
              { value: 'Asia/Kolkata',    label: 'India Standard Time (IST)' },
              { value: 'UTC',             label: 'UTC' },
              { value: 'America/New_York', label: 'Eastern Time (ET)' },
              { value: 'Europe/London',   label: 'Greenwich Mean Time (GMT)' },
            ]}
          />
        </SettField>
        <SettField label="System Version" help="Read-only. Controlled by deployment.">
          <div className="sett-readonly-val">{form.system_version || '1.0.0'}</div>
        </SettField>
      </div>
    </SettCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ModelTab
// ─────────────────────────────────────────────────────────────────────────────

function ModelTab({ onDirty, onSaved }) {
  const { data, loading } = useSettings('model');
  const [threshold, setThreshold] = useState(null);
  const [saving, setSaving]       = useState(false);

  useEffect(() => { if (data) setThreshold(data.confidence_threshold); }, [data]);

  const handleChange = (v) => { setThreshold(v); onDirty(); };

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.put(`${API}/model`, { confidence_threshold: parseFloat(threshold) });
      toast.success('Model settings saved.');
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading || threshold === null) {
    return (
      <SettCard title="Model Configuration" icon={<FiCpu size={15} />}
        iconBg="rgba(139,92,246,0.1)" iconColor="#a78bfa">
        <SettSkel />
      </SettCard>
    );
  }

  const pct = Math.round(threshold * 100);

  return (
    <>
      <SettCard
        title="Active Inference Model"
        subtitle="Currently loaded model — switch via Model Management"
        icon={<FiZap size={15} />}
        iconBg="rgba(139,92,246,0.1)"
        iconColor="#a78bfa"
      >
        <SettField label="Current Active Model">
          <div className="sett-readonly-val">
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#10b981', flexShrink: 0,
              boxShadow: '0 0 5px #10b981',
            }} />
            {data?.current_model || 'No model loaded'}
          </div>
        </SettField>
        <div className="sett-note">
          <FiInfo size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            To switch models or promote a candidate version, use the{' '}
            <strong>Model Management</strong> page where you can compare
            accuracy metrics and perform safe promotions.
          </span>
        </div>
      </SettCard>

      <SettCard
        title="Inference Threshold"
        subtitle="Confidence cutoff applied to all predictions"
        icon={<FiCpu size={15} />}
        iconBg="rgba(139,92,246,0.1)"
        iconColor="#a78bfa"
        footer={<SaveBtn onClick={save} saving={saving} />}
      >
        <SettField
          label="Confidence Threshold"
          help="Predictions below this value are reclassified as 'no corrosion'. Higher values reduce false positives but may miss borderline cases."
        >
          <div className="sett-slider-wrap">
            <input
              type="range" min={0.30} max={0.95} step={0.05}
              value={threshold}
              onChange={(e) => handleChange(parseFloat(e.target.value))}
              className="sett-slider"
            />
            <span className="sett-slider-val">{pct}%</span>
          </div>
          <div className="sett-threshold-pills" style={{ marginTop: 10 }}>
            {[0.50, 0.60, 0.70, 0.80, 0.90].map((t) => (
              <button
                key={t}
                className={`sett-pill${threshold === t ? ' active-pill' : ''}`}
                onClick={() => handleChange(t)}
              >
                {Math.round(t * 100)}%
              </button>
            ))}
          </div>
        </SettField>
      </SettCard>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DetectionTab
// ─────────────────────────────────────────────────────────────────────────────

const DETECTION_TOGGLES = [
  {
    key: 'enable_severity_analysis',
    label: 'Severity Analysis',
    description: 'Classify detected corrosion into severity levels: Low, Medium, High, and Critical.',
  },
  {
    key: 'enable_recommendations',
    label: 'Actionable Recommendations',
    description: 'Generate maintenance recommendations alongside each corrosion detection.',
  },
  {
    key: 'enable_human_verification',
    label: 'Human Verification Workflow',
    description: 'Route predictions to the Verification queue for expert sign-off before finalizing results.',
  },
  {
    key: 'enable_retraining_queue',
    label: 'Retraining Queue',
    description: 'Allow verified inspections to be flagged and added to the model retraining dataset.',
  },
  {
    key: 'enable_analytics_collection',
    label: 'Analytics Collection',
    description: 'Record inference metrics, latency, and accuracy data for the Analytics dashboard.',
  },
];

function DetectionTab({ onDirty, onSaved }) {
  const { data, loading } = useSettings('detection');
  const [form, setForm]   = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setForm({ ...data }); }, [data]);

  const setToggle = (k, v) => { setForm((f) => ({ ...f, [k]: v })); onDirty(); };

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.put(`${API}/detection`, form);
      toast.success('Detection settings saved.');
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return (
      <SettCard title="Detection Configuration" icon={<FiActivity size={15} />}
        iconBg="rgba(16,185,129,0.1)" iconColor="#34d399">
        <SettSkel count={5} height={60} />
      </SettCard>
    );
  }

  return (
    <SettCard
      title="Detection Pipeline Configuration"
      subtitle="Feature flags controlling the corrosion detection and analysis workflow"
      icon={<FiActivity size={15} />}
      iconBg="rgba(16,185,129,0.1)"
      iconColor="#34d399"
      footer={<SaveBtn onClick={save} saving={saving} />}
    >
      {DETECTION_TOGGLES.map(({ key, label, description }) => (
        <SettToggle
          key={key}
          checked={form[key] ?? false}
          onChange={(v) => setToggle(key, v)}
          label={label}
          description={description}
        />
      ))}
    </SettCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SecurityTab
// ─────────────────────────────────────────────────────────────────────────────

function SecurityTab({ onDirty, onSaved }) {
  const { data, loading } = useSettings('security');
  const [form, setForm]   = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setForm({ ...data }); }, [data]);

  const set = (k, v) => {
    const n = parseInt(v, 10);
    if (!Number.isNaN(n)) { setForm((f) => ({ ...f, [k]: n })); onDirty(); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.put(`${API}/security`, form);
      toast.success('Security settings saved.');
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return (
      <SettCard title="Security Configuration" icon={<FiShield size={15} />}
        iconBg="rgba(239,68,68,0.1)" iconColor="#f87171">
        <SettSkel count={4} />
      </SettCard>
    );
  }

  return (
    <>
      <div className="sett-warn">
        <FiAlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        JWT expiration and rate limit changes apply to new logins only. Existing
        tokens remain valid until their original expiry time.
      </div>

      <SettCard
        title="Authentication &amp; Sessions"
        subtitle="Token lifetimes and automatic session management"
        icon={<FiShield size={15} />}
        iconBg="rgba(239,68,68,0.1)"
        iconColor="#f87171"
      >
        <div className="sett-grid-2">
          <SettField label="JWT Expiration (minutes)"
            help="How long a login token stays valid. Range: 5–10080 min. Default: 480 min (8 h).">
            <SettInput type="number" min={5} max={10080}
              value={form.jwt_expiration_minutes}
              onChange={(v) => set('jwt_expiration_minutes', v)} />
          </SettField>
          <SettField label="Session Timeout (minutes)"
            help="Inactivity period before automatic logout. Range: 1–1440 min. Default: 60 min.">
            <SettInput type="number" min={1} max={1440}
              value={form.session_timeout_minutes}
              onChange={(v) => set('session_timeout_minutes', v)} />
          </SettField>
        </div>
      </SettCard>

      <SettCard
        title="Rate Limiting &amp; Password Policy"
        subtitle="Brute-force protection and credential requirements"
        icon={<FiLock size={15} />}
        iconBg="rgba(239,68,68,0.1)"
        iconColor="#f87171"
        footer={<SaveBtn onClick={save} saving={saving} />}
      >
        <div className="sett-grid-2">
          <SettField label="Login Rate Limit (requests / minute)"
            help="Max login attempts per IP per minute before blocking. Range: 1–100. Default: 10.">
            <SettInput type="number" min={1} max={100}
              value={form.login_rate_limit}
              onChange={(v) => set('login_rate_limit', v)} />
          </SettField>
          <SettField label="Minimum Password Length"
            help="Minimum characters required when creating or updating passwords. Range: 4–128. Default: 6.">
            <SettInput type="number" min={4} max={128}
              value={form.password_min_length}
              onChange={(v) => set('password_min_length', v)} />
          </SettField>
        </div>
      </SettCard>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UsersTab – full CRUD
// ─────────────────────────────────────────────────────────────────────────────

function UserModal({ mode, user, onClose, onSave }) {
  const isCreate = mode === 'create';
  const [form, setForm] = useState(
    isCreate
      ? { username: '', email: '', password: '', role: 'viewer' }
      : { role: user?.role ?? 'viewer', email: user?.email ?? '', is_active: user?.is_active ?? true }
  );
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sett-modal-overlay" onClick={onClose}>
      <div className="sett-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sett-modal-header">
          <p className="sett-modal-title">
            {isCreate ? 'Create New User' : `Edit User: ${user?.username}`}
          </p>
          <button className="sett-modal-close" onClick={onClose}><FiX size={16} /></button>
        </div>

        {isCreate && (
          <>
            <SettField label="Username">
              <SettInput value={form.username} onChange={(v) => set('username', v)} placeholder="e.g. jsmith" />
            </SettField>
            <SettField label="Password">
              <SettInput type="password" value={form.password} onChange={(v) => set('password', v)} placeholder="Minimum 6 characters" />
            </SettField>
          </>
        )}
        <SettField label="Email (optional)">
          <SettInput type="email" value={form.email || ''} onChange={(v) => set('email', v)} placeholder="user@example.com" />
        </SettField>
        <SettField label="Role">
          <SettSelect
            value={form.role}
            onChange={(v) => set('role', v)}
            options={[
              { value: 'admin',    label: 'Admin — full access' },
              { value: 'operator', label: 'Operator — inspect & verify' },
              { value: 'viewer',   label: 'Viewer — read-only' },
            ]}
          />
        </SettField>
        {!isCreate && (
          <SettField label="Account Status">
            <SettToggle
              checked={form.is_active ?? true}
              onChange={(v) => set('is_active', v)}
              label="Account is active"
              description="Inactive accounts cannot log in."
            />
          </SettField>
        )}

        <div className="sett-modal-footer">
          <button className="sett-btn primary" onClick={handleSave} disabled={saving}>
            {saving ? <FiRefreshCw size={13} /> : <FiCheck size={13} />}
            {saving ? 'Saving…' : isCreate ? 'Create User' : 'Save Changes'}
          </button>
          <button className="sett-btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ isAdmin }) {
  const [users, setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(null);
  const { user: me } = useAuth();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`${API}/users`);
      setUsers(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) loadUsers(); }, [isAdmin, loadUsers]);

  const handleCreate = async (form) => {
    await apiClient.post(`${API}/users`, form);
    toast.success(`User "${form.username}" created.`);
    await loadUsers();
  };

  const handleEdit = async (form) => {
    await apiClient.put(`${API}/users/${modal.user.id}`, form);
    toast.success('User updated.');
    await loadUsers();
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`${API}/users/${u.id}`);
      toast.success(`User "${u.username}" deleted.`);
      await loadUsers();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Delete failed');
    }
  };

  if (!isAdmin) {
    return (
      <SettCard title="User Management" icon={<FiUsers size={15} />}
        iconBg="rgba(245,158,11,0.1)" iconColor="#fbbf24">
        <div className="sett-access-denied">
          <FiLock size={32} />
          <p>Admin access required to manage users.</p>
        </div>
      </SettCard>
    );
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—';
  const ROLE_CLS = { admin: 'sett-role-admin', operator: 'sett-role-operator', viewer: 'sett-role-viewer' };

  return (
    <SettCard
      title="User Management"
      subtitle={loading ? 'Loading users…' : `${users.length} user${users.length !== 1 ? 's' : ''} in the system`}
      icon={<FiUsers size={15} />}
      iconBg="rgba(245,158,11,0.1)"
      iconColor="#fbbf24"
      footer={
        <button className="sett-btn primary" onClick={() => setModal({ mode: 'create' })}>
          <FiUserPlus size={14} /> Create User
        </button>
      }
    >
      {modal && (
        <UserModal
          mode={modal.mode}
          user={modal.user}
          onClose={() => setModal(null)}
          onSave={modal.mode === 'create' ? handleCreate : handleEdit}
        />
      )}

      {loading ? (
        <SettSkel count={3} height={46} />
      ) : users.length === 0 ? (
        <div className="sett-access-denied">
          <FiUser size={28} />
          <p>No users found.</p>
        </div>
      ) : (
        <div className="sett-table-wrap">
          <table className="sett-table">
            <thead>
              <tr>
                {['Username', 'Email', 'Role', 'Status', 'Last Login', 'Actions'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="col-name">
                    {u.username}
                    {u.id === me?.id && (
                      <span style={{ color: '#60a5fa', fontSize: '0.69rem', marginLeft: 6 }}>(you)</span>
                    )}
                  </td>
                  <td style={{ color: '#64748b', fontSize: '0.78rem' }}>{u.email || '—'}</td>
                  <td>
                    <span className={`sett-role-badge ${ROLE_CLS[u.role] || ''}`}>{u.role}</span>
                  </td>
                  <td>
                    <span className="sett-status">
                      <span className={`sett-status-dot ${u.is_active ? 'green' : 'red'}`} />
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ color: '#475569', fontSize: '0.76rem' }}>{fmtDate(u.last_login)}</td>
                  <td className="col-actions">
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        className="sett-btn ghost sm"
                        onClick={() => setModal({ mode: 'edit', user: u })}
                        title="Edit user"
                      >
                        <FiEdit2 size={12} />
                      </button>
                      {u.id !== me?.id && (
                        <button
                          className="sett-btn danger sm"
                          onClick={() => handleDelete(u)}
                          title="Delete user"
                        >
                          <FiTrash2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SettCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InfoTab  — trimmed to unique technical info only
// ─────────────────────────────────────────────────────────────────────────────

function InfoTab() {
  const { data, loading, error, refresh } = useSettings('info');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 800);
  };

  if (loading) {
    return (
      <SettCard title="System Information" icon={<FiServer size={15} />}
        iconBg="rgba(6,182,212,0.1)" iconColor="#22d3ee">
        <SettSkel count={5} height={64} />
      </SettCard>
    );
  }

  if (error || !data) {
    return (
      <SettCard title="System Information" icon={<FiServer size={15} />}
        iconBg="rgba(6,182,212,0.1)" iconColor="#22d3ee">
        <div className="sett-warn"><FiAlertTriangle size={14} /> Failed to load system info. Check backend connectivity.</div>
      </SettCard>
    );
  }

  const isDbOk  = data.database_status === 'connected';
  const isApiOk = data.api_status === 'healthy' || data.api_status === 'ok';

  return (
    <>
      <SettCard
        title="Service Health"
        subtitle="Live connectivity and operational status"
        icon={<FiActivity size={15} />}
        iconBg="rgba(16,185,129,0.1)"
        iconColor="#34d399"
        footer={
          <button
            className={`sett-btn ghost${refreshing ? ' spinning' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <FiRefreshCw size={13} /> Refresh
          </button>
        }
      >
        <div className="sett-info-grid">
          <div className="sett-info-tile">
            <div className="sett-info-tile-label">Database Status</div>
            <div className={`sett-info-tile-val ${isDbOk ? 'green' : 'red'}`}>
              <span className={`sett-status-dot ${isDbOk ? 'green' : 'red'}`} />
              {data.database_status}
            </div>
          </div>
          <div className="sett-info-tile">
            <div className="sett-info-tile-label">API Status</div>
            <div className={`sett-info-tile-val ${isApiOk ? 'green' : 'red'}`}>
              <span className={`sett-status-dot ${isApiOk ? 'green' : 'red'}`} />
              {data.api_status}
            </div>
          </div>
        </div>
      </SettCard>

      <SettCard
        title="Software Versions"
        subtitle="Runtime environment — read-only diagnostic information"
        icon={<FiServer size={15} />}
        iconBg="rgba(6,182,212,0.1)"
        iconColor="#22d3ee"
      >
        <div className="sett-info-grid">
          {[
            { label: 'Backend Version',  val: data.backend_version },
            { label: 'Frontend Version', val: data.frontend_version },
            { label: 'Python Version',   val: data.python_version },
          ].map(({ label, val }) => (
            <div key={label} className="sett-info-tile">
              <div className="sett-info-tile-label">{label}</div>
              <div className="sett-info-tile-val">{val || '—'}</div>
            </div>
          ))}
        </div>
      </SettCard>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BackupTab
// ─────────────────────────────────────────────────────────────────────────────

function BackupTab({ isAdmin }) {
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const downloadWithAuth = async (path, fallbackName) => {
    try {
      const res = await apiClient.get(path, { responseType: 'blob' });
      const cd  = res.headers['content-disposition'] || '';
      const match = cd.match(/filename="?([^";\n]+)"?/);
      const name  = match ? match[1] : fallbackName;
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success(`Downloaded: ${name}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Download failed.');
    }
  };

  const handleRestore = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiClient.post(`${API}/backup/restore`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(res.data.message || 'Settings restored successfully.');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Restore failed.');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (!isAdmin) {
    return (
      <SettCard title="Backup &amp; Restore" icon={<FiDatabase size={15} />}
        iconBg="rgba(249,115,22,0.1)" iconColor="#fb923c">
        <div className="sett-access-denied">
          <FiLock size={32} />
          <p>Admin access required for backup and restore operations.</p>
        </div>
      </SettCard>
    );
  }

  const ACTIONS = [
    {
      icon:  <FiDatabase size={16} />,
      title: 'Export Database',
      desc:  'Download full SQLite database (.db)',
      color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',
      onClick: () => downloadWithAuth('/v1/settings/backup/export', 'corrosion_db.db'),
    },
    {
      icon:  <FiDownload size={16} />,
      title: 'Export Settings',
      desc:  'Download platform config as JSON',
      color: '#10b981', bg: 'rgba(16,185,129,0.12)',
      onClick: () => downloadWithAuth('/v1/settings/backup/settings', 'settings_backup.json'),
    },
    {
      icon:     <FiUpload size={16} />,
      title:    'Restore Settings',
      desc:     importing ? 'Restoring…' : 'Upload a settings JSON file',
      color:    '#f59e0b', bg: 'rgba(245,158,11,0.12)',
      onClick:  () => fileRef.current?.click(),
      disabled: importing,
    },
  ];

  return (
    <SettCard
      title="Backup &amp; Restore"
      subtitle="Export platform data and settings for safekeeping or migration"
      icon={<FiDatabase size={15} />}
      iconBg="rgba(249,115,22,0.1)"
      iconColor="#fb923c"
    >
      <div className="sett-backup-grid">
        {ACTIONS.map((a) => (
          <button
            key={a.title}
            className="sett-backup-btn"
            onClick={a.onClick}
            disabled={a.disabled}
          >
            <div className="sett-backup-btn-icon" style={{ background: a.bg, color: a.color }}>
              {a.icon}
            </div>
            <div className="sett-backup-btn-title">{a.title}</div>
            <div className="sett-backup-btn-desc">{a.desc}</div>
          </button>
        ))}
      </div>

      <input
        ref={fileRef} type="file" accept=".json,application/json"
        style={{ display: 'none' }} onChange={handleRestore}
      />

      <div className="sett-note" style={{ marginTop: 18, marginBottom: 0 }}>
        <FiInfo size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Restoring settings will overwrite the current configuration immediately.
          Export a backup first to preserve your setup.
          Database exports include all inspections, verifications, and model version records.
        </span>
      </div>
    </SettCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin  = user?.role === 'admin';

  const [activeTab,  setActiveTab]  = useState('system');
  const [dirtyTabs,  setDirtyTabs]  = useState({});
  const [savedTabs,  setSavedTabs]  = useState({});

  const markDirty = (tabId) => setDirtyTabs((p) => ({ ...p, [tabId]: true }));
  const markSaved = (tabId) => {
    setDirtyTabs((p) => ({ ...p, [tabId]: false }));
    setSavedTabs((p) => ({ ...p, [tabId]: new Date() }));
  };

  const anyDirty    = Object.values(dirtyTabs).some(Boolean);
  const currentSaved = savedTabs[activeTab];

  return (
    <div className="sett-page">

      {/* ── HERO ─────────────────────────────────── */}
      <div className="sett-hero">
        <div className="sett-hero-left">
          <div className="sett-hero-icon"><FiSettings size={22} /></div>
          <div>
            <p className="sett-hero-eyebrow">Platform Configuration</p>
            <h1 className="sett-hero-title">Settings</h1>
            <p className="sett-hero-subtitle">
              Configure platform behavior, models, security, and users
            </p>
          </div>
        </div>
        <div className="sett-hero-right">
          {currentSaved && (
            <span className="sett-saved-chip">
              <FiCheck size={11} /> Saved {timeAgo(currentSaved)}
            </span>
          )}
        </div>
      </div>

      {/* ── UNSAVED CHANGES BANNER ───────────────── */}
      {anyDirty && (
        <div className="sett-unsaved-banner">
          <FiAlertTriangle size={14} style={{ flexShrink: 0 }} />
          Unsaved changes in:&nbsp;<strong>{dirtyTabNames(dirtyTabs)}</strong>
        </div>
      )}

      {/* ── TAB BAR ──────────────────────────────── */}
      <div className="sett-tabs">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const isDirty  = !!dirtyTabs[tab.id];
          return (
            <button
              key={tab.id}
              className={`sett-tab${isActive ? ' active' : ''}`}
              style={isActive ? {
                background:  tab.accent + '18',
                color:       tab.accent,
                borderColor: tab.accent + '40',
                boxShadow:   `0 0 14px ${tab.accent}28`,
              } : {}}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.Icon size={13} />
              {tab.label}
              {isDirty && <span className="sett-tab-dot" />}
              {tab.id === 'users' && !isAdmin && (
                <FiLock size={10} style={{ opacity: 0.5 }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── TAB CONTENT ──────────────────────────── */}
      {activeTab === 'system' && (
        <SystemTab
          onDirty={() => markDirty('system')}
          onSaved={() => markSaved('system')}
        />
      )}
      {activeTab === 'model' && (
        <ModelTab
          onDirty={() => markDirty('model')}
          onSaved={() => markSaved('model')}
        />
      )}
      {activeTab === 'detection' && (
        <DetectionTab
          onDirty={() => markDirty('detection')}
          onSaved={() => markSaved('detection')}
        />
      )}
      {activeTab === 'security' && (
        <SecurityTab
          onDirty={() => markDirty('security')}
          onSaved={() => markSaved('security')}
        />
      )}
      {activeTab === 'users'  && <UsersTab   isAdmin={isAdmin} />}
      {activeTab === 'info'   && <InfoTab />}
      {activeTab === 'backup' && <BackupTab  isAdmin={isAdmin} />}
    </div>
  );
}
