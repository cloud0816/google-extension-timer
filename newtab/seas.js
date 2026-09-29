/**
 * Label positions for oceans and major seas on the equirectangular map.
 * rank zoom gate: 1 = world view, 4 = deeply zoomed.
 */

export const SEA_MIN_ZOOM = { 1: 1, 2: 1.45, 3: 2.2, 4: 3.4 };

export function seaMinZoom(sea) {
  return SEA_MIN_ZOOM[sea.rank] ?? SEA_MIN_ZOOM[3];
}

/** @type {{ id: string, name: string, lat: number, lon: number, rank: number, rotate?: number }[]} */
export const SEA_LABELS = [
  // Oceans — visible at world view
  { id: "pacific", name: "Pacific Ocean", lat: 2, lon: -150, rank: 1 },
  { id: "atlantic", name: "Atlantic Ocean", lat: 8, lon: -32, rank: 1 },
  { id: "indian", name: "Indian Ocean", lat: -18, lon: 78, rank: 1 },
  { id: "arctic", name: "Arctic Ocean", lat: 82, lon: 10, rank: 1 },
  { id: "southern", name: "Southern Ocean", lat: -62, lon: 20, rank: 1 },

  // Major seas
  { id: "mediterranean", name: "Mediterranean Sea", lat: 35, lon: 18, rank: 2 },
  { id: "caribbean", name: "Caribbean Sea", lat: 15, lon: -75, rank: 2 },
  { id: "south_china", name: "South China Sea", lat: 12, lon: 114, rank: 2 },
  { id: "arabian", name: "Arabian Sea", lat: 15, lon: 62, rank: 2 },
  { id: "bengal", name: "Bay of Bengal", lat: 15, lon: 90, rank: 2 },
  { id: "bering", name: "Bering Sea", lat: 58, lon: -175, rank: 2 },
  { id: "okhotsk", name: "Sea of Okhotsk", lat: 55, lon: 150, rank: 2 },
  { id: "coral", name: "Coral Sea", lat: -16, lon: 154, rank: 2 },
  { id: "tasman", name: "Tasman Sea", lat: -38, lon: 160, rank: 2 },
  { id: "north", name: "North Sea", lat: 56, lon: 3, rank: 2 },
  { id: "gulf_mexico", name: "Gulf of Mexico", lat: 25, lon: -90, rank: 2 },
  { id: "labrador", name: "Labrador Sea", lat: 58, lon: -52, rank: 2 },
  { id: "norwegian", name: "Norwegian Sea", lat: 68, lon: 2, rank: 2 },
  { id: "philippine", name: "Philippine Sea", lat: 18, lon: 138, rank: 2 },

  // Regional seas
  { id: "black", name: "Black Sea", lat: 43, lon: 35, rank: 3 },
  { id: "caspian", name: "Caspian Sea", lat: 42, lon: 51, rank: 3 },
  { id: "baltic", name: "Baltic Sea", lat: 58, lon: 20, rank: 3 },
  { id: "red", name: "Red Sea", lat: 20, lon: 38, rank: 3, rotate: -35 },
  { id: "persian", name: "Persian Gulf", lat: 26.5, lon: 52, rank: 3 },
  { id: "japan", name: "Sea of Japan", lat: 40, lon: 135, rank: 3 },
  { id: "east_china", name: "East China Sea", lat: 30, lon: 125, rank: 3 },
  { id: "yellow", name: "Yellow Sea", lat: 35, lon: 123, rank: 3 },
  { id: "andaman", name: "Andaman Sea", lat: 10, lon: 96, rank: 3 },
  { id: "java", name: "Java Sea", lat: -5, lon: 112, rank: 3 },
  { id: "celebes", name: "Celebes Sea", lat: 2, lon: 122, rank: 3 },
  { id: "banda", name: "Banda Sea", lat: -5, lon: 128, rank: 3 },
  { id: "arafura", name: "Arafura Sea", lat: -10, lon: 135, rank: 3 },
  { id: "timor", name: "Timor Sea", lat: -12, lon: 128, rank: 3 },
  { id: "guinea", name: "Gulf of Guinea", lat: 1, lon: 2, rank: 3 },
  { id: "barents", name: "Barents Sea", lat: 74, lon: 40, rank: 3 },
  { id: "greenland", name: "Greenland Sea", lat: 75, lon: -5, rank: 3 },
  { id: "beaufort", name: "Beaufort Sea", lat: 72, lon: -140, rank: 3 },
  { id: "chukchi", name: "Chukchi Sea", lat: 70, lon: -170, rank: 3 },
  { id: "hudson", name: "Hudson Bay", lat: 60, lon: -85, rank: 3 },
  { id: "scotia", name: "Scotia Sea", lat: -56, lon: -45, rank: 3 },
  { id: "weddell", name: "Weddell Sea", lat: -72, lon: -45, rank: 3 },
  { id: "ross", name: "Ross Sea", lat: -74, lon: 175, rank: 3 },
  { id: "amundsen", name: "Amundsen Sea", lat: -72, lon: -120, rank: 3 },

  // Smaller / local seas
  { id: "aegean", name: "Aegean Sea", lat: 38, lon: 25, rank: 4 },
  { id: "adriatic", name: "Adriatic Sea", lat: 43, lon: 15, rank: 4 },
  { id: "tyrrhenian", name: "Tyrrhenian Sea", lat: 40, lon: 12, rank: 4 },
  { id: "ionian", name: "Ionian Sea", lat: 38, lon: 18, rank: 4 },
  { id: "marmara", name: "Sea of Marmara", lat: 40.7, lon: 28, rank: 4 },
  { id: "azov", name: "Sea of Azov", lat: 46, lon: 36.5, rank: 4 },
  { id: "white", name: "White Sea", lat: 66, lon: 38, rank: 4 },
  { id: "ireland", name: "Irish Sea", lat: 53.5, lon: -5, rank: 4 },
  { id: "celtic", name: "Celtic Sea", lat: 50, lon: -8, rank: 4 },
  { id: "biscay", name: "Bay of Biscay", lat: 45, lon: -4, rank: 4 },
  { id: "alaska", name: "Gulf of Alaska", lat: 57, lon: -145, rank: 4 },
  { id: "california", name: "Gulf of California", lat: 28, lon: -112, rank: 4 },
  { id: "siam", name: "Gulf of Thailand", lat: 10, lon: 101, rank: 4 },
  { id: "tonkin", name: "Gulf of Tonkin", lat: 20, lon: 108, rank: 4 },
  { id: "sulu", name: "Sulu Sea", lat: 8, lon: 120, rank: 4 },
  { id: "molucca", name: "Molucca Sea", lat: 1, lon: 126, rank: 4 },
  { id: "savu", name: "Savu Sea", lat: -10, lon: 122, rank: 4 },
  { id: "seto", name: "Seto Inland Sea", lat: 34.2, lon: 133.5, rank: 4 },
  { id: "dead", name: "Dead Sea", lat: 31.5, lon: 35.5, rank: 4 },
  { id: "aral", name: "Aral Sea", lat: 45, lon: 59.5, rank: 4 },
];
