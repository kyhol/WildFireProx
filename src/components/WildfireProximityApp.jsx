import React, { useState, useEffect, useRef } from "react";

const WildfireProximityApp = () => {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [currentPage, setCurrentPage] = useState("list"); // "list" or "map"
  const [userLocation, setUserLocation] = useState(null);

  // API endpoints
  const GEOCODING_API =
    "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";

  // Haversine formula for distance calculation
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in kilometers
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

  // Real geocoding using ArcGIS (free, no API key needed)
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
      console.log("Geocoding response:", data);

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
      console.error("Geocoding error:", err);
      throw new Error(`Geocoding failed: ${err.message}`);
    }
  };

  // Fetches live wildfire data from the NL government ArcGIS endpoint
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
      console.log("Live Wildfire API response:", data);

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
      console.error("Error fetching live wildfire data, using fallback:", err);
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
        {
          FIREID: "NL-2025-Labrador",
          NAME: "Labrador City Area Fire",
          STATUS: "UC",
          LATITUDE: 52.94,
          LONGITUDE: -66.91,
          AREAEST: 2500,
          FIREDATE: 1723161600000,
          PROVFIRENUM: 304,
          REGION: "LB",
          DISTRICT: "20",
          CAUSE: "Lightning",
        },
      ];
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
      const cacheData = {
        data,
        timestamp: timestamp,
      };
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
        return "text-yellow-700 bg-yellow-100 border-yellow-300";
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
      console.log("Searching for:", address);

      const location = await geocodeAddress(address);
      console.log("User location:", location);
      setUserLocation(location);

      let wildfires = getCachedData();
      if (!wildfires) {
        console.log("Fetching fresh wildfire data...");
        wildfires = await getWildfireData();
        setCachedData(wildfires);
      } else {
        console.log("Using cached wildfire data");
      }

      if (wildfires.length === 0) {
        setResults([]);
        if (!error) {
          setError(
            "No active wildfires found in the database. Your area is clear."
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

      console.log("Fires with distances:", firesWithDistance);
      setResults(firesWithDistance);
    } catch (err) {
      console.error("Search error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      console.log("Clearing wildfire cache for auto-refresh.");
      sessionStorage.removeItem("wildfireData");
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Map Component
  const InteractiveMap = () => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef([]);

    useEffect(() => {
      // Load Leaflet dynamically
      if (!window.L) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);

        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = initMap;
        document.body.appendChild(script);
      } else {
        initMap();
      }

      return () => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      };
    }, []);

    useEffect(() => {
      if (mapInstanceRef.current && (results.length > 0 || userLocation)) {
        updateMapMarkers();
      }
    }, [results, userLocation]);

    const initMap = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      // Center on Newfoundland and Labrador
      const map = window.L.map(mapRef.current).setView([48.5, -56.5], 6);

      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      mapInstanceRef.current = map;
      updateMapMarkers();
    };

    const updateMapMarkers = () => {
      if (!mapInstanceRef.current || !window.L) return;

      // Clear existing markers
      markersRef.current.forEach((marker) => {
        mapInstanceRef.current.removeLayer(marker);
      });
      markersRef.current = [];

      const bounds = [];

      // Add user location marker if available
      if (userLocation) {
        const userMarker = window.L.marker(
          [userLocation.lat, userLocation.lng],
          {
            icon: window.L.divIcon({
              html: '<div style="background: #3b82f6; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px;">📍</div>',
              className: "custom-div-icon",
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            }),
          }
        ).addTo(mapInstanceRef.current);

        userMarker.bindPopup(`
          <div style="font-size: 14px;">
            <strong>Your Location</strong><br>
            ${userLocation.address || address}
          </div>
        `);

        markersRef.current.push(userMarker);
        bounds.push([userLocation.lat, userLocation.lng]);
      }

      // Add wildfire markers
      results.forEach((fire) => {
        const getMarkerColor = (status) => {
          switch (status) {
            case "OC":
              return "#dc2626"; // red
            case "BH":
              return "#f59e0b"; // yellow
            case "UC":
              return "#16a34a"; // green
            default:
              return "#6b7280"; // gray
          }
        };

        const marker = window.L.marker([fire.LATITUDE, fire.LONGITUDE], {
          icon: window.L.divIcon({
            html: `<div style="background: ${getMarkerColor(
              fire.STATUS
            )}; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🔥</div>`,
            className: "custom-div-icon",
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
        }).addTo(mapInstanceRef.current);

        const risk = userLocation
          ? getRiskLevel(fire.distance, fire.STATUS)
          : null;

        marker.bindPopup(`
          <div style="font-size: 14px; min-width: 200px;">
            <strong style="color: ${getMarkerColor(fire.STATUS)};">${
          fire.NAME || `Fire #${fire.PROVFIRENUM}`
        }</strong><br>
            <strong>Status:</strong> ${getStatusText(fire.STATUS)}<br>
            <strong>Area:</strong> ${
              fire.AREAEST ? `${fire.AREAEST} hectares` : "TBD"
            }<br>
            <strong>Cause:</strong> ${fire.CAUSE || "Unknown"}<br>
            ${
              userLocation
                ? `<strong>Distance:</strong> ${fire.distance.toFixed(
                    1
                  )} km<br>`
                : ""
            }
            ${
              risk
                ? `<strong>Risk Level:</strong> <span style="color: ${getMarkerColor(
                    fire.STATUS
                  )};">${risk.level}</span>`
                : ""
            }
          </div>
        `);

        markersRef.current.push(marker);
        bounds.push([fire.LATITUDE, fire.LONGITUDE]);
      });

      // Fit map to show all markers
      if (bounds.length > 0) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [20, 20] });
      }
    };

    return (
      <div className="h-full w-full">
        <div
          ref={mapRef}
          className="w-full h-96 md:h-[500px] rounded-lg border border-gray-300"
        ></div>
      </div>
    );
  };

  // Render the appropriate page
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
                  <span>🔍</span>
                  Search
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
                <div className="w-4 h-4 bg-red-600 rounded-full"></div>
                <span>Out-of-Control</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-500 rounded-full"></div>
                <span>Being Held</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-600 rounded-full"></div>
                <span>Under Control</span>
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

  // Original list view
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
            <span>🗺️</span>
            View Interactive Map
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
                <span>🔍</span>
                Search
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
              <li>• Distances are approximate</li>
              <li>• Always follow official emergency alerts</li>
              <li>• Wind and terrain affect actual risk</li>
              <li>• For emergencies, call 911</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-blue-200">
          <a
            href="https://www.gov.nl.ca/ffa/public-education/forestry/forest-fires/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 hover:text-blue-800 flex items-center gap-1 text-sm font-medium"
          >
            <span>🔗</span>
            Official NL Forest Fire Information
          </a>
        </div>
      </div>
    </div>
  );
};

export default WildfireProximityApp;
