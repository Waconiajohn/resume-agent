/**
 * API base URL for all backend requests.
 *
 * In development: empty string (Vite dev proxy handles /api/* → localhost:3001)
 * In production:  set VITE_API_URL to the Railway backend URL
 *                 (e.g. https://resume-agent-server.up.railway.app)
 */
export const API_BASE = import.meta.env.VITE_API_URL
  ? `${(import.meta.env.VITE_API_URL as string).replace(/\/$/, '')}/api`
  : '/api';
