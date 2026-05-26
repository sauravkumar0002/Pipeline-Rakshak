import React, { useEffect, useState, useCallback } from 'react';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import DashboardGrid from '../components/dashboard/DashboardGrid';
import { getDashboardMetrics, getAnalyticsSummary, getCurrentModel } from '../services/api';

const DEFAULT_METRICS = {
    total_inspections: 0,
    corrosion_detected: 0,
    healthy_images: 0,
    average_confidence: 0,
    average_inference_time: 0,
    system_uptime: 0,
};

const DEFAULT_SUMMARY = {
    verified_count: 0,
    unverified_count: 0,
    flagged_count: 0,
    retraining_queue_count: 0,
};

const DashboardPage = () => {
    const [metrics, setMetrics] = useState(DEFAULT_METRICS);
    const [summary, setSummary] = useState(DEFAULT_SUMMARY);
    const [activeModel, setActiveModel] = useState('');
    const [loading, setLoading] = useState(true);

    const fetchAll = useCallback(async (initial = false) => {
        if (initial) setLoading(true);
        try {
            const [mRes, sRes, mModel] = await Promise.allSettled([
                getDashboardMetrics(),
                getAnalyticsSummary(),
                getCurrentModel(),
            ]);
            if (mRes.status === 'fulfilled') setMetrics(mRes.value.data);
            if (sRes.status === 'fulfilled') setSummary(sRes.value.data);
            if (mModel.status === 'fulfilled') setActiveModel(mModel.value.data?.model_name || '');
        } catch (_) {
            // individual errors handled via allSettled above
        } finally {
            if (initial) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll(true);
        const id = setInterval(() => fetchAll(false), 15000);
        return () => clearInterval(id);
    }, [fetchAll]);

    return (
        <div style={{ padding: '0 0 40px' }}>
            <DashboardHeader />
            <DashboardGrid
                metrics={metrics}
                summary={summary}
                activeModel={activeModel}
                loading={loading}
            />
        </div>
    );
};

export default DashboardPage;
