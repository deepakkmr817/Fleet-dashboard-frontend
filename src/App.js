import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import * as XLSX from "xlsx";
import L from "leaflet";

// Fix Leaflet default icon issue using CDN fallback URLs
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

const YardLocation = {
  lat: -33.870,
  lng: 151.200,
  radius: 0.5,
};

const isInYard = (lat, lng) => {
  const R = 6371;
  const dLat = ((lat - YardLocation.lat) * Math.PI) / 180;
  const dLon = ((lng - YardLocation.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((YardLocation.lat * Math.PI) / 180) *
      Math.cos((lat * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance <= YardLocation.radius;
};

const BACKEND_URL = "https://your-backend-url.com"; // Replace with your backend deployment URL

export default function FleetDashboard() {
  const [trailers, setTrailers] = useState([]);
  const [gpsData, setGpsData] = useState([]);
  const previousStatuses = useRef({});

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const enriched = jsonData
        .map((row, index) => {
          const lat = parseFloat(row.lat);
          const lng = parseFloat(row.lng);
          return {
            id: row.id || `TRAILER-${index}`,
            lastService: row.lastService || "Unknown",
            location: { lat, lng },
            status: isInYard(lat, lng) ? "In Yard" : "Out for Job",
          };
        })
        .filter(Boolean);

      setTrailers(enriched);
    };
    reader.readAsArrayBuffer(file);
  };

  const fetchWebfleetData = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/gps-data`);
      const data = await response.json();

      if (data.report && Array.isArray(data.report)) {
        const liveData = data.report.map((item, index) => {
          const lat = parseFloat(item.objectlatitude) / 100000;
          const lng = parseFloat(item.objectlongitude) / 100000;
          const id = item.vehicleexternalid || `GPS-${index}`;
          const currentStatus = isInYard(lat, lng) ? "In Yard" : "Out for Job";

          const prev = previousStatuses.current[id];
          if (prev === "Out for Job" && currentStatus === "In Yard") {
            sendAlert(id);
          }

          previousStatuses.current[id] = currentStatus;

          return {
            id,
            location: { lat, lng },
            status: currentStatus,
          };
        });
        setGpsData(liveData);
      }
    } catch (error) {
      console.error("Webfleet fetch error:", error);
    }
  };

  const sendAlert = async (trailerId) => {
    try {
      await fetch(`${BACKEND_URL}/api/alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trailerId }),
      });
    } catch (err) {
      console.error("Failed to send alert", err);
    }
  };

  useEffect(() => {
    fetchWebfleetData();
    const interval = setInterval(fetchWebfleetData, 60000);
    return () => clearInterval(interval);
  }, []);

  const mergedTrailers = trailers.map((t) => {
    const match = gpsData.find((g) => g.id === t.id);
    return match ? { ...t, location: match.location, status: match.status } : t;
  });

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-3xl font-bold mb-4">Fleet Health Dashboard</h1>
      <input
        key={Date.now()}
        type="file"
        accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
        onChange={handleFileUpload}
        className="mb-4"
      />
      <div className="mb-6">
        <MapContainer
          center={[YardLocation.lat, YardLocation.lng]}
          zoom={14}
          style={{ height: "400px", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          {mergedTrailers.map((trailer) => (
            <Marker
              key={trailer.id}
              position={[trailer.location.lat, trailer.location.lng]}
            >
              <Popup>
                {trailer.id}: {trailer.status}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mergedTrailers.length === 0 ? (
          <p className="text-gray-600">No trailer data uploaded yet.</p>
        ) : (
          mergedTrailers.map((trailer) => (
            <div
              key={trailer.id}
              className="bg-white shadow-lg rounded-lg p-4 border"
            >
              <p className="text-lg font-semibold">ID: {trailer.id}</p>
              <p>Last Service: {trailer.lastService}</p>
              <p>Status: {trailer.status}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
