/**
 * Low-precision solar position, good to a fraction of a degree — plenty for
 * drawing a day/night terminator and deciding whether a city is in daylight.
 *
 * Formulas: NOAA / Astronomical Almanac "Approximate Solar Coordinates".
 */

const DEG = Math.PI / 180;

function norm360(deg) {
  return ((deg % 360) + 360) % 360;
}

function normLon(deg) {
  const d = norm360(deg);
  return d > 180 ? d - 360 : d;
}

/**
 * Subsolar point: the latitude/longitude where the sun is directly overhead.
 * Its latitude is the solar declination; its longitude tracks the earth's spin.
 */
export function subsolarPoint(date = new Date()) {
  // Days since the J2000.0 epoch.
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;

  const meanLon = norm360(280.46 + 0.9856474 * n);
  const meanAnom = norm360(357.528 + 0.9856003 * n) * DEG;
  const eclipticLon =
    (meanLon + 1.915 * Math.sin(meanAnom) + 0.02 * Math.sin(2 * meanAnom)) * DEG;
  const obliquity = (23.439 - 0.0000004 * n) * DEG;

  const declination =
    Math.asin(Math.sin(obliquity) * Math.sin(eclipticLon)) / DEG;
  const rightAscension =
    Math.atan2(
      Math.cos(obliquity) * Math.sin(eclipticLon),
      Math.cos(eclipticLon)
    ) / DEG;

  // Greenwich mean sidereal time turns right ascension into a longitude.
  const gmst = norm360(280.46061837 + 360.98564736629 * n);

  return { lat: declination, lon: normLon(rightAscension - gmst) };
}

/** Sun altitude in degrees above the horizon at a place, given the subsolar point. */
export function sunAltitude(lat, lon, sub = subsolarPoint()) {
  const hourAngle = (lon - sub.lon) * DEG;
  const sin =
    Math.sin(lat * DEG) * Math.sin(sub.lat * DEG) +
    Math.cos(lat * DEG) * Math.cos(sub.lat * DEG) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, sin))) / DEG;
}

/**
 * "day" once the sun clears the horizon (-0.833 deg accounts for refraction and
 * the sun's radius), "twilight" through civil twilight, "night" below that.
 */
export function daylightPhase(lat, lon, sub = subsolarPoint()) {
  const alt = sunAltitude(lat, lon, sub);
  if (alt > -0.833) return "day";
  if (alt > -6) return "twilight";
  return "night";
}

/**
 * SVG path for the shaded (night) half of an equirectangular map with
 * viewBox "0 0 360 180". The terminator is the set of points where the solar
 * zenith angle is 90 degrees: tan(lat) = -cos(hourAngle) / tan(declination).
 *
 * The polygon deliberately runs past the viewBox on every side (`overshoot`),
 * so a blur filter can soften the terminator into a twilight band without
 * feathering the edges of the map itself.
 */
export function terminatorPath(sub = subsolarPoint(), { stepDeg = 1, overshoot = 30 } = {}) {
  // Guard the equinox singularity, where tan(declination) collapses to zero.
  const tanDec = Math.tan(sub.lat * DEG);
  const safeTanDec = Math.abs(tanDec) < 1e-6 ? (tanDec < 0 ? -1e-6 : 1e-6) : tanDec;

  // With the sun north of the equator the south pole is the dark one.
  const nightIsSouth = sub.lat > 0;

  const points = [];
  for (let lon = -180 - overshoot; lon <= 180 + overshoot; lon += stepDeg) {
    const hourAngle = (lon - sub.lon) * DEG;
    const lat = Math.atan(-Math.cos(hourAngle) / safeTanDec) / DEG;
    points.push(`${(lon + 180).toFixed(2)} ${(90 - lat).toFixed(2)}`);
  }

  const poleY = nightIsSouth ? 180 + overshoot : -overshoot;
  const left = -overshoot;
  const right = 360 + overshoot;
  return `M${points.join("L")}L${right} ${poleY}L${left} ${poleY}Z`;
}
