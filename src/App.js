import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import Papa from "papaparse";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

const YardLocation = { lat: -33.870, lng: 151.200, radius: 0.5 };

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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:3001";

function App() {
  const [trailers, setTrailers] = useState([]);
  const [gpsData, setGpsData] = useState([]);
  const previousStatuses = useRef({});

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const enriched = results.data
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
      },
    });
  };

  const fetchWebfleetData = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/gps-data`);
      const data = await res.json();
      if (Array.isArray(data.report)) {
        const liveData = data.report.map((item, index) => {
          const lat = parseFloat(item.objectlatitude) / 100000;
          const lng = parseFloat(item.objectlongitude) / 100000;
          const id = item.vehicleexternalid || `GPS-${index}`;
          const currentStatus = isInYard(lat, lng) ? "In Yard" : "Out for Job";

          if (previousStatuses.current[id] === "Out for Job" && currentStatus === "In Yard") {
            sendAlert(id);
          }
          previousStatuses.current[id] = currentStatus;

          return { id, location: { lat, lng }, status: currentStatus };
        });
        setGpsData(liveData);
      }
    } catch (error) {
      console.error("Error fetching GPS data:", error);
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
    <div style={{ padding: "1rem" }}>
      <h1>Fleet Health Dashboard</h1>
      <input type="file" accept=".csv" onChange={handleFileUpload} />
      <MapContainer center={[YardLocation.lat, YardLocation.lng]} zoom={14} style={{ height: "400px", marginTop: "1rem" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {mergedTrailers.map((trailer) => (
          <Marker key={trailer.id} position={[trailer.location.lat, trailer.location.lng]}>
            <Popup>
              {trailer.id}: {trailer.status}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <div style={{ marginTop: "1rem" }}>
        {mergedTrailers.map((trailer) => (
          <div key={trailer.id}>
            <strong>{trailer.id}</strong>: {trailer.status} (Last Service: {trailer.lastService})
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;