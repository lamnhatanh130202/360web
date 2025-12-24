import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import AppLayout from "./cms/AppLayout";
import ProtectedRoute from "./cms/components/ProtectedRoute";
import Dashboard from "./cms/pages/Dashboard";
import ScenesPage from "./cms/pages/ScenesPage";
import Hotspots from "./cms/pages/Hotspots";
import Tours from "./cms/pages/Tours";
import MinimapEditor from "./cms/pages/MinimapEditor";
import Login from "./cms/pages/Login";

import "./cms/styles/cms.css";

function App() {
  return (
    // 👇 QUAN TRỌNG: Thêm basename lấy từ biến môi trường của Vite
    // Giúp code chạy đúng dù ở Local hay trên Render
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppLayout>
        <Routes>
          {/* 1. Trang Login: Xóa /cms, chỉ để /login */}
          <Route path="/login" element={<Login />} />
          
          {/* 2. Dashboard: Xóa /cms */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          {/* 3. Scenes: Xóa /cms, giữ lại /* để route con hoạt động */}
          <Route
            path="/scenes/*"
            element={
              <ProtectedRoute>
                <ScenesPage />
              </ProtectedRoute>
            }
          />

          {/* 4. Hotspots */}
          <Route
            path="/hotspots"
            element={
              <ProtectedRoute>
                <Hotspots />
              </ProtectedRoute>
            }
          />

          {/* 5. Tours */}
          <Route
            path="/tours"
            element={
              <ProtectedRoute>
                <Tours />
              </ProtectedRoute>
            }
          />

          {/* 6. Minimap */}
          <Route
            path="/minimap"
            element={
              <ProtectedRoute>
                <MinimapEditor />
              </ProtectedRoute>
            }
          />

          {/* 7. Redirect: Khi vào trang chủ /, tự nhảy vào /dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          {/* 8. Catch-all: Nếu gõ linh tinh, cũng nhảy về dashboard */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />

        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<App />);