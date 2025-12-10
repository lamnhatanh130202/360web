// src/components/MascotModal.jsx
import React from "react";

export default function MascotModal({ open, onClose, faculties, onSelectFaculty }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg p-6 bg-white rounded-xl shadow-lg">
        <div className="flex items-start gap-4">
          <img src="/assets/mascot.png" alt="mascot" className="w-24 h-24" />
          <div className="flex-1">
            <h2 className="text-xl font-bold">Xin chào! Mình là con AI</h2>
            <p className="mt-2 text-sm">Muốn khám phá theo khoa nào? Mình sẽ dẫn bạn tham quan và giới thiệu bằng giọng nói.</p>

            <div className="mt-4 grid grid-cols-1 gap-2">
              {Object.values(faculties).map(f => (
                <button key={f.id}
                  onClick={() => onSelectFaculty(f.id)}
                  className="text-left p-3 border rounded hover:bg-gray-50">
                  <div className="font-semibold">{f.name}</div>
                  <div className="text-sm text-gray-600">{f.description}</div>
                </button>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded bg-gray-200">Đóng</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
