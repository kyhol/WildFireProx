import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

// Fix for default markers in react-leaflet
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const WildfireProximityApp = () => {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [currentPage, setCurrentPage] = useState("list");
  const [userLocation, setUserLocation] = useState(null);

  const GEOCODING_API =
    "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const geocodeAddress = async (address) => {
    try {
      const params = new URLSearchParams({
        SingleLine: address + ", Newfoundland and Labrador, Canada",
        f: "json",
        outSR: "4326",
        maxLocations: 5,
        countryCode: "CA",
      });

      const response = await fetch(`${GEOCODING_API}?${params}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.candidates && data.candidates.length > 0) {
        const location = data.candidates[0].location;
        return {
          lat: location.y,
          lng: location.x,
          score: data.candidates[0].score,
          address: data.candidates[0].address,
        };
      } else {
        throw new Error(
          "Address not found. Please try a more specific address in Newfoundland & Labrador."
        );
      }
    } catch (err) {
      throw new Error(`Geocoding failed: ${err.message}`);
    }
  };

  const getWildfireData = async () => {
    try {
      const endpoint =
        "https://services8.arcgis.com/aCyQID5qQcyrJMm2/arcgis/rest/services/FFA_Wildfire/FeatureServer/1/query";

      const params = new URLSearchParams({
        where: "1=1",
        outFields: "*",
        f: "json",
        returnGeometry: "true",
        outSR: "4326",
      });

      const response = await fetch(`${endpoint}?${params}`);

      if (!response.ok) {
        throw new Error(
          `Wildfire API request failed with status: ${response.status}`
        );
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`API Error: ${data.error.message}`);
      }

      if (data.features && data.features.length > 0) {
        return data.features
          .map((feature) => ({
            ...feature.attributes,
            LATITUDE: feature.geometry ? feature.geometry.y : null,
            LONGITUDE: feature.geometry ? feature.geometry.x : null,
          }))
          .filter(
            (fire) =>
              fire.LATITUDE &&
              fire.LONGITUDE &&
              fire.STATUS &&
              ["OC", "BH", "UC"].includes(fire.STATUS)
          );
      } else {
        return [];
      }
    } catch (err) {
      setError("Could not fetch live data. Showing recent examples.");
      return [
        {
          FIREID: "NL-2025-Kingston",
          NAME: "Kingston Peninsula Fire",
          STATUS: "OC",
          LATITUDE: 47.75,
          LONGITUDE: -53.18,
          AREAEST: 5000,
          FIREDATE: 1723334400000,
          PROVFIRENUM: 301,
          REGION: "ET",
          DISTRICT: "10",
          CAUSE: "Lightning",
        },
        {
          FIREID: "NL-2025-Ochre",
          NAME: "Ochre Pit Cove Area Fire",
          STATUS: "OC",
          LATITUDE: 47.72,
          LONGITUDE: -53.25,
          AREAEST: 1200,
          FIREDATE: 1723420800000,
          PROVFIRENUM: 302,
          REGION: "ET",
          DISTRICT: "10",
          CAUSE: "Human",
        },
        {
          FIREID: "NL-2025-Trinity",
          NAME: "Trinity Bay Fire",
          STATUS: "BH",
          LATITUDE: 47.65,
          LONGITUDE: -53.38,
          AREAEST: 800,
          FIREDATE: 1723248000000,
          PROVFIRENUM: 303,
          REGION: "ET",
          DISTRICT: "11",
          CAUSE: "Lightning",
        },
      ];
    }
  };

  const getHotspotData = async () => {
    try {
      const hotspotApiUrl =
        "https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query?where=1%3D1&geometry=%7B%22xmin%22%3A-60%2C%22ymin%22%3A46%2C%22xmax%22%3A-52%2C%22ymax%22%3A52%7D&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&f=json";

      const response = await fetch(hotspotApiUrl);

      if (!response.ok) {
        return []; // Silently fail for hotspots, they're supplementary
      }

      const data = await response.json();

      if (data.error || !data.features) {
        return [];
      }

      return data.features
        .map((feature) => ({
          ...feature.attributes,
          LATITUDE: feature.attributes.latitude,
          LONGITUDE: feature.attributes.longitude,
          FIREID: `hotspot-${feature.attributes.OBJECTID}`,
          NAME: `Thermal Hotspot (${feature.attributes.confidence})`,
          STATUS: feature.attributes.confidence,
          isHotspot: true, // Flag to identify hotspots
        }))
        .filter((hotspot) => hotspot.LATITUDE && hotspot.LONGITUDE);
    } catch (err) {
      return []; // Silently fail for hotspots
    }
  };

  const getCachedData = () => {
    try {
      const cached = JSON.parse(sessionStorage.getItem("wildfireData") || "{}");
      const cacheAge = Date.now() - (cached.timestamp || 0);
      const maxAge = 10 * 60 * 1000;

      if (cacheAge < maxAge && cached.data) {
        setLastUpdated(new Date(cached.timestamp));
        return cached.data;
      }
    } catch (err) {
      console.error("Cache error:", err);
    }
    return null;
  };

  const setCachedData = (data) => {
    try {
      const timestamp = Date.now();
      const cacheData = { data, timestamp };
      sessionStorage.setItem("wildfireData", JSON.stringify(cacheData));
      setLastUpdated(new Date(timestamp));
    } catch (err) {
      console.error("Cache storage error:", err);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "OC":
        return "text-red-700 bg-red-100 border-red-300";
      case "BH":
        return "text-purple-700 bg-purple-100 border-purple-300";
      case "UC":
        return "text-green-700 bg-green-100 border-green-300";
      case "O":
        return "text-gray-700 bg-gray-100 border-gray-300";
      default:
        return "text-gray-700 bg-gray-100 border-gray-300";
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case "OC":
        return "Out-of-Control";
      case "BH":
        return "Being Held";
      case "UC":
        return "Under Control";
      case "O":
        return "Out";
      default:
        return "Unknown";
    }
  };

  const getRiskLevel = (distance, status) => {
    if (status === "OC") {
      if (distance < 10)
        return {
          level: "EXTREME RISK",
          color: "text-red-900 bg-red-200 border-red-400",
        };
      if (distance < 25)
        return {
          level: "HIGH RISK",
          color: "text-red-800 bg-red-100 border-red-300",
        };
      if (distance < 50)
        return {
          level: "MODERATE RISK",
          color: "text-orange-800 bg-orange-100 border-orange-300",
        };
    }
    if ((status === "BH" || status === "OC") && distance < 100) {
      return {
        level: "LOW RISK",
        color: "text-yellow-800 bg-yellow-100 border-yellow-300",
      };
    }
    return {
      level: "MINIMAL RISK",
      color: "text-green-800 bg-green-100 border-green-300",
    };
  };

  const searchWildfires = async () => {
    if (!address.trim()) {
      setError("Please enter an address");
      return;
    }

    setLoading(true);
    setError("");
    setResults([]);

    try {
      const location = await geocodeAddress(address);
      setUserLocation(location);

      let wildfires = getCachedData();
      if (!wildfires) {
        wildfires = await getWildfireData();
        setCachedData(wildfires);
      }

      // Get hotspot data for map display (separate from main search results)
      const hotspots = await getHotspotData();

      if (wildfires.length === 0) {
        setResults([]);
        if (!error) {
          setError(
            "No active wildfires found in the database. Your area is clear."
          );
        }
        // Still store hotspots for map even if no wildfires
        if (hotspots.length > 0) {
          const hotspotsWithDistance = hotspots.map((hotspot) => ({
            ...hotspot,
            distance: calculateDistance(
              location.lat,
              location.lng,
              hotspot.LATITUDE,
              hotspot.LONGITUDE
            ),
          }));
          sessionStorage.setItem(
            "mapHotspots",
            JSON.stringify(hotspotsWithDistance)
          );
        }
        return;
      }

      const firesWithDistance = wildfires
        .map((fire) => ({
          ...fire,
          distance: calculateDistance(
            location.lat,
            location.lng,
            fire.LATITUDE,
            fire.LONGITUDE
          ),
        }))
        .sort((a, b) => a.distance - b.distance);

      // Calculate distances for hotspots for map display
      const hotspotsWithDistance = hotspots.map((hotspot) => ({
        ...hotspot,
        distance: calculateDistance(
          location.lat,
          location.lng,
          hotspot.LATITUDE,
          hotspot.LONGITUDE
        ),
      }));

      // Set only wildfires as main results (no hotspots in the list view)
      setResults(firesWithDistance);

      // Store hotspots separately for map use
      sessionStorage.setItem(
        "mapHotspots",
        JSON.stringify(hotspotsWithDistance)
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      sessionStorage.removeItem("wildfireData");
      sessionStorage.removeItem("mapHotspots");
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Custom fire marker icon - memoized for performance
  const createFireIcon = React.useMemo(() => {
    const iconCache = {};

    return (status, isHotspot = false) => {
      const cacheKey = `${status}-${isHotspot}`;

      if (iconCache[cacheKey]) {
        return iconCache[cacheKey];
      }

      let icon;
      if (isHotspot) {
        const color = status?.toLowerCase() === "high" ? "#dc2626" : "#f59e0b";
        icon = L.divIcon({
          html: `<div style="background: ${color}; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 10px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🔥</div>`,
          className: "custom-div-icon",
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
      } else {
        const color =
          status === "OC" ? "#dc2626" : status === "BH" ? "#9333ea" : "#16a34a";
        icon = L.divIcon({
          html: `<div style="background: ${color}; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🔥</div>`,
          className: "custom-div-icon",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
      }

      iconCache[cacheKey] = icon;
      return icon;
    };
  }, []);

  // User location icon - memoized for performance
  const userIcon = React.useMemo(
    () =>
      L.divIcon({
        html: '<div style="background: #3b82f6; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px;">📍</div>',
        className: "custom-div-icon",
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    []
  );

  // Interactive Map Component using react-leaflet
  const InteractiveMap = () => {
    const mapCenter = userLocation
      ? [userLocation.lat, userLocation.lng]
      : [48.5, -56.5];
    const mapZoom = userLocation ? 9 : 6;

    // Get hotspots from storage for map display
    const hotspots = JSON.parse(sessionStorage.getItem("mapHotspots") || "[]");

    return (
      <div className="h-full w-full">
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          className="w-full h-96 md:h-[500px] rounded-lg border border-gray-300"
          key={`${mapCenter[0]}-${mapCenter[1]}-${results.length}-${hotspots.length}`}
          preferCanvas={true}
          zoomControl={true}
          scrollWheelZoom={true}
          doubleClickZoom={true}
          touchZoom={true}
          zoomAnimation={false}
          markerZoomAnimation={false}
          updateWhenZooming={false}
          updateWhenIdle={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={18}
            keepBuffer={2}
            updateWhenIdle={true}
            updateWhenZooming={false}
          />

          {userLocation && (
            <Marker
              position={[userLocation.lat, userLocation.lng]}
              icon={userIcon}
            >
              <Popup>
                <div style={{ fontSize: "14px" }}>
                  <strong>Your Location</strong>
                  <br />
                  {userLocation.address || address}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Display main fire results */}
          {results.map((fire, index) => {
            const risk = userLocation
              ? getRiskLevel(fire.distance, fire.STATUS)
              : null;
            return (
              <Marker
                key={fire.FIREID || index}
                position={[fire.LATITUDE, fire.LONGITUDE]}
                icon={createFireIcon(fire.STATUS)}
              >
                <Popup>
                  <div style={{ fontSize: "14px", minWidth: "200px" }}>
                    <strong
                      style={{
                        color:
                          fire.STATUS === "OC"
                            ? "#dc2626"
                            : fire.STATUS === "BH"
                            ? "#9333ea"
                            : "#16a34a",
                      }}
                    >
                      {fire.NAME || `Fire #${fire.PROVFIRENUM}`}
                    </strong>
                    <br />
                    <strong>Status:</strong> {getStatusText(fire.STATUS)}
                    <br />
                    <strong>Area:</strong>{" "}
                    {fire.AREAEST ? `${fire.AREAEST} hectares` : "TBD"}
                    <br />
                    <strong>Cause:</strong> {fire.CAUSE || "Unknown"}
                    <br />
                    {userLocation && (
                      <>
                        <strong>Distance:</strong> {fire.distance.toFixed(1)} km
                        <br />
                      </>
                    )}
                    {risk && (
                      <>
                        <strong>Risk Level:</strong>{" "}
                        <span
                          style={{
                            color:
                              fire.STATUS === "OC"
                                ? "#dc2626"
                                : fire.STATUS === "BH"
                                ? "#9333ea"
                                : "#16a34a",
                          }}
                        >
                          {risk.level}
                        </span>
                      </>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Display hotspots as smaller markers */}
          {hotspots.map((hotspot, index) => (
            <Marker
              key={`hotspot-${hotspot.FIREID || index}`}
              position={[hotspot.LATITUDE, hotspot.LONGITUDE]}
              icon={createFireIcon(hotspot.STATUS, true)}
            >
              <Popup>
                <div style={{ fontSize: "12px", minWidth: "180px" }}>
                  <strong
                    style={{
                      color:
                        hotspot.STATUS?.toLowerCase() === "high"
                          ? "#dc2626"
                          : "#f59e0b",
                    }}
                  >
                    {hotspot.NAME}
                  </strong>
                  <br />
                  <strong>Type:</strong> Thermal Hotspot
                  <br />
                  <strong>Confidence:</strong> {hotspot.STATUS}
                  <br />
                  {hotspot.frp && (
                    <>
                      <strong>Intensity:</strong> {hotspot.frp} MW
                      <br />
                    </>
                  )}
                  {userLocation && (
                    <>
                      <strong>Distance:</strong> {hotspot.distance.toFixed(1)}{" "}
                      km
                      <br />
                    </>
                  )}
                  <em style={{ fontSize: "10px", color: "#666" }}>
                    Satellite detection - not confirmed fire
                  </em>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    );
  };

  // Map View
  if (currentPage === "map") {
    return (
      <div className="max-w-6xl mx-auto p-6 bg-white min-h-screen">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCurrentPage("list")}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                ← Back to List
              </button>
              <div className="flex items-center">
                <span className="text-3xl mr-2">🗺️</span>
                <h1 className="text-2xl font-bold text-gray-800">
                  Wildfire Map View
                </h1>
              </div>
            </div>
          </div>
          {lastUpdated && (
            <p className="text-sm text-gray-500">
              Data last updated: {lastUpdated.toLocaleString()}
            </p>
          )}
        </div>

        <div className="mb-6">
          <div className="flex gap-4 flex-col sm:flex-row">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-3 text-gray-400">📍</span>
              <input
                type="text"
                placeholder="Enter your address to see your location on the map"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && searchWildfires()}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-base text-black placeholder:text-gray-600"
              />
            </div>
            <button
              onClick={searchWildfires}
              disabled={loading}
              className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors min-w-[120px]"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Searching...
                </>
              ) : (
                <>
                  <span>🔍</span> Search
                </>
              )}
            </button>
          </div>
          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 flex items-center gap-2">
                <span>⚠️</span>
                {error}
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Legend</h3>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-white text-xs">
                  🔥
                </div>
                <span>Out-of-Control Fire</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center text-white text-xs">
                  🔥
                </div>
                <span>Being Held Fire</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center text-white text-xs">
                  🔥
                </div>
                <span>Under Control Fire</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-red-600 rounded-full flex items-center justify-center text-white text-xs">
                  🔥
                </div>
                <span>High Confidence Hotspot</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-white text-xs">
                  🔥
                </div>
                <span>Lower Confidence Hotspot</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                <span>Your Location</span>
              </div>
            </div>
          </div>
          <InteractiveMap />
        </div>

        {results.length === 0 && !loading && !error && (
          <div className="text-center py-8">
            <span className="text-6xl mb-4 block">🌲</span>
            <p className="text-gray-600">
              Enter an address to see wildfires and your location on the map
            </p>
          </div>
        )}
      </div>
    );
  }

  // List View
  return (
    <div className="max-w-4xl mx-auto p-6 bg-white min-h-screen">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-4">
          <span className="text-4xl mr-2">🔥</span>
          <h1 className="text-3xl font-bold text-gray-800">
            NL Wildfire Proximity
          </h1>
        </div>
        <p className="text-gray-600">
          Check active wildfires near your location in Newfoundland & Labrador
        </p>
        {lastUpdated && (
          <p className="text-sm text-gray-500 mt-2">
            Data last updated: {lastUpdated.toLocaleString()}
          </p>
        )}
        {results.length > 0 && (
          <button
            onClick={() => setCurrentPage("map")}
            className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 mx-auto"
          >
            <span>🗺️</span>View Interactive Map
          </button>
        )}
      </div>

      <div className="mb-8">
        <div className="flex gap-4 flex-col sm:flex-row">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-3 text-gray-400">📍</span>
            <input
              type="text"
              placeholder="Enter your address (e.g., 123 Water Street, St. John's, NL)"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && searchWildfires()}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-base text-black placeholder:text-gray-600"
            />
          </div>
          <button
            onClick={searchWildfires}
            disabled={loading}
            className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors min-w-[120px]"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Searching...
              </>
            ) : (
              <>
                <span>🔍</span> Search
              </>
            )}
          </button>
        </div>
        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 flex items-center gap-2">
              <span>⚠️</span>
              {error}
            </p>
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            Active Wildfires Found: {results.length}
          </h2>
          {results.map((fire, index) => {
            const risk = getRiskLevel(fire.distance, fire.STATUS);
            return (
              <div
                key={fire.FIREID || index}
                className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4 flex-col sm:flex-row">
                  <div className="mb-2 sm:mb-0">
                    <h3 className="text-lg font-semibold text-gray-800">
                      {fire.NAME || `Fire #${fire.PROVFIRENUM || fire.FIREID}`}
                    </h3>
                    <p className="text-gray-600 text-sm">
                      ID: {fire.FIREID} | Region: {fire.REGION || "Unknown"}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-800">
                      {fire.distance.toFixed(1)} km
                    </div>
                    <div className="text-sm text-gray-500">away</div>
                    <div
                      className={`text-xs font-medium px-2 py-1 rounded-full mt-1 border ${risk.color}`}
                    >
                      {risk.level}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div>
                    <span className="text-sm font-medium text-gray-500">
                      Status:
                    </span>
                    <div
                      className={`inline-block px-2 py-1 rounded text-sm font-semibold border ${getStatusColor(
                        fire.STATUS
                      )} mt-1`}
                    >
                      {getStatusText(fire.STATUS)}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">
                      Area:
                    </span>
                    <div className="font-semibold text-gray-800">
                      {fire.AREAEST ? `${fire.AREAEST} hectares` : "TBD"}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">
                      Start Date:
                    </span>
                    <div className="font-semibold text-gray-800">
                      {fire.FIREDATE
                        ? new Date(fire.FIREDATE).toLocaleDateString()
                        : "Unknown"}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">
                      Cause:
                    </span>
                    <div className="font-semibold text-gray-800">
                      {fire.CAUSE || "Unknown"}
                    </div>
                  </div>
                </div>
                {fire.distance < 50 && fire.STATUS === "OC" && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-2 text-red-800">
                      <span className="text-xl">🚨</span>
                      <div>
                        <p className="font-medium">Critical Alert</p>
                        <p className="text-sm">
                          Out-of-control fire within 50km. Monitor emergency
                          alerts, prepare evacuation plan, and follow official
                          instructions.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {results.length === 0 && !loading && !error && (
        <div className="text-center py-8">
          <span className="text-6xl mb-4 block">🌲</span>
          <p className="text-gray-600">
            Enter an address to check for nearby wildfires
          </p>
        </div>
      )}

      <div className="mt-8 bg-blue-50 rounded-lg p-6 border border-blue-200">
        <h3 className="text-lg font-semibold text-blue-800 mb-3">
          About This Tool
        </h3>
        <div className="grid md:grid-cols-2 gap-4 text-blue-700">
          <div>
            <h4 className="font-medium mb-2">How it works:</h4>
            <ul className="space-y-1 text-sm">
              <li>• Uses official NL government wildfire data</li>
              <li>• Calculates straight-line distances</li>
              <li>• Updates data every 10 minutes</li>
              <li>• Works entirely in your browser</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2">Important notes:</h4>
            <ul className="space-y-1 text-sm">
              <li>• Distances are straight-line, not road distances</li>
              <li>• Weather and terrain affect actual fire spread</li>
              <li>• Always follow official emergency instructions</li>
              <li>• Contact authorities for evacuation guidance</li>
              <li>• Map also shows satellite thermal hotspots for context</li>
              <li>
                • Check for official advisories on the{" "}
                <a
                  href="https://www.gov.nl.ca/alerts/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium hover:text-blue-900"
                >
                  NL Public Alerts
                </a>{" "}
                page.
              </li>
              <li>
                • For up-to-date info, see the{" "}
                <a
                  href="https://www.gov.nl.ca/releases/wildfire-news/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium hover:text-blue-900"
                >
                  latest wildfire news
                </a>
                .
              </li>
              <li>
                • Know{" "}
                <a
                  href="https://www.getprepared.gc.ca/cnt/hzd/wldfrs-prp-en.aspx"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium hover:text-blue-900"
                >
                  what to do in a wildfire
                </a>
                .
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WildfireProximityApp;
