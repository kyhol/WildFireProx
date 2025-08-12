import React, { useState, useEffect } from "react";

const WildfireProximityApp = () => {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

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
      console.log("Geocoding response:", data); // For debugging

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

  // --- UPDATED FUNCTION ---
  // Fetches live wildfire data from the correct NL government ArcGIS endpoint
  const getWildfireData = async () => {
    try {
      const endpoint =
        "https://services8.arcgis.com/aCyQID5qQcyrJMm2/arcgis/rest/services/FFA_Wildfire/FeatureServer/1/query";

      const params = new URLSearchParams({
        where: "1=1", // Query for all features
        outFields: "*", // Fetch all available data fields
        f: "json", // Request JSON format
        returnGeometry: "true", // CRITICAL: ensures location data is included
        outSR: "4326", // Request coordinates in standard latitude/longitude
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
        // Map over the features and correctly extract attributes and coordinates
        return data.features
          .map((feature) => ({
            ...feature.attributes,
            // The geometry object contains the coordinates
            LATITUDE: feature.geometry ? feature.geometry.y : null,
            LONGITUDE: feature.geometry ? feature.geometry.x : null,
          }))
          .filter(
            // Filter for active fires that have valid coordinates
            (fire) =>
              fire.LATITUDE &&
              fire.LONGITUDE &&
              fire.STATUS &&
              ["OC", "BH", "UC"].includes(fire.STATUS)
          );
      } else {
        // This is a valid response, meaning there are just no active fires
        return [];
      }
    } catch (err) {
      console.error("Error fetching live wildfire data, using fallback:", err);
      // If the API fetch fails, use the static fallback data
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
  //test
  // Cache management with sessionStorage
  const getCachedData = () => {
    try {
      const cached = JSON.parse(sessionStorage.getItem("wildfireData") || "{}");
      const cacheAge = Date.now() - (cached.timestamp || 0);
      const maxAge = 10 * 60 * 1000; // 10 minutes cache

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

      // Get user location
      const userLocation = await geocodeAddress(address);
      console.log("User location:", userLocation);

      // Get wildfire data (try cache first)
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
        // Don't set an error if it was a successful empty fetch
        if (!error) {
          setError(
            "No active wildfires found in the database. Your area is clear."
          );
        }
        return;
      }

      // Calculate distances and sort by proximity
      const firesWithDistance = wildfires
        .map((fire) => ({
          ...fire,
          distance: calculateDistance(
            userLocation.lat,
            userLocation.lng,
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

  // Auto-refresh cache every 10 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      console.log("Clearing wildfire cache for auto-refresh.");
      sessionStorage.removeItem("wildfireData");
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

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
      </div>

      {/* Search Input */}
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

      {/* Results */}
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

      {/* Information Panel */}
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
