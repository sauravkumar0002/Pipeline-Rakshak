import React from 'react';
import { motion } from 'framer-motion';
import { FiCheckCircle, FiAlertCircle, FiClock, FiLayers, FiCpu } from 'react-icons/fi';

const MiniCard = ({ icon, label, value, color, delay }) => (
    <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay }}
        style={{
            background: `linear-gradient(135deg, ${color}14, ${color}08)`,
            border: `1px solid ${color}30`,
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
        }}
    >
        <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${color}20`, border: `1px solid ${color}35`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color, fontSize: 17, flexShrink: 0,
        }}>
            {icon}
        </div>
        <div>
            <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
                {label}
            </div>
            <div style={{ color: '#f1f5f9', fontSize: 20, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {value}
            </div>
        </div>
    </motion.div>
);

const LiveSummary = ({ summary, activeModel, loading }) => {
    if (loading) return null;

    const { verified_count = 0, unverified_count = 0, flagged_count = 0, retraining_queue_count = 0 } = summary;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>
                    Live Summary
                </h3>
                {activeModel && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: '#3b82f615', border: '1px solid #3b82f630',
                        borderRadius: 8, padding: '4px 10px',
                    }}>
                        <FiCpu size={11} style={{ color: '#3b82f6' }} />
                        <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>
                            {activeModel}
                        </span>
                    </div>
                )}
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 10,
            }}>
                <MiniCard icon={<FiCheckCircle />} label="Verified Samples"   value={verified_count}           color="#10b981" delay={0.35} />
                <MiniCard icon={<FiClock />}       label="Pending Reviews"    value={unverified_count}         color="#f59e0b" delay={0.4}  />
                <MiniCard icon={<FiAlertCircle />} label="Flagged for RT"     value={flagged_count}            color="#ef4444" delay={0.45} />
                <MiniCard icon={<FiLayers />}      label="Retraining Queue"   value={retraining_queue_count}   color="#8b5cf6" delay={0.5}  />
            </div>
        </motion.div>
    );
};

export default LiveSummary;
