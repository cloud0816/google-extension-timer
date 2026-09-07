/**
 * World clock city catalogue.
 *
 * id   stable key stored in state
 * tz   IANA zone — Intl handles DST, so offsets are never hard-coded
 * lat/lon  used to place the pin on the map and to work out day vs night
 */

export const CITIES = [
  // Americas
  { id: "honolulu", name: "Honolulu", country: "USA", tz: "Pacific/Honolulu", lat: 21.31, lon: -157.86 },
  { id: "anchorage", name: "Anchorage", country: "USA", tz: "America/Anchorage", lat: 61.22, lon: -149.9 },
  { id: "vancouver", name: "Vancouver", country: "Canada", tz: "America/Vancouver", lat: 49.28, lon: -123.12 },
  { id: "los_angeles", name: "Los Angeles", country: "USA", tz: "America/Los_Angeles", lat: 34.05, lon: -118.24 },
  { id: "denver", name: "Denver", country: "USA", tz: "America/Denver", lat: 39.74, lon: -104.99 },
  { id: "mexico_city", name: "Mexico City", country: "Mexico", tz: "America/Mexico_City", lat: 19.43, lon: -99.13 },
  { id: "chicago", name: "Chicago", country: "USA", tz: "America/Chicago", lat: 41.88, lon: -87.63 },
  { id: "bogota", name: "Bogotá", country: "Colombia", tz: "America/Bogota", lat: 4.71, lon: -74.07 },
  { id: "new_york", name: "New York", country: "USA", tz: "America/New_York", lat: 40.71, lon: -74.01 },
  { id: "toronto", name: "Toronto", country: "Canada", tz: "America/Toronto", lat: 43.65, lon: -79.38 },
  { id: "santiago", name: "Santiago", country: "Chile", tz: "America/Santiago", lat: -33.45, lon: -70.67 },
  { id: "buenos_aires", name: "Buenos Aires", country: "Argentina", tz: "America/Argentina/Buenos_Aires", lat: -34.6, lon: -58.38 },
  { id: "sao_paulo", name: "São Paulo", country: "Brazil", tz: "America/Sao_Paulo", lat: -23.55, lon: -46.63 },

  // Europe & Africa
  { id: "reykjavik", name: "Reykjavík", country: "Iceland", tz: "Atlantic/Reykjavik", lat: 64.15, lon: -21.94 },
  { id: "lisbon", name: "Lisbon", country: "Portugal", tz: "Europe/Lisbon", lat: 38.72, lon: -9.14 },
  { id: "london", name: "London", country: "UK", tz: "Europe/London", lat: 51.51, lon: -0.13 },
  { id: "dublin", name: "Dublin", country: "Ireland", tz: "Europe/Dublin", lat: 53.35, lon: -6.26 },
  { id: "lagos", name: "Lagos", country: "Nigeria", tz: "Africa/Lagos", lat: 6.52, lon: 3.38 },
  { id: "madrid", name: "Madrid", country: "Spain", tz: "Europe/Madrid", lat: 40.42, lon: -3.7 },
  { id: "paris", name: "Paris", country: "France", tz: "Europe/Paris", lat: 48.86, lon: 2.35 },
  { id: "amsterdam", name: "Amsterdam", country: "Netherlands", tz: "Europe/Amsterdam", lat: 52.37, lon: 4.9 },
  { id: "berlin", name: "Berlin", country: "Germany", tz: "Europe/Berlin", lat: 52.52, lon: 13.4 },
  { id: "rome", name: "Rome", country: "Italy", tz: "Europe/Rome", lat: 41.9, lon: 12.5 },
  { id: "stockholm", name: "Stockholm", country: "Sweden", tz: "Europe/Stockholm", lat: 59.33, lon: 18.07 },
  { id: "warsaw", name: "Warsaw", country: "Poland", tz: "Europe/Warsaw", lat: 52.23, lon: 21.01 },
  { id: "cape_town", name: "Cape Town", country: "South Africa", tz: "Africa/Johannesburg", lat: -33.92, lon: 18.42 },
  { id: "johannesburg", name: "Johannesburg", country: "South Africa", tz: "Africa/Johannesburg", lat: -26.2, lon: 28.05 },
  { id: "cairo", name: "Cairo", country: "Egypt", tz: "Africa/Cairo", lat: 30.04, lon: 31.24 },
  { id: "athens", name: "Athens", country: "Greece", tz: "Europe/Athens", lat: 37.98, lon: 23.73 },
  { id: "helsinki", name: "Helsinki", country: "Finland", tz: "Europe/Helsinki", lat: 60.17, lon: 24.94 },
  { id: "istanbul", name: "Istanbul", country: "Türkiye", tz: "Europe/Istanbul", lat: 41.01, lon: 28.98 },
  { id: "nairobi", name: "Nairobi", country: "Kenya", tz: "Africa/Nairobi", lat: -1.29, lon: 36.82 },
  { id: "moscow", name: "Moscow", country: "Russia", tz: "Europe/Moscow", lat: 55.76, lon: 37.62 },

  // Middle East & Asia
  { id: "dubai", name: "Dubai", country: "UAE", tz: "Asia/Dubai", lat: 25.2, lon: 55.27 },
  { id: "tehran", name: "Tehran", country: "Iran", tz: "Asia/Tehran", lat: 35.69, lon: 51.39 },
  { id: "karachi", name: "Karachi", country: "Pakistan", tz: "Asia/Karachi", lat: 24.86, lon: 67.01 },
  { id: "mumbai", name: "Mumbai", country: "India", tz: "Asia/Kolkata", lat: 19.08, lon: 72.88 },
  { id: "delhi", name: "New Delhi", country: "India", tz: "Asia/Kolkata", lat: 28.61, lon: 77.21 },
  { id: "dhaka", name: "Dhaka", country: "Bangladesh", tz: "Asia/Dhaka", lat: 23.81, lon: 90.41 },
  { id: "bangkok", name: "Bangkok", country: "Thailand", tz: "Asia/Bangkok", lat: 13.76, lon: 100.5 },
  { id: "jakarta", name: "Jakarta", country: "Indonesia", tz: "Asia/Jakarta", lat: -6.21, lon: 106.85 },
  { id: "singapore", name: "Singapore", country: "Singapore", tz: "Asia/Singapore", lat: 1.35, lon: 103.82 },
  { id: "hong_kong", name: "Hong Kong", country: "Hong Kong", tz: "Asia/Hong_Kong", lat: 22.32, lon: 114.17 },
  { id: "shanghai", name: "Shanghai", country: "China", tz: "Asia/Shanghai", lat: 31.23, lon: 121.47 },
  { id: "beijing", name: "Beijing", country: "China", tz: "Asia/Shanghai", lat: 39.9, lon: 116.41 },
  { id: "taipei", name: "Taipei", country: "Taiwan", tz: "Asia/Taipei", lat: 25.03, lon: 121.57 },
  { id: "seoul", name: "Seoul", country: "South Korea", tz: "Asia/Seoul", lat: 37.57, lon: 126.98 },
  { id: "tokyo", name: "Tokyo", country: "Japan", tz: "Asia/Tokyo", lat: 35.68, lon: 139.69 },
  { id: "osaka", name: "Osaka", country: "Japan", tz: "Asia/Tokyo", lat: 34.69, lon: 135.5 },

  // Oceania
  { id: "perth", name: "Perth", country: "Australia", tz: "Australia/Perth", lat: -31.95, lon: 115.86 },
  { id: "adelaide", name: "Adelaide", country: "Australia", tz: "Australia/Adelaide", lat: -34.93, lon: 138.6 },
  { id: "brisbane", name: "Brisbane", country: "Australia", tz: "Australia/Brisbane", lat: -27.47, lon: 153.03 },
  { id: "melbourne", name: "Melbourne", country: "Australia", tz: "Australia/Melbourne", lat: -37.81, lon: 144.96 },
  { id: "sydney", name: "Sydney", country: "Australia", tz: "Australia/Sydney", lat: -33.87, lon: 151.21 },
  { id: "auckland", name: "Auckland", country: "New Zealand", tz: "Pacific/Auckland", lat: -36.85, lon: 174.76 },

  // Reference
  { id: "utc", name: "UTC", country: "Coordinated Universal Time", tz: "UTC", lat: 0, lon: 0 },
];

export const CITY_BY_ID = new Map(CITIES.map((c) => [c.id, c]));

/** Shown on a fresh install — the ones most people actually watch. */
export const DEFAULT_CITY_IDS = [
  "los_angeles",
  "new_york",
  "london",
  "dubai",
  "tokyo",
  "sydney",
];
