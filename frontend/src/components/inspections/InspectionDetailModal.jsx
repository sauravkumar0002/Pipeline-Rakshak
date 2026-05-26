import "../../styles/components.css";
import { API_BASE_URL } from '../../api/config';
const InspectionDetailModal = ({ inspection, onClose }) => {
    if (!inspection) return null;
    const imagePath = inspection.image_path || "";
    const hasImage = imagePath && imagePath !== "undefined" && imagePath.trim() !== "";
    const normalizedPath = imagePath.replace(/\\/g, "/");
    const backendBaseUrl = API_BASE_URL;
    const imageUrl = normalizedPath.startsWith("http")
        ? normalizedPath
        : `${backendBaseUrl}/${normalizedPath}`;

    const confidencePercent = Number.isFinite(inspection.confidence)
        ? `${(inspection.confidence * 100).toFixed(2)}%`
        : "N/A";

    const severityValue = inspection.severity || "None";

    const predictionLabel = inspection.prediction_class === "corrosion"
        ? "Corrosion"
        : inspection.prediction_class === "no_corrosion"
            ? "Non-Corrosion"
            : "N/A";

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Inspection Details (ID: {inspection.id})</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="modal-image-container">
                        {hasImage ? (
                            <img src={imageUrl} alt="Inspection" />
                        ) : (
                            <div className="no-image-card">No Image Available</div>
                        )}
                    </div>
                    <div className="modal-details">
                        <p><strong>Prediction:</strong> {predictionLabel}</p>
                        <p><strong>Confidence:</strong> {confidencePercent}</p>
                        <p><strong>Severity:</strong> {severityValue}</p>
                        <p><strong>Model Used:</strong> {inspection.model_used}</p>
                        <p><strong>Recommendation:</strong> {inspection.recommendation || 'None'}</p>
                        <p><strong>Verified:</strong> {inspection.is_verified ? 'Yes' : 'No'}</p>
                        <p><strong>Timestamp:</strong> {new Date(inspection.timestamp).toLocaleString()}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InspectionDetailModal;
