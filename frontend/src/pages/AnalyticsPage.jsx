import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  FiActivity, FiAlertTriangle, FiBarChart2, FiCheckCircle,
  FiClock, FiCpu, FiDatabase, FiDownload, FiPercent,
  FiRefreshCw, FiShield, FiTarget, FiTrendingUp, FiZap,
  FiAward,
} from 'react-icons/fi';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
  LineChart, Line,
} from 'recharts';
import StatCard from '../components/dashboard/StatCard';
import {
  getAnalyticsSummary,
  getAnalyticsPerformance,
  getSeverityDistribution,
  getAnalyticsTrends,
  getResearchAnalytics,
  getRocCurve,
  getPrCurve,
  downloadAnalyticsPDF,
} from '../services/api';
import './analytics.css';

/* ── Chart style constants ─────────────────────────────── */
const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'rgba(10,22,40,0.97)',
    border: '1px solid rgba(59,130,246,0.3)',
    borderRadius: '10px',
    color: '#f1f5f9',
    fontSize: '0.82rem',
    padding: '10px 14px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  labelStyle: { color: '#94a3b8', fontWeight: 600, marginBottom: 3 },
  itemStyle: { color: '#f1f5f9', padding: '2px 0' },
  cursor: { fill: 'rgba(59,130,246,0.05)' },
};

const AXIS_TICK = { fill: '#475569', fontSize: 11 };
const AXIS_LINE = { stroke: '#1e3050' };
const GRID_LINE = { strokeDasharray: '3 3', stroke: '#1e3050', strokeOpacity: 0.8 };

const SEV_COLORS = {
  Minimal: '#22c55e',
  Low:     '#3b82f6',
  Medium:  '#f59e0b',
  High:    '#ef4444',
};
const PRED_PIE_COLORS = ['#ef4444', '#22c55e'];

/* ── Helpers ────────────────────────────────────────────── */
const dec = (v, d = 4) => (v !== null && v !== undefined ? Number(v).toFixed(d) : '—');
const pct = (v)         => (v !== null && v !== undefined ? `${(Number(v) * 100).toFixed(1)}%` : '—');

/* ── SectionHeading ─────────────────────────────────────── */
function SectionHeading({ icon, title, subtitle, isResearch }) {
  return (
    <div className="anlyt-section-heading">
      <div className={`anlyt-section-icon${isResearch ? ' research' : ''}`}>
        {icon}
      </div>
      <div className="anlyt-section-text">
        <div className={`anlyt-section-title${isResearch ? ' research' : ''}`}>{title}</div>
        {subtitle && <div className="anlyt-section-subtitle">{subtitle}</div>}
      </div>
      <div className={`anlyt-section-line${isResearch ? ' research' : ''}`} />
    </div>
  );
}

/* ── ChartCard ──────────────────────────────────────────── */
function ChartCard({ title, subtitle, badge, badgeColor = 'blue', actions, children, delay = 0 }) {
  return (
    <motion.div
      className="anlyt-card"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <div className="anlyt-card-header">
        <div>
          <div className="anlyt-card-title">{title}</div>
          {subtitle && <div className="anlyt-card-subtitle">{subtitle}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {actions}
          {badge && (
            <span className={`anlyt-card-badge ${badgeColor}`}>{badge}</span>
          )}
        </div>
      </div>
      <div className="anlyt-card-body">{children}</div>
    </motion.div>
  );
}

/* ── EmptyChart ─────────────────────────────────────────── */
function EmptyChart({ message, icon }) {
  return (
    <div className="anlyt-empty-chart">
      <div className="anlyt-empty-chart-icon">{icon || <FiBarChart2 />}</div>
      <span>{message || 'No data available yet.'}</span>
    </div>
  );
}

/* ── ConfusionMatrix ────────────────────────────────────── */
function ConfusionMatrix({ cm }) {
  const { TP, TN, FP, FN } = cm;
  return (
    <div className="anlyt-cm-layout">
      {/* Grid */}
      <div>
        <div className="anlyt-cm-grid">
          {/* Row 0 */}
          <div className="anlyt-cm-corner" />
          <div className="anlyt-cm-head">Pred: Corrosion</div>
          <div className="anlyt-cm-head">Pred: No Corrosion</div>
          {/* Row 1 */}
          <div className="anlyt-cm-row-label">Actual: Corrosion</div>
          <div className="anlyt-cm-cell tp">
            <span className="anlyt-cm-value">{TP}</span>
            <span className="anlyt-cm-abbr">TP</span>
          </div>
          <div className="anlyt-cm-cell fn">
            <span className="anlyt-cm-value">{FN}</span>
            <span className="anlyt-cm-abbr">FN</span>
          </div>
          {/* Row 2 */}
          <div className="anlyt-cm-row-label">Actual: No Corrosion</div>
          <div className="anlyt-cm-cell fp">
            <span className="anlyt-cm-value">{FP}</span>
            <span className="anlyt-cm-abbr">FP</span>
          </div>
          <div className="anlyt-cm-cell tn">
            <span className="anlyt-cm-value">{TN}</span>
            <span className="anlyt-cm-abbr">TN</span>
          </div>
        </div>
      </div>
      {/* Legend */}
      <div className="anlyt-cm-legend">
        <div className="anlyt-cm-legend-title">Legend</div>
        {[
          { abbr: 'TP', label: 'True Positive',  desc: 'Correctly detected corrosion',      color: '#86efac' },
          { abbr: 'TN', label: 'True Negative',  desc: 'Correctly detected no corrosion',   color: '#86efac' },
          { abbr: 'FP', label: 'False Positive', desc: 'Incorrectly flagged as corrosion',  color: '#fcd34d' },
          { abbr: 'FN', label: 'False Negative', desc: 'Corrosion missed by model',         color: '#fca5a5' },
        ].map(({ abbr, label, desc, color }) => (
          <div key={abbr} className="anlyt-cm-legend-item">
            <span className="anlyt-cm-legend-abbr" style={{ color }}>{abbr}</span>
            <div className="anlyt-cm-legend-text">
              <div className="anlyt-cm-legend-label">{label}</div>
              <div className="anlyt-cm-legend-desc">{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── ClassificationMetrics ──────────────────────────────── */
function ClassificationMetrics({ metrics }) {
  const CARDS = [
    { label: 'Accuracy',    value: pct(metrics.accuracy),    color: '#93c5fd', formula: '(TP+TN) / Total' },
    { label: 'Precision',   value: pct(metrics.precision),   color: '#86efac', formula: 'TP / (TP+FP)' },
    { label: 'Recall',      value: pct(metrics.recall),      color: '#fca5a5', formula: 'TP / (TP+FN)' },
    { label: 'F1 Score',    value: pct(metrics.f1_score),    color: '#fcd34d', formula: '2·P·R / (P+R)' },
    { label: 'Specificity', value: pct(metrics.specificity), color: '#c4b5fd', formula: 'TN / (TN+FP)' },
    { label: 'Sensitivity', value: pct(metrics.sensitivity), color: '#fb923c', formula: 'Same as Recall' },
  ];
  return (
    <div className="anlyt-metrics-grid">
      {CARDS.map(({ label, value, color, formula }, i) => (
        <motion.div
          key={label}
          className="anlyt-metric-card"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
        >
          <p className="anlyt-metric-label">{label}</p>
          <p className="anlyt-metric-value" style={{ color }}>{value}</p>
          <p className="anlyt-metric-formula">{formula}</p>
        </motion.div>
      ))}
    </div>
  );
}

/* ── ClassificationReport ───────────────────────────────── */
function ClassificationReport({ report }) {
  const ROWS = [
    { key: 'corrosion',    label: 'Corrosion',    color: '#fca5a5', italic: false },
    { key: 'no_corrosion', label: 'No Corrosion', color: '#86efac', italic: false },
    { key: 'macro_avg',    label: 'Macro Avg',    color: '#64748b', italic: true  },
    { key: 'weighted_avg', label: 'Weighted Avg', color: '#64748b', italic: true  },
  ];
  return (
    <div className="anlyt-table-wrap">
      <table className="anlyt-table">
        <thead>
          <tr>
            <th className="left">Class</th>
            <th className="center">Precision</th>
            <th className="center">Recall</th>
            <th className="center">F1 Score</th>
            <th className="center">Support</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(({ key, label, color, italic }) => {
            const row = report[key];
            if (!row) return null;
            const isDivider = italic;
            return (
              <tr key={key} className={isDivider ? 'row-divider' : ''}>
                <td className="left" style={{ color, fontWeight: italic ? 400 : 600, fontStyle: italic ? 'italic' : 'normal' }}>
                  {label}
                </td>
                <td className="center">{pct(row.precision)}</td>
                <td className="center">{pct(row.recall)}</td>
                <td className="center">{pct(row.f1)}</td>
                <td className="center muted">{row.support}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── ModelComparison ────────────────────────────────────── */
function ModelComparison({ data }) {
  return (
    <div className="anlyt-table-wrap">
      <table className="anlyt-table">
        <thead>
          <tr>
            <th className="left">Model</th>
            <th className="center">Accuracy</th>
            <th className="center">Precision</th>
            <th className="center">Recall</th>
            <th className="center">F1</th>
            <th className="center">Avg Latency</th>
            <th className="center">Images</th>
            <th className="center">Verified</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.model_name} className={row.is_best ? 'row-best' : ''}>
              <td className="left">
                <span className={`anlyt-model-name${row.is_best ? ' best' : ''}`}>
                  {row.model_name}
                </span>
                {row.is_best && (
                  <span className="anlyt-best-badge">
                    <FiAward size={9} /> Best
                  </span>
                )}
              </td>
              <td className="center">{pct(row.accuracy)}</td>
              <td className="center">{pct(row.precision)}</td>
              <td className="center">{pct(row.recall)}</td>
              <td className="center" style={{ color: row.is_best ? '#fcd34d' : undefined }}>{pct(row.f1)}</td>
              <td className="center muted">{row.avg_latency_ms != null ? `${row.avg_latency_ms} ms` : '—'}</td>
              <td className="center">{row.images_processed}</td>
              <td className="center">{row.verified_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main AnalyticsPage Component
   ══════════════════════════════════════════════════════════ */
const AnalyticsPage = () => {
  /* ── State ──────────────────────────────────────────── */
  const [summary,         setSummary]         = useState(null);
  const [performance,     setPerformance]     = useState({});
  const [severity,        setSeverity]        = useState([]);
  const [trends,          setTrends]          = useState([]);
  const [research,        setResearch]        = useState(null);
  const [roc,             setRoc]             = useState(null);
  const [pr,              setPr]              = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [researchLoading, setResearchLoading] = useState(true);
  const [pdfLoading,      setPdfLoading]      = useState(false);
  const [error,           setError]           = useState(null);
  const [trendDays,       setTrendDays]       = useState(30);
  const [refreshing,      setRefreshing]      = useState(false);

  /* ── Derived data ───────────────────────────────────── */
  const performanceData = useMemo(() =>
    Object.entries(performance || {}).map(([model, stats]) => ({
      model:    model.length > 22 ? model.slice(0, 22) + '…' : model,
      fullModel: model,
      images:   stats.images_processed,
      latency:  stats.average_latency_ms,
      accuracy: typeof stats.accuracy_percent === 'number' ? stats.accuracy_percent : null,
    })),
  [performance]);

  const predPieData = useMemo(() => summary ? [
    { name: 'Corrosion',    value: summary.corrosion_count    },
    { name: 'No Corrosion', value: summary.no_corrosion_count },
  ].filter(d => d.value > 0) : [], [summary]);

  /* ── Load main data ─────────────────────────────────── */
  const loadMain = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const [sumRes, perfRes, sevRes, trendRes] = await Promise.allSettled([
      getAnalyticsSummary(),
      getAnalyticsPerformance(),
      getSeverityDistribution(),
      getAnalyticsTrends(trendDays),
    ]);

    if (sumRes.status === 'fulfilled') {
      setSummary(sumRes.value.data);
    }
    if (perfRes.status === 'fulfilled') {
      setPerformance(perfRes.value.data || {});
    }
    if (sevRes.status === 'fulfilled') {
      const d = sevRes.value.data || {};
      setSeverity(
        [
          { name: 'High',    value: d.High    || 0 },
          { name: 'Medium',  value: d.Medium  || 0 },
          { name: 'Low',     value: d.Low     || 0 },
          { name: 'Minimal', value: d.Minimal || 0 },
        ].filter(s => s.value > 0)
      );
    }
    if (trendRes.status === 'fulfilled') {
      setTrends(Array.isArray(trendRes.value.data) ? trendRes.value.data : []);
    }

    // surface the first failure as a banner
    const firstFail = [sumRes, perfRes, sevRes, trendRes].find(r => r.status === 'rejected');
    if (firstFail) {
      const msg = firstFail.reason?.response?.data?.detail || 'Failed to load some analytics data.';
      setError(msg);
    }

    setLoading(false);
    setRefreshing(false);
  }, [trendDays]);

  /* ── Load research data ─────────────────────────────── */
  const loadResearch = useCallback(async () => {
    setResearchLoading(true);
    const [resRes, rocRes, prRes] = await Promise.allSettled([
      getResearchAnalytics(),
      getRocCurve(),
      getPrCurve(),
    ]);
    if (resRes.status === 'fulfilled') setResearch(resRes.value.data);
    if (rocRes.status === 'fulfilled') setRoc(rocRes.value.data);
    if (prRes.status === 'fulfilled')  setPr(prRes.value.data);
    setResearchLoading(false);
  }, []);

  /* ── On mount ───────────────────────────────────────── */
  useEffect(() => {
    loadMain(false);
    loadResearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Re-fetch trends when period changes ────────────── */
  useEffect(() => {
    getAnalyticsTrends(trendDays)
      .then(r => setTrends(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, [trendDays]);

  /* ── Handlers ───────────────────────────────────────── */
  const handleRefresh = async () => {
    await loadMain(true);
    await loadResearch();
  };

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      const res = await downloadAnalyticsPDF();
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `research_analytics_${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Analytics PDF downloaded.');
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Failed to download PDF.';
      toast.error(detail);
    } finally {
      setPdfLoading(false);
    }
  };

  /* ── Stat cards ─────────────────────────────────────── */
  const STATS = summary ? [
    { title: 'Total Inspections',   rawValue: summary.total_inspections,        icon: <FiActivity />,     color: 'blue',   decimals: 0, suffix: '' },
    { title: 'Corrosion Detected',  rawValue: summary.corrosion_count,          icon: <FiAlertTriangle />, color: 'red',   decimals: 0, suffix: '' },
    { title: 'No Corrosion',        rawValue: summary.no_corrosion_count,       icon: <FiCheckCircle />,   color: 'green', decimals: 0, suffix: '' },
    { title: 'Avg Confidence',      rawValue: summary.average_confidence * 100, icon: <FiPercent />,       color: 'yellow',decimals: 1, suffix: '%' },
    { title: 'Verified Samples',    rawValue: summary.verified_count,           icon: <FiShield />,        color: 'cyan',  decimals: 0, suffix: '' },
    { title: 'Flagged for Retrain', rawValue: summary.flagged_count,            icon: <FiZap />,           color: 'purple',decimals: 0, suffix: '' },
  ] : [];

  /* ── Recharts custom label for pie ──────────────────── */
  const renderPieLabel = ({ name, percent }) =>
    percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : '';

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div className="anlyt-page">

      {/* ── HERO ──────────────────────────────────────── */}
      <div className="anlyt-hero">
        <div className="anlyt-hero-glow" />
        <div className="anlyt-hero-glow-right" />

        <div className="anlyt-hero-top">
          <div className="anlyt-hero-top-left">
            <div className="anlyt-hero-icon">
              <FiBarChart2 />
            </div>
            <div>
              <p className="anlyt-hero-eyebrow">Model Performance & Research</p>
              <h1 className="anlyt-hero-title">Analytics & Research Center</h1>
            </div>
          </div>
          <div className="anlyt-hero-actions">
            <button
              className={`anlyt-refresh-btn${refreshing ? ' spinning' : ''}`}
              onClick={handleRefresh}
              disabled={refreshing || loading}
            >
              <FiRefreshCw size={14} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <p className="anlyt-hero-subtitle">
          Monitor model performance, inspection trends, and verification outcomes.
        </p>

        {/* Stat cards */}
        <div className="anlyt-stat-grid">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="anlyt-stat-skeleton" />
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
                  delay={i * 0.08}
                />
              ))
          }
        </div>
      </div>

      {/* ── ERROR ─────────────────────────────────────── */}
      {error && (
        <div className="anlyt-error-bar">
          <span>{error}</span>
          <button className="anlyt-retry-btn" onClick={() => loadMain(false)}>Retry</button>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          INSPECTION ANALYTICS
          ════════════════════════════════════════════════ */}
      <SectionHeading
        icon={<FiActivity size={16} />}
        title="Inspection Analytics"
        subtitle="Distribution of corrosion detections and severity levels from actual inspection records"
      />

      <div className="anlyt-chart-row-2">
        {/* Severity Distribution */}
        <ChartCard
          title="Severity Distribution"
          subtitle="Corrosion inspections by severity level"
          delay={0.05}
        >
          {loading ? (
            <div className="anlyt-skel" style={{ height: 280 }} />
          ) : severity.length === 0 ? (
            <EmptyChart message="No corrosion severity data yet. Run inspections to populate." icon={<FiAlertTriangle />} />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={severity}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={96}
                  label={renderPieLabel}
                  labelLine={false}
                  strokeWidth={0}
                  isAnimationActive
                >
                  {severity.map((entry) => (
                    <Cell key={entry.name} fill={SEV_COLORS[entry.name] || '#6b7280'} />
                  ))}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [v, 'Count']} />
                <Legend
                  formatter={(value) => (
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Prediction Breakdown */}
        <ChartCard
          title="Prediction Breakdown"
          subtitle="Overall split: corrosion vs no-corrosion predictions"
          delay={0.1}
        >
          {loading ? (
            <div className="anlyt-skel" style={{ height: 280 }} />
          ) : predPieData.length === 0 ? (
            <EmptyChart message="No inspection predictions yet." icon={<FiDatabase />} />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={predPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={54}
                  outerRadius={96}
                  label={renderPieLabel}
                  labelLine={false}
                  strokeWidth={0}
                  isAnimationActive
                >
                  {predPieData.map((entry, i) => (
                    <Cell key={entry.name} fill={PRED_PIE_COLORS[i % PRED_PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [v, 'Count']} />
                <Legend
                  formatter={(value) => (
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ════════════════════════════════════════════════
          INSPECTION VOLUME (TREND)
          ════════════════════════════════════════════════ */}
      {(loading || trends.length > 0) && (
        <>
          <SectionHeading
            icon={<FiTrendingUp size={16} />}
            title="Inspection Volume"
            subtitle="Daily inspection counts over the selected period"
          />
          <div className="anlyt-chart-row-1">
            <ChartCard
              title="Daily Inspections"
              subtitle="Corrosion vs No-Corrosion over time"
              delay={0.05}
              actions={
                <div className="anlyt-trend-controls">
                  {[7, 30, 90].map(d => (
                    <button
                      key={d}
                      className={`anlyt-trend-btn${trendDays === d ? ' active' : ''}`}
                      onClick={() => setTrendDays(d)}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              }
            >
              {loading ? (
                <div className="anlyt-skel" style={{ height: 280 }} />
              ) : trends.length === 0 ? (
                <EmptyChart
                  message={`No inspection data in the last ${trendDays} days.`}
                  icon={<FiTrendingUp />}
                />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trends} margin={{ top: 5, right: 16, left: 0, bottom: 44 }}>
                    <CartesianGrid {...GRID_LINE} />
                    <XAxis dataKey="date" tick={{ ...AXIS_TICK, fontSize: 10 }} axisLine={AXIS_LINE} tickLine={false} angle={-30} textAnchor="end" />
                    <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} allowDecimals={false} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Legend
                      formatter={(value) => (
                        <span style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'capitalize' }}>{value}</span>
                      )}
                    />
                    <Line type="monotone" dataKey="total"        stroke="#93c5fd" strokeWidth={2.5} dot={false} name="Total"        />
                    <Line type="monotone" dataKey="corrosion"    stroke="#f87171" strokeWidth={2}   dot={false} name="Corrosion"    />
                    <Line type="monotone" dataKey="no_corrosion" stroke="#86efac" strokeWidth={2}   dot={false} name="No Corrosion" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════
          MODEL PERFORMANCE
          ════════════════════════════════════════════════ */}
      {(loading || performanceData.length > 0) && (
        <>
          <SectionHeading
            icon={<FiCpu size={16} />}
            title="Model Performance"
            subtitle="Throughput and latency metrics per deployed model"
          />
          <div className="anlyt-chart-row-2">
            <ChartCard
              title="Images Processed"
              subtitle="Total inspections run per model"
              delay={0.05}
            >
              {loading ? (
                <div className="anlyt-skel" style={{ height: 260 }} />
              ) : performanceData.length === 0 ? (
                <EmptyChart message="No model performance data yet." icon={<FiCpu />} />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={performanceData} margin={{ top: 5, right: 10, left: 0, bottom: 44 }}>
                    <CartesianGrid {...GRID_LINE} />
                    <XAxis dataKey="model" tick={{ ...AXIS_TICK, fontSize: 10 }} axisLine={AXIS_LINE} tickLine={false} angle={-20} textAnchor="end" />
                    <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(v, name, props) => [v, 'Images']}
                      labelFormatter={(label) => {
                        const full = performanceData.find(d => d.model === label)?.fullModel || label;
                        return full;
                      }}
                    />
                    <Bar dataKey="images" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Images" isAnimationActive />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Avg Inference Latency"
              subtitle="Average inference time per model (milliseconds)"
              delay={0.1}
            >
              {loading ? (
                <div className="anlyt-skel" style={{ height: 260 }} />
              ) : performanceData.length === 0 ? (
                <EmptyChart message="No latency data yet." icon={<FiClock />} />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={performanceData} margin={{ top: 5, right: 10, left: 0, bottom: 44 }}>
                    <CartesianGrid {...GRID_LINE} />
                    <XAxis dataKey="model" tick={{ ...AXIS_TICK, fontSize: 10 }} axisLine={AXIS_LINE} tickLine={false} angle={-20} textAnchor="end" />
                    <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} unit=" ms" />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(v) => [`${v} ms`, 'Avg Latency']}
                      labelFormatter={(label) => {
                        const full = performanceData.find(d => d.model === label)?.fullModel || label;
                        return full;
                      }}
                    />
                    <Bar dataKey="latency" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Latency (ms)" isAnimationActive />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════
          RESEARCH ANALYTICS
          ════════════════════════════════════════════════ */}
      <SectionHeading
        icon={<FiTarget size={16} />}
        title="Research Analytics"
        subtitle="Model evaluation metrics computed from verified inspection samples"
        isResearch
      />

      {researchLoading ? (
        <>
          <div className="anlyt-research-skel">
            <div className="anlyt-skel" style={{ height: 260 }} />
            <div className="anlyt-skel" style={{ height: 260 }} />
          </div>
          <div className="anlyt-skel" style={{ height: 120, marginBottom: 14 }} />
          <div className="anlyt-research-skel">
            <div className="anlyt-skel" style={{ height: 300 }} />
            <div className="anlyt-skel" style={{ height: 300 }} />
          </div>
        </>
      ) : !research?.has_data ? (
        <div className="anlyt-research-empty">
          <div className="anlyt-research-empty-icon">
            <FiTarget size={30} />
          </div>
          <h3 className="anlyt-research-empty-title">Insufficient Verified Data</h3>
          <p className="anlyt-research-empty-sub">
            {research?.message || 'Verify at least 4 inspections with both corrosion and no-corrosion labels to enable research metrics.'}
          </p>
        </div>
      ) : (
        <>
          {/* ── Confusion Matrix ────────────────────── */}
          <ChartCard
            title="Confusion Matrix"
            subtitle="Predicted vs actual classes across all verified inspections"
            delay={0.05}
          >
            <ConfusionMatrix cm={research.confusion_matrix} />
          </ChartCard>

          {/* ── Classification Metrics ──────────────── */}
          <SectionHeading
            icon={<FiPercent size={14} />}
            title="Classification Metrics"
            subtitle="Computed from verified inspection ground-truth labels"
          />
          <ClassificationMetrics metrics={research.metrics} />

          {/* ── ROC + PR Curves ─────────────────────── */}
          <div className="anlyt-chart-row-2">
            <ChartCard
              title="ROC Curve"
              subtitle="Receiver Operating Characteristic — model discrimination ability"
              badge={roc?.has_data ? `AUC = ${dec(roc.auc)}` : null}
              badgeColor="blue"
              delay={0.05}
            >
              {roc?.has_data && roc.image_base64 ? (
                <div className="anlyt-curve-wrap">
                  <img
                    src={`data:image/png;base64,${roc.image_base64}`}
                    alt="ROC Curve"
                    className="anlyt-curve-img"
                  />
                  <span className="anlyt-curve-badge blue">
                    AUC = {dec(roc.auc)}
                  </span>
                </div>
              ) : (
                <EmptyChart message={roc?.message || 'Not enough data for ROC curve.'} />
              )}
            </ChartCard>

            <ChartCard
              title="Precision-Recall Curve"
              subtitle="Trade-off between precision and recall at varying thresholds"
              badge={pr?.has_data ? `AP = ${dec(pr.average_precision)}` : null}
              badgeColor="amber"
              delay={0.1}
            >
              {pr?.has_data && pr.image_base64 ? (
                <div className="anlyt-curve-wrap">
                  <img
                    src={`data:image/png;base64,${pr.image_base64}`}
                    alt="Precision-Recall Curve"
                    className="anlyt-curve-img"
                  />
                  <span className="anlyt-curve-badge amber">
                    AP = {dec(pr.average_precision)}
                  </span>
                </div>
              ) : (
                <EmptyChart message={pr?.message || 'Not enough data for PR curve.'} />
              )}
            </ChartCard>
          </div>

          {/* ── Classification Report ───────────────── */}
          <ChartCard
            title="Classification Report"
            subtitle="Per-class precision, recall, F1 score, and sample support"
            delay={0.05}
          >
            <ClassificationReport report={research.classification_report} />
          </ChartCard>

          {/* ── Model Comparison ────────────────────── */}
          {research.model_comparison?.length > 0 && (
            <ChartCard
              title="Model Comparison"
              subtitle="Accuracy and performance metrics per model — computed from verified inspections only"
              delay={0.08}
            >
              <ModelComparison data={research.model_comparison} />
            </ChartCard>
          )}

          {/* ── Export ──────────────────────────────── */}
          <div className="anlyt-export-section">
            <span className="anlyt-export-label">
              Export full research analytics report as a PDF document
            </span>
            <button
              className={`anlyt-export-btn${pdfLoading ? ' generating' : ''}`}
              onClick={handleDownloadPDF}
              disabled={pdfLoading}
            >
              <FiDownload size={15} />
              {pdfLoading ? 'Generating PDF…' : 'Export Analytics Report (PDF)'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AnalyticsPage;
