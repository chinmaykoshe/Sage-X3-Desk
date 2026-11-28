import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import api, { clearStoredToken, getStoredToken, setStoredToken } from '../services/api';
import { useToast } from './ToastContext';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [socket, setSocket] = useState(null);
  const { addToast } = useToast();

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data.data.items || []);
      setUnreadCount(data.data.unreadCount || 0);
    } catch {
      // ignore if logged out
    }
  }, []);

  const loadUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.data);
      fetchNotifications();
    } catch (err) {
      // Only clear credentials if the server explicitly rejected the token (401 Unauthorized).
      // If servers are down / connection refused / 502/503, preserve token so user remains signed in when servers recover.
      if (err.response?.status === 401) {
        clearStoredToken();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchNotifications]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Connect Socket.IO when authenticated
  useEffect(() => {
    const token = getStoredToken();
    if (!user || !token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const socketUrl = import.meta.env.VITE_SOCKET_URL || '/';
    const s = io(socketUrl, { auth: { token } });

    s.on('notification:new', (notif) => {
      setNotifications((prev) => [notif, ...prev]);
      setUnreadCount((c) => c + 1);
      addToast(`${notif.title}: ${notif.message}`, 'info', 4500);
    });

    s.on('permissions:updated', (payload) => {
      if (!payload?.userId || String(payload.userId) === String(user._id)) {
        loadUser();
      }
    });

    setSocket(s);
    return () => {
      s.disconnect();
    };
  }, [user?._id]);

  const login = async (email, password, rememberMe = true) => {
    const { data } = await api.post('/auth/login', { email, password });
    setStoredToken(data.data.token, rememberMe);
    setUser(data.data.user);
    await fetchNotifications();
    return data.data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    if (data.data?.pending) {
      return data.data;
    }
    setStoredToken(data.data.token, true);
    setUser(data.data.user);
    return data.data.user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    clearStoredToken();
    setUser(null);
    setNotifications([]);
    setUnreadCount(0);
  };

  const markNotificationRead = async (id) => {
    await api.patch(`/notifications/${id}/read`);
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const markAllNotificationsRead = async () => {
    await api.patch('/notifications/read-all');
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'admin' || user?.role === 'team_lead';

  const hasScreen = useCallback(
    (screenKey) => {
      if (!user) return false;
      if (user.role === 'admin') return true;
      const eff = user.effectivePermissions;
      if (eff?.screens) return eff.screens.includes(screenKey);
      // Graceful fallback when running with older cached user payload
      if (['reports', 'approval_inbox', 'team', 'workload'].includes(screenKey)) {
        return user.role === 'team_lead';
      }
      if (screenKey.startsWith('admin_') || screenKey === 'settings') return false;
      return true;
    },
    [user]
  );

  const hasAction = useCallback(
    (screenKey, action) => {
      if (!user) return false;
      if (user.role === 'admin') return true;
      const eff = user.effectivePermissions;
      if (eff?.actions?.[screenKey]) {
        return eff.actions[screenKey].includes(action);
      }
      if (user.role === 'team_lead') {
        return ['view', 'create', 'edit', 'assign', 'reassign', 'approve', 'reject', 'request_changes', 'change_status'].includes(action);
      }
      return ['view', 'create', 'change_status', 'track_time', 'add_dev_note'].includes(action);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loadUser,
        loading,
        isAdmin,
        isManager,
        hasScreen,
        hasAction,
        login,
        register,
        logout,
        notifications,
        unreadCount,
        fetchNotifications,
        markNotificationRead,
        markAllNotificationsRead,
        socket,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
