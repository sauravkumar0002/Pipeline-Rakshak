import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FiAlertTriangle,
  FiCamera,
  FiCheckCircle,
  FiClock,
  FiCpu,
  FiSave,
  FiVideo,
  FiVideoOff,
  FiZap,
} from 'react-icons/fi';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getLiveDetectionStatus,
  processLiveFrame,
  startLiveSession,
  stopLiveSession,
} from '../services/api';
import './liveMonitoring.css';

// History entries stored for the chart; the table shows the last 20
const MAX_HISTORY = 100;
// Default capture interval in seconds (1 FPS)
const DEFAULT_INTERVAL_SEC = 1;

// ── Severity CSS class helper ─────────────────────────────────────
function severityClass(severity = '') {
  const s = severity.toLowerCase();
  if (s === 'high') return 'high';
  if (s === 'medium') return 'medium';
  if (s === 'low') return 'low';
  return 'minimal';
}

// ── Custom chart tooltip ──────────────────────────────────────────
function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: '#0a1628', border: '1px solid #1e293b', borderRadius: 8,
      padding: '8px 12px', fontSize: '0.75rem', color: '#94a3b8', minWidth: 130,
    }}>
      <div style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: 3 }}>
        {Number(d.confidence).toFixed(1)}%
      </div>
      <div>{d.prediction_class}</div>
      <div style={{ color: '#475569', marginTop: 2 }}>{d.timeLabel}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
export default function LiveMonitoring() {
  // ── Camera refs ─────────────────────────────────────────────────
  const videoRef        = useRef(null);
  const canvasRef       = useRef(null);
  const streamRef       = useRef(null);
  const intervalRef     = useRef(null);
  // Guard prevents concurrent frame captures when backend is slow
  const isProcessingRef = useRef(false);
  // Always points to the latest captureFrame so the interval never holds a stale closure
  const captureFrameRef = useRef(null);

  // ── UI state ────────────────────────────────────────────────────
  const [cameraActive,  setCameraActive]  = useState(false);
  const [cameraError,   setCameraError]   = useState(null);
  const [isProcessing,  setIsProcessing]  = useState(false);
  const [autoMode,          setAutoMode]          = useState(false);
  // saveCorrosionOnly: auto-save frames where corrosion is predicted (default ON)
  const [saveCorrosionOnly, setSaveCorrosionOnly]  = useState(true);
  // saveAllFrames: save every captured frame regardless of class (overrides saveCorrosionOnly)
  const [saveAllFrames,     setSaveAllFrames]      = useState(false);
  const [intervalSec,       setIntervalSec]        = useState(DEFAULT_INTERVAL_SEC);

  // ── Detection data ───────────────────────────────────────────────
  const [current,      setCurrent]      = useState(null);   // latest LiveDetectionResult
  const [history,      setHistory]      = useState([]);     // last MAX_HISTORY results
  const [sessionCount, setSessionCount] = useState(0);
  const [savedCount,   setSavedCount]   = useState(0);

  // ── System status ────────────────────────────────────────────────
  const [sysStatus, setSysStatus] = useState(null);         // LiveDetectionStatus

  // ── Frame error (per-capture, not camera error) ──────────────────
  const [frameError,  setFrameError]  = useState(null);

  // ── Fetch system status on mount ────────────────────────────────
  useEffect(() => {
    getLiveDetectionStatus()
      .then(r => setSysStatus(r.data))
      .catch(() => setSysStatus({ active_model: null, model_loaded: false }));
  }, []);

  // ── Start camera ─────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      // Acknowledge session start (triggers 503 if no model loaded)
      await startLiveSession();
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Could not start camera.';
      setCameraError(msg);
      // Release the stream if inference service rejected the start
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    }
  }, []);

  // ── Stop camera ──────────────────────────────────────────────────
  const stopCamera = useCallback(async () => {
    // Stop auto-capture first
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setAutoMode(false);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setIsProcessing(false);
    await stopLiveSession().catch(() => {});
  }, []);

  // ── Capture + process one frame ──────────────────────────────────
  const captureFrame = useCallback(async (forceSave = false) => {
    if (!videoRef.current || !canvasRef.current) return;
    if (!cameraActive) return;
    // Skip if the previous frame's inference hasn't returned yet
    if (isProcessingRef.current) return;

    isProcessingRef.current = true;
    setIsProcessing(true);
    setFrameError(null);

    try {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = canvas.toDataURL('image/jpeg', 0.8);

      // Snapshot button always saves; auto-mode respects the save toggles.
      const save          = forceSave || saveAllFrames;
      const saveCorrosion = !forceSave && !saveAllFrames && saveCorrosionOnly;
      const res = await processLiveFrame(imageData, save, saveCorrosion);
      const result = res.data;

      const now = new Date();
      const entry = {
        ...result,
        // Store confidence as 0-100 for chart domain=[0,100]
        confidence: result.confidence * 100,
        timestamp: now,
        timeLabel: now.toLocaleTimeString(),
      };

      setCurrent(entry);
      setHistory(prev => [entry, ...prev].slice(0, MAX_HISTORY));
      setSessionCount(c => c + 1);
      if (result.saved) setSavedCount(c => c + 1);
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Frame processing failed.';
      setFrameError(msg);
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [cameraActive, saveAllFrames, saveCorrosionOnly]);

  // Keep captureFrameRef pointing to the latest captureFrame so the
  // setInterval callback never holds a stale closure over save settings.
  useEffect(() => { captureFrameRef.current = captureFrame; }, [captureFrame]);

  // ── Auto-capture interval ─────────────────────────────────────────
  useEffect(() => {
    if (autoMode && cameraActive) {
      // Fire immediately, then every intervalSec seconds
      captureFrameRef.current(false);
      intervalRef.current = setInterval(() => captureFrameRef.current(false), intervalSec * 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoMode, cameraActive, intervalSec]);

  // ── Clean up on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Chart data (chronological for line chart) ─────────────────────
  const chartData = [...history].reverse();

  // ── Average confidence for KPI ────────────────────────────────────
  const avgConf = history.length
    ? (history.reduce((s, h) => s + h.confidence, 0) / history.length).toFixed(1)
    : '—';

  // ── Avg latency ───────────────────────────────────────────────────
  const avgLatency = history.length
    ? (history.reduce((s, h) => s + h.latency_ms, 0) / history.length).toFixed(0)
    : '—';

  // ── Status pill ───────────────────────────────────────────────────
  let pillClass = 'idle', pillLabel = 'Idle';
  if (cameraError) {
    pillClass = 'error'; pillLabel = 'Error';
  } else if (cameraActive && autoMode) {
    const isCorr = current &&
      current.prediction_class.toLowerCase().includes('corrosion') &&
      !current.prediction_class.toLowerCase().includes('no_corrosion');
    pillClass = isCorr ? 'corrosion' : 'detecting';
    pillLabel = isCorr ? 'Corrosion Found' : 'Detecting';
  } else if (cameraActive) {
    pillClass = 'streaming'; pillLabel = 'Streaming';
  }

  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="live-page">

      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="live-page-header">
        <div className="live-page-title">
          <div className="live-page-title-icon">
            <FiVideo size={22} />
          </div>
          <div>
            <h1>Live Monitoring</h1>
            <p>Real-time corrosion detection from camera feed</p>
          </div>
        </div>
        <div className={`live-status-pill ${pillClass}`}>
          <span className="live-pulse" />
          {pillLabel}
        </div>
      </div>

      {/* ── No model warning ─────────────────────────────────────── */}
      {sysStatus && !sysStatus.model_loaded && (
        <div className="live-no-model-notice" style={{ marginBottom: 20 }}>
          <FiAlertTriangle size={15} />
          No model is currently active. Go to{' '}
          <a href="/models" style={{ color: '#fbbf24', marginLeft: 4 }}>Model Management</a>
          &nbsp;to select a model before starting.
        </div>
      )}

      {/* ── KPI stats row ─────────────────────────────────────────── */}
      <div className="live-stats-row">
        <div className="live-kpi-card">
          <div className="live-kpi-icon blue"><FiCpu size={18} /></div>
          <div className="live-kpi-info">
            <div className="live-kpi-label">Active Model</div>
            <div
              className={`live-kpi-value ${sysStatus?.active_model ? '' : 'small'}`}
              title={sysStatus?.active_model ? sysStatus.active_model.replace('.onnx', '') : undefined}
            >
              {sysStatus?.active_model
                ? sysStatus.active_model.replace('.onnx', '')
                : 'None'}
            </div>
          </div>
        </div>

        <div className="live-kpi-card">
          <div className="live-kpi-icon green"><FiCamera size={18} /></div>
          <div className="live-kpi-info">
            <div className="live-kpi-label">Detections</div>
            <div className="live-kpi-value">{sessionCount}</div>
            <div className="live-kpi-sub">this session</div>
          </div>
        </div>

        <div className="live-kpi-card">
          <div className="live-kpi-icon purple"><FiSave size={18} /></div>
          <div className="live-kpi-info">
            <div className="live-kpi-label">Saved</div>
            <div className="live-kpi-value">{savedCount}</div>
            <div className="live-kpi-sub">inspections</div>
          </div>
        </div>

        <div className="live-kpi-card">
          <div className="live-kpi-icon cyan"><FiZap size={18} /></div>
          <div className="live-kpi-info">
            <div className="live-kpi-label">Avg Confidence</div>
            <div className="live-kpi-value">{avgConf}{history.length ? '%' : ''}</div>
          </div>
        </div>

        <div className="live-kpi-card">
          <div className="live-kpi-icon yellow"><FiClock size={18} /></div>
          <div className="live-kpi-info">
            <div className="live-kpi-label">Avg Latency</div>
            <div className="live-kpi-value">{avgLatency}{history.length ? ' ms' : ''}</div>
          </div>
        </div>
      </div>

      {/* ── Main grid: Camera | Results ──────────────────────────── */}
      <div className="live-main-grid">

        {/* ── Left: Camera panel ─────────────────────────────────── */}
        <div className="live-panel">
          <div className="live-panel-header">
            <div className="live-panel-header-left">
              <FiVideo size={15} />
              Camera Feed
            </div>
          </div>
          <div className="live-panel-body">

            {/* Video element */}
            <div className="live-camera-wrapper">
              <video
                ref={videoRef}
                className="live-video"
                muted
                playsInline
                style={{ display: cameraActive ? 'block' : 'none' }}
              />
              {/* Hidden canvas for frame capture */}
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {/* Placeholder when camera is off */}
              {!cameraActive && (
                <div className="live-camera-overlay">
                  <FiVideoOff size={48} />
                  <p>Camera not started</p>
                </div>
              )}

              {/* Overlay decorations when camera is active */}
              {cameraActive && (
                <>
                  <div className="live-corner tl" />
                  <div className="live-corner tr" />
                  <div className="live-corner bl" />
                  <div className="live-corner br" />
                  {autoMode && <div className="live-scan-line" />}
                </>
              )}

              {isProcessing && (
                <div className="live-processing-badge">
                  <div className="live-spinner" />
                  Processing…
                </div>
              )}
            </div>

            {/* Camera error */}
            {cameraError && (
              <div className="live-error-bar">
                <FiAlertTriangle size={15} />
                {cameraError}
              </div>
            )}

            {/* Frame-level error */}
            {frameError && !cameraError && (
              <div className="live-error-bar">
                <FiAlertTriangle size={15} />
                {frameError}
              </div>
            )}

            {/* Controls */}
            <div className="live-controls">
              {!cameraActive ? (
                <button
                  className="live-btn live-btn-primary"
                  onClick={startCamera}
                  disabled={sysStatus && !sysStatus.model_loaded}
                >
                  <FiVideo size={14} />
                  Start Camera
                </button>
              ) : (
                <button className="live-btn live-btn-danger" onClick={stopCamera}>
                  <FiVideoOff size={14} />
                  Stop Camera
                </button>
              )}

              <button
                className="live-btn live-btn-success"
                onClick={() => captureFrame(true)}
                disabled={!cameraActive || isProcessing}
              >
                <FiCamera size={14} />
                Snapshot
              </button>

              {/* Auto-mode toggle */}
              <label className="live-toggle-group">
                <label className="live-toggle">
                  <input
                    type="checkbox"
                    checked={autoMode}
                    onChange={e => setAutoMode(e.target.checked)}
                    disabled={!cameraActive}
                  />
                  <span className="live-toggle-track" />
                  <span className="live-toggle-thumb" />
                </label>
                Auto
              </label>

              {/* Save corrosion only toggle (default ON — auto-saves corrosion frames) */}
              <label className="live-toggle-group" title="Auto-save frames where corrosion is detected">
                <label className="live-toggle">
                  <input
                    type="checkbox"
                    checked={saveCorrosionOnly}
                    disabled={saveAllFrames}
                    onChange={e => setSaveCorrosionOnly(e.target.checked)}
                  />
                  <span className="live-toggle-track" />
                  <span className="live-toggle-thumb" />
                </label>
                Save Corrosion
              </label>

              {/* Save all frames toggle */}
              <label className="live-toggle-group" title="Save every captured frame regardless of result">
                <label className="live-toggle">
                  <input
                    type="checkbox"
                    checked={saveAllFrames}
                    onChange={e => {
                      setSaveAllFrames(e.target.checked);
                      // Disable corrosion-only when save-all is active
                      if (e.target.checked) setSaveCorrosionOnly(false);
                    }}
                  />
                  <span className="live-toggle-track" />
                  <span className="live-toggle-thumb" />
                </label>
                Save All
              </label>

              {/* Interval */}
              {autoMode && (
                <div className="live-interval-control">
                  <FiClock size={13} />
                  every
                  <select
                    className="live-interval-select"
                    value={intervalSec}
                    onChange={e => setIntervalSec(Number(e.target.value))}
                  >
                    <option value={1}>1 s</option>
                    <option value={2}>2 s</option>
                    <option value={5}>5 s</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Current result panel ────────────────────────── */}
        <div className="live-panel">
          <div className="live-panel-header">
            <div className="live-panel-header-left">
              <FiCpu size={15} />
              Detection Result
            </div>
            {current && (
              <span style={{ fontSize: '0.72rem', color: '#475569' }}>
                {current.timeLabel}
              </span>
            )}
          </div>
          <div className="live-panel-body">
            {!current ? (
              <div className="live-result-empty">
                No detection yet — start camera and press Snapshot or enable Auto mode.
              </div>
            ) : (
              <div className={`live-result-card${(
                current.prediction_class.toLowerCase().includes('corrosion') &&
                !current.prediction_class.toLowerCase().includes('no_corrosion')
              ) ? ' corrosion-found' : current.confidence < 50 ? ' low-conf' : ' healthy'}`}>
                {/* Class + severity */}
                <div className="live-result-class">
                  <span className="live-class-label">
                    {current.prediction_class.replace(/_/g, ' ')}
                  </span>
                  <span className={`live-severity-badge ${severityClass(current.severity)}`}>
                    {current.severity}
                  </span>
                </div>

                {/* Confidence bar */}
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 4 }}>
                  Confidence <strong style={{ color: '#e2e8f0' }}>
                    {Number(current.confidence).toFixed(1)}%
                  </strong>
                </div>
                <div className="live-result-conf-bar">
                  <div
                    className="live-result-conf-fill"
                    style={{ width: `${Math.min(current.confidence, 100)}%` }}
                  />
                </div>

                {/* Meta row */}
                <div className="live-result-meta">
                  <span><strong>Model:</strong> {current.model_used.replace('.onnx', '')}</span>
                  <span><FiClock size={12} /><strong>Latency:</strong> {current.latency_ms.toFixed(1)} ms</span>
                  {current.inspection_id && (
                    <span>
                      <strong>ID:</strong>&nbsp;
                      <a className="live-id-link" href={`/history`}>#{current.inspection_id}</a>
                    </span>
                  )}
                </div>

                {/* Recommendation */}
                {current.recommendation && (
                  <div className="live-result-recommendation">
                    {current.recommendation}
                  </div>
                )}

                {/* Saved badge */}
                {current.saved && (
                  <div className="live-saved-badge">
                    <FiCheckCircle size={12} />
                    Saved to Inspection History (#{current.inspection_id})
                  </div>
                )}
              </div>
            )}

            {/* ── Confidence trend chart ──────────────────────────── */}
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: '0.72rem', color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                Confidence Trend (last {MAX_HISTORY})
              </div>
              {history.length === 0 ? (
                <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: '0.8rem' }}>
                  No data yet
                </div>
              ) : (
                <div className="live-chart-wrapper">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="timeLabel"
                        tick={{ fill: '#475569', fontSize: 10 }}
                        tickLine={false}
                        axisLine={{ stroke: '#1e293b' }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        domain={[0, 100]}
                        tickFormatter={v => `${v}%`}
                        tick={{ fill: '#475569', fontSize: 10 }}
                        tickLine={false}
                        axisLine={{ stroke: '#1e293b' }}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      {/* Warning threshold at 75% */}
                      <ReferenceLine
                        y={75}
                        stroke="rgba(251,191,36,0.4)"
                        strokeDasharray="4 3"
                        label={{ value: '75%', fill: '#fbbf24', fontSize: 9, position: 'right' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="confidence"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#1e293b', stroke: '#3b82f6', strokeWidth: 2 }}
                        activeDot={{ r: 5, fill: '#60a5fa' }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Full-width history table ──────────────────────────────── */}
      <div className="live-panel">
        <div className="live-panel-header">
          <div className="live-panel-header-left">
            <FiCamera size={15} />
            Detection History (last 20 shown)
          </div>
          <span style={{ fontSize: '0.72rem', color: '#475569' }}>
            {sessionCount} total this session
          </span>
        </div>
        <div className="live-panel-body" style={{ padding: '0 0 4px' }}>
          <div className="live-table-wrapper">
            {history.length === 0 ? (
              <div className="live-table-empty">No detections yet.</div>
            ) : (
              <table className="live-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Class</th>
                    <th>Confidence</th>
                    <th>Severity</th>
                    <th>Latency</th>
                    <th>Saved</th>
                    <th>ID</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 20).map((h, i) => (
                    <tr key={i}>
                      <td>{h.timeLabel}</td>
                      <td style={{ color: '#e2e8f0' }}>{h.prediction_class.replace(/_/g, ' ')}</td>
                      <td>
                        <span className="live-conf-text">{Number(h.confidence).toFixed(1)}%</span>
                      </td>
                      <td>
                        <span className={`live-severity-badge ${severityClass(h.severity)}`}>
                          {h.severity}
                        </span>
                      </td>
                      <td>{h.latency_ms.toFixed(1)} ms</td>
                      <td>
                        {h.saved
                          ? <span className="live-saved-dot" title="Saved to History" />
                          : <span className="live-unsaved-dash">—</span>}
                      </td>
                      <td>
                        {h.inspection_id
                          ? <a className="live-id-link" href="/history">#{h.inspection_id}</a>
                          : <span className="live-unsaved-dash">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
