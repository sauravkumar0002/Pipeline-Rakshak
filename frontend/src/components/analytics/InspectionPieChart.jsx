import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import '../../styles/components.css';

const COLORS = ['#3b82f6', '#ef4444', '#10b981'];

const InspectionPieChart = ({ data }) => {
    const safeData = data && typeof data === 'object' ? data : {};
    const chartData = [
        { name: 'Corrosion', value: safeData.corrosion_count || 0 },
        { name: 'No Corrosion', value: safeData.no_corrosion_count || 0 },
        { name: 'Verified', value: safeData.verified_count || 0 },
    ];

    return (
        <div className="chart-container">
            <h3 className="chart-title">Inspection Overview</h3>
            <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                    >
                        {Array.isArray(chartData) ? chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        )) : null}
                    </Pie>
                    <Tooltip />
                    <Legend />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export default InspectionPieChart;
