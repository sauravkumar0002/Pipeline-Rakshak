import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  FiActivity, FiAward, FiCheckCircle, FiCpu, FiDatabase,
  FiLayers, FiRefreshCw, FiAlertTriangle, FiServer,
  FiInfo, FiX, FiBarChart2, FiArrowUp, FiPackage,
  FiZap, FiTarget, FiGitBranch,
} from 'react-icons/fi';
import StatCard from '../components/dashboard/StatCard';
import {
  getModelList, selectModel,
  getModelVersions, promoteModelVersion,
  getRetrainingJobs,
} from '../services/api';
import './models.css';

/* ── Helpers ─────────────────────────────────────────── */
const pct   = (v) => (v != null ? `${(Number(v) * 100).toFixed(2)}%` : null);
const fmtD  = (d) => d ? new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—';

/** Derive a human-readable architecture name from the ONNX filename convention. */
const ARCH_NAMES = {
  mobilenetv2_standard:       'MobileNetV2',
  efficientnetb0_augmented:   'EfficientNet-B0',
  resnet50_augmented:         'ResNet-50',
};
const getArch = (name) => ARCH_NAMES[(name ?? '').toLowerCase()] || name;

/* ── SectionHeading ──────────────────────────────────── */
function SectionHeading({ icon, title, subtitle, color }) {
  return (
    <div className="modelmgmt-section-heading">
      <div className={`modelmgmt-section-icon${color ? ` ${color}` : ''}`}>{icon}</div>
      <div className="modelmgmt-section-text">
        <div className="modelmgmt-section-title">{title}</div>
        {subtitle && <div className="modelmgmt-section-subtitle">{subtitle}</div>}
      </div>
      <div className="modelmgmt-section-line" />
    </div>
  );
}

/* ── StatusBadge ─────────────────────────────────────── */
function StatusBadge({ status }) {
  const ICONS = {
    active:    <FiCheckCircle size={10} />,
    candidate: <FiTarget size={10} />,
    archived:  <FiPackage size={10} />,
  };
  const LABELS = { active: 'Active', candidate: 'Candidate', archived: 'Archived' };
  return (
    <span className={`modelmgmt-badge ${status ?? 'archived'}`}>
      {ICONS[status] ?? null}
      {LABELS[status] ?? status}
    </span>
  );
}

/* ── Custom Recharts Tooltip ─────────────────────────── */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#0d1a2f', border: '1px solid rgba(6,182,212,0.25)',
      borderRadius: 10, padding: '10px 14px', fontSize: '0.8rem', color: '#e2e8f0',
    }}>
      <div style={{ color: '#475569', marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}%</strong>
        </div>
      ))}
    </div>
  );
}

/* ── Detail Modal ────────────────────────────────────── */
function DetailModal({ version: v, onClose }) {
  return (
    <div className="modelmgmt-modal-overlay" onClick={onClose}>
      <motion.div
        className="modelmgmt-modal"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
      >
        <div className="modelmgmt-modal-header">
          <div className="modelmgmt-modal-title">
            Version Details — {v.version}
          </div>
          <button className="modelmgmt-modal-close" onClick={onClose}><FiX /></button>
        </div>

        <div className="modelmgmt-modal-grid">
          <div className="modelmgmt-modal-metric">
            <div className="modelmgmt-modal-metric-label">Model</div>
            <div className="modelmgmt-modal-metric-value" style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>
              {v.model_name}
            </div>
          </div>
          <div className="modelmgmt-modal-metric">
            <div className="modelmgmt-modal-metric-label">Status</div>
            <div style={{ marginTop: 4 }}><StatusBadge status={v.status} /></div>
          </div>
          <div className="modelmgmt-modal-metric">
            <div className="modelmgmt-modal-metric-label">Accuracy</div>
            <div className={`modelmgmt-modal-metric-value${v.accuracy == null ? ' null' : ''}`}>
              {pct(v.accuracy) ?? 'No Data'}
            </div>
          </div>
          <div className="modelmgmt-modal-metric">
            <div className="modelmgmt-modal-metric-label">F1 Score</div>
            <div className={`modelmgmt-modal-metric-value${v.f1 == null ? ' null' : ''}`}>
              {pct(v.f1) ?? 'No Data'}
            </div>
          </div>
          <div className="modelmgmt-modal-metric">
            <div className="modelmgmt-modal-metric-label">Precision</div>
            <div className={`modelmgmt-modal-metric-value${v.precision == null ? ' null' : ''}`}>
              {pct(v.precision) ?? 'No Data'}
            </div>
          </div>
          <div className="modelmgmt-modal-metric">
            <div className="modelmgmt-modal-metric-label">Recall</div>
            <div className={`modelmgmt-modal-metric-value${v.recall == null ? ' null' : ''}`}>
              {pct(v.recall) ?? 'No Data'}
            </div>
          </div>
          <div className="modelmgmt-modal-metric">
            <div className="modelmgmt-modal-metric-label">Dataset Size</div>
            <div className={`modelmgmt-modal-metric-value${v.dataset_size == null ? ' null' : ''}`}>
              {v.dataset_size != null ? `${v.dataset_size} samples` : 'No Data'}
            </div>
          </div>
          <div className="modelmgmt-modal-metric">
            <div className="modelmgmt-modal-metric-label">Created</div>
            <div className="modelmgmt-modal-metric-value" style={{ fontSize: '0.85rem' }}>
              {fmtD(v.created_at)}
            </div>
          </div>
          {v.job_id != null && (
            <div className="modelmgmt-modal-metric">
              <div className="modelmgmt-modal-metric-label">Training Job</div>
              <div className="modelmgmt-modal-metric-value" style={{ fontSize: '0.9rem' }}>
                #{v.job_id}
              </div>
            </div>
          )}
          {v.notes && (
            <div className="modelmgmt-modal-notes">
              <div className="modelmgmt-modal-notes-label">Notes</div>
              <div className="modelmgmt-modal-notes-text">{v.notes}</div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ── Comparison Panel ────────────────────────────────── */
const COMPARE_METRICS = [
  { key: 'accuracy',  label: 'Accuracy'  },
  { key: 'f1',        label: 'F1 Score'  },
  { key: 'precision', label: 'Precision' },
  { key: 'recall',    label: 'Recall'    },
];

function CompareMetricBar({ label, valA, valB, side }) {
  const val = side === 'left' ? valA : valB;
  const other = side === 'left' ? valB : valA;
  const fillPct = val != null ? Math.round(val * 100) : 0;
  const isWinner = val != null && other != null && val > other;
  const isNull = val == null;

  return (
    <div className="modelmgmt-compare-metric">
      <div className="modelmgmt-compare-metric-row">
        <span>{label}</span>
        <span className="modelmgmt-compare-metric-val">
          {isNull ? <span style={{ color: '#334155' }}>No Data</span> : pct(val)}
        </span>
      </div>
      <div className="modelmgmt-compare-bar-track">
        <div
          className={`modelmgmt-compare-bar-fill${side === 'right' ? ' right' : ''}${isWinner ? ' winner' : ''}`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </div>
  );
}

function ComparePanel({ vA, vB, onClear }) {
  return (
    <motion.div
      className="modelmgmt-compare"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
    >
      <div className="modelmgmt-compare-header">
        <div>
          <div className="modelmgmt-compare-title">Model Version Comparison</div>
          <div className="modelmgmt-compare-subtitle">
            Comparing stored metrics — no fabricated values.
          </div>
        </div>
        <button className="modelmgmt-btn ghost sm" onClick={onClear}>
          <FiX size={13} /> Clear
        </button>
      </div>

      <div className="modelmgmt-compare-grid">
        {/* Left column */}
        <div>
          <div className="modelmgmt-compare-col-label">Version A</div>
          <div className="modelmgmt-compare-model">{vA.model_name}</div>
          <div className="modelmgmt-compare-version">
            {vA.version} · <StatusBadge status={vA.status} />
          </div>
          {COMPARE_METRICS.map(m => (
            <CompareMetricBar
              key={m.key}
              label={m.label}
              valA={vA[m.key]}
              valB={vB[m.key]}
              side="left"
            />
          ))}
        </div>

        <div className="modelmgmt-compare-vs">VS</div>

        {/* Right column */}
        <div>
          <div className="modelmgmt-compare-col-label">Version B</div>
          <div className="modelmgmt-compare-model">{vB.model_name}</div>
          <div className="modelmgmt-compare-version">
            {vB.version} · <StatusBadge status={vB.status} />
          </div>
          {COMPARE_METRICS.map(m => (
            <CompareMetricBar
              key={m.key}
              label={m.label}
              valA={vA[m.key]}
              valB={vB[m.key]}
              side="right"
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════
   Main ModelHubPage
   ══════════════════════════════════════════════════════ */
const ModelHubPage = () => {
  /* ── State ─────────────────────────────────────────── */
  const [models,     setModels]     = useState([]);
  const [activeModel,setActiveModel]= useState('');
  const [versions,   setVersions]   = useState([]);
  const [jobs,       setJobs]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState(null);
  const [switching,  setSwitching]  = useState('');
  const [promoting,  setPromoting]  = useState(null);
  const [compareIds, setCompareIds] = useState([]);
  const [detailVer,  setDetailVer]  = useState(null);

  /* ── Derived ───────────────────────────────────────── */
  const activeDbVersion = useMemo(
    () => versions.find(v => v.status === 'active') ?? null,
    [versions],
  );
  const bestAccuracy = useMemo(() => {
    const vals = versions.map(v => v.accuracy).filter(v => v != null);
    return vals.length > 0 ? Math.max(...vals) : null;
  }, [versions]);
  const latestRetrain = useMemo(() => {
    const dates = jobs.filter(j => j.completed_at).map(j => new Date(j.completed_at));
    return dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
  }, [jobs]);
  const compareVersions = useMemo(
    () => compareIds.map(id => versions.find(v => v.id === id)).filter(Boolean),
    [compareIds, versions],
  );
  const trendData = useMemo(
    () => jobs
      .filter(j => j.accuracy_after != null)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(j => ({
        name:     fmtDate(j.created_at),
        accuracy: parseFloat((j.accuracy_after * 100).toFixed(2)),
        model:    j.model_name,
      })),
    [jobs],
  );

  /* ── Load ──────────────────────────────────────────── */
  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const [listRes, versRes, jobsRes] = await Promise.allSettled([
      getModelList(),
      getModelVersions(),
      getRetrainingJobs(),
    ]);

    if (listRes.status === 'fulfilled') {
      const d = listRes.value.data;
      setModels(Array.isArray(d) ? d : (d?.available_models ?? []));
      setActiveModel(d?.active_model ?? '');
    }
    if (versRes.status === 'fulfilled')
      setVersions(Array.isArray(versRes.value.data) ? versRes.value.data : []);
    if (jobsRes.status === 'fulfilled')
      setJobs(Array.isArray(jobsRes.value.data) ? jobsRes.value.data : []);

    const firstFail = [listRes, versRes, jobsRes].find(r => r.status === 'rejected');
    if (firstFail)
      setError(firstFail.reason?.response?.data?.detail || 'Failed to load some data.');

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadAll(false); }, [loadAll]);

  /* ── Handlers ──────────────────────────────────────── */
  async function handleActivate(modelName) {
    setSwitching(modelName);
    try {
      await selectModel(modelName);
      setActiveModel(modelName);
      toast.success(`Switched to: ${modelName}`);
      await loadAll(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to switch model.');
    } finally {
      setSwitching('');
    }
  }

  async function handlePromote(versionId) {
    setPromoting(versionId);
    try {
      const res = await promoteModelVersion(versionId, 'Promoted via Model Management');
      toast.success(`Version "${res.data.version}" promoted to Active.`);
      await loadAll(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Promotion failed.');
    } finally {
      setPromoting(null);
    }
  }

  function toggleCompare(id) {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) {
        toast.info('Select only 2 versions to compare. Replaced oldest selection.');
        return [prev[1], id];
      }
      return [...prev, id];
    });
  }

  /* ── Stat cards (real data only) ─────────────────────*/
  const STATS = [
    { title: 'Available Models',  rawValue: models.length,                                           icon: <FiDatabase />,      color: 'blue',   decimals: 0 },
    { title: 'Tracked Versions',  rawValue: versions.length,                                         icon: <FiLayers />,        color: 'cyan',   decimals: 0 },
    { title: 'Active Versions',   rawValue: versions.filter(v => v.status === 'active').length,      icon: <FiCheckCircle />,   color: 'green',  decimals: 0 },
    { title: 'Candidates',        rawValue: versions.filter(v => v.status === 'candidate').length,   icon: <FiTarget />,        color: 'yellow', decimals: 0 },
    { title: 'Best Accuracy',     rawValue: bestAccuracy != null ? bestAccuracy * 100 : 0,           icon: <FiAward />,         color: 'purple', decimals: 2, suffix: '%' },
    { title: 'Completed Jobs',    rawValue: jobs.filter(j => j.status === 'completed').length,       icon: <FiActivity />,      color: 'red',    decimals: 0 },
  ];

  /* ── Render ────────────────────────────────────────── */
  return (
    <div className="modelmgmt-page">

      {/* ── HERO ────────────────────────────────────── */}
      <div className="modelmgmt-hero">
        <div className="modelmgmt-hero-glow" />
        <div className="modelmgmt-hero-glow-right" />

        <div className="modelmgmt-hero-top">
          <div className="modelmgmt-hero-top-left">
            <div className="modelmgmt-hero-icon"><FiCpu /></div>
            <div>
              <p className="modelmgmt-hero-eyebrow">AI Model Lifecycle Management</p>
              <h1 className="modelmgmt-hero-title">Model Management Center</h1>
            </div>
          </div>
          <div className="modelmgmt-hero-actions">
            <button
              className={`modelmgmt-refresh-btn${refreshing ? ' spinning' : ''}`}
              onClick={() => loadAll(true)}
              disabled={refreshing || loading}
            >
              <FiRefreshCw size={14} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <p className="modelmgmt-hero-subtitle">
          Manage AI model lifecycle, runtime selection, version tracking, and performance monitoring.
        </p>

        <div className="modelmgmt-hero-badges">
          {activeModel ? (
            <span className="modelmgmt-active-badge">
              <span className="modelmgmt-active-dot" />
              Runtime: {activeModel}
            </span>
          ) : (
            <span className="modelmgmt-active-badge" style={{ opacity: 0.5 }}>
              No model loaded
            </span>
          )}
          {activeDbVersion && (
            <span className="modelmgmt-prod-badge">
              <FiAward size={11} />
              Production: {activeDbVersion.version} · {activeDbVersion.model_name}
            </span>
          )}
          {versions.length > 0 && (
            <span className="modelmgmt-prod-badge" style={{ borderColor: 'rgba(139,92,246,0.3)', color: '#a78bfa', background: 'rgba(139,92,246,0.1)' }}>
              <FiGitBranch size={11} />
              {versions.length} version{versions.length !== 1 ? 's' : ''} tracked
            </span>
          )}
        </div>

        <div className="modelmgmt-stat-grid">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="modelmgmt-stat-skeleton" />)
            : STATS.map((s, i) => (
                <StatCard
                  key={s.title}
                  title={s.title}
                  rawValue={s.rawValue}
                  icon={s.icon}
                  color={s.color}
                  suffix={s.suffix ?? ''}
                  decimals={s.decimals}
                  loading={false}
                  delay={i * 0.08}
                />
              ))
          }
        </div>
      </div>

      {/* ── ERROR ───────────────────────────────────── */}
      {error && (
        <div className="modelmgmt-error-bar">
          <FiAlertTriangle size={15} />
          <span>{error}</span>
          <button className="modelmgmt-retry-btn" onClick={() => loadAll(false)}>Retry</button>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          ACTIVE DEPLOYMENT
          ══════════════════════════════════════════════ */}
      <SectionHeading
        icon={<FiServer size={15} />}
        title="Active Deployment"
        subtitle="Currently loaded inference model and production version record"
        color="green"
      />

      {loading ? (
        <div className="modelmgmt-skel" style={{ height: 96, marginBottom: 20 }} />
      ) : activeModel ? (
        <motion.div
          className="modelmgmt-deploy-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="modelmgmt-deploy-icon"><FiZap /></div>
          <div>
            <div className="modelmgmt-deploy-name">{activeModel}</div>
            <div className="modelmgmt-deploy-meta">
              {getArch(activeModel)}
              {activeDbVersion?.created_at && ` · Promoted ${fmtD(activeDbVersion.created_at)}`}
              {activeDbVersion?.dataset_size != null && ` · ${activeDbVersion.dataset_size} training samples`}
            </div>
          </div>
          <div className="modelmgmt-deploy-status">
            <span className="modelmgmt-badge active">
              <FiCheckCircle size={10} /> Live
            </span>
            {activeDbVersion && (
              <div style={{ fontSize: '0.75rem', color: '#334155', textAlign: 'right' }}>
                {activeDbVersion.accuracy != null
                  ? `Accuracy: ${pct(activeDbVersion.accuracy)}`
                  : 'No accuracy record'}
              </div>
            )}
          </div>
        </motion.div>
      ) : (
        <div className="modelmgmt-card">
          <div className="modelmgmt-card-body">
            <div className="modelmgmt-empty">
              <div className="modelmgmt-empty-icon"><FiServer /></div>
              No model currently loaded. Activate an ONNX model below.
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          ONNX RUNTIME MODELS
          ══════════════════════════════════════════════ */}
      <SectionHeading
        icon={<FiDatabase size={15} />}
        title="ONNX Runtime Models"
        subtitle="Available model files — select one to load into the inference engine"
      />

      <div className="modelmgmt-card">
        <div className="modelmgmt-card-header">
          <div>
            <div className="modelmgmt-card-title">Model File Registry</div>
            <div className="modelmgmt-card-subtitle">
              {models.length} model{models.length !== 1 ? 's' : ''} found in model directory
            </div>
          </div>
        </div>
        <div className="modelmgmt-card-body">
          {loading ? (
            <div className="modelmgmt-hub-grid">
              {[0, 1, 2].map(i => <div key={i} className="modelmgmt-skel" style={{ height: 72 }} />)}
            </div>
          ) : models.length === 0 ? (
            <div className="modelmgmt-empty">
              <div className="modelmgmt-empty-icon"><FiPackage /></div>
              No ONNX model files found in the model directory.
            </div>
          ) : (
            <div className="modelmgmt-hub-grid">
              {models.map((m, i) => {
                const isActive = m === activeModel;
                const isSwitching = switching === m;
                return (
                  <motion.div
                    key={m}
                    className={`modelmgmt-hub-card${isActive ? ' hub-active' : ''}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.28 }}
                  >
                    <div className="modelmgmt-hub-card-row">
                      <div>
                        <div className="modelmgmt-hub-arch">{getArch(m)}</div>
                        <div className="modelmgmt-hub-file">{m}</div>
                      </div>
                      <button
                        className={`modelmgmt-hub-activate-btn ${isActive ? 'active' : 'inactive'}`}
                        disabled={isActive || isSwitching || !!switching}
                        onClick={() => !isActive && handleActivate(m)}
                      >
                        {isActive ? '✓ Active' : isSwitching ? 'Loading…' : 'Activate'}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          PERFORMANCE TREND
          ══════════════════════════════════════════════ */}
      <SectionHeading
        icon={<FiBarChart2 size={15} />}
        title="Model Performance Trend"
        subtitle="Accuracy progression across completed retraining jobs — real stored values only"
        color="amber"
      />

      <div className="modelmgmt-card">
        <div className="modelmgmt-card-header">
          <div>
            <div className="modelmgmt-card-title">Accuracy Over Training History</div>
            <div className="modelmgmt-card-subtitle">
              {trendData.length > 0
                ? `${trendData.length} data point${trendData.length !== 1 ? 's' : ''} from completed jobs`
                : 'No completed retraining jobs with recorded accuracy'}
            </div>
          </div>
        </div>
        <div className="modelmgmt-card-body">
          {loading ? (
            <div className="modelmgmt-skel" style={{ height: 220 }} />
          ) : trendData.length < 2 ? (
            <div className="modelmgmt-chart-empty">
              {trendData.length === 0
                ? 'No retraining jobs with accuracy data yet.\nRun at least one retraining job to see performance data here.'
                : 'Only 1 data point available. Run more retraining jobs to see a trend.'}
            </div>
          ) : (
            <div className="modelmgmt-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 24, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                  <XAxis
                    dataKey="name" tick={{ fill: '#475569', fontSize: 11 }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fill: '#475569', fontSize: 11 }}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => `${v}%`}
                    width={46}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    formatter={(v) => <span style={{ color: '#64748b', fontSize: '0.78rem' }}>{v}</span>}
                  />
                  <Line
                    type="monotone" dataKey="accuracy" name="Accuracy (%)"
                    stroke="#06b6d4" strokeWidth={2.5}
                    dot={{ fill: '#06b6d4', r: 4, strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: '#22d3ee' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          COMPARISON PANEL (when 2 selected)
          ══════════════════════════════════════════════ */}
      <AnimatePresence>
        {compareVersions.length === 2 && (
          <ComparePanel
            vA={compareVersions[0]}
            vB={compareVersions[1]}
            onClear={() => setCompareIds([])}
          />
        )}
      </AnimatePresence>

      {compareIds.length === 1 && (
        <div style={{
          padding: '10px 16px', borderRadius: 10, marginBottom: 16,
          background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
          fontSize: '0.82rem', color: '#a78bfa',
        }}>
          1 version selected for comparison. Select one more from the table below.
        </div>
      )}

      {/* ══════════════════════════════════════════════
          MODEL VERSIONS TABLE
          ══════════════════════════════════════════════ */}
      <SectionHeading
        icon={<FiLayers size={15} />}
        title="Model Version Registry"
        subtitle="All tracked versions from retraining jobs — active, candidate, and archived"
        color="purple"
      />

      <div className="modelmgmt-card">
        <div className="modelmgmt-card-header">
          <div>
            <div className="modelmgmt-card-title">Version History</div>
            <div className="modelmgmt-card-subtitle">
              {versions.filter(v => v.status === 'active').length} active
              &nbsp;·&nbsp;{versions.filter(v => v.status === 'candidate').length} candidate
              &nbsp;·&nbsp;{versions.filter(v => v.status === 'archived').length} archived
            </div>
          </div>
          {compareIds.length > 0 && (
            <button
              className="modelmgmt-btn ghost sm"
              onClick={() => setCompareIds([])}
            >
              <FiX size={12} /> Clear Compare
            </button>
          )}
        </div>
        <div className="modelmgmt-card-body" style={{ padding: '0 0 4px' }}>
          {loading ? (
            <div className="modelmgmt-skel" style={{ height: 180, margin: 18 }} />
          ) : versions.length === 0 ? (
            <div className="modelmgmt-empty">
              <div className="modelmgmt-empty-icon"><FiGitBranch /></div>
              No model versions tracked yet. Run a retraining job to create the first version.
            </div>
          ) : (
            <div className="modelmgmt-table-wrap">
              <table className="modelmgmt-table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Model</th>
                    <th className="center">Accuracy</th>
                    <th className="center">Precision</th>
                    <th className="center">Recall</th>
                    <th className="center">F1</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => {
                    const isActive    = v.status === 'active';
                    const isSelected  = compareIds.includes(v.id);
                    const canPromote  = v.status === 'candidate';
                    const rowClass    = isActive ? 'row-active' : isSelected ? 'row-selected' : '';
                    return (
                      <motion.tr
                        key={v.id}
                        className={rowClass}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                      >
                        <td>
                          <span className="modelmgmt-version-tag">{v.version}</span>
                        </td>
                        <td>
                          <span className="modelmgmt-model-name" title={v.model_name}>
                            {v.model_name}
                          </span>
                        </td>
                        <td className="center">
                          {v.accuracy != null
                            ? <span className="modelmgmt-metric-val">{pct(v.accuracy)}</span>
                            : <span className="modelmgmt-metric-null">—</span>}
                        </td>
                        <td className="center muted">
                          {v.precision != null ? pct(v.precision) : <span className="modelmgmt-metric-null">—</span>}
                        </td>
                        <td className="center muted">
                          {v.recall != null ? pct(v.recall) : <span className="modelmgmt-metric-null">—</span>}
                        </td>
                        <td className="center muted">
                          {v.f1 != null ? pct(v.f1) : <span className="modelmgmt-metric-null">—</span>}
                        </td>
                        <td><StatusBadge status={v.status} /></td>
                        <td className="muted">{fmtDate(v.created_at)}</td>
                        <td>
                          <div className="modelmgmt-actions-row">
                            {/* View Details */}
                            <button
                              className="modelmgmt-btn ghost sm"
                              title="View full details"
                              onClick={() => setDetailVer(v)}
                            >
                              <FiInfo size={12} />
                            </button>
                            {/* Compare toggle */}
                            <button
                              className={`modelmgmt-btn sm ${isSelected ? 'compare-on' : 'ghost'}`}
                              title={isSelected ? 'Remove from comparison' : 'Add to comparison'}
                              onClick={() => toggleCompare(v.id)}
                            >
                              <FiBarChart2 size={12} />
                              {isSelected ? 'Comparing' : 'Compare'}
                            </button>
                            {/* Promote */}
                            {canPromote && (
                              <button
                                className="modelmgmt-btn success sm"
                                title="Promote to Active"
                                disabled={promoting === v.id}
                                onClick={() => handlePromote(v.id)}
                              >
                                <FiArrowUp size={12} />
                                {promoting === v.id ? '…' : 'Promote'}
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── DETAIL MODAL ────────────────────────────── */}
      <AnimatePresence>
        {detailVer && (
          <DetailModal version={detailVer} onClose={() => setDetailVer(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default ModelHubPage;
