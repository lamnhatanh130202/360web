import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ScenesList from "./ScenesList";
import ScenesCreate from "./ScenesCreate";
import ScenePreview from "./ScenePreview";
import ScenesEdit from "./ScenesEdit";

export default function ScenesPage() {
  return (
    <Routes>
      <Route path="/" element={<ScenesList />} />
      <Route path="/create" element={<ScenesCreate />} />
      <Route path="/:sceneId/edit" element={<ScenesEdit />} />
      <Route path="/:sceneId/preview" element={<ScenePreview />} />
      <Route path="*" element={<Navigate to="/cms/scenes" replace />} />
    </Routes>
  );
}
