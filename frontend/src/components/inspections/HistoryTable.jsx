import React from 'react';
import '../../styles/components.css';

const HistoryTable = ({ inspections, onDetailsClick }) => {
    if (!inspections || inspections.length === 0) {
        return <p>No inspection history found.</p>;
    }

    return (
        <div className="table-container">
            <table className="history-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Prediction</th>
                        <th>Confidence</th>
                        <th>Severity</th>
                        <th>Model Used</th>
                        <th>Timestamp</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {inspections.map((item) => (
                        <tr key={item.id}>
                            <td>{item.id}</td>
                            <td>
                                {item.prediction_class === "corrosion"
                                    ? "Corrosion"
                                    : item.prediction_class === "no_corrosion"
                                        ? "Non-Corrosion"
                                        : "N/A"}
                            </td>
                            <td>
                                {Number.isFinite(item.confidence)
                                    ? `${(item.confidence * 100).toFixed(2)}%`
                                    : "N/A"}
                            </td>
                            <td>
                                {item.severity || "None"}
                            </td>
                            <td>{item.model_used}</td>
                            <td>{new Date(item.timestamp).toLocaleString()}</td>
                            <td>
                                <button className="btn-primary" onClick={() => onDetailsClick(item.id)}>
                                    View Details
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default HistoryTable;
