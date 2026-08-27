import * as THREE from "three";

declare global {
  interface WindowEventMap {
    "mobile-joystick": CustomEvent<{ x: number; y: number }>;
    "mobile-look": CustomEvent<{ dx: number; dy: number }>;
    "toggle-rgb-border": CustomEvent<void>;
    "toggle-dark-mode": CustomEvent<void>;
    "spin-banner": CustomEvent<void>;
    "relock-pointer": CustomEvent<void>;
    "teleport-to": CustomEvent<{ x: number; y: number; z: number }>;
  }
}

export type HouseDef = {
  id: string;
  x: number;
  z: number;
  doorWorld: THREE.Vector3;
  insideSpawn: THREE.Vector3;
  interiorLight: THREE.Vector3;
};

export type AABB = {
  min: [number, number, number];
  max: [number, number, number];
  tag?: string;
};

export type Section = {
  title: string;
  url?: string;
  body: string;
};

export type WhiteboardConfig = {
  id: string;
  title: string;
  sections: Section[];
  images: string[];
  image: string;
};
