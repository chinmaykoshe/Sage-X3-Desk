import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import AppLayout from './components/layout/AppLayout';
import Loader from './components/ui/Loader';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TicketsPage from './pages/TicketsPage';
import TicketDetailPage from './pages/TicketDetailPage';
import TasksPage from './pages/TasksPage';
import CalendarPage from './pages/CalendarPage';
import ClientsPage from './pages/ClientsPage';
import ClientDetailPage from './pages/ClientDetailPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import TeamPage from './pages/TeamPage';
import EmployeeDetailPage from './pages/EmployeeDetailPage';
import WorkloadPage from './pages/WorkloadPage';
import DeploymentsPage from './pages/DeploymentsPage';
import ReportsPage from './pages/ReportsPage';
import ActivityLogsPage from './pages/ActivityLogsPage';
import KnowledgeBasePage from './pages/KnowledgeBasePage';
import NotificationsPage from './pages/NotificationsPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import SmartIntakePage from './pages/SmartIntakePage';
import ApprovalInboxPage from './pages/ApprovalInboxPage';
import AdminMonitoringPage from './pages/AdminMonitoringPage';

function AccessDeniedView({ screenKey }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-[#E8E8E5] bg-white p-8 text-center shadow-sm dark:border-[#2C2E33] dark:bg-[#17181B]">
      <h2 className="text-lg font-bold text-[#171717] dark:text-white">Access Denied</h2>
      <p className="mt-2 text-xs text-[#777777]">
        You do not currently have permission to access this screen ({screenKey}). Contact an Administrator to request access.
      </p>
      <a
        href="/"
        className="mt-4 inline-block rounded-lg bg-[#171717] px-4 py-2 text-xs font-semibold text-white dark:bg-[#C6F36B] dark:text-[#171717]"
      >
        Return to Overview
      </a>
    </div>
  );
}

function ProtectedRoute({ children, roles, screenKey }) {
  const { user, loading, hasScreen } = useAuth();
  if (loading) return <Loader label="Initializing Sage X3 Desk..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role) && !(screenKey && hasScreen(screenKey))) {
    return <AccessDeniedView screenKey={screenKey || roles.join(', ')} />;
  }
  if (screenKey && !hasScreen(screenKey)) {
    return <AccessDeniedView screenKey={screenKey} />;
  }
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader label="Initializing Sage X3 Desk..." />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <WorkspaceProvider>
            <BrowserRouter>
              <Routes>
                <Route
                  path="/login"
                  element={
                    <PublicRoute>
                      <LoginPage />
                    </PublicRoute>
                  }
                />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<DashboardPage />} />
                  <Route path="my-tasks" element={<ProtectedRoute screenKey="my_tasks"><TasksPage defaultTab="my" /></ProtectedRoute>} />
                  <Route path="tasks" element={<ProtectedRoute screenKey="task_board"><TasksPage defaultTab="all" /></ProtectedRoute>} />
                  <Route path="task-board" element={<ProtectedRoute screenKey="task_board"><TasksPage defaultTab="board" /></ProtectedRoute>} />
                  <Route path="tickets" element={<ProtectedRoute screenKey="tickets"><TicketsPage /></ProtectedRoute>} />
                  <Route path="tickets/:id" element={<ProtectedRoute screenKey="tickets"><TicketDetailPage /></ProtectedRoute>} />
                  <Route path="smart-intake" element={<ProtectedRoute screenKey="smart_intake"><SmartIntakePage /></ProtectedRoute>} />
                  <Route path="approvals" element={<ProtectedRoute screenKey="approval_inbox"><ApprovalInboxPage /></ProtectedRoute>} />
                  <Route path="calendar" element={<ProtectedRoute screenKey="calendar"><CalendarPage /></ProtectedRoute>} />
                  <Route path="clients" element={<ProtectedRoute screenKey="clients"><ClientsPage /></ProtectedRoute>} />
                  <Route path="clients/:id" element={<ProtectedRoute screenKey="clients"><ClientDetailPage /></ProtectedRoute>} />
                  <Route path="projects" element={<ProtectedRoute screenKey="projects"><ProjectsPage /></ProtectedRoute>} />
                  <Route path="projects/:id" element={<ProtectedRoute screenKey="projects"><ProjectDetailPage /></ProtectedRoute>} />
                  <Route path="team" element={<ProtectedRoute screenKey="team"><TeamPage /></ProtectedRoute>} />
                  <Route path="team/:id" element={<ProtectedRoute screenKey="team"><EmployeeDetailPage /></ProtectedRoute>} />
                  <Route path="workload" element={<ProtectedRoute screenKey="workload"><WorkloadPage /></ProtectedRoute>} />
                  <Route path="deployments" element={<ProtectedRoute screenKey="deployments"><DeploymentsPage /></ProtectedRoute>} />
                  <Route path="reports" element={<ProtectedRoute screenKey="reports"><ReportsPage /></ProtectedRoute>} />
                  <Route path="activity-logs" element={<ProtectedRoute screenKey="activity_logs"><ActivityLogsPage /></ProtectedRoute>} />
                  <Route path="knowledge-base" element={<ProtectedRoute screenKey="knowledge_base"><KnowledgeBasePage /></ProtectedRoute>} />
                  <Route path="notifications" element={<ProtectedRoute screenKey="inbox"><NotificationsPage /></ProtectedRoute>} />
                  <Route path="admin/overview" element={<ProtectedRoute screenKey="admin_overview"><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="admin/user-activity" element={<ProtectedRoute screenKey="admin_user_activity"><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="admin/dev-logs" element={<ProtectedRoute screenKey="admin_dev_logs"><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="admin/system-logs" element={<ProtectedRoute screenKey="admin_system_logs"><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="admin/api-monitoring" element={<ProtectedRoute screenKey="admin_api_monitoring"><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="admin/deployments" element={<ProtectedRoute screenKey="admin_deployment_history"><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="admin/time-tracking" element={<ProtectedRoute screenKey="admin_time_tracking"><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="admin/ai-activity" element={<ProtectedRoute screenKey="admin_ai_activity"><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="admin/audit-logs" element={<ProtectedRoute screenKey="admin_audit_logs"><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="settings" element={<ProtectedRoute screenKey="settings"><SettingsPage /></ProtectedRoute>} />
                  <Route path="profile" element={<ProfilePage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </WorkspaceProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
