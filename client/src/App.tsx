import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import AuthPage from './pages/AuthPage';
import ProjectsPage from './pages/ProjectsPage';
import ProfilePage from './pages/ProfilePage';
import TasksPage from './pages/TasksPage';
import NotificationsPage from './pages/NotificationsPage';
import ProjectPage from './pages/ProjectPage';

/** Пускает дальше только авторизованных, остальных отправляет на вход. */
function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash">Загрузка…</div>;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

/** Страницы входа/регистрации: уже вошедшего отправляем на главную. */
function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash">Загрузка…</div>;
  return user ? <Navigate to="/" replace /> : <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
      </Route>

      <Route element={<Protected />}>
        <Route element={<Layout />}>
          <Route index element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectPage />} />
          <Route path="projects/:projectId/roadmap/:roadmapId" element={<ProjectPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
