/** Human-readable coordinate line, e.g. `52.3759° N / 9.7320° E`. */
export function formatCoordinates(lat: number, lon: number): string {
  const latPart = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
  const lonPart = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
  return `${latPart} / ${lonPart}`;
}
