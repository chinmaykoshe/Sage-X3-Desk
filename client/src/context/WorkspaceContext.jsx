import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const WorkspaceContext = createContext();

export function WorkspaceProvider({ children }) {
  const { user, socket } = useAuth();
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);

  // Global modals, drawers & palette
  const [quickTicketModal, setQuickTicketModal] = useState({ open: false, defaults: {} });
  const [quickTaskModal, setQuickTaskModal] = useState({ open: false, defaults: {} });
  const [ticketDrawerId, setTicketDrawerId] = useState(null);
  const [taskDrawerId, setTaskDrawerId] = useState(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Realtime sync counters
  const [lastSync, setLastSync] = useState({
    ticket: 0,
    task: 0,
    deployment: 0,
    comment: 0,
    lastEvent: null,
  });

  const refreshLookups = useCallback(async () => {
    if (!user) return;
    try {
      const [cRes, uRes, pRes] = await Promise.all([
        api.get('/clients?limit=100'),
        api.get('/users?limit=100'),
        api.get('/projects?limit=100'),
      ]);
      setClients(cRes.data.data || []);
      setUsers(uRes.data.data || []);
      setProjects(pRes.data.data || []);
    } catch {
      // ignore if unauthenticated
    }
  }, [user]);

  useEffect(() => {
    refreshLookups();
  }, [refreshLookups]);

  useEffect(() => {
    if (!socket) return;

    const onTicket = (payload) =>
      setLastSync((s) => ({ ...s, ticket: Date.now(), lastEvent: { type: 'ticket', ...payload } }));
    const onTask = (payload) =>
      setLastSync((s) => ({ ...s, task: Date.now(), lastEvent: { type: 'task', ...payload } }));
    const onDeployment = (payload) =>
      setLastSync((s) => ({ ...s, deployment: Date.now(), lastEvent: { type: 'deployment', ...payload } }));
    const onComment = (payload) =>
      setLastSync((s) => ({ ...s, comment: Date.now(), lastEvent: { type: 'comment', ...payload } }));

    socket.on('ticket:changed', onTicket);
    socket.on('task:changed', onTask);
    socket.on('deployment:changed', onDeployment);
    socket.on('comment:added', onComment);

    return () => {
      socket.off('ticket:changed', onTicket);
      socket.off('task:changed', onTask);
      socket.off('deployment:changed', onDeployment);
      socket.off('comment:added', onComment);
    };
  }, [socket]);

  const openQuickTicket = useCallback((defaults = {}) => {
    setQuickTicketModal({ open: true, defaults });
  }, []);

  const closeQuickTicket = useCallback(() => {
    setQuickTicketModal({ open: false, defaults: {} });
  }, []);

  const openQuickTask = useCallback((defaults = {}) => {
    setQuickTaskModal({ open: true, defaults });
  }, []);

  const closeQuickTask = useCallback(() => {
    setQuickTaskModal({ open: false, defaults: {} });
  }, []);

  const openTicketDrawer = useCallback((id) => {
    setTaskDrawerId(null);
    setTicketDrawerId(id);
  }, []);

  const openTaskDrawer = useCallback((id) => {
    setTicketDrawerId(null);
    setTaskDrawerId(id);
  }, []);

  const closeDrawers = useCallback(() => {
    setTicketDrawerId(null);
    setTaskDrawerId(null);
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        clients,
        users,
        projects,
        refreshLookups,
        quickTicketModal,
        openQuickTicket,
        closeQuickTicket,
        quickTaskModal,
        openQuickTask,
        closeQuickTask,
        ticketDrawerId,
        openTicketDrawer,
        taskDrawerId,
        openTaskDrawer,
        closeDrawers,
        commandPaletteOpen,
        setCommandPaletteOpen,
        lastSync,
        notifyLocalMutation: (type) => setLastSync((s) => ({ ...s, [type]: Date.now() })),
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => useContext(WorkspaceContext);
