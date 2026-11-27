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

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const reqUrl = error.config?.url || '';
    const isEmailEndpoint = reqUrl.includes('/email/');
    if (error.response?.status === 401 && !isEmailEndpoint) {
      clearStoredToken();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export function getApiError(err, fallback = 'Something went wrong') {
  return err?.response?.data?.message || err?.message || fallback;
}

export default api;
