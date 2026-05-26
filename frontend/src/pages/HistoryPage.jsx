import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  FiActivity, FiAlertTriangle, FiCalendar, FiCheckCircle,
  FiClock, FiCpu, FiImage, FiSearch, FiX, FiTrash2,
  FiDownload, FiGrid, FiList, FiChevronLeft, FiChevronRight,
  FiShield, FiPercent, FiFilter, FiColumns,
} from 'react-icons/fi';
import StatCard from '../components/dashboard/StatCard';
import {
  getInspectionHistory,
  getAnalyticsSummary,
  deleteInspection,
  downloadInspectionPDF,
} from '../services/api';
import './history.css';
import { API_BASE_URL } from '../api/config';

/* ── Constants ─────────────────────────────────────────── */
const BACKEND_BASE = API_BASE_URL;
const PAGE_SIZES = { grid: 12, table: 20, card: 10 };

const SEV_STYLE = {
  High:    { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)' },
  Medium:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)' },
  Low:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)' },
  Minimal: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)' },
};

/* ── Helpers ───────────────────────────────────────────── */
function getImageUrl(imagePath) {
  if (!imagePath || imagePath === 'undefined' || !imagePath.trim()) return null;
  const norm = imagePath.replace(/\\/g, '/');
  return norm.startsWith('http') ? norm : `${BACKEND_BASE}/${norm}`;
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

/* ── DrawerImage ───────────────────────────────────────── */
function DrawerImage({ imagePath }) {
  const url = getImageUrl(imagePath);
  const [err, setErr] = useState(false);
  if (!url || err) {
    return (
      <div className="history-drawer-no-image">
        <FiImage size={32} />
        <span style={{ fontSize: '0.82rem' }}>No Image Available</span>
      </div>
    );
  }
  return <img src={url} alt="Inspection" onError={() => setErr(true)} />;
}

/* ── GridCard ──────────────────────────────────────────── */
function GridCard({ item, index, onOpen }) {
  const url = getImageUrl(item.image_path);
  const [imgErr, setImgErr] = useState(false);
  const isCorr = item.prediction_class === 'corrosion';

  return (
    <motion.div
      className={`history-insp-card${isCorr ? ' corr-card' : ''}`}
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
      onClick={() => onOpen(item)}
    >
      {url && !imgErr ? (
        <img src={url} alt="" className="history-card-image" onError={() => setImgErr(true)} />
      ) : (
        <div className="history-card-no-image">
          <FiImage size={24} />
          <span style={{ fontSize: '0.72rem' }}>No Image</span>
        </div>
      )}
      <div className="history-card-body">
        <div className="history-card-header">
          <span className={`hist-pred-badge ${isCorr ? 'corr' : 'healthy'}`}>
            {isCorr ? <FiAlertTriangle size={10} /> : <FiCheckCircle size={10} />}
            {getPredLabel(item.prediction_class)}
          </span>
          <span className={`hist-ver-badge ${item.is_verified ? 'verified' : 'pending'}`}>
            {item.is_verified ? 'Verified' : 'Pending'}
          </span>
        </div>
        <div className="history-card-metrics">
          <div className="history-card-metric">
            <div className="history-card-metric-label">Confidence</div>
            <div className="history-card-metric-value">{fmtConf(item.confidence)}</div>
          </div>
          <div className="history-card-metric">
            <div className="history-card-metric-label">Severity</div>
            <div className="history-card-metric-value">{item.severity || '—'}</div>
          </div>
          <div className="history-card-metric" style={{ gridColumn: '1 / -1' }}>
            <div className="history-card-metric-label">Model</div>
            <div className="history-card-metric-value" style={{ fontFamily: 'Courier New, monospace', fontSize: '0.74rem' }}>
              {item.model_used || '—'}
            </div>
          </div>
        </div>
        <div className="history-card-footer">
          <span className="history-card-id">#{item.id}</span>
          <span className="history-card-ts">
            <FiCalendar size={10} />
            {fmtDateShort(item.timestamp || item.created_at)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ── TableRow ──────────────────────────────────────────── */
function TableRow({ item, onOpen }) {
  const url = getImageUrl(item.image_path);
  const [imgErr, setImgErr] = useState(false);
  const isCorr = item.prediction_class === 'corrosion';

  return (
    <tr onClick={() => onOpen(item)}>
      <td>
        {url && !imgErr ? (
          <img src={url} alt="" className="history-tbl-thumb" onError={() => setImgErr(true)} />
        ) : (
          <div className="history-tbl-no-thumb"><FiImage size={14} /></div>
        )}
      </td>
      <td style={{ fontFamily: 'Courier New, monospace', color: '#334155', fontSize: '0.8rem' }}>
        #{item.id}
      </td>
      <td>
        <span className={`hist-pred-badge ${isCorr ? 'corr' : 'healthy'}`} style={{ fontSize: '0.69rem' }}>
          {isCorr ? <FiAlertTriangle size={9} /> : <FiCheckCircle size={9} />}
          {getPredLabel(item.prediction_class)}
        </span>
      </td>
      <td style={{ fontVariantNumeric: 'tabular-nums', color: '#94a3b8' }}>
        {fmtConf(item.confidence)}
      </td>
      <td><SevBadge severity={item.severity} /></td>
      <td style={{
        fontFamily: 'Courier New, monospace', fontSize: '0.76rem',
        color: '#64748b', maxWidth: 160,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {item.model_used || '—'}
      </td>
      <td>
        <span className={`hist-ver-badge ${item.is_verified ? 'verified' : 'pending'}`}>
          {item.is_verified ? <FiCheckCircle size={9} /> : <FiClock size={9} />}
          {item.is_verified ? 'Verified' : 'Pending'}
        </span>
      </td>
      <td style={{ color: '#475569', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
        {fmtDate(item.timestamp || item.created_at)}
      </td>
    </tr>
  );
}

/* ── ListCard ──────────────────────────────────────────── */
function ListCard({ item, index, onOpen }) {
  const url = getImageUrl(item.image_path);
  const [imgErr, setImgErr] = useState(false);
  const isCorr = item.prediction_class === 'corrosion';

  return (
    <motion.div
      className="history-list-card"
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.03, 0.3) }}
      onClick={() => onOpen(item)}
    >
      {url && !imgErr ? (
        <img src={url} alt="" className="history-list-thumb" onError={() => setImgErr(true)} />
      ) : (
        <div className="history-list-no-thumb"><FiImage size={18} /></div>
      )}
      <div className="history-list-info">
        <span className="history-list-id">#{item.id}</span>
        <div className="history-list-badges">
          <span className={`hist-pred-badge ${isCorr ? 'corr' : 'healthy'}`} style={{ fontSize: '0.69rem' }}>
            {isCorr ? <FiAlertTriangle size={9} /> : <FiCheckCircle size={9} />}
            {getPredLabel(item.prediction_class)}
          </span>
          {item.severity && <SevBadge severity={item.severity} />}
          <span className={`hist-ver-badge ${item.is_verified ? 'verified' : 'pending'}`}>
            {item.is_verified ? 'Verified' : 'Pending'}
          </span>
        </div>
        <div className="history-list-meta">
          <span className="history-list-meta-item">
            <FiPercent size={11} />
            {fmtConf(item.confidence)}
          </span>
          <span className="history-list-meta-item" style={{
            fontFamily: 'Courier New, monospace', fontSize: '0.71rem',
            maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            <FiCpu size={11} />
            {item.model_used || '—'}
          </span>
          <span className="history-list-meta-item">
            <FiCalendar size={11} />
            {fmtDateShort(item.timestamp || item.created_at)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Pagination ────────────────────────────────────────── */
function Pagination({ page, total, pageSize, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const pages = [];
  pages.push(1);
  const left = Math.max(2, page - 2);
  const right = Math.min(totalPages - 1, page + 2);
  if (left > 2) pages.push('…');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < totalPages - 1) pages.push('…');
  if (totalPages > 1) pages.push(totalPages);

  return (
    <div className="history-pagination">
      <button
        className="history-page-btn"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        <FiChevronLeft size={14} />
      </button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="history-page-info">…</span>
        ) : (
          <button
            key={p}
            className={`history-page-btn${page === p ? ' pg-active' : ''}`}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        )
      )}
      <button
        className="history-page-btn"
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
      >
        <FiChevronRight size={14} />
      </button>
      <span className="history-page-info">
        {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
    </div>
  );
}

/* ── DetailDrawer ──────────────────────────────────────── */
function DetailDrawer({ item, onClose, onDelete, onDownloadPdf, pdfLoading }) {
  if (!item) return null;

  return (
    <>
      <motion.div
        className="history-drawer-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="history-drawer"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
      >
        {/* Header */}
        <div className="history-drawer-header">
          <div>
            <div className="history-drawer-title">Inspection Details</div>
            <div className="history-drawer-id">#{item.id}</div>
          </div>
          <button className="history-drawer-close" onClick={onClose}>
            <FiX size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="history-drawer-body">
          {/* Image */}
          <div className="history-drawer-image-wrap">
            <DrawerImage imagePath={item.image_path} />
          </div>

          {/* Status badges */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className={`hist-pred-badge ${item.prediction_class === 'corrosion' ? 'corr' : 'healthy'}`}>
              {item.prediction_class === 'corrosion'
                ? <FiAlertTriangle size={11} />
                : <FiCheckCircle size={11} />}
              {getPredLabel(item.prediction_class)}
            </span>
            {item.severity && <SevBadge severity={item.severity} />}
            <span className={`hist-ver-badge ${item.is_verified ? 'verified' : 'pending'}`}>
              {item.is_verified
                ? <FiCheckCircle size={10} />
                : <FiClock size={10} />}
              {item.is_verified ? 'Verified' : 'Pending Verification'}
            </span>
          </div>

          {/* Detail grid */}
          <div>
            <p className="history-drawer-section-label">Inspection Data</p>
            <div className="history-drawer-detail-grid">
              <div className="history-drawer-detail">
                <div className="history-drawer-detail-label">Confidence</div>
                <div className="history-drawer-detail-value">{fmtConf(item.confidence)}</div>
              </div>
              {item.latency_ms != null && (
                <div className="history-drawer-detail">
                  <div className="history-drawer-detail-label">Inference Time</div>
                  <div className="history-drawer-detail-value">{item.latency_ms.toFixed(1)} ms</div>
                </div>
              )}
              {item.fps != null && (
                <div className="history-drawer-detail">
                  <div className="history-drawer-detail-label">FPS</div>
                  <div className="history-drawer-detail-value">{item.fps.toFixed(1)}</div>
                </div>
              )}
              <div className="history-drawer-detail">
                <div className="history-drawer-detail-label">Timestamp</div>
                <div className="history-drawer-detail-value" style={{ fontSize: '0.78rem' }}>
                  {fmtDate(item.timestamp || item.created_at)}
                </div>
              </div>
              <div className="history-drawer-detail" style={{ gridColumn: '1 / -1' }}>
                <div className="history-drawer-detail-label">Model Used</div>
                <div className="history-drawer-detail-value" style={{ fontFamily: 'Courier New, monospace', fontSize: '0.78rem' }}>
                  {item.model_used || '—'}
                </div>
              </div>
              {item.corrected_class && (
                <div className="history-drawer-detail">
                  <div className="history-drawer-detail-label">Corrected Class</div>
                  <div className="history-drawer-detail-value">{item.corrected_class}</div>
                </div>
              )}
            </div>
          </div>

          {/* Recommendation */}
          {item.recommendation && (
            <div className="history-drawer-recommendation">
              <p className="history-drawer-section-label" style={{ marginBottom: 8 }}>Recommendation</p>
              <p style={{ margin: 0, color: '#93c5fd', fontSize: '0.87rem', lineHeight: 1.6 }}>
                {item.recommendation}
              </p>
            </div>
          )}

          {/* Actions */}
          <div>
            <p className="history-drawer-section-label">Actions</p>
            <div className="history-drawer-actions">
              <button
                className="history-drawer-btn history-drawer-btn-pdf"
                onClick={() => onDownloadPdf(item.id)}
                disabled={pdfLoading}
              >
                <FiDownload size={14} />
                {pdfLoading ? 'Exporting…' : 'Export PDF'}
              </button>
              <button
                className="history-drawer-btn history-drawer-btn-delete"
                onClick={() => onDelete(item.id)}
              >
                <FiTrash2 size={14} />
                Delete
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════
   Main HistoryPage
   ══════════════════════════════════════════════════════════ */
const HistoryPage = () => {
  /* ── Data state ─────────────────────────────────────── */
  const [inspections, setInspections] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);

  /* ── Drawer ─────────────────────────────────────────── */
  const [drawerItem, setDrawerItem] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  /* ── View mode (persisted) ──────────────────────────── */
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('historyViewMode') || 'grid'
  );

  /* ── Search state ───────────────────────────────────── */
  const [globalSearch, setGlobalSearch] = useState('');
  const [advOpen, setAdvOpen] = useState(false);
  const [searchId, setSearchId] = useState('');
  const [searchPred, setSearchPred] = useState('');
  const [searchModel, setSearchModel] = useState('');
  const [searchSev, setSearchSev] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [searchConfMin, setSearchConfMin] = useState('');
  const [searchConfMax, setSearchConfMax] = useState('');

  /* ── Filter chip ────────────────────────────────────── */
  const [activeFilter, setActiveFilter] = useState('all');

  /* ── Pagination ─────────────────────────────────────── */
  const [page, setPage] = useState(1);

  /* ── Fetch ──────────────────────────────────────────── */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setSummaryLoading(true);
    const [histRes, sumRes] = await Promise.allSettled([
      getInspectionHistory({ limit: 500 }),
      getAnalyticsSummary(),
    ]);
    if (histRes.status === 'fulfilled') {
      setInspections(Array.isArray(histRes.value.data) ? histRes.value.data : []);
    } else {
      toast.error('Failed to load inspection history.');
    }
    if (sumRes.status === 'fulfilled') {
      setSummary(sumRes.value.data);
    }
    setLoading(false);
    setSummaryLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── View mode switch ───────────────────────────────── */
  const switchView = (mode) => {
    setViewMode(mode);
    localStorage.setItem('historyViewMode', mode);
    setPage(1);
  };

  /* ── Search clear ───────────────────────────────────── */
  const clearSearch = () => {
    setGlobalSearch('');
    setSearchId('');
    setSearchPred('');
    setSearchModel('');
    setSearchSev('');
    setSearchDate('');
    setSearchConfMin('');
    setSearchConfMax('');
  };

  const hasActiveSearch = !!(
    globalSearch || searchId || searchPred || searchModel ||
    searchSev || searchDate || searchConfMin || searchConfMax
  );

  /* ── Filtering ──────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = [...inspections];

    // Quick filter chips
    if (activeFilter === 'corrosion') list = list.filter(i => i.prediction_class === 'corrosion');
    if (activeFilter === 'healthy')   list = list.filter(i => i.prediction_class === 'no_corrosion');
    if (activeFilter === 'verified')  list = list.filter(i => i.is_verified);
    if (activeFilter === 'pending')   list = list.filter(i => !i.is_verified);
    if (activeFilter === 'high')      list = list.filter(i => i.severity === 'High');
    if (activeFilter === 'medium')    list = list.filter(i => i.severity === 'Medium');
    if (activeFilter === 'low')       list = list.filter(i => i.severity === 'Low');

    // Global search
    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      list = list.filter(i =>
        String(i.id).includes(q) ||
        (i.prediction_class || '').toLowerCase().includes(q) ||
        (i.model_used || '').toLowerCase().includes(q) ||
        (i.severity || '').toLowerCase().includes(q) ||
        (i.recommendation || '').toLowerCase().includes(q)
      );
    }

    // Advanced fields
    if (searchId.trim())
      list = list.filter(i => String(i.id).includes(searchId.trim()));
    if (searchPred.trim()) {
      const q = searchPred.toLowerCase();
      list = list.filter(i =>
        (i.prediction_class || '').toLowerCase().includes(q) ||
        getPredLabel(i.prediction_class).toLowerCase().includes(q)
      );
    }
    if (searchModel.trim()) {
      const q = searchModel.toLowerCase();
      list = list.filter(i => (i.model_used || '').toLowerCase().includes(q));
    }
    if (searchSev.trim()) {
      const q = searchSev.toLowerCase();
      list = list.filter(i => (i.severity || '').toLowerCase().includes(q));
    }
    if (searchDate.trim()) {
      list = list.filter(i => {
        const d = fmtDate(i.timestamp || i.created_at);
        return d.toLowerCase().includes(searchDate.toLowerCase());
      });
    }
    if (searchConfMin !== '') {
      const min = parseFloat(searchConfMin) / 100;
      list = list.filter(i => Number.isFinite(i.confidence) && i.confidence >= min);
    }
    if (searchConfMax !== '') {
      const max = parseFloat(searchConfMax) / 100;
      list = list.filter(i => Number.isFinite(i.confidence) && i.confidence <= max);
    }

    return list;
  }, [
    inspections, activeFilter, globalSearch,
    searchId, searchPred, searchModel, searchSev,
    searchDate, searchConfMin, searchConfMax,
  ]);

  // Reset to page 1 on filter/search change
  useEffect(() => { setPage(1); }, [
    activeFilter, globalSearch, searchId, searchPred,
    searchModel, searchSev, searchDate, searchConfMin, searchConfMax,
  ]);

  /* ── Pagination ─────────────────────────────────────── */
  const pageSize = PAGE_SIZES[viewMode] || 12;
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  /* ── Actions ────────────────────────────────────────── */
  const handleDelete = async (id) => {
    if (!window.confirm(`Delete inspection #${id}? This cannot be undone.`)) return;
    try {
      await deleteInspection(id);
      setInspections(prev => prev.filter(i => i.id !== id));
      if (drawerItem?.id === id) setDrawerItem(null);
      toast.success(`Inspection #${id} deleted.`);
      getAnalyticsSummary().then(r => setSummary(r.data)).catch(() => {});
    } catch {
      toast.error('Failed to delete inspection.');
    }
  };

  const handleDownloadPdf = async (id) => {
    setPdfLoading(true);
    try {
      const res = await downloadInspectionPDF(id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `inspection_${id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('PDF export failed or is not yet available for this inspection.');
    } finally {
      setPdfLoading(false);
    }
  };

  /* ── Stat cards config ──────────────────────────────── */
  const STATS = summary ? [
    { title: 'Total Inspections', rawValue: summary.total_inspections, icon: <FiActivity />, color: 'blue',   suffix: '', decimals: 0 },
    { title: 'Corrosion Cases',   rawValue: summary.corrosion_count,   icon: <FiAlertTriangle />, color: 'red',    suffix: '', decimals: 0 },
    { title: 'Healthy Cases',     rawValue: summary.no_corrosion_count, icon: <FiCheckCircle />, color: 'green',  suffix: '', decimals: 0 },
    { title: 'Pending Review',    rawValue: summary.unverified_count,  icon: <FiClock />,    color: 'yellow', suffix: '', decimals: 0 },
    { title: 'Verified Cases',    rawValue: summary.verified_count,    icon: <FiShield />,   color: 'purple', suffix: '', decimals: 0 },
    { title: 'Avg Confidence',    rawValue: parseFloat((summary.average_confidence * 100).toFixed(1)), icon: <FiPercent />, color: 'cyan', suffix: '%', decimals: 1 },
  ] : [];

  /* ── Filter chip definitions ────────────────────────── */
  const FILTERS = [
    { key: 'all',      label: 'All',           activeCls: 'chip-active'  },
    { key: 'corrosion', label: 'Corrosion',     activeCls: 'chip-red'    },
    { key: 'healthy',  label: 'No Corrosion',  activeCls: 'chip-green'  },
    { key: 'verified', label: 'Verified',      activeCls: 'chip-green'  },
    { key: 'pending',  label: 'Pending',       activeCls: 'chip-yellow' },
    { key: 'high',     label: 'High Severity', activeCls: 'chip-red'    },
    { key: 'medium',   label: 'Med Severity',  activeCls: 'chip-yellow' },
    { key: 'low',      label: 'Low Severity',  activeCls: 'chip-active' },
  ];

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div className="history-page">

      {/* ── HERO ──────────────────────────────────────── */}
      <div className="history-hero">
        <div className="history-hero-glow" />
        <div className="history-hero-glow-right" />

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative', marginBottom: 4 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(59,130,246,0.28), rgba(139,92,246,0.18))',
            border: '1px solid rgba(59,130,246,0.38)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#93c5fd', fontSize: 22,
          }}>
            <FiClock />
          </div>
          <div>
            <p className="history-hero-eyebrow">Inspection Management</p>
            <h1 className="history-hero-title">Inspection History</h1>
          </div>
        </div>

        <p className="history-hero-subtitle" style={{ position: 'relative' }}>
          Review, search, filter, and analyze all corrosion inspections.
        </p>

        {/* Stat cards */}
        <div className="history-stat-grid">
          {summaryLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="history-stat-skeleton" />
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
                  delay={i * 0.07}
                />
              ))
          }
        </div>
      </div>

      {/* ── CONTROLS ─────────────────────────────────── */}
      <div className="history-controls">
        <div className="history-controls-left">

          {/* Search bar */}
          <div className="history-search-wrap">
            <div className="history-search-main">
              <span className="history-search-icon"><FiSearch size={16} /></span>
              <input
                className="history-search-input"
                placeholder="Search by ID, prediction, model, severity…"
                value={globalSearch}
                onChange={e => setGlobalSearch(e.target.value)}
              />
              {hasActiveSearch && (
                <button className="history-search-btn clear" onClick={clearSearch}>
                  <FiX size={11} /> Clear
                </button>
              )}
              <button
                className="history-search-btn"
                onClick={() => setAdvOpen(v => !v)}
                style={advOpen ? { background: 'rgba(59,130,246,0.18)', borderColor: 'rgba(59,130,246,0.44)' } : {}}
              >
                <FiFilter size={11} />
                {advOpen ? 'Less' : 'More'}
              </button>
            </div>

            {advOpen && (
              <div className="history-search-advanced">
                <div className="history-search-field">
                  <label>Inspection ID</label>
                  <input placeholder="#123" value={searchId} onChange={e => setSearchId(e.target.value)} />
                </div>
                <div className="history-search-field">
                  <label>Prediction</label>
                  <input placeholder="corrosion…" value={searchPred} onChange={e => setSearchPred(e.target.value)} />
                </div>
                <div className="history-search-field">
                  <label>Model</label>
                  <input placeholder="mobilenet…" value={searchModel} onChange={e => setSearchModel(e.target.value)} />
                </div>
                <div className="history-search-field">
                  <label>Severity</label>
                  <input placeholder="High, Medium…" value={searchSev} onChange={e => setSearchSev(e.target.value)} />
                </div>
                <div className="history-search-field">
                  <label>Date</label>
                  <input placeholder="2024-01…" value={searchDate} onChange={e => setSearchDate(e.target.value)} />
                </div>
                <div className="history-search-field">
                  <label>Confidence Min (%)</label>
                  <input type="number" placeholder="0" min="0" max="100" value={searchConfMin} onChange={e => setSearchConfMin(e.target.value)} />
                </div>
                <div className="history-search-field">
                  <label>Confidence Max (%)</label>
                  <input type="number" placeholder="100" min="0" max="100" value={searchConfMax} onChange={e => setSearchConfMax(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* Filter chips */}
          <div className="history-filters">
            {FILTERS.map(f => (
              <button
                key={f.key}
                className={`history-chip${activeFilter === f.key ? ' ' + f.activeCls : ''}`}
                onClick={() => setActiveFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* View mode buttons */}
        <div className="history-controls-right">
          <button
            className={`history-view-btn${viewMode === 'grid' ? ' vmode-active' : ''}`}
            onClick={() => switchView('grid')}
            title="Grid View"
          >
            <FiGrid size={15} />
          </button>
          <button
            className={`history-view-btn${viewMode === 'table' ? ' vmode-active' : ''}`}
            onClick={() => switchView('table')}
            title="Table View"
          >
            <FiList size={15} />
          </button>
          <button
            className={`history-view-btn${viewMode === 'card' ? ' vmode-active' : ''}`}
            onClick={() => switchView('card')}
            title="Card View"
          >
            <FiColumns size={15} />
          </button>
        </div>
      </div>

      {/* ── RESULTS BAR ──────────────────────────────── */}
      {!loading && (
        <div className="history-results-bar">
          <span>
            {filtered.length} inspection{filtered.length !== 1 ? 's' : ''} found
            {(hasActiveSearch || activeFilter !== 'all') && (
              <span style={{ color: '#3b82f6', marginLeft: 6 }}>
                (filtered from {inspections.length})
              </span>
            )}
          </span>
          <span>
            {filtered.length > pageSize && `Page ${page} of ${Math.ceil(filtered.length / pageSize)}`}
          </span>
        </div>
      )}

      {/* ── CONTENT ──────────────────────────────────── */}
      {loading ? (
        viewMode === 'grid' ? (
          <div className="history-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="hist-skel" style={{ height: 300 }} />
            ))}
          </div>
        ) : viewMode === 'table' ? (
          <div className="history-table-wrap">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="hist-skel" style={{
                height: 52, borderRadius: 0,
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }} />
            ))}
          </div>
        ) : (
          <div className="history-list">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="hist-skel" style={{ height: 72 }} />
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        /* ── EMPTY STATE ── */
        <div className="history-empty">
          <div className="history-empty-icon">
            <FiSearch size={30} />
          </div>
          <h3 className="history-empty-title">No inspections found</h3>
          <p className="history-empty-sub">
            {hasActiveSearch || activeFilter !== 'all'
              ? 'Try adjusting your search criteria or clearing the active filters.'
              : 'No inspection records exist yet. Run your first inspection to see results here.'}
          </p>
          {(hasActiveSearch || activeFilter !== 'all') && (
            <button
              className="history-chip chip-active"
              style={{ marginTop: 10 }}
              onClick={() => { clearSearch(); setActiveFilter('all'); }}
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* ── GRID VIEW ── */
        <AnimatePresence mode="popLayout">
          <div className="history-grid">
            {paginated.map((item, i) => (
              <GridCard key={item.id} item={item} index={i} onOpen={setDrawerItem} />
            ))}
          </div>
        </AnimatePresence>
      ) : viewMode === 'table' ? (
        /* ── TABLE VIEW ── */
        <div className="history-table-wrap">
          <table className="history-tbl">
            <thead>
              <tr>
                <th>Image</th>
                <th>ID</th>
                <th>Prediction</th>
                <th>Confidence</th>
                <th>Severity</th>
                <th>Model</th>
                <th>Status</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(item => (
                <TableRow key={item.id} item={item} onOpen={setDrawerItem} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── CARD / LIST VIEW ── */
        <AnimatePresence mode="popLayout">
          <div className="history-list">
            {paginated.map((item, i) => (
              <ListCard key={item.id} item={item} index={i} onOpen={setDrawerItem} />
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* ── PAGINATION ───────────────────────────────── */}
      {!loading && filtered.length > 0 && (
        <Pagination
          page={page}
          total={filtered.length}
          pageSize={pageSize}
          onChange={setPage}
        />
      )}

      {/* ── DETAIL DRAWER ────────────────────────────── */}
      <AnimatePresence>
        {drawerItem && (
          <DetailDrawer
            item={drawerItem}
            onClose={() => setDrawerItem(null)}
            onDelete={handleDelete}
            onDownloadPdf={handleDownloadPdf}
            pdfLoading={pdfLoading}
          />
        )}
      </AnimatePresence>

    </div>
  );
};

export default HistoryPage;
