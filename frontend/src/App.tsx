import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PostProvider } from './context/PostContext';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProfilePage } from './pages/ProfilePage';
import { PostListPage } from './pages/PostListPage';
import { PostCreatePage } from './pages/PostCreatePage';
import { PostDetailPage } from './pages/PostDetailPage';
import { PostEditPage } from './pages/PostEditPage';
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import './App.css';

function App() {
  return (
    <PostProvider>
      <BrowserRouter>
        <Routes>
          {/* 1. 일반 사용자 페이지 (공통 레이아웃: Navbar, Footer 적용) */}
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="posts" element={<PostListPage />} />
            <Route path="posts/create" element={<PostCreatePage />} />
            <Route path="posts/:id" element={<PostDetailPage />} />
            <Route path="posts/:id/edit" element={<PostEditPage />} />
          </Route>

          {/* 2. 관리자 전용 독립 페이지 */}
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/posts" element={<AdminDashboardPage defaultCategory="posts" />} />
          <Route path="/admin/users" element={<AdminDashboardPage defaultCategory="users" />} />
          <Route path="/admin/comments" element={<AdminDashboardPage defaultCategory="comments" />} />
          <Route path="/admin/account" element={<AdminDashboardPage defaultCategory="account" />} />
          <Route path="/admin/system" element={<AdminDashboardPage defaultCategory="system" />} />

          {/* 3. 잘못된 경로 처리 */}
          <Route path="*" element={<HomePage />} />
        </Routes>
      </BrowserRouter>
    </PostProvider>
  );
}

export default App;
