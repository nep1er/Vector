import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import AuthPage from './pages/AuthPage';
import ProjectsPage from './pages/ProjectsPage';
import ProfilePage from './pages/ProfilePage';
import TasksPage from './pages/TasksPage';
import FriendsPage from './pages/FriendsPage';
import DashboardPage from './pages/DashboardPage';
import NotificationsPage from './pages/NotificationsPage';
import TodoPage from './pages/TodoPage';
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
        {/* Внутри проекта глобальное меню скрыто: у проекта свой изолированный экран */}
        <Route path="projects/:projectId" element={<ProjectPage />} />
        <Route path="projects/:projectId/roadmap/:roadmapId" element={<ProjectPage />} />
        <Route path="projects/:projectId/todo/:todoId" element={<TodoPage />} />
        <Route path="projects/:projectId/dashboard" element={<DashboardPage />} />

        <Route element={<Layout />}>
          <Route index element={<ProjectsPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="friends" element={<FriendsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
