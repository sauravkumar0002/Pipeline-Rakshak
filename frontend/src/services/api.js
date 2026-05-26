import apiClient from '../api/axios';

export const getAnalyticsSummary = () => {
  return apiClient.get('/v1/analytics/summary');
};

export const getDashboardMetrics = () => {
  return apiClient.get('/v1/analytics/dashboard');
};

export const getAnalyticsPerformance = () => {
  return apiClient.get('/v1/analytics/performance');
};
export const getSeverityDistribution = () => {
  return apiClient.get('/v1/analytics/severity-distribution');
};
export const getInspectionHistory = (params) => {
  return apiClient.get('/v1/inspections/history', { params });
};

export const getInspectionById = (id) => {
  return apiClient.get(`/v1/inspections/history/${id}`);
};

export const predictCorrosion = (formData) => {
  return apiClient.post('/v1/inspections/predict', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const getAvailableModels = () => {
  return apiClient.get('/v1/models/models');
};

export const getModelList = () => {
  return apiClient.get('/v1/models/list');
};

export const getCurrentModel = () => {
  return apiClient.get('/v1/models/models/current');
};

export const selectModel = (modelName) => {
  return apiClient.post('/v1/models/models/select', {
    model_name: modelName,
  });
};

export const verifyInspection = (id, data) => {
  return apiClient.post(`/v1/inspections/verify/${id}`, data);
};

export const deleteInspection = (id) => {
  return apiClient.delete(`/v1/inspections/history/${id}`);
};

export const getAnalyticsTrends = (days = 30) => {
  return apiClient.get('/v1/analytics/trends', { params: { days } });
};

export const downloadInspectionPDF = (id) => {
  return apiClient.get(`/v1/reports/${id}/pdf`, {
    responseType: 'blob',
  });
};

export const getResearchAnalytics = () => {
  return apiClient.get('/v1/analytics/research');
};

export const getRocCurve = () => {
  return apiClient.get('/v1/analytics/roc-curve');
};

export const getPrCurve = () => {
  return apiClient.get('/v1/analytics/pr-curve');
};

export const downloadAnalyticsPDF = () => {
  return apiClient.get('/v1/analytics/research-report/pdf', {
    responseType: 'blob',
  });
};

// ── Retraining Pipeline ──────────────────────────────────────────────────────

export const getRetrainingDataset = () =>
  apiClient.get('/v1/retraining/dataset');

export const getRetrainingQueue = () =>
  apiClient.get('/v1/retraining/queue');

export const buildRetrainingQueue = (modelName = null) =>
  apiClient.post('/v1/retraining/queue', { model_name: modelName });

export const clearRetrainingQueue = () =>
  apiClient.delete('/v1/retraining/queue');

export const getRetrainingJobs = () =>
  apiClient.get('/v1/retraining/jobs');

export const startRetraining = (modelName, trainingMode = 'full_finetune', notes = null, hp = {}) =>
  apiClient.post('/v1/retraining/start', {
    model_name:    modelName,
    training_mode: trainingMode,
    notes,
    epochs:        hp.epochs        ?? 30,
    batch_size:    hp.batch_size    ?? 8,
    learning_rate: hp.learning_rate ?? 0.0001,
    weight_decay:  hp.weight_decay  ?? 0.0001,
    patience:      hp.patience      ?? 7,
    scheduler:     hp.scheduler     ?? 'plateau',
  });

export const cancelRetrainingJob = (jobId) =>
  apiClient.delete(`/v1/retraining/jobs/${jobId}`);

export const getJobEpochs = (jobId) =>
  apiClient.get(`/v1/retraining/jobs/${jobId}/epochs`);

export const getRetrainingJob = (jobId) =>
  apiClient.get(`/v1/retraining/jobs/${jobId}`);

export const getModelVersions = () =>
  apiClient.get('/v1/retraining/model-versions');

export const promoteModelVersion = (versionId, notes = null) =>
  apiClient.post(`/v1/retraining/model-versions/${versionId}/promote`, { notes });

export const getJobArtifacts = (jobId) =>
  apiClient.get(`/v1/retraining/jobs/${jobId}/artifacts`);

export const validateRetrainingDataset = () =>
  apiClient.get('/v1/retraining/dataset/validate');

// ── Notifications ────────────────────────────────────────────────────────────

export const getNotifications = (limit = 50) =>
  apiClient.get('/v1/notifications', { params: { limit } });

export const createNotification = (type, title, message) =>
  apiClient.post('/v1/notifications', { type, title, message });

export const markNotificationRead = (id) =>
  apiClient.post(`/v1/notifications/${id}/read`);

export const markAllNotificationsRead = () =>
  apiClient.post('/v1/notifications/read-all');

export const deleteNotification = (id) =>
  apiClient.delete(`/v1/notifications/${id}`);

// ── Live Detection ───────────────────────────────────────────────────────────

export const getLiveDetectionStatus = () =>
  apiClient.get('/v1/live-detection/status');

export const startLiveSession = () =>
  apiClient.post('/v1/live-detection/start');

export const stopLiveSession = () =>
  apiClient.post('/v1/live-detection/stop');

export const processLiveFrame = (imageData, save = false, saveCorrosionOnly = false) =>
  apiClient.post('/v1/live-detection/frame', { image_data: imageData, save, save_corrosion_only: saveCorrosionOnly });