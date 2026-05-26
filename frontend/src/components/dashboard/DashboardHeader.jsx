import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FiCpu, FiActivity } from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';

const DashboardHeader = () => {
    const { user } = useAuth();
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const id = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    const greeting = () => {
        const h = time.getHours();
        if (h < 12) return 'Good Morning';
        if (h < 17) return 'Good Afternoon';
        return 'Good Evening';
    };

    const timeStr = time.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
    });
    const dateStr = time.toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata'
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 16,
                marginBottom: 32,
                padding: '24px 0 8px',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: 'linear-gradient(135deg, #3b82f630, #1d4ed820)',
                    border: '1px solid #3b82f640',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#3b82f6', fontSize: 22,
                }}>
                    <FiActivity />
                </div>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
                            {greeting()}, {user?.username || 'Operator'}
                        </h1>
                        <motion.span
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            style={{
                                background: '#10b98120', color: '#10b981', border: '1px solid #10b98140',
                                borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700,
                                letterSpacing: '0.05em', textTransform: 'uppercase',
                            }}
                        >
                            ● Live
                        </motion.span>
                    </div>
                    <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
                        Pipeline Rakshak — AI Corrosion Detection & Monitoring Platform
                    </p>
                </div>
            </div>

            <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginBottom: 2 }}>
                    <FiCpu style={{ color: '#3b82f6', fontSize: 13 }} />
                    <span style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
                        {timeStr}
                    </span>
                </div>
                <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>{dateStr} IST</p>
            </div>
        </motion.div>
    );
};

export default DashboardHeader;

