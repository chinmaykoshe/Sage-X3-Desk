import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import api from '../services/api';
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
    const token = localStorage.getItem('sagex3_token');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.data);
      fetchNotifications();
    } catch {
      localStorage.removeItem('sagex3_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [fetchNotifications]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Connect Socket.IO when authenticated
  useEffect(() => {
    const token = localStorage.getItem('sagex3_token');
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

    setSocket(s);
    return () => {
      s.disconnect();
    };
  }, [user?._id]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('sagex3_token', data.data.token);
    setUser(data.data.user);
    await fetchNotifications();
    return data.data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    localStorage.setItem('sagex3_token', data.data.token);
    setUser(data.data.user);
    return data.data.user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    localStorage.removeItem('sagex3_token');
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

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loading,
        isAdmin,
        isManager,
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
