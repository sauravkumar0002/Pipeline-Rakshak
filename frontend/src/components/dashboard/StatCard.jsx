import React, { useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

const COLORS = {
    blue:   { base: '#3b82f6', dark: '#1d4ed8' },
    red:    { base: '#ef4444', dark: '#b91c1c' },
    green:  { base: '#10b981', dark: '#047857' },
    yellow: { base: '#f59e0b', dark: '#d97706' },
    purple: { base: '#8b5cf6', dark: '#6d28d9' },
    cyan:   { base: '#06b6d4', dark: '#0e7490' },
};

const CountUp = ({ to, decimals, prefix, suffix }) => {
    const motionVal = useMotionValue(0);
    const display = useTransform(motionVal, (v) => {
        const n = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString();
        return `${prefix}${n}${suffix}`;
    });

    useEffect(() => {
        const controls = animate(motionVal, to, {
            duration: 1.8,
            ease: [0.34, 1.2, 0.64, 1],
        });
        return controls.stop;
    }, [to]); // eslint-disable-line react-hooks/exhaustive-deps

    return <motion.span>{display}</motion.span>;
};

const SkeletonCard = () => (
    <div style={{
        background: 'linear-gradient(135deg, rgba(15,31,51,0.9), rgba(26,43,66,0.8))',
        borderRadius: 16,
        padding: '20px 24px',
        border: '1px solid rgba(255,255,255,0.06)',
        height: 120,
        overflow: 'hidden',
        position: 'relative',
    }}>
        <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
            animation: 'shimmer 1.6s ease-in-out infinite',
        }} />
    </div>
);

const StatCard = ({ title, rawValue, icon, color = 'blue', suffix = '', prefix = '', decimals = 0, loading, delay = 0 }) => {
    const { base, dark } = COLORS[color] || COLORS.blue;

    if (loading) return <SkeletonCard />;

    return (
        <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay, ease: [0.34, 1.2, 0.64, 1] }}
            whileHover={{
                y: -6,
                boxShadow: `0 20px 60px rgba(0,0,0,0.45), 0 0 30px ${base}30`,
                transition: { type: 'spring', stiffness: 320, damping: 22 },
            }}
            whileTap={{ scale: 0.97 }}
            style={{
                background: 'linear-gradient(145deg, rgba(15,31,51,0.95) 0%, rgba(22,40,62,0.88) 100%)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: 16,
                padding: '20px 24px',
                border: `1px solid ${base}28`,
                boxShadow: `0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)`,
                position: 'relative',
                overflow: 'hidden',
                cursor: 'default',
                userSelect: 'none',
            }}
        >
            {/* Radial glow corner */}
            <div style={{
                position: 'absolute', top: -20, right: -20,
                width: 90, height: 90, borderRadius: '50%',
                background: `radial-gradient(circle, ${base}25 0%, transparent 70%)`,
                pointerEvents: 'none',
            }} />
            {/* Bottom gradient strip */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(90deg, transparent, ${base}60, transparent)`,
            }} />

            {/* Icon */}
            <motion.div
                whileHover={{ scale: 1.12, rotate: 8 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 44, height: 44, borderRadius: 12,
                    background: `linear-gradient(135deg, ${base}30, ${dark}20)`,
                    border: `1px solid ${base}40`,
                    color: base, fontSize: 20, marginBottom: 14,
                    boxShadow: `0 4px 12px ${base}20`,
                }}
            >
                {icon}
            </motion.div>

            <p style={{
                margin: '0 0 5px',
                color: '#94a3b8',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
            }}>
                {title}
            </p>

            <div style={{ fontSize: 30, fontWeight: 800, color: '#f1f5f9', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                <CountUp to={rawValue} decimals={decimals} prefix={prefix} suffix={suffix} />
            </div>
        </motion.div>
    );
};

export default StatCard;

