import axios from 'axios';

export function getStoredToken() {
  return localStorage.getItem('sagex3_token') || sessionStorage.getItem('sagex3_token');
}

export function setStoredToken(token, rememberMe = true) {
  if (rememberMe) {
    localStorage.setItem('sagex3_token', token);
    sessionStorage.removeItem('sagex3_token');
  } else {
    sessionStorage.setItem('sagex3_token', token);
    localStorage.removeItem('sagex3_token');
  }
}

export function clearStoredToken() {
  localStorage.removeItem('sagex3_token');
  sessionStorage.removeItem('sagex3_token');
}

// ── Multi-Server Failover Configuration ───────────────────────────────────────
// Support single base URL (e.g. "https://chinmaysloq.tail43ed85.ts.net") or comma-separated list.
// Automatically appends "/api" when needed.
const rawEndpoints = [
  import.meta.env.VITE_BACKEND_URL,
  import.meta.env.VITE_API_URL,
  import.meta.env.VITE_FALLBACK_API_URLS,
  '/api',
]
  .filter(Boolean)
  .flatMap((str) => String(str).split(','))
  .map((u) => {
    const clean = u.trim().replace(/\/+$/, '');
    if (!clean) return '';
    if (clean === '/api' || clean.endsWith('/api')) return clean;
    return `${clean}/api`;
  })
  .filter(Boolean);

export const SERVER_ENDPOINTS = [...new Set(rawEndpoints.length ? rawEndpoints : ['/api'])];

let activeEndpointIndex = 0;
let isOutageActive = false;
const outageListeners = new Set();

export function getActiveEndpoint() {
  return SERVER_ENDPOINTS[activeEndpointIndex] || SERVER_ENDPOINTS[0];
}

export function onServerOutageChange(listener) {
  outageListeners.add(listener);
  listener(isOutageActive);
  return () => outageListeners.delete(listener);
}

function setServerOutageState(state) {
  if (isOutageActive !== state) {
    isOutageActive = state;
    outageListeners.forEach((fn) => {
      try { fn(state); } catch {}
    });
  }
}

/**
 * Pings each candidate endpoint's /health route to find the first live server
 * and clears the outage screen if a server is online.
 */
export async function checkServersHealth() {
  for (let i = 0; i < SERVER_ENDPOINTS.length; i++) {
    const candidate = SERVER_ENDPOINTS[i];
    try {
      const res = await axios.get(`${candidate}/health`, { timeout: 3500 });
      if (res.data?.success || res.status === 200) {
        activeEndpointIndex = i;
        api.defaults.baseURL = candidate;
        setServerOutageState(false);
        return { online: true, endpoint: candidate, data: res.data };
      }
    } catch {
      // Continue to next candidate node
    }
  }
  setServerOutageState(true);
  return { online: false, error: 'All servers are currently down.' };
}

// ── Axios Instance ────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: getActiveEndpoint(),
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  // Always ensure baseURL matches current active failover endpoint
  config.baseURL = getActiveEndpoint();
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    // A successful response proves at least one server is operational
    if (isOutageActive) setServerOutageState(false);
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const code = error.response?.data?.code;

    // Detect server downtime: network error, timeout, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout
    const isNetworkOrDowntime =
      !error.response ||
      status === 502 ||
      status === 503 ||
      status === 504 ||
      code === 'ALL_SERVERS_DOWN' ||
      error.code === 'ECONNABORTED' ||
      error.message?.includes('Network Error');

    // Attempt automatic failover to the next candidate server endpoint if available
    if (isNetworkOrDowntime && originalRequest && !originalRequest._failoverRetried) {
      if (SERVER_ENDPOINTS.length > 1) {
        const nextIndex = (activeEndpointIndex + 1) % SERVER_ENDPOINTS.length;
        if (nextIndex !== activeEndpointIndex) {
          activeEndpointIndex = nextIndex;
          api.defaults.baseURL = SERVER_ENDPOINTS[activeEndpointIndex];
          originalRequest._failoverRetried = true;
          originalRequest.baseURL = SERVER_ENDPOINTS[activeEndpointIndex];
          return api(originalRequest);
        }
      }
      // If we cycled through all or only 1 endpoint exists and it failed, mark all servers down
      setServerOutageState(true);
    }

    const reqUrl = originalRequest?.url || '';
    const isEmailEndpoint = reqUrl.includes('/email/');
    if (status === 401 && !isEmailEndpoint) {
      clearStoredToken();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export function getApiError(err, fallback = 'Something went wrong') {
  if (!err?.response && (err?.message?.includes('Network Error') || err?.code === 'ECONNABORTED')) {
    return 'All servers are currently down. Please try again later.';
  }
  return err?.response?.data?.message || err?.message || fallback;
}

export default api;
