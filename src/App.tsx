import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ScrollToTop from './components/ScrollToTop';
import Bills from './pages/Bills';
import Home from './pages/Home';
import Me from './pages/Me';
import Records from './pages/Records';
import Rules from './pages/Rules';

// 后台只有我一个人会打开，没必要让所有访客都下载它
const AdminApp = lazy(() => import('./pages/admin/AdminApp'));

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* admin 故意不套 Layout：这里不该有导航栏、页脚和「当前可领」 */}
        <Route
          path="admin"
          element={
            <Suspense fallback={<div className="admin admin-boot"><span className="mono">加载中…</span></div>}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="records" element={<Records />} />
          <Route path="me" element={<Me />} />
          <Route path="bills" element={<Bills />} />
          <Route path="rules" element={<Rules />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
