import * as THREE from "three";
import type { AABB } from "../types";

export const IS_TOUCH =
  typeof window !== "undefined" &&
  (("ontouchstart" in window) || (navigator as any).maxTouchPoints > 0);

export const CLOUD_ALT = 12;
export const BOARD_ALT = 2.2;
export const TITLE_ALT = 10;
export const ARENA_HALF = 26;
export const EDGE_PAD = 0.12;
export const PROBE_FACTOR = 0.55;
export const GROUND_SNAP = 0.25;
export const MAX_STEP = 0.45;
export const MAX_UP_SNAP = 0.5;
export const ROOF_GRACE_MS = 1200;

export const asset = (p: string) =>
  `${import.meta.env.BASE_URL}${p.replace(/^\/+/, "")}`;

let GLOBAL_BLOCKERS: AABB[] = [];
export function setBlockers(aabbs: AABB[]) {
  GLOBAL_BLOCKERS = aabbs;
}
export function getBlockers(): AABB[] {
  return GLOBAL_BLOCKERS;
}

let GLOBAL_WALK_SURFACES: AABB[] = [];
export function setWalkSurfaces(aabbs: AABB[]) {
  GLOBAL_WALK_SURFACES = aabbs;
}
export function getWalkSurfaces(): AABB[] {
  return GLOBAL_WALK_SURFACES;
}

let GLOBAL_CLIMB_VOLUMES: AABB[] = [];
export function setClimbVolumes(vols: AABB[]) {
  GLOBAL_CLIMB_VOLUMES = vols;
}
export function getClimbVolumes(): AABB[] {
  return GLOBAL_CLIMB_VOLUMES;
}

let GLOBAL_INTERIOR_BLOCKERS: AABB[] = [];
export function setInteriorBlockers(aabbs: AABB[]) {
  GLOBAL_INTERIOR_BLOCKERS = aabbs;
}
export function getInteriorBlockers(): AABB[] {
  return GLOBAL_INTERIOR_BLOCKERS;
}

export function makeInteriorAABBs(
  house: { id: string; x: number; z: number },
  baseW = 8,
  baseD = 8,
  baseH = 4.4,
  thickness = 0.4, // Thickened from 0.18 to prevent player clipping through walls
  inset = 0.1
): AABB[] {
  const { id, x, z } = house,
    gap = 2.2;
  const north: AABB = {
    min: [x - baseW / 2 + inset, 0, z - baseD / 2 - thickness / 2 + inset],
    max: [x + baseW / 2 - inset, baseH, z - baseD / 2 + thickness / 2 + inset],
    tag: `interior-${id}`,
  };
  const southLeft: AABB = {
    min: [x - baseW / 2 + inset, 0, z + baseD / 2 - thickness / 2 - inset],
    max: [x - gap / 2 - 0.05, baseH, z + baseD / 2 + thickness / 2 - inset],
    tag: `interior-${id}`,
  };
  const southRight: AABB = {
    min: [x + gap / 2 + 0.05, 0, z + baseD / 2 - thickness / 2 - inset],
    max: [x + baseW / 2 - inset, baseH, z + baseD / 2 + thickness / 2 - inset],
    tag: `interior-${id}`,
  };
  const west: AABB = {
    min: [x - baseW / 2 - thickness / 2 + inset, 0, z - baseD / 2 + inset],
    max: [x - baseW / 2 + thickness / 2 + inset, baseH, z + baseD / 2 - inset],
    tag: `interior-${id}`,
  };
  const east: AABB = {
    min: [x + baseW / 2 - thickness / 2 - inset, 0, z - baseD / 2 + inset],
    max: [x + baseW / 2 + thickness / 2 - inset, baseH, z + baseD / 2 - inset],
    tag: `interior-${id}`,
  };
  return [north, southLeft, southRight, west, east];
}

export const DESK = { cx: -2.0, cz: -1.6, w: 1.5, d: 0.7, h: 0.6 };
export const BED = { cx: 2.2, cz: -1.6, w: 2.0, d: 1.0, h: 0.6 };

export function makeDeskAABB(hx: number, hz: number): AABB {
  const { cx, cz, w, d, h } = DESK;
  const x = hx + cx,
    z = hz + cz;
  return {
    min: [x - w / 2, 0, z - d / 2],
    max: [x + w / 2, h, z + d / 2],
    tag: "interior-furniture",
  };
}

export function makeBedAABB(hx: number, hz: number): AABB {
  const { cx, cz, w, d, h } = BED;
  const x = hx + cx,
    z = hz + cz;
  return {
    min: [x - w / 2, 0, z - d / 2],
    max: [x + w / 2, h, z + d / 2],
    tag: "interior-furniture",
  };
}

export function getParkourDefs() {
  const defs: { x: number; z: number; w: number; d: number; h: number }[] = [];
  const w = 1.6,
    d = 1.6,
    R = 14,
    steps = 18;
  const angleStep = w / R;
  let h = 0.8;
  for (let i = 0; i < steps; i++) {
    const a = i * angleStep;
    defs.push({ x: Math.cos(a) * R, z: Math.sin(a) * R, w, d, h });
    h += 0.35;
  }
  return defs;
}

export function getTopButtonPos() {
  const defs = getParkourDefs();
  const top = defs[defs.length - 1];
  return new THREE.Vector3(top.x, top.h + 0.25, top.z);
}
