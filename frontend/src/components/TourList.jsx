// src/components/TourList.jsx
import React from "react";

export default function TourList({ tours, onStartTour }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {tours.map(t => (
        <div key={t.id} className="border rounded p-3">
          <h3 className="font-bold">{t.name}</h3>
          <p className="text-sm text-gray-600">{t.description}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => onStartTour(t.id)} className="px-3 py-2 rounded bg-blue-600 text-white">Bắt đầu</button>
            <button onClick={() => onStartTour(t.id, {voice:false})} className="px-3 py-2 rounded border">Bắt đầu (tắt giọng)</button>
          </div>
        </div>
      ))}
    </div>
  );
}
