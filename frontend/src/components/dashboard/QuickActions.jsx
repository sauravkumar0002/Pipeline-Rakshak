import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { FiCamera, FiClock, FiCheckSquare, FiBarChart2, FiRefreshCw, FiCpu } from 'react-icons/fi';

const ACTIONS = [
    { label: 'Run Inspection',      icon: <FiCamera />,      path: '/inspect',      color: '#3b82f6' },
    { label: 'View History',        icon: <FiClock />,       path: '/history',      color: '#8b5cf6' },
    { label: 'Verify Predictions',  icon: <FiCheckSquare />, path: '/verification', color: '#10b981' },
    { label: 'Analytics',           icon: <FiBarChart2 />,   path: '/analytics',    color: '#f59e0b' },
    { label: 'Retraining',          icon: <FiRefreshCw />,   path: '/retraining',   color: '#ef4444' },
    { label: 'Model Hub',           icon: <FiCpu />,         path: '/models',       color: '#06b6d4' },
];

const QuickActions = () => {
    const navigate = useNavigate();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            style={{
                background: 'linear-gradient(145deg, rgba(15,31,51,0.95), rgba(22,40,62,0.88))',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: 16,
                padding: '20px 22px',
                border: '1px solid rgba(255,255,255,0.07)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
            }}
        >
            <h3 style={{ margin: '0 0 16px', color: '#e2e8f0', fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>
                Quick Actions
            </h3>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
            }}>
                {ACTIONS.map(({ label, icon, path, color }, i) => (
                    <motion.button
                        key={path}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.35, delay: 0.55 + i * 0.06 }}
                        whileHover={{
                            scale: 1.04,
                            boxShadow: `0 8px 24px rgba(0,0,0,0.4), 0 0 16px ${color}30`,
                            transition: { type: 'spring', stiffness: 400, damping: 20 },
                        }}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => navigate(path)}
                        style={{
                            background: `linear-gradient(135deg, ${color}18, ${color}0a)`,
                            border: `1px solid ${color}35`,
                            borderRadius: 12,
                            padding: '12px 8px',
                            cursor: 'pointer',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', gap: 7,
                            color: color,
                        }}
                    >
                        <span style={{ fontSize: 20 }}>{icon}</span>
                        <span style={{
                            fontSize: 10, fontWeight: 600, color: '#94a3b8',
                            textAlign: 'center', letterSpacing: '0.02em',
                            lineHeight: 1.3,
                        }}>
                            {label}
                        </span>
                    </motion.button>
                ))}
            </div>
        </motion.div>
    );
};

export default QuickActions;
