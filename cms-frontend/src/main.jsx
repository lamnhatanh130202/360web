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
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/cms/login" element={<Login />} />
          <Route path="/login" element={<Navigate to="/cms/login" replace />} />
          <Route
            path="/cms/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cms/scenes/*"
            element={
              <ProtectedRoute>
                <ScenesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cms/hotspots"
            element={
              <ProtectedRoute>
                <Hotspots />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cms/tours"
            element={
              <ProtectedRoute>
                <Tours />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cms/minimap"
            element={
              <ProtectedRoute>
                <MinimapEditor />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/cms/dashboard" replace />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<App />);
