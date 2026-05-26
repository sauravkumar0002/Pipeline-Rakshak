// frontend/src/components/ProtectedRoute.jsx
/**
 * Wraps a route element so that unauthenticated users are redirected to /login.
 * The current location is passed as `state.from` so LoginPage can redirect back.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
