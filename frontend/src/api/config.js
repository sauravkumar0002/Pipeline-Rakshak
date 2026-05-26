// Centralised API base URL.
// Set VITE_API_BASE_URL in your .env file for non-localhost environments.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';
