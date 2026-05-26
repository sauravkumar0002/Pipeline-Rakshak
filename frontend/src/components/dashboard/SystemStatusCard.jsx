import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiServer, FiDatabase, FiCpu, FiZap, FiLock, FiRefreshCw } from 'react-icons/fi';
import { API_BASE_URL } from '../../api/config';
import apiClient from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';

const PulseDot = ({ online }) => (
    <div style={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
        {online && (
            <motion.div
                animate={{ scale: [1, 2.2, 1], opacity: [0.7, 0, 0.7] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    background: '#10b981',
                }}
            />
        )}
        <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: online ? '#10b981' : '#ef4444',
            boxShadow: online ? '0 0 6px #10b98180' : '0 0 6px #ef444480',
        }} />
    </div>
);

const StatusRow = ({ icon, label, status, detail, online, loading }) => (
    <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
        <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: online ? '#10b98115' : '#ef444415',
            border: `1px solid ${online ? '#10b98130' : '#ef444430'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: online ? '#10b981' : '#ef4444', fontSize: 15, flexShrink: 0,
        }}>
            {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 500 }}>{label}</div>
            {detail && <div style={{ color: '#475569', fontSize: 11, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {loading ? (
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#334155', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ) : (
                <>
                    <PulseDot online={online} />
                    <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: online ? '#10b981' : '#ef4444',
                        background: online ? '#10b98115' : '#ef444415',
                        border: `1px solid ${online ? '#10b98130' : '#ef444430'}`,
                        borderRadius: 6, padding: '2px 7px',
                    }}>
                        {status}
                    </span>
                </>
            )}
        </div>
    </div>
);

const SystemStatusCard = () => {
    const { isAuthenticated, user } = useAuth();
    const [health, setHealth] = useState(null);
    const [dbOnline, setDbOnline] = useState(false);
    const [checking, setChecking] = useState(true);
    const [lastChecked, setLastChecked] = useState(null);

    const checkHealth = useCallback(async () => {
        setChecking(true);
        try {
            const [healthRes, dbRes] = await Promise.allSettled([
                fetch(`${API_BASE_URL}/health`).then(r => r.json()),
                apiClient.get('/v1/analytics/summary'),
            ]);
            if (healthRes.status === 'fulfilled') setHealth(healthRes.value);
            setDbOnline(dbRes.status === 'fulfilled');
            setLastChecked(new Date());
        } catch (_) {
            // no-op
        } finally {
            setChecking(false);
        }
    }, []);

    useEffect(() => {
        checkHealth();
        const id = setInterval(checkHealth, 20000);
        return () => clearInterval(id);
    }, [checkHealth]);

    const apiOnline  = health?.status === 'ok';
    const modelOnline = health?.model_loaded === true;
    const inferenceOnline = modelOnline && !!health?.active_model && health.active_model !== 'none';

    const checkedStr = lastChecked
        ? lastChecked.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
        : '—';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
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
                    System Status
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#475569', fontSize: 10 }}>Updated {checkedStr}</span>
                    <button
                        onClick={checkHealth}
                        disabled={checking}
                        style={{
                            background: 'none', border: '1px solid #2a3a55', borderRadius: 6,
                            padding: '3px 6px', cursor: checking ? 'not-allowed' : 'pointer',
                            color: '#64748b', display: 'flex', alignItems: 'center',
                        }}
                    >
                        <FiRefreshCw size={11} style={{ animation: checking ? 'spin 1s linear infinite' : 'none' }} />
                    </button>
                </div>
            </div>

            <StatusRow icon={<FiServer />}    label="API Server"      status={apiOnline ? 'Online' : 'Offline'}    online={apiOnline}      loading={checking} detail="FastAPI · Port 8001" />
            <StatusRow icon={<FiDatabase />}  label="Database"        status={dbOnline ? 'Online' : 'Offline'}     online={dbOnline}       loading={checking} detail="SQLite · Local" />
            <StatusRow icon={<FiCpu />}       label="Active Model"    status={modelOnline ? 'Loaded' : 'No Model'} online={modelOnline}    loading={checking} detail={health?.active_model || 'Not loaded'} />
            <StatusRow icon={<FiZap />}       label="Inference Engine" status={inferenceOnline ? 'Ready' : 'Idle'} online={inferenceOnline} loading={checking} detail="ONNX Runtime" />
            <StatusRow icon={<FiLock />}      label="Authentication"  status={isAuthenticated ? 'Active' : 'None'} online={isAuthenticated} loading={false} detail={user ? `${user.username} · ${user.role}` : 'Not signed in'} />
        </motion.div>
    );
};

export default SystemStatusCard;

