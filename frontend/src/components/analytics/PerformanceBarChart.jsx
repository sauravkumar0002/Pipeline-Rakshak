import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import '../../styles/components.css';

const PerformanceBarChart = ({ data }) => {
    const safeData = Array.isArray(data) ? data : [];
    const chartData = safeData.map(item => ({
        name: item.model_name,
        accuracy: item.accuracy * 100,
        precision: item.precision * 100,
        recall: item.recall * 100,
        f1_score: item.f1_score * 100,
    }));

    return (
        <div className="chart-container">
            <h3 className="chart-title">Model Performance Metrics (%)</h3>
            <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#1f2937',
                            borderColor: '#374151',
                        }}
                    />
                    <Legend />
                    <Bar dataKey="accuracy" fill="#8884d8" />
                    <Bar dataKey="precision" fill="#82ca9d" />
                    <Bar dataKey="recall" fill="#ffc658" />
                    <Bar dataKey="f1_score" fill="#ff8042" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default PerformanceBarChart;
