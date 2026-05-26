import React from 'react';
import { motion } from 'framer-motion';
import StatCard from './StatCard';
import SystemStatusCard from './SystemStatusCard';
import LiveSummary from './LiveSummary';
import {
    FiActivity, FiAlertTriangle, FiCheckCircle,
    FiPercent, FiTrendingUp,
} from 'react-icons/fi';

const STAT_CARDS = (metrics) => {
    const total     = metrics.total_inspections || 0;
    const corrosion = metrics.corrosion_detected || 0;
    const detRate   = total > 0 ? parseFloat(((corrosion / total) * 100).toFixed(1)) : 0;

    return [
        {
            title:    'Total Inspections',
            rawValue: total,
            icon:     <FiActivity />,
            color:    'blue',
            suffix:   '',
            decimals: 0,
        },
        {
            title:    'Corrosion Detected',
            rawValue: corrosion,
            icon:     <FiAlertTriangle />,
            color:    'red',
            suffix:   '',
            decimals: 0,
        },
        {
            title:    'Healthy Images',
            rawValue: metrics.healthy_images,
            icon:     <FiCheckCircle />,
            color:    'green',
            suffix:   '',
            decimals: 0,
        },
        {
            title:    'Avg Confidence',
            rawValue: parseFloat((metrics.average_confidence * 100).toFixed(2)),
            icon:     <FiPercent />,
            color:    'yellow',
            suffix:   '%',
            decimals: 1,
        },
        {
            title:    'Detection Rate',
            rawValue: detRate,
            icon:     <FiTrendingUp />,
            color:    'purple',
            suffix:   '%',
            decimals: 1,
        },
    ];
};

const DashboardGrid = ({ metrics, summary, activeModel, loading }) => {
    const cards = STAT_CARDS(metrics);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* KPI Stat Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                gap: 16,
            }}>
                {cards.map((card, i) => (
                    <StatCard
                        key={card.title}
                        title={card.title}
                        rawValue={card.rawValue}
                        icon={card.icon}
                        color={card.color}
                        suffix={card.suffix}
                        decimals={card.decimals}
                        loading={loading}
                        delay={i * 0.07}
                    />
                ))}
            </div>

            {/* Middle row: Live Summary + System Status */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 16,
            }}>
                <LiveSummary summary={summary} activeModel={activeModel} loading={loading} />
                <SystemStatusCard />
            </div>

        </div>
    );
};

export default DashboardGrid;

