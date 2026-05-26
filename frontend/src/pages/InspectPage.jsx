import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  FiActivity, FiAlertTriangle, FiCalendar, FiCheckCircle,
  FiClock, FiCpu, FiImage, FiRefreshCw, FiX, FiZap,
} from "react-icons/fi";
import {
  predictCorrosion,
  getModelList,
  getCurrentModel,
  selectModel,
} from "../services/api";
import "./inspect.css";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/bmp", "image/webp", "image/gif"];
const MAX_SIZE_MB = 10;

/* Severity is returned by the API — only defines display colours */
const SEVERITY_CONFIG = {
  High:    { color: "#ef4444", bg: "rgba(239,68,68,0.1)",    border: "rgba(239,68,68,0.25)" },
  Medium:  { color: "#f59e0b", bg: "rgba(245,158,11,0.1)",   border: "rgba(245,158,11,0.25)" },
  Low:     { color: "#3b82f6", bg: "rgba(59,130,246,0.1)",   border: "rgba(59,130,246,0.25)" },
  Minimal: { color: "#22c55e", bg: "rgba(34,197,94,0.1)",    border: "rgba(34,197,94,0.25)" },
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/* ── Animated SVG confidence ring ─────────────────────────── */
function ConfidenceRing({ value, color }) {
  const r = 50;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: 130, height: 130, flexShrink: 0 }}>
      <svg width="130" height="130" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="65" cy="65" r={r} fill="none" stroke="#0d1a2e" strokeWidth="11" />
        <circle
          cx="65" cy="65" r={r} fill="none"
          stroke={color} strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${circ}`}
          strokeDashoffset={`${circ * (1 - value)}`}
          style={{
            transition: "stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)",
            filter: `drop-shadow(0 0 8px ${color}99)`,
          }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: "1.45rem", fontWeight: 800, color, lineHeight: 1 }}>
          {(value * 100).toFixed(1)}%
        </span>
        <span style={{ fontSize: "0.58rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 3 }}>
          Confidence
        </span>
      </div>
    </div>
  );
}

/* ── Three-step workflow stepper ──────────────────────────── */
function WorkflowStepper({ step }) {
  const steps = [
    { num: 1, label: "Upload" },
    { num: 2, label: "Analysis" },
    { num: 3, label: "Results" },
  ];
  return (
    <div className="inspect-stepper">
      {steps.map((s, i) => {
        const done   = step > s.num;
        const active = step === s.num;
        return (
          <div key={s.num} style={{ display: "flex", alignItems: "flex-start" }}>
            <div className="inspect-step">
              <div className={`inspect-step-circle ${done ? "done" : active ? "active" : "idle"}`}>
                {done ? <FiCheckCircle size={18} /> : s.num}
              </div>
              <span
                className="inspect-step-label"
                style={{ color: active ? "#93c5fd" : done ? "#60a5fa" : "#334155" }}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="inspect-step-connector"
                style={{ background: step > s.num ? "linear-gradient(90deg,#1d4ed8,#3b82f6)" : "#0d1a2e" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ════════════════════════════════════════════════════════════ */
const InspectPage = () => {
  const [file, setFile]                     = useState(null);
  const [preview, setPreview]               = useState("");
  const [imgDims, setImgDims]               = useState(null);
  const [models, setModels]                 = useState([]);
  const [currentModel, setCurrentModel]     = useState("");
  const [loading, setLoading]               = useState(false);
  const [result, setResult]                 = useState(null);
  const [resultTimestamp, setResultTimestamp] = useState(null);
  const [dragOver, setDragOver]             = useState(false);
  const fileInputRef = useRef(null);

  /* Workflow: always starts at step 1 (Upload); only marks steps
     as "done" after they have genuinely completed. */
  const workflowStep = result ? 3 : loading ? 2 : 1;

  /* ── Load available models ──────────────────────────────── */
  async function fetchModels() {
    try {
      const [modelsRes, currentRes] = await Promise.all([
        getModelList(),
        getCurrentModel(),
      ]);
      const available = Array.isArray(modelsRes.data?.available_models)
        ? modelsRes.data.available_models
        : Array.isArray(modelsRes.data)
          ? modelsRes.data
          : [];
      setModels(available);
      const active =
        modelsRes.data?.active_model ||
        currentRes.data?.active_model ||
        currentRes.data?.model_name ||
        "";
      setCurrentModel(active);
    } catch {
      toast.error("Could not load model list.");
    }
  }

  useEffect(() => {
    void (async () => { await fetchModels(); })();
  }, []);

  /* ── File validation ────────────────────────────────────── */
  const validateFile = (f) => {
    if (!ALLOWED_TYPES.includes(f.type)) {
      toast.error("Unsupported file type. Please upload a JPEG, PNG, BMP, WebP, or GIF image.");
      return false;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`File is too large. Maximum allowed size is ${MAX_SIZE_MB} MB.`);
      return false;
    }
    return true;
  };

  const applyFile = (f) => {
    if (!f || !validateFile(f)) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setResultTimestamp(null);
    setImgDims(null);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) applyFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) applyFile(f);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  /* ── Model selection ────────────────────────────────────── */
  const handleModelSelect = async (modelName) => {
    setCurrentModel(modelName);
    try {
      await selectModel(modelName);
      toast.success(`Switched to model: ${modelName}`);
    } catch {
      toast.error("Model selection failed.");
    }
  };

  /* ── Inference ──────────────────────────────────────────── */
  const handlePredict = async () => {
    if (!file) {
      toast.warning("Please upload an image first.");
      return;
    }
    if (!currentModel) {
      toast.warning("No model selected. Please choose a model.");
      return;
    }
    try {
      setLoading(true);
      setResult(null);
      const formData = new FormData();
      formData.append("image_file", file);
      const response = await predictCorrosion(formData);
      setResult(response.data);
      setResultTimestamp(new Date().toLocaleString());
    } catch (err) {
      const detail = err?.response?.data?.detail || "Prediction failed. Please try again.";
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const clearImage = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview("");
    setResult(null);
    setResultTimestamp(null);
    setImgDims(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ── Derived values ─────────────────────────────────────── */
  const isCorrosion  = result?.prediction_class === "corrosion";
  const resultColor  = isCorrosion ? "#ef4444" : "#22c55e";
  const severityConf = SEVERITY_CONFIG[result?.severity];    /* undefined if severity absent */
  const modelList    = Array.isArray(models) ? models : [];

  /* Build metric cards only from values the API actually returned */
  const resultMetrics = result
    ? [
        result.latency_ms != null && {
          label: "Inference Time",
          value: `${result.latency_ms.toFixed(1)} ms`,
          icon: <FiClock size={13} />,
        },
        result.fps != null && {
          label: "FPS",
          value: result.fps.toFixed(1),
          icon: <FiActivity size={13} />,
        },
        (result.model_used || currentModel) && {
          label: "Model",
          value: result.model_used || currentModel,
          icon: <FiCpu size={13} />,
          mono: true,
        },
        resultTimestamp && {
          label: "Timestamp",
          value: resultTimestamp,
          icon: <FiCalendar size={13} />,
        },
      ].filter(Boolean)
    : [];

  return (
    <div className="page-fade-in" style={{ maxWidth: 1080 }}>

      {/* ══════════════════════════════════════════════════════
          HERO HEADER
          ══════════════════════════════════════════════════════ */}
      <div className="inspect-hero">
        <div className="inspect-hero-glow" />
        <div className="inspect-hero-glow-right" />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="inspect-hero-badges">
            <span className="inspect-badge-model">
              <FiCpu size={11} style={{ marginRight: 5, verticalAlign: "middle" }} />
              {currentModel || "Loading model…"}
            </span>
            <span className="inspect-badge-status">
              <span className="inspect-status-dot" />
              System Online
            </span>
            {loading && (
              <span className="inspect-badge-live">
                <span className="inspect-live-dot" />
                Live Inference
              </span>
            )}
          </div>
          <h1 className="inspect-hero-title">Corrosion Detection Center</h1>
          <p className="inspect-hero-subtitle">
            Upload images and perform AI-powered corrosion inspections.
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          WORKFLOW STEPPER
          ══════════════════════════════════════════════════════ */}
      <WorkflowStepper step={workflowStep} />

      {/* ══════════════════════════════════════════════════════
          MODEL SELECTION
          Model cards show only API-provided data: model name +
          active/select state. No hardcoded metrics.
          ══════════════════════════════════════════════════════ */}
      <p className="inspect-section-label">AI Model Selection</p>
      {modelList.length === 0 ? (
        <p style={{ color: "#f87171", fontSize: "0.88rem", marginBottom: 20 }}>
          No models available. Ensure backend is running.
        </p>
      ) : (
        <div className="inspect-model-grid">
          {modelList.map((model) => {
            const isActive = model === currentModel;
            return (
              <div
                key={model}
                className={`inspect-model-card${isActive ? " active" : ""}`}
                onClick={() => !isActive && handleModelSelect(model)}
                title={isActive ? "Currently active model" : `Switch to ${model}`}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <FiCpu size={15} style={{ color: isActive ? "#60a5fa" : "#374151", flexShrink: 0 }} />
                    <span style={{
                      fontFamily: "'Courier New', monospace",
                      fontSize: "0.82rem",
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? "#e2e8f0" : "#64748b",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {model}
                    </span>
                  </div>
                  {isActive ? (
                    <span style={{
                      padding: "2px 8px", borderRadius: "999px", flexShrink: 0,
                      background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.4)",
                      color: "#60a5fa", fontSize: "0.62rem", fontWeight: 700,
                    }}>
                      ACTIVE
                    </span>
                  ) : (
                    <span style={{
                      padding: "2px 8px", borderRadius: "999px", flexShrink: 0,
                      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                      color: "#334155", fontSize: "0.62rem", fontWeight: 600,
                    }}>
                      SELECT
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          UPLOAD + RESULTS (two-column)
          ══════════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>

        {/* ── LEFT: UPLOAD ──────────────────────────────────── */}
        <div className="inspect-panel">
          <p className="inspect-section-label" style={{ marginBottom: 14 }}>Image Upload</p>

          <div
            className={`inspect-drop-zone${dragOver ? " drag-over" : ""}${preview ? " has-image" : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={() => setDragOver(false)}
            onClick={() => !preview && fileInputRef.current?.click()}
          >
            {preview ? (
              <img
                src={preview}
                alt="Uploaded preview"
                onLoad={(e) => setImgDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
                style={{ maxWidth: "100%", maxHeight: 270, borderRadius: 8, objectFit: "contain" }}
              />
            ) : (
              <>
                <div className="inspect-drop-icon">
                  <FiImage size={22} color="#475569" />
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ margin: "0 0 5px", color: "#64748b", fontWeight: 500, fontSize: "0.9rem" }}>
                    Drop image here or{" "}
                    <span style={{ color: "#3b82f6", textDecoration: "underline" }}>browse</span>
                  </p>
                  <p style={{ margin: 0, color: "#334155", fontSize: "0.75rem" }}>
                    JPEG · PNG · BMP · WebP · GIF &nbsp;·&nbsp; Max {MAX_SIZE_MB} MB
                  </p>
                </div>
              </>
            )}
          </div>

          {preview && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                className="inspect-img-action-btn"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                <FiRefreshCw size={13} style={{ marginRight: 5 }} />
                Change Image
              </button>
            </div>
          )}

          {/* File metadata — all values from the File API, never from backend */}
          {file && (
            <div className="inspect-file-meta">
              <div className="inspect-file-meta-item">
                <div className="inspect-file-meta-label">Filename</div>
                <div className="inspect-file-meta-value" title={file.name}
                  style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {file.name}
                </div>
              </div>
              <div className="inspect-file-meta-item">
                <div className="inspect-file-meta-label">Size</div>
                <div className="inspect-file-meta-value">{formatBytes(file.size)}</div>
              </div>
              <div className="inspect-file-meta-item">
                <div className="inspect-file-meta-label">Format</div>
                <div className="inspect-file-meta-value">{file.type.split("/")[1]?.toUpperCase()}</div>
              </div>
              {imgDims && (
                <div className="inspect-file-meta-item">
                  <div className="inspect-file-meta-label">Resolution</div>
                  <div className="inspect-file-meta-value">{imgDims.w} x {imgDims.h}</div>
                </div>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(",")}
            onChange={handleFileChange}
            style={{ display: "none" }}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button
              className="inspect-run-btn"
              onClick={handlePredict}
              disabled={loading || !file}
            >
              {loading ? (
                <><div className="inspect-spinner" /> Analyzing…</>
              ) : (
                <><FiZap size={16} /> Run Inspection</>
              )}
            </button>
            {file && (
              <button className="inspect-clear-btn" onClick={clearImage}>
                <FiX size={15} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* ── RIGHT: RESULTS ────────────────────────────────── */}
        <div className="inspect-panel" style={{ minHeight: 360 }}>

          {/* ANALYZING */}
          {loading && (
            <div className="inspect-analyzing">
              <div className="inspect-analyze-orbit">
                <div className="inspect-analyze-ring" />
                <div className="inspect-analyze-ring-inner" />
                <div className="inspect-analyze-icon">
                  <FiZap size={22} color="#3b82f6" />
                </div>
              </div>
              <div>
                <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#93c5fd", fontSize: "1rem" }}>
                  AI Analysis in Progress
                </p>
                <p style={{ margin: 0, color: "#334155", fontSize: "0.82rem" }}>
                  Running inference with {currentModel}
                </p>
              </div>
            </div>
          )}

          {/* RESULT — all values are real API data */}
          {!loading && result && (
            <>
              {/* Confidence ring + prediction */}
              <div className="inspect-confidence-wrap">
                <ConfidenceRing value={result.confidence} color={resultColor} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "6px 14px", borderRadius: "999px",
                    background: isCorrosion ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.1)",
                    border: `1px solid ${resultColor}44`,
                    marginBottom: 10,
                  }}>
                    {isCorrosion
                      ? <FiAlertTriangle size={16} color={resultColor} />
                      : <FiCheckCircle size={16} color={resultColor} />
                    }
                    <span style={{ fontWeight: 800, color: resultColor, fontSize: "1rem" }}>
                      {isCorrosion ? "Corrosion Detected" : "No Corrosion"}
                    </span>
                  </div>

                  {/* Severity badge — only rendered when API returns severity */}
                  {isCorrosion && result.severity && severityConf && (
                    <div>
                      <span style={{
                        display: "inline-block", padding: "3px 10px", borderRadius: 6,
                        background: severityConf.bg, border: `1px solid ${severityConf.border}`,
                        color: severityConf.color,
                        fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.07em",
                        textTransform: "uppercase",
                      }}>
                        {result.severity} Severity
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Metric cards — only real values, no nulls or placeholders */}
              {resultMetrics.length > 0 && (
                <div className="inspect-result-grid">
                  {resultMetrics.map(({ label, value, icon, mono }, i) => (
                    <div
                      key={label}
                      className="inspect-metric-card"
                      style={{ animationDelay: `${i * 0.07}s` }}
                    >
                      <div className="inspect-metric-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        {icon}
                        {label}
                      </div>
                      <div
                        className="inspect-metric-value"
                        style={{
                          fontFamily: mono ? "'Courier New', monospace" : undefined,
                          fontSize: mono ? "0.75rem" : undefined,
                        }}
                      >
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recommendation — only rendered when API returns one */}
              {result.recommendation && (
                <div className="inspect-recommendation">
                  <div style={{
                    fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.09em",
                    color: "#3b82f6", marginBottom: 7, fontWeight: 700,
                  }}>
                    Recommendation
                  </div>
                  <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.86rem", lineHeight: 1.65 }}>
                    {result.recommendation}
                  </p>
                </div>
              )}
            </>
          )}

          {/* AWAITING */}
          {!loading && !result && (
            <div className="inspect-awaiting">
              <FiImage size={40} color="#1e293b" />
              <div>
                <p style={{ margin: "0 0 6px", fontWeight: 600, color: "#1e293b", fontSize: "0.95rem" }}>
                  Awaiting Inspection
                </p>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#1e293b" }}>
                  {file ? "Click Run Inspection to analyze the image" : "Upload an image to get started"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InspectPage;
