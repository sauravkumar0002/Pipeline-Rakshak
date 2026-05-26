import React from 'react';
import { Route, Routes } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';
import InspectPage from '../pages/InspectPage';
import HistoryPage from '../pages/HistoryPage';
import ModelHubPage from '../pages/ModelHubPage';
import SettingsPage from '../pages/SettingsPage';
import VerificationPage from '../pages/VerificationPage';
import AnalyticsPage from '../pages/AnalyticsPage';
import RetrainingPage from '../pages/RetrainingPage';
import LiveMonitoring from '../pages/LiveMonitoring';
import NotFoundPage from '../pages/NotFoundPage';
import LoginPage from '../pages/LoginPage';
import ProtectedRoute from '../components/ProtectedRoute';

const AppRoutes = () => {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected */}
      <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/inspect" element={<ProtectedRoute><InspectPage /></ProtectedRoute>} />
      <Route path="/detection" element={<ProtectedRoute><InspectPage /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
      <Route path="/verification" element={<ProtectedRoute><VerificationPage /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
      <Route path="/retraining" element={<ProtectedRoute><RetrainingPage /></ProtectedRoute>} />
      <Route path="/live" element={<ProtectedRoute><LiveMonitoring /></ProtectedRoute>} />
      <Route path="/models" element={<ProtectedRoute><ModelHubPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default AppRoutes;
