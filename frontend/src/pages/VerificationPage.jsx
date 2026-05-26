import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  FiAlertTriangle, FiCalendar, FiCheckCircle,
  FiClock, FiCpu, FiImage, FiSearch, FiX,
  FiShield, FiPercent, FiRefreshCw,
  FiZoomIn, FiSkipForward, FiTag,
} from 'react-icons/fi';
import StatCard from '../components/dashboard/StatCard';
import { getInspectionHistory, getAnalyticsSummary, verifyInspection } from '../services/api';
import { API_BASE_URL } from '../api/config';
import './verification.css';

/* ── Constants ─────────────────────────────────────────── */
const CLASS_OPTIONS = ['corrosion', 'no_corrosion'];

const SEV_STYLE = {
  High:    { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)' },
  Medium:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)' },
  Low:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)' },
  Minimal: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)' },
};

/* ── Helpers ───────────────────────────────────────────── */
function getImageUrl(imagePath) {
  if (!imagePath) return null;
  const norm = imagePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!norm || norm === 'undefined') return null;
  return norm.startsWith('http') ? norm : `${API_BASE_URL}/${norm}`;
}

function getPredLabel(cls) {
  if (cls === 'corrosion') return 'Corrosion';
  if (cls === 'no_corrosion') return 'No Corrosion';
  return cls || '—';
}

function fmtConf(v) {
  return Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—';
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function fmtDateShort(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString();
}

/* ── SeverityBadge ─────────────────────────────────────── */
function SevBadge({ severity }) {
  const s = SEV_STYLE[severity];
  if (!s) return null;
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 999,
      fontSize: '0.7rem', fontWeight: 700,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
    }}>
      {severity}
    </span>
  );
}

/* ── FullscreenModal ───────────────────────────────────── */
function FullscreenModal({ src, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <motion.div
      className="veri-fs-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <button className="veri-fs-close" onClick={onClose}><FiX size={18} /></button>
      <motion.img
        src={src}
        alt="Inspection fullscreen"
        className="veri-fs-img"
        initial={{ scale: 0.88, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.88, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      />
    </motion.div>
  );
}

/* ── VerifCard ─────────────────────────────────────────── */
function VerifCard({ item, index, onOpenDrawer, onQuickConfirm, onSkip }) {
  const url = getImageUrl(item.image_path);
  const [imgErr, setImgErr] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const isCorr = item.prediction_class === 'corrosion';

  const handleQuickConfirm = async (e) => {
    e.stopPropagation();
    setConfirming(true);
    await onQuickConfirm(item);
    setConfirming(false);
  };

  return (
    <motion.div
      className={`veri-card${isCorr ? ' corr-glow' : ''}`}
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      layout
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
    >
      {/* Image */}
      <div
        className="veri-card-img-wrap"
        onClick={() => onOpenDrawer(item)}
        title="Click to open review"
      >
        {url && !imgErr ? (
          <>
            <img src={url} alt="" onError={() => setImgErr(true)} />
            <div className="veri-card-img-hover">
              <FiZoomIn size={26} color="#f1f5f9" />
            </div>
          </>
        ) : (
          <div className="veri-card-no-img">
            <FiImage size={24} />
            <span style={{ fontSize: '0.72rem' }}>No Image</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="veri-card-body">
        {/* Prediction + severity badges */}
        <div className="veri-card-badges">
          <span className={`veri-pred-badge ${isCorr ? 'corr' : 'healthy'}`}>
            {isCorr ? <FiAlertTriangle size={10} /> : <FiCheckCircle size={10} />}
            {getPredLabel(item.prediction_class)}
          </span>
          {item.severity && <SevBadge severity={item.severity} />}
          <span className={`veri-status-badge ${item.is_verified ? 'verified' : 'pending'}`}>
            {item.is_verified
              ? <><FiCheckCircle size={9} /> Verified</>
              : <><FiClock size={9} /> Pending</>}
          </span>
        </div>

        {/* Metadata */}
        <div className="veri-card-meta">
          <div className="veri-card-meta-row">
            <FiPercent size={11} className="veri-card-meta-label" />
            <span className="veri-card-meta-value">{fmtConf(item.confidence)}</span>
          </div>
          <div className="veri-card-model" title={item.model_used || '—'}>
            <FiCpu size={10} style={{ marginRight: 4, verticalAlign: 'middle', color: '#334155' }} />
            {item.model_used || '—'}
          </div>
        </div>

        {/* Footer row */}
        <div className="veri-card-footer-row">
          <span className="veri-card-id">#{item.id}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <FiCalendar size={10} />
            {fmtDateShort(item.timestamp || item.created_at)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="veri-card-actions">
        <button
          className="veri-quick-btn confirm"
          onClick={handleQuickConfirm}
          disabled={confirming}
          title="Confirm AI prediction (no correction, no retraining flag)"
        >
          <FiCheckCircle size={13} />
          {confirming ? 'Confirming…' : 'Confirm'}
        </button>
        <button
          className="veri-quick-btn review"
          onClick={() => onOpenDrawer(item)}
        >
          <FiTag size={13} />
          Review
        </button>
      </div>
    </motion.div>
  );
}

/* ── VerifDrawer ───────────────────────────────────────── */
function VerifDrawer({ item, onClose, onVerified, onSkip, onExpand }) {
  const [selectedClass, setSelectedClass] = useState(item.prediction_class);
  const [flagRetrain, setFlagRetrain] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const url = getImageUrl(item.image_path);
  const [imgErr, setImgErr] = useState(false);
  const isCorr = item.prediction_class === 'corrosion';
  const isCorrecting = selectedClass !== item.prediction_class;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onVerified(item.id, {
        is_verified: true,
        corrected_class: selectedClass,
        is_flagged_for_retraining: flagRetrain,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    onSkip(item.id);
    onClose();
  };

  return (
    <>
      <motion.div
        className="veri-drawer-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="veri-drawer"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
      >
        {/* Header */}
        <div className="veri-drawer-header">
          <div>
            <div className="veri-drawer-title">Review Inspection</div>
            <div className="veri-drawer-subtitle">#{item.id}</div>
          </div>
          <button className="veri-drawer-close" onClick={onClose}>
            <FiX size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="veri-drawer-body">
          {/* Image */}
          <div
            className="veri-drawer-img-wrap"
            onClick={() => url && !imgErr && onExpand(url)}
            title={url && !imgErr ? 'Click to view fullscreen' : ''}
          >
            {url && !imgErr ? (
              <>
                <img src={url} alt="Inspection" onError={() => setImgErr(true)} />
                <div className="veri-drawer-img-overlay">
                  <FiZoomIn size={12} /> Fullscreen
                </div>
              </>
            ) : (
              <div className="veri-drawer-no-img">
                <FiImage size={30} />
                <span style={{ fontSize: '0.82rem' }}>No Image Available</span>
              </div>
            )}
          </div>

          {/* Status badges */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className={`veri-pred-badge ${isCorr ? 'corr' : 'healthy'}`}>
              {isCorr ? <FiAlertTriangle size={11} /> : <FiCheckCircle size={11} />}
              {getPredLabel(item.prediction_class)}
            </span>
            {item.severity && <SevBadge severity={item.severity} />}
            <span className={`veri-status-badge ${item.is_verified ? 'verified' : 'pending'}`}>
              {item.is_verified
                ? <><FiCheckCircle size={10} /> Verified</>
                : <><FiClock size={10} /> Pending Verification</>}
            </span>
          </div>

          {/* Inspection data */}
          <div>
            <p className="veri-drawer-section-label">Inspection Data</p>
            <div className="veri-detail-grid">
              <div className="veri-detail-cell">
                <div className="veri-detail-label">Confidence</div>
                <div className="veri-detail-value">{fmtConf(item.confidence)}</div>
              </div>
              {item.latency_ms != null && (
                <div className="veri-detail-cell">
                  <div className="veri-detail-label">Inference Time</div>
                  <div className="veri-detail-value">{item.latency_ms.toFixed(1)} ms</div>
                </div>
              )}
              {item.fps != null && (
                <div className="veri-detail-cell">
                  <div className="veri-detail-label">FPS</div>
                  <div className="veri-detail-value">{item.fps.toFixed(1)}</div>
                </div>
              )}
              <div className="veri-detail-cell">
                <div className="veri-detail-label">Timestamp</div>
                <div className="veri-detail-value" style={{ fontSize: '0.76rem' }}>
                  {fmtDate(item.timestamp || item.created_at)}
                </div>
              </div>
              <div className="veri-detail-cell" style={{ gridColumn: '1 / -1' }}>
                <div className="veri-detail-label">Model Used</div>
                <div className="veri-detail-value" style={{ fontFamily: 'Courier New, monospace', fontSize: '0.77rem' }}>
                  {item.model_used || '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Recommendation */}
          {item.recommendation && (
            <div className="veri-recommendation">
              <p className="veri-drawer-section-label" style={{ marginBottom: 8 }}>Recommendation</p>
              <p>{item.recommendation}</p>
            </div>
          )}

          {/* Verification Decision Panel */}
          <div className="veri-decision-panel">
            <p className="veri-decision-title">Verification Decision</p>

            {/* Label selector */}
            <div className="veri-label-row">
              <span className="veri-label-row-label">Correct Label</span>
              <div className="veri-label-selector">
                {CLASS_OPTIONS.map(cls => {
                  const isSel = selectedClass === cls;
                  const isC = cls === 'corrosion';
                  return (
                    <button
                      key={cls}
                      className={`veri-label-btn ${
                        isSel
                          ? (isC ? 'sel-corr' : 'sel-healthy')
                          : (isC ? 'idle-corr' : 'idle-healthy')
                      }`}
                      onClick={() => setSelectedClass(cls)}
                    >
                      {isC ? <FiAlertTriangle size={13} /> : <FiCheckCircle size={13} />}
                      {isC ? 'Corrosion' : 'No Corrosion'}
                    </button>
                  );
                })}
              </div>
              {isCorrecting && (
                <div className="veri-correction-notice">
                  <FiAlertTriangle size={13} />
                  Correcting AI prediction
                </div>
              )}
            </div>

            {/* Retraining toggle */}
            <button
              className={`veri-retrain-toggle${flagRetrain ? ' active' : ''}`}
              onClick={() => setFlagRetrain(v => !v)}
            >
              <div className="veri-retrain-dot" />
              <div className="veri-retrain-text">
                <div className="veri-retrain-text-title">Flag for Retraining Dataset</div>
                <div className="veri-retrain-text-sub">
                  {flagRetrain
                    ? 'Sample will be added to the retraining dataset'
                    : 'Add this verified sample to the retraining dataset'}
                </div>
              </div>
            </button>

            {/* Actions */}
            <div className="veri-decision-actions">
              <button
                className="veri-submit-btn"
                onClick={handleSubmit}
                disabled={submitting}
              >
                <FiShield size={14} />
                {submitting ? 'Submitting…' : 'Submit Verification'}
              </button>
              <button className="veri-skip-btn" onClick={handleSkip}>
                <FiSkipForward size={14} />
                Skip
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════
   Main VerificationPage
   ══════════════════════════════════════════════════════════ */
const VerificationPage = () => {
  /* ── Data ───────────────────────────────────────────── */
  const [queue, setQueue] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  /* ── Drawer / Fullscreen ────────────────────────────── */
  const [drawerItem, setDrawerItem] = useState(null);
  const [fullscreenSrc, setFullscreenSrc] = useState(null);

  /* ── Search + Filter ────────────────────────────────── */
  const [search, setSearch] = useState('');
  const [predFilter, setPredFilter] = useState('all');
  const [sevFilter, setSevFilter] = useState('all');

  /* ── Fetch ──────────────────────────────────────────── */
  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else { setLoading(true); setSummaryLoading(true); }
    setError(null);

    const [qRes, sRes] = await Promise.allSettled([
      getInspectionHistory({ is_verified: false, limit: 200 }),
      getAnalyticsSummary(),
    ]);

    if (qRes.status === 'fulfilled') {
      setQueue(Array.isArray(qRes.value.data) ? qRes.value.data : []);
    } else {
      const msg = qRes.reason?.response?.data?.detail || 'Failed to load verification queue.';
      setError(msg);
      toast.error(msg);
    }
    if (sRes.status === 'fulfilled') setSummary(sRes.value.data);

    setLoading(false);
    setSummaryLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── Refresh summary after action ──────────────────── */
  const refreshSummary = () => {
    getAnalyticsSummary().then(r => setSummary(r.data)).catch(() => {});
  };

  /* ── Verify action ──────────────────────────────────── */
  const handleVerify = async (id, payload) => {
    try {
      await verifyInspection(id, payload);
      setQueue(prev => prev.filter(i => i.id !== id));
      if (drawerItem?.id === id) setDrawerItem(null);
      const label = payload.is_flagged_for_retraining
        ? `Inspection #${id} verified and flagged for retraining.`
        : `Inspection #${id} verified.`;
      toast.success(label);
      refreshSummary();
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Verification failed.';
      toast.error(msg);
      throw err; // re-throw so drawer can reset loading state
    }
  };

  /* ── Quick confirm (no correction, no retrain flag) ── */
  const handleQuickConfirm = async (item) => {
    await handleVerify(item.id, {
      is_verified: true,
      corrected_class: item.prediction_class,
      is_flagged_for_retraining: false,
    });
  };

  /* ── Skip (client-side, no API call) ───────────────── */
  const handleSkip = (id) => {
    setQueue(prev => prev.filter(i => i.id !== id));
  };

  /* ── Filtered queue ─────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = [...queue];
    if (predFilter === 'corrosion')   list = list.filter(i => i.prediction_class === 'corrosion');
    if (predFilter === 'no_corrosion') list = list.filter(i => i.prediction_class === 'no_corrosion');
    if (sevFilter !== 'all')          list = list.filter(i => i.severity === sevFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        String(i.id).includes(q) ||
        (i.prediction_class || '').toLowerCase().includes(q) ||
        (i.model_used || '').toLowerCase().includes(q) ||
        (i.severity || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [queue, predFilter, sevFilter, search]);

  const hasFilter = search || predFilter !== 'all' || sevFilter !== 'all';

  /* ── Stat cards ─────────────────────────────────────── */
  const STATS = summary ? [
    { title: 'Pending Reviews',    rawValue: summary.unverified_count, icon: <FiClock />,         color: 'yellow', suffix: '', decimals: 0 },
    { title: 'Verified Samples',   rawValue: summary.verified_count,   icon: <FiCheckCircle />,   color: 'green',  suffix: '', decimals: 0 },
    { title: 'Flagged for Retrain', rawValue: summary.flagged_count,    icon: <FiTag />,           color: 'purple', suffix: '', decimals: 0 },
  ] : [];

  /* ── Filter chip helper ─────────────────────────────── */
  const PRED_FILTERS = [
    { key: 'all',         label: 'All',         cls: 'chip-blue'  },
    { key: 'corrosion',   label: 'Corrosion',   cls: 'chip-red'   },
    { key: 'no_corrosion', label: 'No Corrosion', cls: 'chip-green' },
  ];
  const SEV_FILTERS = [
    { key: 'all',     label: 'All Severity', cls: 'chip-blue'   },
    { key: 'High',    label: 'High',         cls: 'chip-red'    },
    { key: 'Medium',  label: 'Medium',       cls: 'chip-yellow' },
    { key: 'Low',     label: 'Low',          cls: 'chip-blue'   },
    { key: 'Minimal', label: 'Minimal',      cls: 'chip-green'  },
  ];

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div className="veri-page">

      {/* ── HERO ──────────────────────────────────────── */}
      <div className="veri-hero">
        <div className="veri-hero-glow" />
        <div className="veri-hero-glow-right" />

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative', marginBottom: 4 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(59,130,246,0.28), rgba(245,158,11,0.18))',
            border: '1px solid rgba(59,130,246,0.38)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#93c5fd', fontSize: 22,
          }}>
            <FiShield />
          </div>
          <div>
            <p className="veri-hero-eyebrow">Human Review Workflow</p>
            <h1 className="veri-hero-title">Verification Center</h1>
          </div>
        </div>

        <p className="veri-hero-subtitle" style={{ position: 'relative' }}>
          Review and validate AI corrosion predictions before retraining.
        </p>

        {/* Stat cards — only rendered when summary is available */}
        <div className="veri-stat-grid">
          {summaryLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="veri-stat-skeleton" />
              ))
            : STATS.map((s, i) => (
                <StatCard
                  key={s.title}
                  title={s.title}
                  rawValue={s.rawValue}
                  icon={s.icon}
                  color={s.color}
                  suffix={s.suffix}
                  decimals={s.decimals}
                  loading={false}
                  delay={i * 0.1}
                />
              ))
          }
        </div>
      </div>

      {/* ── ERROR ─────────────────────────────────────── */}
      {error && (
        <div className="veri-error">
          <span>{error}</span>
          <button className="veri-retry-btn" onClick={() => fetchAll()}>Retry</button>
        </div>
      )}

      {/* ── CONTROLS ─────────────────────────────────── */}
      <div className="veri-controls">
        <div className="veri-controls-left">
          {/* Search */}
          <div className="veri-search-wrap">
            <span className="veri-search-icon"><FiSearch size={16} /></span>
            <input
              className="veri-search-input"
              placeholder="Search by ID, prediction, model, severity…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="veri-search-clear" onClick={() => setSearch('')}>
                <FiX size={11} /> Clear
              </button>
            )}
          </div>

          {/* Filter chips */}
          <div className="veri-filters">
            {PRED_FILTERS.map(f => (
              <button
                key={f.key}
                className={`veri-chip${predFilter === f.key ? ' ' + f.cls : ''}`}
                onClick={() => setPredFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
            <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
            {SEV_FILTERS.map(f => (
              <button
                key={f.key}
                className={`veri-chip${sevFilter === f.key ? ' ' + f.cls : ''}`}
                onClick={() => setSevFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Refresh */}
        <div className="veri-controls-right">
          <button
            className={`veri-refresh-btn${refreshing ? ' spinning' : ''}`}
            onClick={() => fetchAll(true)}
            disabled={refreshing}
          >
            <FiRefreshCw size={14} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── QUEUE BAR ─────────────────────────────────── */}
      {!loading && !error && (
        <div className="veri-queue-bar">
          <span>
            {filtered.length} inspection{filtered.length !== 1 ? 's' : ''} pending review
            {hasFilter && (
              <span style={{ color: '#3b82f6', marginLeft: 6 }}>
                (filtered from {queue.length})
              </span>
            )}
          </span>
          {hasFilter && (
            <button
              className="veri-chip chip-blue"
              style={{ fontSize: '0.72rem', padding: '3px 10px' }}
              onClick={() => { setSearch(''); setPredFilter('all'); setSevFilter('all'); }}
            >
              <FiX size={10} style={{ marginRight: 3 }} />
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── CONTENT ──────────────────────────────────── */}
      {loading ? (
        <div className="veri-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="veri-skel" style={{ height: 320 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="veri-empty">
          <div className={`veri-empty-icon${hasFilter ? ' veri-empty-icon-search' : ''}`}>
            {hasFilter ? <FiSearch size={30} /> : <FiCheckCircle size={32} />}
          </div>
          <h3 className="veri-empty-title">
            {hasFilter ? 'No matches found' : 'Queue is clear'}
          </h3>
          <p className="veri-empty-sub">
            {hasFilter
              ? 'Try adjusting your search or clearing the active filters.'
              : 'All inspections in the queue have been reviewed. Run new inspections to populate the queue.'}
          </p>
          {hasFilter && (
            <button
              className="veri-chip chip-blue"
              style={{ marginTop: 10 }}
              onClick={() => { setSearch(''); setPredFilter('all'); setSevFilter('all'); }}
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="veri-grid">
            {filtered.map((item, i) => (
              <VerifCard
                key={item.id}
                item={item}
                index={i}
                onOpenDrawer={setDrawerItem}
                onQuickConfirm={handleQuickConfirm}
                onSkip={handleSkip}
              />
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* ── DETAIL DRAWER ────────────────────────────── */}
      <AnimatePresence>
        {drawerItem && (
          <VerifDrawer
            key={drawerItem.id}
            item={drawerItem}
            onClose={() => setDrawerItem(null)}
            onVerified={handleVerify}
            onSkip={handleSkip}
            onExpand={setFullscreenSrc}
          />
        )}
      </AnimatePresence>

      {/* ── FULLSCREEN IMAGE MODAL ────────────────────── */}
      <AnimatePresence>
        {fullscreenSrc && (
          <FullscreenModal src={fullscreenSrc} onClose={() => setFullscreenSrc(null)} />
        )}
      </AnimatePresence>

    </div>
  );
};

export default VerificationPage;
