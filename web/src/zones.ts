import { project } from "./worldPath";

export type ZoneMeta = { id: string; n: number; label: string; x: number; y: number };

// IMPORTANT: ids must match seeded DB zones (see db/migrations/0001_init.sql)
// Positions are projected from approximate lat/lon so the map stays geographically honest.
const at = (id: string, n: number, label: string, lat: number, lon: number): ZoneMeta => {
  const [x, y] = project(lat, lon);
  return { id, n, label, x, y };
};

export const ZONES: ZoneMeta[] = [
  at("zone-na", 3, "North America", 40, -100),
  at("zone-sa", 7, "South America", -15, -60),
  at("zone-eu", 2, "Europe", 49, 12),
  at("zone-uk", 4, "United Kingdom", 54, -2),
  at("zone-af", 10, "Africa", 5, 20),
  at("zone-me", 1, "Middle East", 26, 45),
  at("zone-in", 8, "India", 22, 79),
  at("zone-cn", 6, "China", 35, 104),
  at("zone-ap", 5, "Asia Pacific", 5, 115),
  at("zone-au", 9, "Australia", -25, 134),
];

export function zoneNumber(id: string): number {
  return ZONES.find(z => z.id === id)?.n ?? 0;
}

export function zoneLabel(id: string): string {
  return ZONES.find(z => z.id === id)?.label ?? id;
}
