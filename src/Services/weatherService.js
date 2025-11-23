const axios = require("axios");

const OWM_KEY = process.env.OPENWEATHER_API_KEY || null;

// Geocode: try OpenWeatherMap (if key) else Nominatim (no key)
const geocodeLocation = async (location) => {
  if (!location) return null;
  try {
    const q = String(location).trim();
    // quick hardcoded Colombo support
    if (q.toLowerCase().includes("colombo")) {
      return { lat: 6.9271, lon: 79.8612 };
    }

    if (OWM_KEY) {
      const url = `http://api.openweathermap.org/geo/1.0/direct`;
      const res = await axios.get(url, { params: { q, limit: 1, appid: OWM_KEY }, timeout: 7000 });
      if (Array.isArray(res.data) && res.data.length) {
        return { lat: res.data[0].lat, lon: res.data[0].lon };
      }
    }

    // Fallback: Nominatim (OpenStreetMap) — no API key required
    const nomUrl = "https://nominatim.openstreetmap.org/search";
    const nom = await axios.get(nomUrl, {
      params: { q, format: "json", limit: 1 },
      headers: { "User-Agent": "energy-trading-network-backend/1.0 (+https://example.com)" },
      timeout: 7000
    });
    if (Array.isArray(nom.data) && nom.data.length) {
      return { lat: parseFloat(nom.data[0].lat), lon: parseFloat(nom.data[0].lon) };
    }

    return null;
  } catch (err) {
    console.error("geocodeLocation error:", err.message);
    return null;
  }
};

// Get current weather: prefer OpenWeatherMap (if key), else use Open-Meteo (no key)
const getCurrentWeather = async (lat, lon) => {
  if (!lat || !lon) return null;
  try {
    if (OWM_KEY) {
      const url = `https://api.openweathermap.org/data/2.5/weather`;
      const res = await axios.get(url, { params: { lat, lon, appid: OWM_KEY, units: "metric" }, timeout: 7000 });
      return res.data;
    }

    // Open-Meteo fallback: returns object shaped somewhat like OpenWeatherMap
    const omUrl = `https://api.open-meteo.com/v1/forecast`;
    // request current weather + hourly cloudcover & precipitation + daily sunrise/sunset (UTC)
    const res = await axios.get(omUrl, {
      params: {
        latitude: lat,
        longitude: lon,
        current_weather: true,
        hourly: "cloudcover,precipitation",
        daily: "sunrise,sunset",
        timezone: "UTC"
      },
      timeout: 7000
    });

    const data = res.data;
    // find current hour index
    const nowIso = new Date().toISOString().slice(0,13) + ":00";
    let hourIndex = data.hourly?.time?.indexOf ? data.hourly.time.indexOf(nowIso) : -1;
    if (hourIndex === -1) hourIndex = 0;

    const cloudcover = (data.hourly && data.hourly.cloudcover && typeof data.hourly.cloudcover[hourIndex] === "number")
      ? data.hourly.cloudcover[hourIndex]
      : 0;
    const precipitation = (data.hourly && data.hourly.precipitation && typeof data.hourly.precipitation[hourIndex] === "number")
      ? data.hourly.precipitation[hourIndex]
      : 0;

    // daily sunrise/sunset for today index 0
    const sunriseIso = data.daily?.sunrise?.[0];
    const sunsetIso = data.daily?.sunset?.[0];
    const sunriseTs = sunriseIso ? Math.floor(new Date(sunriseIso).getTime() / 1000) : null;
    const sunsetTs = sunsetIso ? Math.floor(new Date(sunsetIso).getTime() / 1000) : null;

    // assemble object with minimal fields used by estimator
    return {
      clouds: { all: cloudcover },
      weather: [{ id: precipitation > 0 ? 500 : 800 }],
      sys: { sunrise: sunriseTs, sunset: sunsetTs },
      // include raw current_weather if present
      current_weather: data.current_weather || null
    };
  } catch (err) {
    console.error("getCurrentWeather error:", err.message);
    return null;
  }
};

module.exports = {
  geocodeLocation,
  getCurrentWeather
};