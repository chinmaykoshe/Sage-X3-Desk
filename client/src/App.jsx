import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import api, { getApiError } from './services/api';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider, useToast } from './context/ToastContext';
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
import EmailInboxPage from './pages/EmailInboxPage';
import TimesheetPage from './pages/TimesheetPage';

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

function GmailOAuthHandler() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || location.pathname !== '/') return;
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return;

    api
      .post('/email/integrations/gmail/exchange', {
        code,
        integrationId: state,
        redirectUri: window.location.origin,
      })
      .then(() => {
        addToast('Gmail OAuth authorized and connected!');
        navigate('/settings/email-integrations', { replace: true });
      })
      .catch((err) => {
        addToast(getApiError(err, 'Gmail OAuth failed'), 'error');
        navigate('/settings/email-integrations', { replace: true });
      });
  }, [user, location.pathname, location.search]);

  return null;
}

function LegacySettingsRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  if (tab === 'access') return <Navigate to="/settings/access-control" replace />;
  if (tab === 'integrations') return <Navigate to="/settings/email-integrations" replace />;
  return <Navigate to="/settings/general" replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <WorkspaceProvider>
            <BrowserRouter>
              <GmailOAuthHandler />
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
                  <Route path="timesheet" element={<TimesheetPage />} />
                  <Route path="tasks" element={<ProtectedRoute screenKey="task_board"><TasksPage defaultTab="all" /></ProtectedRoute>} />
                  <Route path="task-board" element={<ProtectedRoute screenKey="task_board"><TasksPage defaultTab="board" /></ProtectedRoute>} />
                  <Route path="tickets" element={<ProtectedRoute screenKey="tickets"><TicketsPage /></ProtectedRoute>} />
                  <Route path="tickets/:id" element={<ProtectedRoute screenKey="tickets"><TicketDetailPage /></ProtectedRoute>} />
                  <Route path="smart-intake" element={<ProtectedRoute screenKey="smart_intake"><SmartIntakePage /></ProtectedRoute>} />
                  <Route path="email-inbox" element={<ProtectedRoute screenKey="email_inbox"><EmailInboxPage /></ProtectedRoute>} />
                  <Route path="approvals" element={<ProtectedRoute screenKey="approval_inbox"><ApprovalInboxPage queue="all" /></ProtectedRoute>} />
                  <Route path="approvals/drafts" element={<ProtectedRoute screenKey="approval_inbox"><ApprovalInboxPage queue="drafts" /></ProtectedRoute>} />
                  <Route path="approvals/tickets" element={<ProtectedRoute screenKey="approval_inbox"><ApprovalInboxPage queue="manual" /></ProtectedRoute>} />
                  <Route path="approvals/requests" element={<ProtectedRoute screenKey="approval_inbox"><ApprovalInboxPage queue="actions" /></ProtectedRoute>} />
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
                  <Route path="admin/governance" element={<ProtectedRoute screenKey="admin_governance" roles={['admin']}><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="admin/user-activity" element={<ProtectedRoute screenKey="admin_user_activity"><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="admin/dev-logs" element={<ProtectedRoute screenKey="admin_dev_logs"><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="admin/system-logs" element={<ProtectedRoute screenKey="admin_system_logs"><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="admin/api-monitoring" element={<ProtectedRoute screenKey="admin_api_monitoring"><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="admin/deployments" element={<ProtectedRoute screenKey="admin_deployment_history"><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="admin/time-tracking" element={<ProtectedRoute screenKey="admin_time_tracking"><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="admin/ai-activity" element={<ProtectedRoute screenKey="admin_ai_activity"><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="admin/audit-logs" element={<ProtectedRoute screenKey="admin_audit_logs"><AdminMonitoringPage /></ProtectedRoute>} />
                  <Route path="settings" element={<ProtectedRoute screenKey="settings"><LegacySettingsRedirect /></ProtectedRoute>} />
                  <Route path="settings/general" element={<ProtectedRoute screenKey="settings"><SettingsPage section="general" /></ProtectedRoute>} />
                  <Route path="settings/access-control" element={<ProtectedRoute screenKey="settings"><SettingsPage section="access" /></ProtectedRoute>} />
                  <Route path="settings/email-integrations" element={<ProtectedRoute screenKey="settings"><SettingsPage section="integrations" /></ProtectedRoute>} />
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
