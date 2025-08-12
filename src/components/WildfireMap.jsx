import React from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
} from "react-leaflet";
import L from "leaflet";

// --- FIX for broken marker icons with Webpack ---
// This is a common issue with React-Leaflet and ensures that the
// default marker icons are found and displayed correctly.
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;
// --- END FIX ---

// Helper component to recenter the map when the user's location or results change.
const ChangeView = ({ center, zoom }) => {
  const map = useMap();
  map.setView(center, zoom);
  return null;
};

// Helper function to get a color based on the fire's status.
const getStatusColor = (status) => {
  switch (status) {
    case "OC":
      return "red";
    case "BH":
      return "orange";
    case "UC":
      return "green";
    default:
      return "gray";
  }
};

const WildfireMap = ({ fires, userLocation }) => {
  // Set a default center for the map (center of Newfoundland) for initial load.
  const defaultCenter = [48.95, -56.0];
  const mapCenter = userLocation
    ? [userLocation.lat, userLocation.lng]
    : defaultCenter;

  return (
    <MapContainer
      center={mapCenter}
      zoom={userLocation ? 9 : 6} // Zoom in if a location is set, otherwise show the whole province.
      style={{ height: "500px", width: "100%", borderRadius: "8px", zIndex: 0 }}
    >
      <ChangeView center={mapCenter} zoom={userLocation ? 9 : 6} />

      {/* Base map tiles from OpenStreetMap */}
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      {/* Marker for the user's searched address */}
      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.lng]}>
          <Popup>
            <div className="font-semibold">Your Location</div>
            {userLocation.address}
          </Popup>
        </Marker>
      )}

      {/* Render a circle for each wildfire */}
      {fires.map((fire) => {
        // Use a circle to represent the fire area. Radius is in meters.
        // Formula for radius from area: r = sqrt(Area / PI). 1 hectare = 10,000 sq meters.
        const radius = fire.AREAEST
          ? Math.sqrt((fire.AREAEST * 10000) / Math.PI)
          : 1000; // Default to 1km radius

        return (
          <Circle
            key={fire.FIREID}
            center={[fire.LATITUDE, fire.LONGITUDE]}
            pathOptions={{
              color: getStatusColor(fire.STATUS),
              fillColor: getStatusColor(fire.STATUS),
              fillOpacity: 0.5,
            }}
            radius={radius}
          >
            <Popup>
              <div className="text-base font-bold">
                {fire.NAME || "Unnamed Fire"}
              </div>
              <div>
                <strong>Status:</strong> {fire.STATUS}
              </div>
              <div>
                <strong>Area:</strong>{" "}
                {fire.AREAEST ? `${fire.AREAEST} hectares` : "N/A"}
              </div>
              <div>
                <strong>Distance:</strong> {fire.distance.toFixed(1)} km away
              </div>
            </Popup>
          </Circle>
        );
      })}
    </MapContainer>
  );
};

export default WildfireMap;
