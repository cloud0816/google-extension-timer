/**
 * Current conditions from Open-Meteo (https://open-meteo.com) — free, no API
 * key, and CORS-open, so the new tab can call it without host permissions.
 *
 * Every selected city goes out in a single batched request, and the answer is
 * cached so opening a dozen tabs does not mean a dozen calls.
 */

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";

/** WMO weather interpretation codes, grouped onto the icons we draw. */
const CODES = new Map([
  [0, ["Clear sky", "clear"]],
  [1, ["Mainly clear", "partly"]],
  [2, ["Partly cloudy", "partly"]],
  [3, ["Overcast", "cloud"]],
  [45, ["Fog", "fog"]],
  [48, ["Rime fog", "fog"]],
  [51, ["Light drizzle", "drizzle"]],
  [53, ["Drizzle", "drizzle"]],
  [55, ["Heavy drizzle", "drizzle"]],
  [56, ["Freezing drizzle", "drizzle"]],
  [57, ["Freezing drizzle", "drizzle"]],
  [61, ["Light rain", "rain"]],
  [63, ["Rain", "rain"]],
  [65, ["Heavy rain", "rain"]],
  [66, ["Freezing rain", "rain"]],
  [67, ["Freezing rain", "rain"]],
  [71, ["Light snow", "snow"]],
  [73, ["Snow", "snow"]],
  [75, ["Heavy snow", "snow"]],
  [77, ["Snow grains", "snow"]],
  [80, ["Light showers", "rain"]],
  [81, ["Showers", "rain"]],
  [82, ["Violent showers", "rain"]],
  [85, ["Snow showers", "snow"]],
  [86, ["Heavy snow showers", "snow"]],
  [95, ["Thunderstorm", "thunder"]],
  [96, ["Thunderstorm, hail", "thunder"]],
  [99, ["Thunderstorm, hail", "thunder"]],
]);

export function describeCode(code) {
  const hit = CODES.get(code);
  return { label: hit ? hit[0] : "Unknown", icon: hit ? hit[1] : "cloud" };
}

/* ---------- Icons ---------- */

const CLOUD = `<path d="M18 10.2h-1.3A8 8 0 1 0 9 20.2h9a5 5 0 0 0 0-10z" />`;
const RAIN_CLOUD = `<path d="M20 16.6A5 5 0 0 0 18 7.2h-1.3A8 8 0 1 0 4 15.4" />`;
const SMALL_SUN = `<circle cx="8.6" cy="8.6" r="3.1" />
    <path d="M8.6 2.5v1.5M8.6 13.2v1.5M2.5 8.6H4M13.2 8.6h1.5M4.3 4.3l1.1 1.1M11.8 11.8l1.1 1.1M4.3 12.9l1.1-1.1M11.8 5.4l1.1-1.1" />`;
const SMALL_MOON = `<path d="M13.6 9.1A5.2 5.2 0 1 1 7.7 3.2a4 4 0 0 0 5.9 5.9z" />`;
const SMALL_CLOUD = `<path d="M18.2 20.4h-6.6a3.4 3.4 0 0 1 .3-6.8 4.7 4.7 0 0 1 8.9 1.1 2.9 2.9 0 0 1-2.6 5.7z" />`;

/**
 * `clear` and `partly` come in day and night flavours; the caller passes the
 * phase the rest of the UI already computed from the sun's position.
 */
export const WEATHER_ICONS = {
  clear: (night) => (night ? `<path d="M20.5 14.3A8.6 8.6 0 1 1 9.7 3.5a6.9 6.9 0 0 0 10.8 10.8z" />`
    : `<circle cx="12" cy="12" r="4.2" />
       <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />`),
  partly: (night) => `${night ? SMALL_MOON : SMALL_SUN}${SMALL_CLOUD}`,
  cloud: () => CLOUD,
  // Banded haze rather than a cloud, so fog never reads as plain overcast.
  fog: () => `<path d="M3.5 7h17M6.5 11.5h14M3.5 16h13M8.5 20.5h11" />`,
  drizzle: () => `${RAIN_CLOUD}<path d="M8 18.4v1.4M12 20.2v1.4M16 18.4v1.4" />`,
  rain: () => `${RAIN_CLOUD}<path d="M8 17.6v3.2M12 19v3.4M16 17.6v3.2" />`,
  snow: () => `${RAIN_CLOUD}
    <path d="M8 17.8v4.4M6 19l4 2.2M10 19l-4 2.2" />
    <path d="M16 17.8v4.4M14 19l4 2.2M18 19l-4 2.2" />`,
  thunder: () => `<path d="M19 16.9A5 5 0 0 0 18 7.2h-1.3a8 8 0 1 0-11.6 9" />
    <path d="M13 11.5 9 17.5h5l-3.4 5" />`,
};

export function iconMarkup(icon, night = false) {
  const build = WEATHER_ICONS[icon] || WEATHER_ICONS.cloud;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round">${build(night)}</svg>`;
}

/* ---------- Units ---------- */

// The handful of places that still read Fahrenheit day to day.
const FAHRENHEIT_REGIONS = new Set(["US", "BS", "BZ", "KY", "LR", "PW", "FM", "MH"]);

export function defaultTempUnit() {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    return FAHRENHEIT_REGIONS.has(region) ? "fahrenheit" : "celsius";
  } catch {
    return "celsius";
  }
}

/** Readings are stored in Celsius, so switching units never needs a refetch. */
export function formatTemp(tempC, unit, withUnit = false) {
  if (typeof tempC !== "number" || !Number.isFinite(tempC)) return null;
  const fahrenheit = unit === "fahrenheit";
  const value = Math.round(fahrenheit ? tempC * 9 / 5 + 32 : tempC);
  return `${value}°${withUnit ? (fahrenheit ? "F" : "C") : ""}`;
}

/* ---------- Fetch ---------- */

/**
 * One request for every city. Open-Meteo returns an array in the order asked
 * for when several coordinates are given, and a bare object for a single one.
 */
export async function fetchWeather(cities, { signal } = {}) {
  if (!cities.length) return new Map();

  const url = new URL(ENDPOINT);
  url.searchParams.set("latitude", cities.map((c) => c.lat).join(","));
  url.searchParams.set("longitude", cities.map((c) => c.lon).join(","));
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("timezone", "UTC");

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);

  const body = await res.json();
  const entries = Array.isArray(body) ? body : [body];

  const out = new Map();
  cities.forEach((city, i) => {
    const current = entries[i]?.current;
    if (!current || typeof current.temperature_2m !== "number") return;
    out.set(city.id, {
      tempC: current.temperature_2m,
      code: current.weather_code ?? 0,
    });
  });
  return out;
}

/**
 * Weather and IANA timezone for an arbitrary map click. `timezone=auto`
 * lets Open-Meteo resolve the zone so the pin can show local time.
 */
export async function fetchPointWeather(lat, lon, { signal } = {}) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);

  const body = await res.json();
  const current = body?.current;
  if (!current || typeof current.temperature_2m !== "number") {
    throw new Error("No weather for this point");
  }
  return {
    tempC: current.temperature_2m,
    code: current.weather_code ?? 0,
    timezone: body.timezone || "UTC",
  };
}

function shortCountry(name) {
  if (!name) return "";
  if (name === "Russian Federation") return "Russia";
  if (name.startsWith("United Kingdom")) return "United Kingdom";
  if (name.startsWith("United States")) return "United States";
  if (name.startsWith("Korea (the Republic")) return "South Korea";
  if (name.startsWith("Korea (the Democratic")) return "North Korea";
  return name.replace(/ \(the.+$/, "").replace(/ of .+$/, "");
}

/**
 * City + country for a map click. Uses BigDataCloud's keyless reverse
 * geocoder (CORS-open). Returns null if nothing useful is found.
 */
export async function reverseGeocode(lat, lon, { signal } = {}) {
  const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("localityLanguage", "en");

  const res = await fetch(url, { signal, credentials: "omit" });
  if (!res.ok) return null;
  const body = await res.json();
  const city = body.city || body.locality || body.principalSubdivision || "";
  const country = shortCountry(body.countryName);
  if (!city && !country) return null;
  return {
    city: city || country,
    country,
    name: [city, country].filter(Boolean).join(", "),
  };
}
