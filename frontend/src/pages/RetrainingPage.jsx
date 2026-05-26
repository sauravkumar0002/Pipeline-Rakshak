import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  FiActivity, FiAward, FiCheckCircle, FiChevronRight,
  FiClock, FiCpu, FiDatabase, FiList, FiPlay, FiRefreshCw,
  FiTarget, FiTrash2, FiAlertTriangle, FiPlus, FiZap,
  FiShield, FiPackage, FiArrowRight, FiXCircle, FiSliders,
  FiBarChart2, FiChevronDown, FiChevronUp, FiFile, FiImage,
} from 'react-icons/fi';
import StatCard from '../components/dashboard/StatCard';
import {
  getRetrainingDataset,
  getRetrainingQueue,
  buildRetrainingQueue,
  clearRetrainingQueue,
  getRetrainingJobs,
  startRetraining,
  cancelRetrainingJob,
  getModelVersions,
  promoteModelVersion,
  getJobEpochs,
  getJobArtifacts,
} from '../services/api';
import { API_BASE_URL } from '../api/config';
import './retraining.css';

/* ── Helpers ─────────────────────────────────────────── */
const pct  = (v) => (v != null ? `${(Number(v) * 100).toFixed(2)}%` : '—');
const fmtD = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—');

/* ── SectionHeading ──────────────────────────────────── */
function SectionHeading({ icon, title, subtitle, color }) {
  return (
    <div className="retrain-section-heading">
      <div className={`retrain-section-icon${color ? ` ${color}` : ''}`}>
        {icon}
      </div>
      <div className="retrain-section-text">
        <div className="retrain-section-title">{title}</div>
        {subtitle && <div className="retrain-section-subtitle">{subtitle}</div>}
      </div>
      <div className="retrain-section-line" />
    </div>
  );
}

/* ── StatusBadge ─────────────────────────────────────── */
function StatusBadge({ status }) {
  const ICONS = {
    active:     <FiCheckCircle size={10} />,
    candidate:  <FiTarget size={10} />,
    archived:   <FiPackage size={10} />,
    completed:  <FiCheckCircle size={10} />,
    running:    <FiCpu size={10} />,
    evaluating: <FiActivity size={10} />,
    exporting:  <FiPackage size={10} />,
    queued:     <FiClock size={10} />,
    failed:     <FiAlertTriangle size={10} />,
    cancelled:  <FiXCircle size={10} />,
    pending:    <FiClock size={10} />,
  };
  const LABELS = {
    active: 'Active', candidate: 'Candidate', archived: 'Archived',
    completed: 'Completed', running: 'Running', evaluating: 'Evaluating',
    exporting: 'Exporting', queued: 'Queued', failed: 'Failed',
    cancelled: 'Cancelled', pending: 'Pending',
  };
  return (
    <span className={`retrain-badge ${status ?? 'archived'}`}>
      {ICONS[status] ?? null}
      {LABELS[status] ?? status}
    </span>
  );
}

/* ── Pipeline ────────────────────────────────────────── */
const PIPELINE_STEPS = [
  { id: 'inspect',    icon: <FiActivity size={16} />,    label: 'Inspection',    sub: 'Images captured'    },
  { id: 'verify',     icon: <FiShield size={16} />,      label: 'Verification',  sub: 'Human reviewed'     },
  { id: 'queue',      icon: <FiList size={16} />,        label: 'Dataset Queue', sub: 'Queued for training' },
  { id: 'retrain',    icon: <FiCpu size={16} />,         label: 'Retraining',    sub: 'Model training'     },
  { id: 'evaluate',   icon: <FiTarget size={16} />,      label: 'Evaluation',    sub: 'Metrics computed'   },
  { id: 'promote',    icon: <FiAward size={16} />,       label: 'Promotion',     sub: 'Candidate selected' },
  { id: 'production', icon: <FiZap size={16} />,         label: 'Production',    sub: 'Model deployed'     },
];

function Pipeline({ stepStatus }) {
  return (
    <div className="retrain-pipeline">
      {PIPELINE_STEPS.map((step, i) => (
        <div key={step.id} style={{ display: 'flex', alignItems: 'center' }}>
          <motion.div
            className={`retrain-pipeline-step ${stepStatus[step.id] ?? 'inactive'}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.3 }}
          >
            <div className="retrain-pipeline-icon">{step.icon}</div>
            <div className="retrain-pipeline-label">{step.label}</div>
            <div className="retrain-pipeline-sublabel">{step.sub}</div>
          </motion.div>
          {i < PIPELINE_STEPS.length - 1 && (
            <div className="retrain-pipeline-arrow"><FiChevronRight /></div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Queue table ─────────────────────────────────────── */
function QueueTable({ queue }) {
  if (queue.length === 0) {
    return (
      <div className="retrain-empty">
        <div className="retrain-empty-icon"><FiList /></div>
        Queue is empty. Use &ldquo;Build Queue&rdquo; to populate it from verified inspections.
      </div>
    );
  }
  return (
    <>
      <div className="retrain-table-wrap">
        <table className="retrain-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Inspection ID</th>
              <th>Verified Label</th>
              <th>Model</th>
              <th>Added At</th>
            </tr>
          </thead>
          <tbody>
            {queue.slice(0, 60).map((item, i) => (
              <tr key={item.id}>
                <td className="muted">{i + 1}</td>
                <td><span className="retrain-id-chip">#{item.inspection_id}</span></td>
                <td>
                  <span className={`retrain-label-pill ${item.verified_label === 'corrosion' ? 'corrosion' : 'no-corrosion'}`}>
                    {item.verified_label}
                  </span>
                </td>
                <td className="muted" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{item.model_name}</td>
                <td className="muted">{fmtD(item.added_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {queue.length > 60 && (
        <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#475569', textAlign: 'center' }}>
          Showing first 60 of {queue.length} items.
        </p>
      )}
    </>
  );
}

/* ── Jobs table ──────────────────────────────────────── */
function JobsTable({ jobs, onCancel, cancelling, onSelect, selectedJobId }) {
  if (jobs.length === 0) {
    return (
      <div className="retrain-empty">
        <div className="retrain-empty-icon"><FiCpu /></div>
        No retraining jobs yet. Build the queue, then start a job.
      </div>
    );
  }
  const ACTIVE = new Set(['queued', 'running', 'evaluating', 'exporting']);
  return (
    <div className="retrain-table-wrap">
      <table className="retrain-table">
        <thead>
          <tr>
            <th>Job ID</th>
            <th>Model</th>
            <th className="center">Dataset</th>
            <th>Status / Progress</th>
            <th className="center">Acc Before</th>
            <th className="center">Acc After</th>
            <th className="center">Precision</th>
            <th className="center">Recall</th>
            <th className="center">F1</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const improved = job.accuracy_after != null && job.accuracy_before != null
              && job.accuracy_after > job.accuracy_before;
            const delta = (job.accuracy_after != null && job.accuracy_before != null)
              ? (job.accuracy_after - job.accuracy_before) : null;
            const isActive = ACTIVE.has(job.status);
            const pct100 = job.progress_pct ?? 0;
            const epochLabel = (job.progress_epoch != null && job.total_epochs)
              ? `Epoch ${job.progress_epoch}/${job.total_epochs}` : null;
            return (
              <tr key={job.id} className={improved ? 'row-hl' : ''}>
                <td><span className="retrain-id-chip">#{job.id}</span></td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.79rem', color: '#94a3b8' }}>{job.model_name}</td>
                <td className="center">{job.dataset_size}</td>
                <td>
                  <StatusBadge status={job.status} />
                  {isActive && (
                    <div style={{ marginTop: 5 }}>
                      <div style={{ background: '#1e293b', borderRadius: 4, height: 5, width: 120, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct100}%`, background: '#3b82f6', transition: 'width 0.4s' }} />
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2 }}>
                        {epochLabel ?? `${pct100.toFixed(0)}%`}
                      </div>
                    </div>
                  )}
                  {job.status === 'failed' && job.error_message && (
                    <div style={{ fontSize: '0.68rem', color: '#ef4444', marginTop: 3, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.error_message}>
                      {job.error_message.split('\n').pop()}
                    </div>
                  )}
                </td>
                <td className="center muted">{pct(job.accuracy_before)}</td>
                <td className="center">
                  {job.accuracy_after != null ? (
                    <span className={`retrain-acc-val ${improved ? 'improved' : 'declined'}`}>
                      {pct(job.accuracy_after)}
                      {delta != null && (
                        <span className="retrain-acc-delta">
                          ({delta >= 0 ? '+' : ''}{(delta * 100).toFixed(2)}pp)
                        </span>
                      )}
                    </span>
                  ) : '—'}
                </td>
                <td className="center muted">{pct(job.precision_after)}</td>
                <td className="center muted">{pct(job.recall_after)}</td>
                <td className="center muted">{pct(job.f1_after)}</td>
                <td className="muted">{fmtD(job.created_at)}</td>
                <td>
                  {isActive && (
                    <button
                      className="retrain-btn danger"
                      style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                      disabled={cancelling === job.id}
                      onClick={() => onCancel(job.id)}
                      title="Cancel this job"
                    >
                      <FiXCircle size={11} />
                      {cancelling === job.id ? '…' : 'Cancel'}
                    </button>
                  )}
                  <button
                    className="retrain-btn"
                    style={{ padding: '3px 8px', fontSize: '0.72rem', marginTop: isActive ? 4 : 0, background: 'transparent', border: '1px solid #1e293b', color: '#64748b' }}
                    onClick={() => onSelect(selectedJobId === job.id ? null : job)}
                    title="View learning curves and artifacts"
                  >
                    {selectedJobId === job.id ? <FiChevronUp size={11} /> : <FiChevronDown size={11} />}
                    {selectedJobId === job.id ? 'Hide' : 'Details'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Version card ────────────────────────────────────── */
function VersionCard({ v, activeForModel, onPromote, promoting }) {
  const isActive    = v.status === 'active';
  const canPromote  = v.status === 'candidate' &&
    (!activeForModel || (v.accuracy ?? 0) > (activeForModel?.accuracy ?? 0));
  const lowerAcc    = v.status === 'candidate' && !canPromote;

  return (
    <motion.div
      className={`retrain-version-card${isActive ? ' active-card' : ''}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -2 }}
    >
      <div className="retrain-version-head">
        <div>
          <div className={`retrain-version-tag${isActive ? ' active-tag' : ''}`}>
            {isActive && <FiCheckCircle size={13} />}
            {v.version}
          </div>
          <div className="retrain-version-model" title={v.model_name}>{v.model_name}</div>
        </div>
        <StatusBadge status={v.status} />
      </div>

      <div className="retrain-version-metrics">
        <div className="retrain-version-metric">
          <div className="retrain-version-metric-val">{pct(v.accuracy)}</div>
          <div className="retrain-version-metric-label">Accuracy</div>
        </div>
        <div className="retrain-version-metric">
          <div className="retrain-version-metric-val">{pct(v.f1)}</div>
          <div className="retrain-version-metric-label">F1 Score</div>
        </div>
        <div className="retrain-version-metric">
          <div className="retrain-version-metric-val">{pct(v.precision)}</div>
          <div className="retrain-version-metric-label">Precision</div>
        </div>
        <div className="retrain-version-metric">
          <div className="retrain-version-metric-val">{pct(v.recall)}</div>
          <div className="retrain-version-metric-label">Recall</div>
        </div>
      </div>

      <div className="retrain-version-footer">
        <div>
          <div className="retrain-version-date">{fmtD(v.created_at)}</div>
          {v.dataset_size != null && (
            <div className="retrain-version-date" style={{ marginTop: 2 }}>
              {v.dataset_size} training samples
            </div>
          )}
        </div>
        {canPromote ? (
          <button
            className="retrain-btn promote sm"
            disabled={promoting === v.id}
            onClick={() => onPromote(v.id)}
          >
            <FiAward size={12} />
            {promoting === v.id ? 'Promoting…' : 'Promote'}
          </button>
        ) : lowerAcc ? (
          <span style={{ fontSize: '0.7rem', color: '#334155' }}>Lower accuracy</span>
        ) : null}
      </div>
    </motion.div>
  );
}

/* ── LearningCurvePanel ──────────────────────────────── */
function LearningCurvePanel({ jobId }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    getJobEpochs(jobId)
      .then(res => setData(res.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading) return <div className="retrain-skel" style={{ height: 220, borderRadius: 8 }} />;
  if (!data || data.length === 0)
    return <div style={{ color: '#475569', fontSize: '0.82rem', padding: '12px 0' }}>No epoch data yet.</div>;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 6 }}>
        Learning Curves — Job #{jobId}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 20, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="epoch" tick={{ fill: '#64748b', fontSize: 11 }} label={{ value: 'Epoch', position: 'insideBottom', offset: -2, fill: '#475569', fontSize: 11 }} />
          <YAxis yAxisId="loss" tick={{ fill: '#64748b', fontSize: 11 }} domain={['auto', 'auto']} />
          <YAxis yAxisId="acc"  orientation="right" tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, 100]} tickFormatter={v => `${v.toFixed(0)}%`} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: '0.78rem' }}
            formatter={(value, name) => {
              if (name === 'val_accuracy') return [`${Number(value).toFixed(2)}%`, 'Val Acc'];
              return [value?.toFixed(4), name === 'train_loss' ? 'Train Loss' : 'Val Loss'];
            }}
          />
          <Legend wrapperStyle={{ fontSize: '0.76rem', paddingTop: 8 }} />
          <Line yAxisId="loss" type="monotone" dataKey="train_loss" stroke="#3b82f6" strokeWidth={2} dot={false} name="train_loss" />
          <Line yAxisId="loss" type="monotone" dataKey="val_loss"   stroke="#f97316" strokeWidth={2} dot={false} name="val_loss" />
          <Line yAxisId="acc"  type="monotone" dataKey="val_accuracy" stroke="#22c55e" strokeWidth={2} dot={false} name="val_accuracy" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── ArtifactsPanel ──────────────────────────────────── */
const ARTIFACT_ICONS = { image: <FiImage size={13} />, json: <FiFile size={13} />, csv: <FiFile size={13} /> };

function ArtifactsPanel({ jobId }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    getJobArtifacts(jobId)
      .then(res => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading) return <div className="retrain-skel" style={{ height: 60, borderRadius: 8, marginTop: 12 }} />;
  if (!data || data.artifacts.length === 0)
    return <div style={{ color: '#475569', fontSize: '0.82rem', padding: '12px 0' }}>No evaluation artifacts yet.</div>;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 8 }}>
        Evaluation Artifacts — Job #{jobId}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {data.artifacts.map(a => (
          <a
            key={a.name}
            href={`${API_BASE_URL}${a.url}`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6,
              padding: '5px 10px', color: '#93c5fd', fontSize: '0.76rem',
              textDecoration: 'none',
            }}
            title={`${a.size_bytes.toLocaleString()} bytes`}
          >
            {ARTIFACT_ICONS[a.kind] ?? <FiFile size={13} />}
            {a.name}
          </a>
        ))}
      </div>
    </div>
  );
}

/* ── JobDetailDrawer ─────────────────────────────────── */
function JobDetailDrawer({ job, onClose }) {
  if (!job) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      style={{
        background: '#0a1628', border: '1px solid #1e293b', borderRadius: 10,
        padding: '18px 22px', marginTop: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.88rem' }}>
          <FiBarChart2 size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Job #{job.id} — {job.model_name}
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '1.1rem' }}
        >×</button>
      </div>
      <LearningCurvePanel jobId={job.id} />
      <ArtifactsPanel jobId={job.id} />
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════
   Main RetrainingPage
   ══════════════════════════════════════════════════════ */
const RetrainingPage = () => {
  /* ── State ─────────────────────────────────────────── */
  const [dataset,    setDataset]    = useState(null);
  const [queue,      setQueue]      = useState([]);
  const [jobs,       setJobs]       = useState([]);
  const [versions,   setVersions]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState(null);

  const [building,   setBuilding]   = useState(false);
  const [clearing,   setClearing]   = useState(false);
  const [training,   setTraining]   = useState(false);
  const [promoting,  setPromoting]  = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [startModel, setStartModel] = useState('');
  const [startNotes, setStartNotes] = useState('');

  // Training mode & hyperparameters
  const [trainingMode, setTrainingMode] = useState('full_finetune');
  const [hpOpen,       setHpOpen]       = useState(false);
  const [hpEpochs,     setHpEpochs]     = useState(30);
  const [hpBatch,      setHpBatch]      = useState(8);
  const [hpLR,         setHpLR]         = useState(0.0001);
  const [hpPatience,   setHpPatience]   = useState(7);
  const [hpScheduler,  setHpScheduler]  = useState('plateau');

  const pollRef = useRef(null);

  /* ── Derived ───────────────────────────────────────── */
  const modelOptions = useMemo(() =>
    [...new Set(queue.map((q) => q.model_name))].filter(Boolean),
  [queue]);

  const activeByModel = useMemo(() => {
    const map = {};
    versions.forEach(v => { if (v.status === 'active') map[v.model_name] = v; });
    return map;
  }, [versions]);

  const pipelineStatus = useMemo(() => {
    const totalVer = dataset?.total_verified_images ?? 0;
    return {
      inspect:    totalVer > 0                                            ? 'done'   : 'inactive',
      verify:     totalVer > 0                                            ? 'done'   : 'inactive',
      queue:      queue.length > 0                                        ? 'done'   : totalVer > 0 ? 'active' : 'inactive',
      retrain:    training                                                ? 'active' : jobs.length > 0 ? 'done' : queue.length > 0 ? 'active' : 'inactive',
      evaluate:   jobs.some(j => j.accuracy_after != null)               ? 'done'   : jobs.length > 0 ? 'active' : 'inactive',
      promote:    versions.some(v => v.status === 'active')              ? 'done'   : versions.some(v => v.status === 'candidate') ? 'active' : 'inactive',
      production: versions.some(v => v.status === 'active')              ? 'done'   : 'inactive',
    };
  }, [dataset, queue, jobs, versions, training]);

  /* ── Load ──────────────────────────────────────────── */
  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const [dsRes, qRes, jobRes, verRes] = await Promise.allSettled([
      getRetrainingDataset(),
      getRetrainingQueue(),
      getRetrainingJobs(),
      getModelVersions(),
    ]);

    if (dsRes.status  === 'fulfilled') setDataset(dsRes.value.data);
    if (qRes.status   === 'fulfilled') setQueue(Array.isArray(qRes.value.data)      ? qRes.value.data      : []);
    if (jobRes.status === 'fulfilled') setJobs(Array.isArray(jobRes.value.data)     ? jobRes.value.data    : []);
    if (verRes.status === 'fulfilled') setVersions(Array.isArray(verRes.value.data) ? verRes.value.data    : []);

    const firstFail = [dsRes, qRes, jobRes, verRes].find(r => r.status === 'rejected');
    if (firstFail) {
      setError(firstFail.reason?.response?.data?.detail || 'Failed to load some data.');
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadAll(false); }, [loadAll]);

  // Auto-poll every 5 s while any job is in an active state
  useEffect(() => {
    const ACTIVE = new Set(['queued', 'running', 'evaluating', 'exporting']);
    const hasActive = jobs.some(j => ACTIVE.has(j.status));
    if (hasActive) {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => loadAll(true), 5000);
      }
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {};
  }, [jobs, loadAll]);

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  useEffect(() => {
    if (!startModel && modelOptions.length > 0) setStartModel(modelOptions[0]);
  }, [modelOptions, startModel]);

  /* ── Handlers ──────────────────────────────────────── */
  async function handleBuildQueue() {
    setBuilding(true);
    try {
      const res = await buildRetrainingQueue(null);
      toast.success(res.data.message || 'Queue built.');
      await loadAll(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to build queue.');
    } finally {
      setBuilding(false);
    }
  }

  async function handleClearQueue() {
    if (!window.confirm('Clear the entire retraining queue? This cannot be undone.')) return;
    setClearing(true);
    try {
      await clearRetrainingQueue();
      toast.success('Retraining queue cleared.');
      await loadAll(true);
    } catch (err) {
      toast.error('Failed to clear queue.');
    } finally {
      setClearing(false);
    }
  }

  async function handleStartTraining() {
    if (!startModel) { toast.warn('Select a model first.'); return; }
    setTraining(true);
    try {
      const res = await startRetraining(
        startModel,
        trainingMode,
        startNotes || null,
        { epochs: hpEpochs, batch_size: hpBatch, learning_rate: hpLR, patience: hpPatience, scheduler: hpScheduler },
      );
      toast.info(`Training job #${res.data.id} queued — training started in background.`);
      setStartNotes('');
      await loadAll(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to start retraining.');
    } finally {
      setTraining(false);
    }
  }

  async function handleCancel(jobId) {
    setCancelling(jobId);
    try {
      await cancelRetrainingJob(jobId);
      toast.success(`Job #${jobId} cancelled.`);
      await loadAll(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to cancel job.');
    } finally {
      setCancelling(null);
    }
  }

  async function handlePromote(versionId) {
    setPromoting(versionId);
    try {
      const res = await promoteModelVersion(versionId, 'Promoted via UI');
      toast.success(`Version "${res.data.version}" promoted to Active.`);
      await loadAll(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Promotion failed.');
    } finally {
      setPromoting(null);
    }
  }

  /* ── Stat cards ────────────────────────────────────── */
  const STATS = [
    { title: 'Verified Samples',  rawValue: dataset?.total_verified_images ?? 0,       icon: <FiDatabase />,      color: 'blue',   decimals: 0, suffix: '' },
    { title: 'Corrosion Samples', rawValue: dataset?.corrosion_count        ?? 0,       icon: <FiAlertTriangle />, color: 'red',    decimals: 0, suffix: '' },
    { title: 'No-Corrosion',      rawValue: dataset?.non_corrosion_count    ?? 0,       icon: <FiCheckCircle />,   color: 'green',  decimals: 0, suffix: '' },
    { title: 'Dataset Balance',   rawValue: (dataset?.dataset_balance ?? 0) * 100,      icon: <FiActivity />,      color: 'yellow', decimals: 1, suffix: '% corrosion' },
    { title: 'Queue Size',        rawValue: queue.length,                               icon: <FiList />,          color: 'purple', decimals: 0, suffix: '' },
    { title: 'Retraining Jobs',   rawValue: jobs.length,                                icon: <FiCpu />,           color: 'cyan',   decimals: 0, suffix: '' },
  ];

  const hasCandidates = versions.some(v => v.status === 'candidate');

  /* ── Render ────────────────────────────────────────── */
  return (
    <div className="retrain-page">

      {/* ── HERO ────────────────────────────────────── */}
      <div className="retrain-hero">
        <div className="retrain-hero-glow" />
        <div className="retrain-hero-glow-right" />

        <div className="retrain-hero-top">
          <div className="retrain-hero-top-left">
            <div className="retrain-hero-icon"><FiCpu /></div>
            <div>
              <p className="retrain-hero-eyebrow">AI Model Lifecycle Management</p>
              <h1 className="retrain-hero-title">Dataset & Retraining Center</h1>
            </div>
          </div>
          <div className="retrain-hero-actions">
            <button
              className={`retrain-refresh-btn${refreshing ? ' spinning' : ''}`}
              onClick={() => loadAll(true)}
              disabled={refreshing || loading}
            >
              <FiRefreshCw size={14} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <p className="retrain-hero-subtitle">
          Manage verified datasets, retrain AI models, and deploy improved versions.
        </p>

        <div className="retrain-stat-grid">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="retrain-stat-skeleton" />
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

      {/* ── ERROR ───────────────────────────────────── */}
      {error && (
        <div className="retrain-error-bar">
          <FiAlertTriangle size={15} />
          <span>{error}</span>
          <button className="retrain-retry-btn" onClick={() => loadAll(false)}>Retry</button>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          SELF-LEARNING PIPELINE
          ══════════════════════════════════════════════ */}
      <SectionHeading
        icon={<FiArrowRight size={15} />}
        title="Self-Learning Pipeline"
        subtitle="Status driven by real inspection and verification records"
        color="purple"
      />

      <Pipeline stepStatus={pipelineStatus} />

      {/* ══════════════════════════════════════════════
          RETRAINING CONTROLS
          ══════════════════════════════════════════════ */}
      <SectionHeading
        icon={<FiPlay size={15} />}
        title="Retraining Controls"
        subtitle="Build the dataset queue from verified inspections, then launch a retraining job"
        color="green"
      />

      <div className="retrain-card">
        <div className="retrain-card-header">
          <div>
            <div className="retrain-card-title">Dataset Queue Management</div>
            <div className="retrain-card-subtitle">
              {queue.length} item{queue.length !== 1 ? 's' : ''} in queue
              {dataset?.total_verified_images != null && ` · ${dataset.total_verified_images} total verified`}
            </div>
          </div>
          <div className="retrain-card-actions">
            <button
              className="retrain-btn primary"
              onClick={handleBuildQueue}
              disabled={building || loading}
            >
              <FiPlus size={14} />
              {building ? 'Building…' : 'Build Queue'}
            </button>
            <button
              className="retrain-btn danger"
              onClick={handleClearQueue}
              disabled={clearing || queue.length === 0}
            >
              <FiTrash2 size={14} />
              {clearing ? 'Clearing…' : 'Clear Queue'}
            </button>
          </div>
        </div>

        <div className="retrain-card-body">
          <div className="retrain-controls-row">
            <div className="retrain-form-group">
              <label className="retrain-form-label">Model to Retrain</label>
              <select
                className="retrain-select"
                value={startModel}
                onChange={(e) => setStartModel(e.target.value)}
                disabled={training || modelOptions.length === 0}
              >
                {modelOptions.length === 0
                  ? <option value="">No models in queue — build queue first</option>
                  : modelOptions.map((m) => <option key={m} value={m}>{m}</option>)
                }
              </select>
            </div>

            <div className="retrain-form-group">
              <label className="retrain-form-label">Training Mode</label>
              <select
                className="retrain-select"
                value={trainingMode}
                onChange={(e) => setTrainingMode(e.target.value)}
                disabled={training}
              >
                <option value="classifier_only">Classifier Only (fastest)</option>
                <option value="partial_finetune">Partial Fine-tune</option>
                <option value="full_finetune">Full Fine-tune (best quality)</option>
              </select>
            </div>

            <div className="retrain-form-group" style={{ flex: 1, minWidth: 180 }}>
              <label className="retrain-form-label">Notes (optional)</label>
              <input
                type="text"
                className="retrain-input"
                value={startNotes}
                onChange={(e) => setStartNotes(e.target.value)}
                placeholder="e.g. After adding 15 new verified samples"
                disabled={training}
              />
            </div>

            <button
              className="retrain-btn success"
              onClick={handleStartTraining}
              disabled={training || modelOptions.length === 0}
              style={{ alignSelf: 'flex-end' }}
            >
              <FiPlay size={14} />
              {training ? 'Queuing…' : 'Start Retraining'}
            </button>
          </div>

          {/* Hyperparameter accordion */}
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="retrain-btn"
              style={{ fontSize: '0.78rem', padding: '4px 10px', color: '#94a3b8', background: 'transparent', border: '1px solid #1e293b' }}
              onClick={() => setHpOpen(o => !o)}
            >
              <FiSliders size={12} />
              {hpOpen ? 'Hide' : 'Show'} Hyperparameters
            </button>
            {hpOpen && (
              <div className="retrain-controls-row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                <div className="retrain-form-group" style={{ minWidth: 110 }}>
                  <label className="retrain-form-label">Epochs</label>
                  <input type="number" className="retrain-input" min={1} max={200} value={hpEpochs}
                    onChange={e => setHpEpochs(Number(e.target.value))} disabled={training} />
                </div>
                <div className="retrain-form-group" style={{ minWidth: 110 }}>
                  <label className="retrain-form-label">Batch Size</label>
                  <input type="number" className="retrain-input" min={1} max={128} value={hpBatch}
                    onChange={e => setHpBatch(Number(e.target.value))} disabled={training} />
                </div>
                <div className="retrain-form-group" style={{ minWidth: 130 }}>
                  <label className="retrain-form-label">Learning Rate</label>
                  <input type="number" className="retrain-input" step="0.00001" min={0.00001} max={0.1} value={hpLR}
                    onChange={e => setHpLR(Number(e.target.value))} disabled={training} />
                </div>
                <div className="retrain-form-group" style={{ minWidth: 100 }}>
                  <label className="retrain-form-label">Patience</label>
                  <input type="number" className="retrain-input" min={1} max={50} value={hpPatience}
                    onChange={e => setHpPatience(Number(e.target.value))} disabled={training} />
                </div>
                <div className="retrain-form-group" style={{ minWidth: 120 }}>
                  <label className="retrain-form-label">Scheduler</label>
                  <select className="retrain-select" value={hpScheduler}
                    onChange={e => setHpScheduler(e.target.value)} disabled={training}>
                    <option value="plateau">ReduceLROnPlateau</option>
                    <option value="cosine">CosineAnnealing</option>
                    <option value="cosine_warm">CosineWarmRestarts</option>
                    <option value="step">StepLR</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {queue.length === 0 && (
            <div className="retrain-warning-note">
              <FiAlertTriangle size={14} />
              Build the retraining queue before starting a job.
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          RETRAINING QUEUE
          ══════════════════════════════════════════════ */}
      <SectionHeading
        icon={<FiList size={15} />}
        title="Retraining Queue"
        subtitle="Verified inspection samples queued for the next training run"
      />

      <div className="retrain-card">
        <div className="retrain-card-header">
          <div>
            <div className="retrain-card-title">Queue Contents</div>
            <div className="retrain-card-subtitle">{queue.length} item{queue.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div className="retrain-card-body" style={{ padding: '0 0 4px' }}>
          {loading
            ? <div className="retrain-skel" style={{ height: 120, margin: 18 }} />
            : <QueueTable queue={queue} />
          }
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          RETRAINING JOBS
          ══════════════════════════════════════════════ */}
      <SectionHeading
        icon={<FiClock size={15} />}
        title="Retraining Job History"
        subtitle="Historical record of completed retraining runs with stored metrics"
        color="amber"
      />

      <div className="retrain-card">
        <div className="retrain-card-header">
          <div>
            <div className="retrain-card-title">Job Records</div>
            <div className="retrain-card-subtitle">
              {jobs.length} job{jobs.length !== 1 ? 's' : ''} recorded
            </div>
          </div>
        </div>
        <div className="retrain-card-body" style={{ padding: '0 0 4px' }}>
          {loading
            ? <div className="retrain-skel" style={{ height: 160, margin: 18 }} />
            : <JobsTable
                jobs={jobs}
                onCancel={handleCancel}
                cancelling={cancelling}
                onSelect={setSelectedJob}
                selectedJobId={selectedJob?.id}
              />
          }
          {selectedJob && (
            <div style={{ padding: '0 18px 18px' }}>
              <JobDetailDrawer job={selectedJob} onClose={() => setSelectedJob(null)} />
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          MODEL VERSIONS
          ══════════════════════════════════════════════ */}
      <SectionHeading
        icon={<FiAward size={15} />}
        title="Model Versions"
        subtitle="All tracked model versions — active, candidate, and archived"
        color="purple"
      />

      {hasCandidates && (
        <div className="retrain-promote-bar">
          <div className="retrain-promote-bar-icon"><FiAward size={18} /></div>
          <div className="retrain-promote-bar-text">
            <div className="retrain-promote-bar-title">Candidate versions available for promotion</div>
            <div className="retrain-promote-bar-sub">
              Promote a candidate to Active when its accuracy exceeds the current active version for the same model.
            </div>
          </div>
        </div>
      )}

      <div className="retrain-card">
        <div className="retrain-card-header">
          <div>
            <div className="retrain-card-title">Version Registry</div>
            <div className="retrain-card-subtitle">
              {versions.filter(v => v.status === 'active').length} active
              &nbsp;·&nbsp;{versions.filter(v => v.status === 'candidate').length} candidate
              &nbsp;·&nbsp;{versions.filter(v => v.status === 'archived').length} archived
            </div>
          </div>
        </div>
        <div className="retrain-card-body">
          {loading ? (
            <div className="retrain-version-grid">
              {[0, 1, 2].map(i => (
                <div key={i} className="retrain-skel" style={{ height: 210 }} />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="retrain-empty">
              <div className="retrain-empty-icon"><FiPackage /></div>
              No model versions yet. Start a retraining job to create the first candidate.
            </div>
          ) : (
            <div className="retrain-version-grid">
              {versions.map((v) => (
                <VersionCard
                  key={v.id}
                  v={v}
                  activeForModel={activeByModel[v.model_name]}
                  onPromote={handlePromote}
                  promoting={promoting}
                />
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default RetrainingPage;
