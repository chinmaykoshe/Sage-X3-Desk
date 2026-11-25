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

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader label="Initializing Sage X3 Desk..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
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
                  <Route path="my-tasks" element={<TasksPage defaultTab="my" />} />
                  <Route path="tasks" element={<TasksPage defaultTab="all" />} />
                  <Route path="task-board" element={<TasksPage defaultTab="board" />} />
                  <Route path="tickets" element={<TicketsPage />} />
                  <Route path="tickets/:id" element={<TicketDetailPage />} />
                  <Route path="smart-intake" element={<SmartIntakePage />} />
                  <Route path="approvals" element={<ApprovalInboxPage />} />
                  <Route path="calendar" element={<CalendarPage />} />
                  <Route path="clients" element={<ClientsPage />} />
                  <Route path="clients/:id" element={<ClientDetailPage />} />
                  <Route path="projects" element={<ProjectsPage />} />
                  <Route path="projects/:id" element={<ProjectDetailPage />} />
                  <Route path="team" element={<TeamPage />} />
                  <Route path="team/:id" element={<EmployeeDetailPage />} />
                  <Route path="workload" element={<WorkloadPage />} />
                  <Route path="deployments" element={<DeploymentsPage />} />
                  <Route
                    path="reports"
                    element={
                      <ProtectedRoute roles={['admin', 'team_lead']}>
                        <ReportsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="activity-logs" element={<ActivityLogsPage />} />
                  <Route path="knowledge-base" element={<KnowledgeBasePage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route
                    path="settings"
                    element={
                      <ProtectedRoute roles={['admin']}>
                        <SettingsPage />
                      </ProtectedRoute>
                    }
                  />
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
