import { useEffect, useMemo, useRef, useState, type JSX, type Key } from "react";
import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber";
import * as THREE from "three";

/* ---------- Event typings ---------- */
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

/* ---------- Flags + constants ---------- */
const IS_TOUCH =
  typeof window !== "undefined" &&
  (("ontouchstart" in window) || (navigator as any).maxTouchPoints > 0);

const CLOUD_ALT = 12;
const BOARD_ALT = 2.2;
const TITLE_ALT = 10;
const ARENA_HALF = 26;
const EDGE_PAD = 0.12;
const PROBE_FACTOR = 0.55;
const GROUND_SNAP = 0.25;
const MAX_STEP = 0.45;
const MAX_UP_SNAP = 0.5;
const ROOF_GRACE_MS = 1200;

const asset = (p: string) =>
  `${import.meta.env.BASE_URL}${p.replace(/^\/+/, "")}`;

export type HouseDef = {
  id: string;
  x: number;
  z: number;
  doorWorld: THREE.Vector3;
  insideSpawn: THREE.Vector3;
  interiorLight: THREE.Vector3;
};

type AABB = {
  min: [number, number, number];
  max: [number, number, number];
  tag?: string;
};

let GLOBAL_BLOCKERS: AABB[] = [];
function setBlockers(aabbs: AABB[]) {
  GLOBAL_BLOCKERS = aabbs;
}
let GLOBAL_WALK_SURFACES: AABB[] = [];
function setWalkSurfaces(aabbs: AABB[]) {
  GLOBAL_WALK_SURFACES = aabbs;
}
let GLOBAL_CLIMB_VOLUMES: AABB[] = [];
function setClimbVolumes(vols: AABB[]) {
  GLOBAL_CLIMB_VOLUMES = vols;
}
let GLOBAL_INTERIOR_BLOCKERS: AABB[] = [];
function setInteriorBlockers(aabbs: AABB[]) {
  GLOBAL_INTERIOR_BLOCKERS = aabbs;
}

/* ---------- Interiors geometry helpers ---------- */
function makeInteriorAABBs(
  house: { id: string; x: number; z: number },
  baseW = 8,
  baseD = 8,
  baseH = 4.4,
  thickness = 0.18,
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
const DESK = { cx: -2.0, cz: -1.6, w: 1.5, d: 0.7, h: 0.6 };
const BED = { cx: 2.2, cz: -1.6, w: 2.0, d: 1.0, h: 0.6 };
function makeDeskAABB(hx: number, hz: number): AABB {
  const { cx, cz, w, d, h } = DESK;
  const x = hx + cx,
    z = hz + cz;
  return {
    min: [x - w / 2, 0, z - d / 2],
    max: [x + w / 2, h, z + d / 2],
    tag: "interior-furniture",
  };
}
function makeBedAABB(hx: number, hz: number): AABB {
  const { cx, cz, w, d, h } = BED;
  const x = hx + cx,
    z = hz + cz;
  return {
    min: [x - w / 2, 0, z - d / 2],
    max: [x + w / 2, h, z + d / 2],
    tag: "interior-furniture",
  };
}

/* ---------- Parkour ring ---------- */
function getParkourDefs() {
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
function getTopButtonPos() {
  const defs = getParkourDefs();
  const top = defs[defs.length - 1];
  return new THREE.Vector3(top.x, top.h + 0.25, top.z);
}

/* ---------- Resume boards config ---------- */
const WHITEBOARD_CONFIG = [
  {
    id: "board1",
    title: "Projects",
    sections: [
      {
        title: "Jetbot Autonomous Vehicle",
        url: "https://github.com/samarthVijay/Jetbot-Autonomous-Parking-and-Self-Driving",
        body: `<p><b>Why I built it:</b> ...</p><p><b>Perception:</b> ... <b>Jetson Nano</b> ...</p><p><b>Control loop:</b> ...</p><p><b>Reliability:</b> ...</p>`,
      },
      {
        title: "Embedded LIDAR Project (Object Modeling)",
        url: "https://github.com/samarthVijay/Embedded-LIDAR-Project",
        body: `<p><b>Goal:</b> ...</p><p><b>Hardware:</b> ...</p><p><b>Pipeline:</b> ...</p><p><b>Result:</b> ...</p>`,
      },
      {
        title: "C++ Snake (Terminal UI, 2-Player)",
        url: "https://github.com/samarthVijay/Snake-Game-Cpp",
        body: `<p><b>Design:</b> ...</p><p><b>Data structures:</b> ...</p><p><b>Algorithms:</b> ...</p><p><b>Memory:</b> ...</p>`,
      },
      {
        title: "Minecraft-inspired Web World (this site)",
        body: `<p>... <b>React + @react-three/fiber</b> ...</p><p>Under the hood: ...</p>`,
      },
    ],
    images: [
      asset("images/imagejetbot1.jpeg"),
      asset("images/imagejetbot3.gif"),
      asset("images/imagejetbot2.jpeg"),
      asset("images/imagelidar1.jpeg"),
      asset("images/imagesnake1.jpg"),
    ],
    image: "https://via.placeholder.com/400x300/4ade80/ffffff?text=Projects",
  },
  {
    id: "board2",
    title: "Experience",
    sections: [
      {
        title: "MAD Elevators — IoT/Embedded Developer",
        body: `<p>Shipped an escalator-monitoring device ...</p><ul><li>Linux gateways ... <b>UART/RS-485</b> ... <b>I²C</b>.</li><li><b>Zero-Touch Provisioning</b> ...</li><li>MosaicONE REST ...</li><li>Containers ...</li></ul>`,
      },
      {
        title: "Maple Leaf Foods — Automation Analyst",
        body: `<p>Focus: ...</p><ul><li>Power Platform ... <b>~$700k</b> ...</li><li>ITSM REST ...</li><li>Microsoft Graph ...</li><li><b>Power BI</b> ...</li></ul>`,
      },
    ],
    images: [
      "https://via.placeholder.com/360x540/60a5fa/ffffff?text=Exp+1",
      "https://via.placeholder.com/360x540/3b82f6/ffffff?text=Exp+2",
      "https://via.placeholder.com/360x540/2563eb/ffffff?text=Exp+3",
    ],
    image: "https://via.placeholder.com/400x300/60a5fa/ffffff?text=Experience",
  },
  {
    id: "board3",
    title: "Skills",
    sections: [
      { title: "Embedded & Systems", body: "<ul><li>Jetson Nano ...</li><li>Debugging ...</li></ul>" },
      { title: "ML & Computer Vision", body: "<ul><li>PyTorch ...</li><li>Data curation ...</li></ul>" },
      { title: "Cloud & Microsoft", body: "<ul><li>REST APIs ...</li><li>SQL Server ...</li></ul>" },
      { title: "Web", body: "<ul><li>React, TypeScript/JavaScript, Tailwind, shadcn/ui.</li></ul>" },
    ],
    images: [
      "https://via.placeholder.com/360x540/fbbf24/ffffff?text=Skill+1",
      "https://via.placeholder.com/360x540/f59e0b/ffffff?text=Skill+2",
      "https://via.placeholder.com/360x540/d97706/ffffff?text=Skill+3",
    ],
    image: "https://via.placeholder.com/400x300/fbbf24/ffffff?text=Skills",
  },
  {
    id: "board4",
    title: "About + Contact",
    sections: [
      { title: "About me", body: "<p>I’m Samarth — a Computer Engineering student ...</p>" },
      {
        title: "How I work",
        body: "<ul><li>Bias for working prototypes ...</li><li>Prefer readable ...</li><li>Automate the boring parts ...</li></ul>",
      },
      {
        title: "Contact",
        body: `<p><a href="mailto:samarthvijay714@gmail.com" target="_blank" rel="noopener noreferrer">Email</a> · <a href="https://www.linkedin.com/in/samarth-vijay714/" target="_blank" rel="noopener noreferrer">LinkedIn</a> · <a href="https://github.com/samarthVijay" target="_blank" rel="noopener noreferrer">GitHub</a></p>`,
      },
    ],
    images: [asset("images/imageme1.jpeg"), asset("images/imageme2.jpeg"), asset("images/imageme3.jpeg")],
    image: "https://via.placeholder.com/400x300/f87171/ffffff?text=Contact",
  },
];

/* ===================== Audio ===================== */
function BackgroundMusic({
  lightSrc = "audio/bg.mp3",
  darkSrc = "audio/night.mp3",
  darkMode,
  maxVolume = 0.6,
  fadeMs = 900,
}: {
  lightSrc?: string;
  darkSrc?: string;
  darkMode: boolean;
  maxVolume?: number;
  fadeMs?: number;
}) {
  const lightRef = useRef<HTMLAudioElement | null>(null);
  const darkRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);
  const mutedRef = useRef(false);

  function fadeTo(a: HTMLAudioElement, target: number, ms: number, onZeroPause = false) {
    const steps = Math.max(1, Math.floor(ms / 50));
    const start = a.volume;
    const delta = target - start;
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      const t = i / steps;
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      a.volume = Math.max(0, Math.min(1, start + delta * eased));
      if (i >= steps) {
        a.volume = Math.max(0, Math.min(1, target));
        window.clearInterval(id);
        if (onZeroPause && a.volume <= 0.001) {
          try {
            a.pause();
          } catch {}
        }
      }
    }, 50);
  }

  useEffect(() => {
    const mk = (path: string) => {
      const url = `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
      const a = new Audio(url);
      a.loop = true;
      a.preload = "auto";
      (a as any).playsInline = true;
      a.volume = 0;
      a.muted = mutedRef.current;
      return a;
    };
    lightRef.current = mk(lightSrc);
    darkRef.current = mk(darkSrc);

    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m") {
        mutedRef.current = !mutedRef.current;
        if (lightRef.current) lightRef.current.muted = mutedRef.current;
        if (darkRef.current) darkRef.current.muted = mutedRef.current;
      }
    };
    window.addEventListener("keydown", onKey);

    const start = async () => {
      if (startedRef.current) return;
      try {
        if (IS_TOUCH) {
          const on = darkMode ? darkRef.current! : lightRef.current!;
          await on.play();
          fadeTo(on, maxVolume, fadeMs);
        } else {
          await lightRef.current?.play();
          await darkRef.current?.play();
          if (darkMode) {
            fadeTo(darkRef.current!, maxVolume, fadeMs);
            fadeTo(lightRef.current!, 0, fadeMs);
          } else {
            fadeTo(lightRef.current!, maxVolume, fadeMs);
            fadeTo(darkRef.current!, 0, fadeMs);
          }
        }
        startedRef.current = true;
      } catch {
        startedRef.current = false;
      }
      if (startedRef.current) window.removeEventListener("click", start, true);
    };
    window.addEventListener("click", start, true);

    return () => {
      window.removeEventListener("click", start, true);
      window.removeEventListener("keydown", onKey);
      lightRef.current?.pause();
      darkRef.current?.pause();
      if (lightRef.current) lightRef.current.src = "";
      if (darkRef.current) darkRef.current.src = "";
      lightRef.current = null;
      darkRef.current = null;
    };
  }, [lightSrc, darkSrc, darkMode, fadeMs, maxVolume]);

  useEffect(() => {
    if (!startedRef.current) return;
    const on = darkMode ? darkRef.current : lightRef.current;
    const off = darkMode ? lightRef.current : darkRef.current;
    if (!on || !off) return;

    on.play().catch(() => {});
    if (IS_TOUCH) {
      fadeTo(on, maxVolume, fadeMs);
      fadeTo(off, 0, fadeMs, true);
    } else {
      fadeTo(on, maxVolume, fadeMs);
      fadeTo(off, 0, fadeMs);
    }
  }, [darkMode, fadeMs, maxVolume]);

  return null;
}

/* ===================== Title screen ===================== */
function TitleScreen({ onContinue, onLiteMode }: { onContinue: () => void; onLiteMode: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#1e1e1e",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: "2rem",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "'Press Start 2P', monospace",
        zIndex: 9999,
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "5rem", color: "#4caf50", margin: 0 }}>WORLD OF SAM</h1>
      <div
        style={{
          maxWidth: 720,
          border: "4px solid #ff4444",
          background: "#000",
          padding: "1rem 1.25rem",
          fontSize: "0.9rem",
          lineHeight: 1.6,
          textAlign: "left",
        }}
      >
        <strong>WARNING:</strong> Best with <span style={{ color: "#ffeb3b" }}>Hardware Acceleration</span>. If choppy, try <em>Lite Mode</em>.
      </div>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <button
          onClick={onContinue}
          style={{
            padding: "1rem 2rem",
            fontFamily: "'Press Start 2P', monospace",
            fontSize: "1rem",
            background: "#4caf50",
            border: "4px solid #2e7d32",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          CONTINUE
        </button>
        <button
          onClick={onLiteMode}
          style={{
            padding: "1rem 2rem",
            fontFamily: "'Press Start 2P', monospace",
            fontSize: "1rem",
            background: "#3b82f6",
            border: "4px solid #1d4ed8",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          PLAY LITE MODE
        </button>
      </div>
    </div>
  );
}

/* ===================== Mobile overlay ===================== */
function TouchControls({ enabled }: { enabled: boolean }) {
  if (!IS_TOUCH || !enabled) return null;
  return (
    <div style={tc_wrap}>
      <TC_LeftStick />
      <TC_RightLookPad />
      <TC_ActionBar />
    </div>
  );
}
type Vec2 = { x: number; y: number };
function tc_fire(name: string, detail?: any) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
function tc_keyDown(key: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key } as KeyboardEventInit));
}
function tc_keyUp(key: string) {
  window.dispatchEvent(new KeyboardEvent("keyup", { key } as KeyboardEventInit));
}

function TC_LeftStick() {
  const padRef = useRef<HTMLDivElement | null>(null);
  const center = useRef<Vec2>({ x: 0, y: 0 });
  const activeId = useRef<number | null>(null);
  const onStart = (e: TouchEvent) => {
    if (!padRef.current || activeId.current !== null) return;
    const t = e.changedTouches[0];
    activeId.current = t.identifier;
    const r = padRef.current.getBoundingClientRect();
    center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    e.preventDefault();
  };
  const onMove = (e: TouchEvent) => {
    if (activeId.current === null) return;
    const t = [...e.changedTouches].find((tt) => tt.identifier === activeId.current);
    if (!t) return;
    const dx = t.clientX - center.current.x,
      dy = t.clientY - center.current.y;
    const radius = 60;
    let x = dx / radius,
      y = -dy / radius;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    tc_fire("mobile-joystick", { x, y });
    e.preventDefault();
  };
  const onEnd = (e: TouchEvent) => {
    if (activeId.current === null) return;
    const ended = [...e.changedTouches].some((tt) => tt.identifier === activeId.current);
    if (!ended) return;
    activeId.current = null;
    tc_fire("mobile-joystick", { x: 0, y: 0 });
    e.preventDefault();
  };
  useEffect(() => {
    const el = padRef.current!;
    const add = (n: keyof HTMLElementEventMap, f: any) => el.addEventListener(n, f, { passive: false });
    const rm = (n: keyof HTMLElementEventMap, f: any) => el.removeEventListener(n, f as any);
    add("touchstart", onStart);
    add("touchmove", onMove);
    add("touchend", onEnd);
    add("touchcancel", onEnd);
    return () => {
      rm("touchstart", onStart);
      rm("touchmove", onMove);
      rm("touchend", onEnd);
      rm("touchcancel", onEnd);
    };
  }, []);
  return (
    <div ref={padRef} style={tc_leftPad}>
      <div style={tc_ring} />
      <div style={{ ...tc_ring, width: 70, height: 70, opacity: 0.3 }} />
      <div style={{ ...tc_ring, width: 40, height: 40, opacity: 0.5 }} />
    </div>
  );
}

function TC_RightLookPad() {
  const padRef = useRef<HTMLDivElement | null>(null);
  const last = useRef<Vec2 | null>(null);
  const activeId = useRef<number | null>(null);
  const onStart = (e: TouchEvent) => {
    if (activeId.current !== null) return;
    const t = e.changedTouches[0];
    activeId.current = t.identifier;
    last.current = { x: t.clientX, y: t.clientY };
    e.preventDefault();
  };
  const onMove = (e: TouchEvent) => {
    if (activeId.current === null) return;
    const t = [...e.changedTouches].find((tt) => tt.identifier === activeId.current);
    if (!t || !last.current) return;
    const dx = t.clientX - last.current.x,
      dy = t.clientY - last.current.y;
    last.current = { x: t.clientX, y: t.clientY };
    tc_fire("mobile-look", { dx, dy });
    e.preventDefault();
  };
  const onEnd = (e: TouchEvent) => {
    if (activeId.current === null) return;
    const ended = [...e.changedTouches].some((tt) => tt.identifier === activeId.current);
    if (!ended) return;
    activeId.current = null;
    last.current = null;
    e.preventDefault();
  };
  useEffect(() => {
    const el = padRef.current!;
    const add = (n: keyof HTMLElementEventMap, f: any) => el.addEventListener(n, f, { passive: false });
    const rm = (n: keyof HTMLElementEventMap, f: any) => el.removeEventListener(n, f as any);
    add("touchstart", onStart);
    add("touchmove", onMove);
    add("touchend", onEnd);
    add("touchcancel", onEnd);
    return () => rm("touchstart", onStart);
  }, []);
  return <div ref={padRef} style={tc_rightPad} />;
}

function TC_ActionBar() {
  return (
    <div style={tc_bar}>
      <button
        style={tc_btn}
        onTouchStart={(e) => {
          e.preventDefault();
          tc_keyDown(" ");
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          tc_keyUp(" ");
        }}
      >
        Jump
      </button>

      <button
        style={tc_btn}
        onTouchStart={(e) => {
          e.preventDefault();
          tc_keyDown("e");
          setTimeout(() => tc_keyUp("e"), 80);
        }}
      >
        Interact
      </button>

      <button
        style={tc_btn}
        onTouchStart={(e) => {
          e.preventDefault();
          tc_keyDown("q");
          setTimeout(() => tc_keyUp("q"), 80);
        }}
      >
        Enter/Exit
      </button>
    </div>
  );
}

/* centered HUD row between pads */
const tc_wrap: React.CSSProperties = { position: "fixed", inset: 0, pointerEvents: "none", zIndex: 25 };
const tc_leftPad: React.CSSProperties = {
  position: "absolute",
  left: 12,
  bottom: 12,
  width: 120, // smaller than before
  height: 120,
  borderRadius: 90,
  background: "rgba(15,23,42,0.25)",
  border: "2px solid rgba(148,163,184,0.5)",
  pointerEvents: "auto",
  touchAction: "none",
};
const tc_rightPad: React.CSSProperties = {
  position: "absolute",
  right: 12,
  bottom: 12,
  width: 160,
  height: 160,
  borderRadius: 12,
  background: "rgba(15,23,42,0.18)",
  border: "2px solid rgba(148,163,184,0.4)",
  pointerEvents: "auto",
  touchAction: "none",
};
const tc_bar: React.CSSProperties = {
  position: "absolute",
  bottom: 28,
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  pointerEvents: "auto",
  alignItems: "center",
  justifyContent: "center",
};
const tc_btn: React.CSSProperties = {
  fontFamily: "monospace",
  fontWeight: 900,
  padding: "10px 12px",
  background: "rgba(34,197,94,0.9)",
  border: "3px solid #14532d",
  color: "#0b2e13",
  borderRadius: 10,
  touchAction: "none",
};
const tc_ring: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: 96,
  height: 96,
  marginLeft: -48,
  marginTop: -48,
  border: "2px dashed rgba(226,232,240,0.5)",
  borderRadius: 80,
};

/* Mobile top-left mute button */
function MobileMuteButton() {
  if (!IS_TOUCH) return null;
  return (
    <button
      onTouchStart={(e) => {
        e.preventDefault();
        tc_keyDown("m");
        setTimeout(() => tc_keyUp("m"), 60);
      }}
      style={{
        position: "fixed",
        top: 10,
        left: 10,
        zIndex: 26,
        fontFamily: "monospace",
        fontWeight: 900,
        padding: "8px 10px",
        background: "rgba(30,41,59,0.9)",
        color: "#fff",
        border: "3px solid #111827",
        borderRadius: 10,
        pointerEvents: "auto",
      }}
    >
      Mute
    </button>
  );
}

/* ===================== App ===================== */
export default function App() {
  const [started, setStarted] = useState(false);
  const [lowSpec, setLowSpec] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [activeBoard, setActiveBoard] = useState<string | null>(null);
  const [rgbBorder, setRgbBorder] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [insideHouseId, setInsideHouseId] = useState<string | null>(null);
  const [exhibit, setExhibit] = useState<{ img: string; caption: string } | null>(null);
  const [houseDefs, setHouseDefs] = useState<HouseDef[]>([]);
  const topBtnPos = useMemo(() => getTopButtonPos(), []);
  const skyGradient = darkMode ? "linear-gradient(#0b1220, #111827)" : "linear-gradient(#87ceeb, #1e90ff)";

  useEffect(() => {
    const anyModal = !!activeBoard;
    if (anyModal && document.pointerLockElement) document.exitPointerLock();
    document.body.style.cursor = anyModal ? "auto" : "none";
    return () => {
      if (!anyModal) document.body.style.cursor = "none";
    };
  }, [activeBoard]);

  useEffect(() => {
    if (!insideHouseId) {
      setInteriorBlockers([]);
      return;
    }
    const h = houseDefs.find((hh) => hh.id === insideHouseId);
    if (!h) {
      setInteriorBlockers([]);
      return;
    }
    setInteriorBlockers([...makeInteriorAABBs(h), makeBedAABB(h.x, h.z), makeDeskAABB(h.x, h.z)]);
  }, [insideHouseId, houseDefs]);

  useEffect(() => {
    const onToggle = () => setRgbBorder((v) => !v);
    window.addEventListener("toggle-rgb-border", onToggle as any);
    return () => window.removeEventListener("toggle-rgb-border", onToggle as any);
  }, []);
  useEffect(() => {
    const onToggle = () => setDarkMode((v) => !v);
    window.addEventListener("toggle-dark-mode", onToggle as any);
    return () => window.removeEventListener("toggle-dark-mode", onToggle as any);
  }, []);
  const closeAndRelock = () => {
    setActiveBoard(null);
    setTimeout(() => window.dispatchEvent(new CustomEvent("relock-pointer")), 0);
  };

  if (!started) {
    return (
      <TitleScreen
        onContinue={() => {
          setLowSpec(IS_TOUCH ? true : false);
          setStarted(true);
        }}
        onLiteMode={() => {
          setLowSpec(true);
          setStarted(true);
        }}
      />
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: skyGradient }} />

      {!activeBoard && !IS_TOUCH && (
        <div
          style={{
            position: "fixed",
            top: 10,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.5)",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: 10,
            zIndex: 10,
            fontSize: 14,
          }}
        >
          Click to lock · WASD · Space jump · F ladder · E gold button · Q enter/exit · Shift sprint · M mute
        </div>
      )}
      {!activeBoard && IS_TOUCH && (
        <div
          style={{
            position: "fixed",
            top: 10,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.45)",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: 10,
            zIndex: 10,
            fontSize: 12,
          }}
        >
          Left pad: move (push further = run) · Right pad: look · Buttons: Jump / Interact / Enter-Exit
        </div>
      )}

      <BackgroundMusic lightSrc="audio/bg.mp3" darkSrc="audio/night.mp3" darkMode={darkMode} maxVolume={0.6} />

      {prompt && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            top: 10, // moved to top-center
            transform: "translateX(-50%)",
            background: "rgba(30,41,59,0.85)",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 10,
            zIndex: 20,
            fontFamily: "monospace",
            fontWeight: 800,
            letterSpacing: 1,
            border: "3px solid #111827",
          }}
        >
          {prompt}
        </div>
      )}

      <Canvas
        camera={{ fov: IS_TOUCH ? 78 : 70, position: [0, 1.6, 6] }}
        dpr={lowSpec || IS_TOUCH ? [1, 1] : [1, 1.5]}
        gl={{
          antialias: !(lowSpec || IS_TOUCH),
          powerPreference: lowSpec || IS_TOUCH ? "low-power" : "high-performance",
          alpha: true,
          stencil: false,
          preserveDrawingBuffer: false,
        }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <ambientLight intensity={lowSpec ? 0.6 : 0.7} />
        <directionalLight position={[8, 20, 10]} intensity={lowSpec ? 0.8 : 1} />

        <World
          darkMode={darkMode}
          enabled={!activeBoard}
          setPrompt={setPrompt}
          onDefs={setHouseDefs}
          lowSpec={lowSpec}
          insideHouseId={insideHouseId}
        />

        <GroundedWhiteboards setActiveBoard={setActiveBoard} darkMode={darkMode} setPrompt={setPrompt} />

        <ThickSkySign text="WELCOME TO MY WORLD" rgbActive={rgbBorder} darkMode={darkMode} />

        <MouseLookControls enabled={!activeBoard} initialYaw={0} initialPitch={-0.1} />
        <MovementControls enabled={!activeBoard} speed={3.5} insideHouseId={insideHouseId} />
        <Crosshair enabled={!activeBoard} />

        <InteractAtPoint
          target={topBtnPos}
          enabled={!activeBoard}
          keyName="e"
          range={2.0}
          label={darkMode ? "Press E to switch to Day" : "Press E to switch to Night"}
          onTrigger={() => {
            window.dispatchEvent(new CustomEvent("toggle-rgb-border"));
            window.dispatchEvent(new CustomEvent("spin-banner"));
            window.dispatchEvent(new CustomEvent("toggle-dark-mode"));
          }}
          setPrompt={setPrompt}
        />

        {houseDefs.length > 0 && (
          <HouseInteriors
            enabled={!activeBoard}
            houseDefs={houseDefs}
            setPrompt={setPrompt}
            setExhibit={setExhibit}
            insideId={insideHouseId}
            darkMode={darkMode}
          />
        )}
        {houseDefs.length > 0 && (
          <DoorPrompts
            enabled={!activeBoard}
            houseDefs={houseDefs}
            setPrompt={setPrompt}
            setInside={setInsideHouseId}
            insideId={insideHouseId}
          />
        )}
      </Canvas>

      {!activeBoard && <TouchControls enabled={!activeBoard} />}

      {IS_TOUCH && <MobileMuteButton />}

      {exhibit && <ImageModal img={exhibit.img} caption={exhibit.caption} darkMode={darkMode} onClose={() => setExhibit(null)} />}
      {activeBoard && (
        <WhiteboardModal config={WHITEBOARD_CONFIG.find((b) => b.id === activeBoard)!} onClose={closeAndRelock} darkMode={darkMode} />
      )}
    </div>
  );
}

/* ---------- InteractAtPoint ---------- */
function InteractAtPoint({
  target,
  enabled,
  keyName = "e",
  range = 2.0,
  label,
  onTrigger,
  setPrompt,
}: {
  target: THREE.Vector3;
  enabled: boolean;
  keyName?: string;
  range?: number;
  label: string;
  onTrigger: () => void;
  setPrompt: (s: string | null) => void;
}) {
  const { camera } = useThree();
  const inRange = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!enabled || !inRange.current) return;
      if (e.key.toLowerCase() === keyName.toLowerCase()) onTrigger();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, keyName, onTrigger]);
  useFrame(() => {
    if (!enabled) {
      if (inRange.current) {
        inRange.current = false;
        setPrompt(null);
      }
      return;
    }
    const dx = camera.position.x - target.x,
      dz = camera.position.z - target.z;
    const d = Math.hypot(dx, dz);
    const now = d < range;
    if (now !== inRange.current) {
      inRange.current = now;
      setPrompt(now ? label : null);
    }
  });
  return null;
}

/* ---------- Image Modal ---------- */
function ImageModal({
  img,
  caption,
  onClose,
  darkMode,
}: {
  img: string;
  caption: string;
  onClose: () => void;
  darkMode: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "q" || e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const overlayBg = "linear-gradient(rgba(116,76,41,0.65), rgba(116,76,41,0.65))";
  const paper = darkMode ? "#cbaa86" : "#ffffff";
  const frame = darkMode ? "#0b1220" : "#0f172a";
  const ink = darkMode ? "#e5e7eb" : "#111827";
  const captionBg = darkMode ? "#0e1e2f" : "#f9fafb";

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: overlayBg,
        zIndex: 40,
        padding: "2rem",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "80vw",
          maxWidth: 900,
          background: paper,
          border: `6px solid ${frame}`,
          boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
        }}
      >
        <img src={img} alt="exhibit" style={{ display: "block", width: "100%", height: "auto", filter: "none" }} />
        <div style={{ padding: "1rem", color: ink, fontFamily: "monospace", background: captionBg }}>{caption}</div>
        <div style={{ padding: "0 1rem 1rem", color: ink, opacity: 0.8 }}>Press ESC or Q to close</div>
      </div>
    </div>
  );
}

/* ---------- Hook: responsive breakpoint ---------- */
function useIsMobile(bp = 900) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? IS_TOUCH || window.innerWidth <= bp
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${bp}px)`);
    const on = () => setIsMobile(IS_TOUCH || mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [bp]);
  return isMobile;
}

/* ---------- Whiteboard Modal (responsive) ---------- */
function WhiteboardModal({
  config,
  onClose,
  darkMode,
}: {
  config: (typeof WHITEBOARD_CONFIG)[0];
  onClose: () => void;
  darkMode: boolean;
}) {
  const isMobile = useIsMobile(980);
  const [tab, setTab] = useState<"info" | "gallery">("info");
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key.toLowerCase() === "q") onClose();
      // gallery keyboard nav
      if (isMobile && tab === "gallery" && scrollerRef.current) {
        if (e.key === "ArrowRight")
          scrollerRef.current.scrollBy({ left: scrollerRef.current.clientWidth, behavior: "smooth" });
        if (e.key === "ArrowLeft")
          scrollerRef.current.scrollBy({ left: -scrollerRef.current.clientWidth, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", onKey);
    // prevent background scroll while open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, isMobile, tab]);

  // colors & textures
  const pixelBorder = (thick = 6) => ({
    boxShadow: `0 0 0 ${thick}px #111827, 0 0 0 ${thick * 2}px #6b7280, 0 0 0 ${thick * 3}px #111827` as const,
  });
  const pixelTile = {
    backgroundImage:
      "repeating-linear-gradient(45deg, #9b6b43 0 16px, #8d5e37 16px 32px, #a7744d 32px 48px)",
    imageRendering: "pixelated" as const,
  };
  const paper = darkMode ? "#cbaa86" : "#d6c2a5";
  const frame = darkMode ? "#0b1220" : "#0f172a";
  const ink = darkMode ? "#e5e7eb" : "#111827";
  const panelBlue = "#0e1e2f";
  const panelLight = "#ffffff";
  const overlayBg = "linear-gradient(rgba(116,76,41,0.65), rgba(116,76,41,0.65))";

  const images =
    (config as any).images ??
    ((config as any).image ? [(config as any).image] : []);

  // track active slide for dots
  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    setActiveIdx(Math.max(0, Math.min(i, images.length - 1)));
  };

  const GalleryDots = () => (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", padding: "8px 0" }} aria-hidden="true">
      {images.map((_: any, i: Key | null | undefined) => (
        <div
          key={i}
          style={{
            width: i === activeIdx ? 14 : 8,
            height: 8,
            borderRadius: 6,
            background: i === activeIdx ? "#22c55e" : "#94a3b8",
            transition: "width 150ms",
          }}
        />
      ))}
    </div>
  );

  // shared overlay wrapper (click outside to close)
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${config.title} modal`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 30,
        background: overlayBg,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: isMobile ? "0" : "2rem",
      }}
    >
      {/* DESKTOP: existing split layout */}
      {!isMobile && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            width: "92vw",
            height: "92vh",
            background: paper,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            ...pixelBorder(6),
            ...pixelTile,
          }}
        >
          <div
            style={{
              background: "linear-gradient(#16a34a, #16a34a)",
              height: 24,
              width: "100%",
              borderBottom: "6px solid #14532d",
            }}
          />
          <button
            onClick={onClose}
            title="ESC also closes"
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              padding: "10px 18px",
              background: "#22c55e",
              color: "#0b2e13",
              border: "4px solid #14532d",
              cursor: "pointer",
              fontFamily: "monospace",
              fontWeight: 900,
              letterSpacing: 1,
              textTransform: "uppercase",
              imageRendering: "pixelated",
              ...pixelBorder(2),
            }}
          >
            EXIT
          </button>

          <div
            style={{
              display: "flex",
              gap: "1.5rem",
              padding: "1rem",
              flex: 1,
              overflow: "hidden",
            }}
          >
            {/* LEFT: text */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div
                style={{
                  background: darkMode ? "#18243a" : "#fefefe",
                  padding: "0.75rem 1rem",
                  border: `4px solid ${frame}`,
                  fontFamily: "monospace",
                  fontWeight: 900,
                  fontSize: "1.8rem",
                  letterSpacing: 1,
                  color: darkMode ? "#ffffff" : "#0f172a",
                  ...pixelBorder(2),
                }}
              >
                {config.title.toUpperCase()}
              </div>
              <div
                style={{
                  marginTop: "1rem",
                  background: darkMode ? panelBlue : panelLight,
                  padding: "1rem",
                  border: `4px solid ${frame}`,
                  fontFamily: "monospace",
                  color: ink,
                  lineHeight: 1.7,
                  flex: 1,
                  overflow: "auto",
                  ...pixelBorder(2),
                }}
              >
                {(config as any).sections?.map((sec: any, i: number) => (
                  <div key={i} style={{ marginBottom: "1.1rem" }}>
                    <div style={{ fontSize: "1.35rem", fontWeight: 900, marginBottom: 6, color: ink }}>
                      {sec.url ? (
                        <a
                          href={sec.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: darkMode ? "#93c5fd" : "#0f172a", textDecoration: "underline" }}
                        >
                          {sec.title}
                        </a>
                      ) : (
                        sec.title
                      )}
                    </div>
                    <div style={{ fontSize: "1.05rem", color: ink }} dangerouslySetInnerHTML={{ __html: sec.body }} />
                  </div>
                ))}
                <div style={{ height: 24 }} />
                <p style={{ color: ink }}>Tip: Press <b>ESC</b> or <b>Q</b> to close. Everything here scrolls.</p>
              </div>
            </div>

            {/* RIGHT: images */}
            <div
              style={{
                width: 420,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                minWidth: 0,
                overflow: "auto",
              }}
            >
              {images.map((src: string, idx: number) => (
                <div
                  key={idx}
                  style={{
                    width: "100%",
                    border: `4px solid ${frame}`,
                    background: "#ffffff",
                    boxShadow:
                      "0 0 0 6px #111827, 0 0 0 12px #6b7280, 0 0 0 18px #111827",
                  }}
                >
                  <img
                    src={src}
                    alt={`${config.title} ${idx + 1}`}
                    style={{ width: "100%", height: 360, objectFit: "cover", imageRendering: "pixelated", filter: "none" }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MOBILE: tabbed + swipeable */}
      {isMobile && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            inset: 0,
            background: paper,
            display: "flex",
            flexDirection: "column",
            ...pixelTile,
          }}
        >
          {/* sticky header */}
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              padding: "10px 12px",
              borderBottom: `6px solid #14532d`,
              background: "linear-gradient(#16a34a, #16a34a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              ...pixelBorder(0),
            }}
          >
            <div
              style={{
                marginLeft: 8,
                padding: "6px 10px",
                border: `4px solid ${frame}`,
                background: darkMode ? "#18243a" : "#fefefe",
                fontFamily: "monospace",
                fontWeight: 900,
                color: darkMode ? "#ffffff" : "#0f172a",
                ...pixelBorder(2),
              }}
            >
              {config.title.toUpperCase()}
            </div>
            <button
              onClick={onClose}
              style={{
                marginRight: 8,
                padding: "8px 14px",
                background: "#22c55e",
                color: "#0b2e13",
                border: "4px solid #14532d",
                fontFamily: "monospace",
                fontWeight: 900,
                ...pixelBorder(2),
              }}
              aria-label="Close"
            >
              EXIT
            </button>
          </div>

          {/* tabs */}
          <div
            role="tablist"
            aria-label="Content tabs"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              padding: "10px",
            }}
          >
            {(["info", "gallery"] as const).map((t) => {
              const selected = tab === t;
              return (
                <button
                  key={t}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(t)}
                  style={{
                    padding: "10px 12px",
                    border: `4px solid ${frame}`,
                    fontFamily: "monospace",
                    fontWeight: 900,
                    letterSpacing: 1,
                    background: selected
                      ? (darkMode ? "#18243a" : "#fefefe")
                      : (darkMode ? "#0b1220" : "#e5e7eb"),
                    color: selected ? (darkMode ? "#fff" : "#0f172a") : (darkMode ? "#9fb3c8" : "#374151"),
                    ...pixelBorder(2),
                  }}
                >
                  {t === "info" ? "INFO" : "GALLERY"}
                </button>
              );
            })}
          </div>

          {/* panels */}
          <div style={{ flex: 1, minHeight: 0 }}>
            {/* INFO panel */}
            {tab === "info" && (
              <div
                role="tabpanel"
                aria-labelledby="INFO"
                style={{
                  height: "100%",
                  overflow: "auto",
                  padding: "10px",
                }}
              >
                <div
                  style={{
                    background: darkMode ? panelBlue : panelLight,
                    padding: "1rem",
                    border: `4px solid ${frame}`,
                    color: ink,
                    lineHeight: 1.7,
                    fontFamily: "monospace",
                    ...pixelBorder(2),
                  }}
                >
                  {(config as any).sections?.map((sec: any, i: number) => (
                    <div key={i} style={{ marginBottom: "1.1rem" }}>
                      <div style={{ fontSize: "1.15rem", fontWeight: 900, marginBottom: 6, color: ink }}>
                        {sec.url ? (
                          <a
                            href={sec.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: darkMode ? "#93c5fd" : "#0f172a", textDecoration: "underline" }}
                          >
                            {sec.title}
                          </a>
                        ) : (
                          sec.title
                        )}
                      </div>
                      <div style={{ fontSize: "1rem" }} dangerouslySetInnerHTML={{ __html: sec.body }} />
                    </div>
                  ))}
                  <p style={{ opacity: 0.85, marginTop: 12 }}>
                    Tip: You can switch tabs anytime. ESC / Q to close.
                  </p>
                </div>
              </div>
            )}

            {/* GALLERY panel */}
            {tab === "gallery" && (
              <div
                role="tabpanel"
                aria-labelledby="GALLERY"
                style={{
                  height: "100%",
                  display: "grid",
                  gridTemplateRows: "1fr auto",
                }}
              >
                <div
                  ref={scrollerRef}
                  onScroll={onScroll}
                  style={{
                    overflowX: "auto",
                    overflowY: "hidden",
                    scrollSnapType: "x mandatory",
                    display: "grid",
                    gridAutoFlow: "column",
                    gridAutoColumns: "100%",
                    gap: 12,
                    padding: "10px",
                    WebkitOverflowScrolling: "touch",
                    touchAction: "pan-x pan-y",
                  }}
                >
                  {images.map((src: string, i: number) => (
                    <div
                      key={i}
                      style={{
                        scrollSnapAlign: "start",
                        display: "grid",
                        alignContent: "start",
                        border: `4px solid ${frame}`,
                        background: "#ffffff",
                        ...pixelBorder(2),
                      }}
                    >
                      <img
                        src={src}
                        alt={`${config.title} ${i + 1}`}
                        style={{
                          width: "100%",
                          height: "calc(100vh - 220px)",
                          objectFit: "cover",
                          imageRendering: "pixelated",
                          filter: "none",
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* controls + dots */}
                <div style={{ padding: "0 10px 12px" }}>
                  <GalleryDots />
                  <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                    <button
                      onClick={() =>
                        scrollerRef.current?.scrollBy({
                          left: -Math.max(1, scrollerRef.current.clientWidth),
                          behavior: "smooth",
                        })
                      }
                      style={{
                        padding: "8px 14px",
                        background: "#e5e7eb",
                        border: `4px solid ${frame}`,
                        fontFamily: "monospace",
                        fontWeight: 900,
                        ...pixelBorder(2),
                      }}
                      aria-label="Previous image"
                    >
                      ◀
                    </button>
                    <button
                      onClick={() =>
                        scrollerRef.current?.scrollBy({
                          left: Math.max(1, scrollerRef.current.clientWidth),
                          behavior: "smooth",
                        })
                      }
                      style={{
                        padding: "8px 14px",
                        background: "#e5e7eb",
                        border: `4px solid ${frame}`,
                        fontFamily: "monospace",
                        fontWeight: 900,
                        ...pixelBorder(2),
                      }}
                      aria-label="Next image"
                    >
                      ▶
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Crosshair ---------- */
function Crosshair({ enabled = true }: { enabled?: boolean }) {
  const { camera } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!enabled || !meshRef.current) return;
    const v = new THREE.Vector3(0, 0, -0.7).applyQuaternion(camera.quaternion).add(camera.position);
    meshRef.current.position.copy(v);
    meshRef.current.quaternion.copy(camera.quaternion);
  });
  if (!enabled) return null;
  return (
    <mesh ref={meshRef}>
      <circleGeometry args={[0.005, 16]} />
      <meshBasicMaterial color={0x111111} />
    </mesh>
  );
}

/* ---------- Mouse look (mobile sensitivity 1.5x) ---------- */
function MouseLookControls({
  enabled,
  initialYaw = 0,
  initialPitch = -0.1,
}: {
  enabled: boolean;
  initialYaw?: number;
  initialPitch?: number;
}) {
  const { camera, gl } = useThree();
  const yaw = useRef(initialYaw),
    pitch = useRef(initialPitch),
    locked = useRef(false);

  useEffect(() => {
    if (IS_TOUCH) return;
    const canvas = gl.domElement;
    const relock = () => {
      if (enabled && document.pointerLockElement !== canvas) canvas.requestPointerLock();
    };
    const onRelock = () => relock();
    const onClick = () => {
      if (enabled && document.pointerLockElement !== canvas) canvas.requestPointerLock();
    };
    const onLockChange = () => {
      locked.current = document.pointerLockElement === canvas;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!locked.current || !enabled) return;
      const s = 0.00375; // 1.5x from 0.0025
      yaw.current -= e.movementX * s;
      pitch.current -= e.movementY * s;
      const max = Math.PI / 2 - 0.05;
      pitch.current = Math.max(-max, Math.min(max, pitch.current));
    };
    canvas.addEventListener("click", onClick);
    document.addEventListener("pointerlockchange", onLockChange);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("relock-pointer", onRelock as any);
    return () => {
      canvas.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onLockChange);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("relock-pointer", onRelock as any);
    };
  }, [enabled, gl]);

  useEffect(() => {
    if (!IS_TOUCH) return;
    function onLook(e: any) {
      const { dx, dy } = (e as CustomEvent).detail || { dx: 0, dy: 0 };
      const s = 0.0066; // 1.5x from 0.0044
      yaw.current -= dx * s;
      pitch.current -= dy * s;
      const max = Math.PI / 2 - 0.05;
      pitch.current = Math.max(-max, Math.min(max, pitch.current));
    }
    window.addEventListener("mobile-look", onLook as any);
    return () => window.removeEventListener("mobile-look", onLook as any);
  }, []);

  useFrame(() => {
    const q = new THREE.Quaternion();
    q.setFromEuler(new THREE.Euler(pitch.current, yaw.current, 0, "YXZ"));
    camera.quaternion.copy(q);
  });
  return null;
}

/* ---------- Movement + ladders (mobile omits ladders; joystick sprint) ---------- */
function MovementControls({
  enabled,
  speed = 3.5,
  sprint = 1.9,
  insideHouseId,
}: {
  enabled: boolean;
  speed?: number;
  sprint?: number;
  insideHouseId?: string | null;
}) {
  const { camera } = useThree();
  const keys = useRef<{ [k: string]: boolean }>({});
  const vY = useRef(0);
  const last = useRef(performance.now());
  const baseEye = 1.6,
    gravity = 20,
    jumpSpeed = 7.5,
    climbSpeed = 3.0,
    radius = 0.4;
  const climbing = useRef(false);
  const climbVolRef = useRef<AABB | null>(null);
  const laddersEnabled = !IS_TOUCH;

  const joy = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onJoy = (e: any) => {
      joy.current = e.detail || { x: 0, y: 0 };
    };
    window.addEventListener("mobile-joystick", onJoy as any);
    return () => window.removeEventListener("mobile-joystick", onJoy as any);
  }, []);
  useEffect(() => {
    const onTeleport = (e: any) => {
      const { x, y, z } = (e as CustomEvent).detail || {};
      if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
        camera.position.set(x, y, z);
        vY.current = 0;
      }
    };
    window.addEventListener("teleport-to", onTeleport as any);
    return () => window.removeEventListener("teleport-to", onTeleport as any);
  }, [camera]);
  const lastLadderToggle = useRef(0);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.current[k] = true;
      keys.current[e.code] = true;
      if (k === "f" && laddersEnabled && climbVolRef.current) {
        climbing.current = !climbing.current;
        lastLadderToggle.current = performance.now();
        const a = climbVolRef.current;
        const cx = (a.min[0] + a.max[0]) / 2,
          cz = (a.min[2] + a.max[2]) / 2;
        camera.position.x = cx;
        camera.position.z = cz;
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
      keys.current[e.code] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [camera, laddersEnabled]);
  const isDown = (n: string) => !!(keys.current[n] || keys.current[n.toLowerCase()]);

  function collidesXYAt(x: number, z: number) {
    const yMin = camera.position.y - baseEye + 0.02,
      yMax = camera.position.y - 0.02;
    const all = [...GLOBAL_BLOCKERS, ...GLOBAL_INTERIOR_BLOCKERS];
    for (const a of all) {
      if (insideHouseId && a.tag === insideHouseId) continue;
      if (x >= a.min[0] - radius && x <= a.max[0] + radius && z >= a.min[2] - radius && z <= a.max[2] + radius) {
        if (yMax > a.min[1] + 1e-3 && yMin < a.max[1] - 1e-3) return true;
      }
    }
    return false;
  }
  function groundAtLimited(x: number, z: number, footY: number, allowHighSnap: boolean) {
    const probe = Math.max(0, radius * PROBE_FACTOR);
    let best = 0;
    for (const a of GLOBAL_WALK_SURFACES) {
      const minX = a.min[0] - EDGE_PAD - probe,
        maxX = a.max[0] + EDGE_PAD + probe,
        minZ = a.min[2] - EDGE_PAD - probe,
        maxZ = a.max[2] + EDGE_PAD + probe;
      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
        const top = a.max[1];
        if (allowHighSnap || top <= footY + MAX_UP_SNAP) best = Math.max(best, top);
      }
    }
    return best;
  }
  function inClimbVol(x: number, z: number) {
    for (const a of GLOBAL_CLIMB_VOLUMES) {
      if (x >= a.min[0] && x <= a.max[0] && z >= a.min[2] && z <= a.max[2]) return a;
    }
    return null;
  }

  useFrame(() => {
    const now = performance.now(),
      dt = (now - last.current) / 1000;
    last.current = now;
    if (!enabled) return;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    // walking vs running: joystick threshold on mobile, Shift on desktop
    let sprintMul = 1;
    if (IS_TOUCH) {
      const jl = Math.hypot(joy.current.x, joy.current.y);
      sprintMul = jl > 0.68 ? sprint : 1; // two-speed
    } else {
      sprintMul = isDown("ShiftLeft") || isDown("ShiftRight") || isDown("shift") ? sprint : 1;
    }

    let wish = new THREE.Vector3();
    if (isDown("w")) wish.add(forward);
    if (isDown("s")) wish.sub(forward);
    if (isDown("a")) wish.sub(right);
    if (isDown("d")) wish.add(right);
    const j = joy.current;
    if (Math.abs(j.x) > 0.01 || Math.abs(j.y) > 0.01) wish.addScaledVector(forward, j.y).addScaledVector(right, j.x);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed * sprintMul);

    const next = camera.position.clone().addScaledVector(wish, dt);
    let nx = camera.position.x,
      nz = camera.position.z;
    if (!collidesXYAt(next.x, next.z)) {
      nx = next.x;
      nz = next.z;
    } else {
      if (!collidesXYAt(next.x, camera.position.z)) nx = next.x;
      if (!collidesXYAt(camera.position.x, next.z)) nz = next.z;
    }
    camera.position.x = nx;
    camera.position.z = nz;

    const hereClimb = laddersEnabled ? inClimbVol(camera.position.x, camera.position.z) : null;
    climbVolRef.current = hereClimb;
    if (!laddersEnabled) climbing.current = false;

    if (climbing.current && hereClimb) {
      let y = camera.position.y;
      if (isDown("w")) y += climbSpeed * dt;
      if (isDown("s")) y -= climbSpeed * dt;
      const minY = hereClimb.min[1] + baseEye,
        maxY = hereClimb.max[1] + baseEye + 0.2;
      camera.position.y = Math.max(minY, Math.min(maxY, y));
      vY.current = 0;
    } else {
      const allowHighSnap = performance.now() - lastLadderToggle.current < ROOF_GRACE_MS;
      const footY = camera.position.y - baseEye;
      const gY = groundAtLimited(camera.position.x, camera.position.z, footY, allowHighSnap);
      const minY = gY + baseEye;
      vY.current -= gravity * dt;
      camera.position.y += vY.current * dt;

      if (vY.current <= 0) {
        const dist = camera.position.y - minY;
        if (dist <= GROUND_SNAP) {
          camera.position.y = minY;
          vY.current = 0;
        } else if (dist > 0 && dist < MAX_STEP) {
          camera.position.y = minY;
          vY.current = 0;
        }
      }
      const onGround = Math.abs(camera.position.y - minY) < 0.005 || camera.position.y < minY;
      if (onGround) {
        camera.position.y = minY;
        vY.current = 0;
      }
      if ((isDown(" ") || isDown("Space")) && onGround) vY.current = jumpSpeed * (sprintMul > 1 ? 1.05 : 1);
    }

    const H = ARENA_HALF;
    camera.position.x = Math.max(-H, Math.min(H, camera.position.x));
    camera.position.z = Math.max(-H, Math.min(H, camera.position.z));
  });
  return null;
}

/* ---------- World + geometry ---------- */
function World({
  darkMode,
  enabled,
  setPrompt,
  onDefs,
  lowSpec = false,
  insideHouseId,
}: {
  darkMode: boolean;
  enabled: boolean;
  setPrompt: (s: string | null) => void;
  onDefs: (defs: HouseDef[]) => void;
  lowSpec?: boolean;
  insideHouseId: string | null;
}) {
  type FullHouseDef = HouseDef & {
    baseW: number;
    baseH: number;
    baseD: number;
    roofT: number;
    ld: number;
    ladderX: number;
    ladderZ: number;
  };
  const groundTex = useMemo(() => makeVoxelGroundTexture(darkMode), [darkMode]);
  const houseDefs = useMemo<FullHouseDef[]>(() => {
    const raw = [
      { id: "house-0", x: -16, z: -12 },
      { id: "house-1", x: 16, z: -10 },
      { id: "house-2", x: -14, z: 14 },
      { id: "house-3", x: 14, z: 14 },
    ];
    const baseW = 8,
      baseH = 4.4,
      baseD = 8,
      roofT = 0.4,
      ld = 0.5;
    return raw.map((h) => {
      const doorWorld = new THREE.Vector3(h.x, 0, h.z + baseD / 2 + 0.1);
      const insideSpawn = new THREE.Vector3(h.x, 1.6, h.z + baseD / 2 - 2.0);
      const interiorLight = new THREE.Vector3(h.x, baseH * 0.6, h.z);
      const ladderX = h.x + (baseW as number) * 0.35,
        ladderZ = h.z + baseD / 2 + ld / 2 + 0.02;
      return { ...h, baseW, baseH, baseD, roofT, ld, ladderX, ladderZ, doorWorld, insideSpawn, interiorLight };
    });
  }, []);
  useEffect(() => {
    onDefs(
      houseDefs.map((h) => ({
        id: h.id,
        x: h.x,
        z: h.z,
        doorWorld: h.doorWorld,
        insideSpawn: h.insideSpawn,
        interiorLight: h.interiorLight,
      }))
    );
  }, [onDefs, houseDefs]);
  useEffect(() => () => {
    groundTex.dispose?.();
  }, [groundTex]);

  useEffect(() => {
    const blockers: AABB[] = [],
      walk: AABB[] = [],
      climb: AABB[] = [];
    const fixedTrees: [number, number][] = [
      [-3, -6],
      [6, -3],
      [-6, 5],
      [4, -8],
    ];
    const ringR = 20,
      ringN = 18;
    const ringTrees: [number, number][] = Array.from({ length: ringN }, (_, i) => [
      Math.cos((i / ringN) * Math.PI * 2) * ringR,
      Math.sin((i / ringN) * Math.PI * 2) * ringR,
    ]);
    [...fixedTrees, ...ringTrees].forEach(([x, z]) => {
      const w = 0.6,
        d = 0.6,
        h = 2.0;
      blockers.push({ min: [x - w / 2, 0, z - d / 2], max: [x + w / 2, h, z + d / 2] });
    });

    houseDefs.forEach((h) => {
      const { x, z, id, baseW, baseH, baseD, roofT, ld, ladderX, ladderZ } = h;
      blockers.push({ min: [x - baseW / 2, 0, z - baseD / 2], max: [x + baseW / 2, baseH, z + baseD / 2], tag: id });
      const over = 0.6,
        inset = 0.1;
      walk.push({
        min: [x - (baseW + over) / 2 + inset, baseH, z - (baseD + over) / 2 + inset],
        max: [x + (baseW + over) / 2 - inset, baseH + 0.12, z + (baseD + over) / 2 - inset],
      });
      climb.push({ min: [ladderX - 0.8 / 2, 0, ladderZ - ld / 2], max: [ladderX + 0.8 / 2, baseH + roofT, ladderZ + ld / 2] });
    });

    getParkourDefs().forEach((b) => {
      blockers.push({ min: [b.x - b.w / 2, 0, b.z - b.d / 2], max: [b.x + b.w / 2, b.h, b.z + b.d / 2] });
      const over = 0.06;
      walk.push({
        min: [b.x - b.w / 2 - over, b.h - 0.02, b.z - b.d / 2 - over],
        max: [b.x + b.w / 2 + over, b.h + 0.2, b.z + b.d / 2 + over],
      });
    });

    const H = ARENA_HALF,
      wallH = 10,
      thick = 0.6,
      span = H * 2 + 2;
    blockers.push({ min: [H, 0, -span / 2], max: [H + thick, wallH, span / 2] });
    blockers.push({ min: [-H - thick, 0, -span / 2], max: [-H, wallH, span / 2] });
    blockers.push({ min: [-span / 2, 0, H], max: [span / 2, wallH, H + thick] });
    blockers.push({ min: [-span / 2, 0, -H - thick], max: [span / 2, wallH, -H] });

    setBlockers(blockers);
    setWalkSurfaces(walk);
    setClimbVolumes(climb);
  }, []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[300, 300]} />
        <meshBasicMaterial map={groundTex} color={darkMode ? "#bcdcbc" : "#ffffff"} />
      </mesh>
      <Trees darkMode={darkMode} houseDefs={houseDefs} />
      <Houses darkMode={darkMode} defs={houseDefs} insideId={insideHouseId} />
      {!lowSpec && <ParkourBoxes />}
      {!(lowSpec || IS_TOUCH) && <CloudField darkMode={darkMode} />}
      {!IS_TOUCH && <LadderPrompts enabled={enabled} setPrompt={setPrompt} />}
      <ArenaWalls />
      {darkMode &&
        houseDefs.map((h) => <pointLight key={h.id} position={(h as any).interiorLight} intensity={0.9} distance={10} color={"#ffd27a"} />)}
    </group>
  );
}

/* ---------- Trees / Houses / Parkour / Clouds / Walls ---------- */
function Trees({ darkMode, houseDefs }: { darkMode: boolean; houseDefs: { id: string; x: number; z: number }[] }) {
  const baseW = 8,
    baseD = 8,
    pad = 1.2;
  const isInside = (tx: number, tz: number) => {
    for (const h of houseDefs) {
      const withinX = Math.abs(tx - h.x) <= baseW / 2 + pad;
      const withinZ = Math.abs(tz - h.z) <= baseD / 2 + pad;
      if (withinX && withinZ) return true;
    }
    return false;
  };
  const trees: JSX.Element[] = [];
  const fixed: [number, number][] = [
    [-3, -6],
    [6, -3],
    [-6, 5],
    [4, -8],
  ];
  const radius = 20;
  const ring: [number, number][] = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  });
  [...fixed, ...ring].forEach(([x, z], i) => {
    if (isInside(x, z)) return;
    trees.push(<Tree key={`tree-${i}`} position={[x, 0, z]} darkMode={darkMode} />);
  });
  return <group>{trees}</group>;
}
function Tree({ position = [0, 0, 0] as [number, number, number], darkMode }: { position: [number, number, number]; darkMode: boolean }) {
  const trunk = "#8b5a2b",
    leaf1 = darkMode ? "#013220" : "#2fad4e",
    leaf2 = darkMode ? "#022d1c" : "#27a046";
  return (
    <group position={position}>
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[0.6, 2, 0.6]} />
        <meshBasicMaterial color={trunk} />
      </mesh>
      <mesh position={[0, 2.4, 0]}>
        <boxGeometry args={[2, 1.2, 2]} />
        <meshBasicMaterial color={leaf1} />
      </mesh>
      <mesh position={[0, 3.3, 0]}>
        <boxGeometry args={[1.4, 1, 1.4]} />
        <meshBasicMaterial color={leaf2} />
      </mesh>
    </group>
  );
}
function Houses({ darkMode, defs, insideId }: { darkMode: boolean; defs: { id: string; x: number; z: number }[]; insideId: string | null }) {
  return <group>{defs.map((h) => <House key={h.id} position={[h.x, 0, h.z]} darkMode={darkMode} insideActive={insideId === h.id} />)}</group>;
}
function House({
  position = [0, 0, 0] as [number, number, number],
  darkMode,
  insideActive = false,
}: {
  position: [number, number, number];
  darkMode: boolean;
  insideActive?: boolean;
}) {
  const plank = useMemo(() => makePlankTexture(), []),
    brick = useMemo(() => makeBrickTexture(), []);
  const baseW = 8,
    baseH = 4.4,
    baseD = 8,
    ridgeY = baseH,
    roofT = 0.36;
  return (
    <group position={position}>
      <mesh position={[0, baseH / 2, 0]}>
        <boxGeometry args={[baseW, baseH, baseD]} />
        <meshBasicMaterial map={brick} side={insideActive ? THREE.DoubleSide : THREE.FrontSide} />
      </mesh>
      <mesh position={[0, 1.2, baseD / 2 + 0.01]}>
        <planeGeometry args={[1.8, 2.4]} />
        <meshBasicMaterial map={plank} />
      </mesh>
      <mesh position={[baseW / 3.1, 2.6, baseD / 2 + 0.01]}>
        <planeGeometry args={[1.4, 1.0]} />
        <meshBasicMaterial color={darkMode ? "#ffe599" : "#a3e7ff"} />
      </mesh>
      <mesh position={[0, ridgeY + roofT / 2, 0]}>
        <boxGeometry args={[baseW + 0.6, roofT, baseD + 0.6]} />
        <meshBasicMaterial map={plank} />
      </mesh>
      <group position={[baseW * 0.35, 1.6, baseD / 2 + 0.02]}>
        <mesh position={[-0.35, 0, 0]}>
          <boxGeometry args={[0.12, 3, 0.06]} />
          <meshBasicMaterial map={plank} />
        </mesh>
        <mesh position={[0.35, 0, 0]}>
          <boxGeometry args={[0.12, 3, 0.06]} />
          <meshBasicMaterial map={plank} />
        </mesh>
        {Array.from({ length: 7 }).map((_, i) => (
          <mesh key={i} position={[0, -1.4 + i * (3 / 6), 0]}>
            <boxGeometry args={[0.7, 0.08, 0.06]} />
            <meshBasicMaterial map={plank} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
function ParkourBoxes() {
  const plank = useMemo(() => makePlankTexture(), []);
  const defs = useMemo(() => getParkourDefs(), []);
  const top = defs[defs.length - 1];
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const s = 1 + Math.sin(clock.getElapsedTime() * 3) * 0.08;
    ringRef.current.scale.set(s, 1, s);
  });
  return (
    <group>
      {defs.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshBasicMaterial map={plank} />
        </mesh>
      ))}
      {top && (
        <group position={[top.x, top.h + 0.25, top.z]}>
          <mesh>
            <cylinderGeometry args={[0.45, 0.45, 0.2, 20]} />
            <meshBasicMaterial color="#f59e0b" />
          </mesh>
          <mesh ref={ringRef} position={[0, 0.02, 0]}>
            <torusGeometry args={[0.65, 0.05, 10, 40]} />
            <meshBasicMaterial color="#fde68a" />
          </mesh>
        </group>
      )}
    </group>
  );
}
function Cloud({ position = [0, 0, 0] as [number, number, number], darkMode }: { position: [number, number, number]; darkMode: boolean }) {
  const cloud = darkMode ? "#d1d5db" : "#fff";
  return (
    <group position={position}>
      {[
        [0, 0, 0],
        [1.2, 0.3, 0.4],
        [-1, 0.2, -0.4],
        [0.2, -0.1, 0.9],
      ].map((o, i) => (
        <mesh key={i} position={[o[0], o[1], o[2]]}>
          <boxGeometry args={[2, 1, 1]} />
          <meshBasicMaterial color={cloud} />
        </mesh>
      ))}
    </group>
  );
}
function CloudField({ darkMode }: { darkMode: boolean }) {
  const groups: JSX.Element[] = [];
  const ringRadius = 14,
    ringCount = 12;
  for (let i = 0; i < ringCount; i++) {
    const ang = (i / ringCount) * Math.PI * 2;
    groups.push(<Cloud key={"ring" + i} position={[Math.cos(ang) * ringRadius, CLOUD_ALT, Math.sin(ang) * ringRadius]} darkMode={darkMode} />);
  }
  const grid = [-2, -1, 0, 1, 2];
  grid.forEach((gx) =>
    grid.forEach((gz) => {
      if (gx === 0 && gz === 0) return;
      const x = gx * 10 + (gx % 2 === 0 ? 2 : -2),
        z = gz * 12 + (gz % 2 === 0 ? -2 : 2),
        y = CLOUD_ALT + (((gx + gz + 5) % 3) - 1);
      groups.push(<Cloud key={`grid-${gx}-${gz}`} position={[x, y, z]} darkMode={darkMode} />);
    })
  );
  return <group>{groups}</group>;
}
function LadderPrompts({ enabled, setPrompt }: { enabled: boolean; setPrompt: (s: string | null) => void }) {
  const houses: [number, number][] = [
    [-16, -12],
    [16, -10],
    [-14, 14],
    [14, 14],
  ];
  const baseW = 8,
    baseD = 8,
    ld = 0.5;
  return (
    <group>
      {houses.map(([x, z], i) => {
        const lx = x + baseW * 0.35,
          lz = z + baseD / 2 + ld / 2 + 0.02;
        return (
          <InteractAtPoint
            key={`ladder-${i}`}
            target={new THREE.Vector3(lx, 1.4, lz)}
            enabled={enabled}
            range={1.8}
            keyName="f"
            label="Press F to climb ladder"
            onTrigger={() => {}}
            setPrompt={setPrompt}
          />
        );
      })}
    </group>
  );
}
function DoorPrompts({
  enabled,
  houseDefs,
  setPrompt,
  setInside,
  insideId,
}: {
  enabled: boolean;
  houseDefs: { id: string; doorWorld: THREE.Vector3; insideSpawn: THREE.Vector3 }[];
  setPrompt: (s: string | null) => void;
  setInside: (id: string | null) => void;
  insideId: string | null;
}) {
  return (
    <group>
      {houseDefs.map((h) => {
        if (!h.doorWorld || !h.insideSpawn) return null;
        return (
          <InteractAtPoint
            key={`door-${h.id}`}
            target={new THREE.Vector3(h.doorWorld.x, 1.4, h.doorWorld.z)}
            enabled={enabled}
            keyName="q"
            range={2.6}
            label={insideId === h.id ? "Press Q to Exit" : "Press Q to Enter"}
            onTrigger={() => {
              const goingIn = insideId !== h.id;
              if (goingIn) {
                setInside(h.id);
                window.dispatchEvent(
                  new CustomEvent("teleport-to", {
                    detail: { x: h.insideSpawn.x, y: h.insideSpawn.y, z: h.insideSpawn.z },
                  })
                );
              } else {
                setInside(null);
                const out = h.doorWorld.clone();
                out.y = 1.6;
                out.z += 0.6;
                window.dispatchEvent(new CustomEvent("teleport-to", { detail: { x: out.x, y: out.y, z: out.z } }));
              }
            }}
            setPrompt={setPrompt}
          />
        );
      })}
    </group>
  );
}
function ArenaWalls() {
  const brick = useMemo(() => makeBrickTexture(), []);
  const H = ARENA_HALF,
    wallH = 10,
    thick = 0.6,
    span = H * 2 + 2;
  return (
    <group>
      <mesh position={[H + thick / 2, wallH / 2, 0]}>
        <boxGeometry args={[thick, wallH, span]} />
        <meshBasicMaterial map={brick} />
      </mesh>
      <mesh position={[-H - thick / 2, wallH / 2, 0]}>
        <boxGeometry args={[thick, wallH, span]} />
        <meshBasicMaterial map={brick} />
      </mesh>
      <mesh position={[0, wallH / 2, H + thick / 2]}>
        <boxGeometry args={[span, wallH, thick]} />
        <meshBasicMaterial map={brick} />
      </mesh>
      <mesh position={[0, wallH / 2, -H - thick / 2]}>
        <boxGeometry args={[span, wallH, thick]} />
        <meshBasicMaterial map={brick} />
      </mesh>
    </group>
  );
}

/* ---------- Interiors ---------- */
function InteriorShell({
  x,
  z,
  baseW = 8,
  baseD = 8,
  baseH = 4.4,
  inset = 0.08,
}: {
  x: number;
  z: number;
  baseW?: number;
  baseD?: number;
  baseH?: number;
  inset?: number;
}) {
  const brickTex = useMemo(() => makeBrickTexture(), []);
  const floorTex = useMemo(() => makeFloorWoodTexture(), []);
  return (
    <group>
      <mesh position={[x, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[baseW - 0.2, baseD - 0.2]} />
        <meshBasicMaterial map={floorTex} />
      </mesh>
      <mesh position={[x, baseH / 2, z - (baseD / 2 - inset)]}>
        <planeGeometry args={[baseW - 2 * inset, baseH]} />
        <meshBasicMaterial map={brickTex} side={THREE.FrontSide} />
      </mesh>
      <group position={[x, baseH / 2, z + (baseD / 2 - inset)]} rotation={[0, Math.PI, 0]}>
        <mesh position={[-(baseW / 2 - inset) / 2 - 1.1, 0, 0]}>
          <planeGeometry args={[baseW - 2 * inset - 2.2, baseH]} />
          <meshBasicMaterial map={brickTex} />
        </mesh>
        <mesh position={[(baseW / 2 - inset) / 2 + 1.1, 0, 0]}>
          <planeGeometry args={[baseW - 2 * inset - 2.2, baseH]} />
          <meshBasicMaterial map={brickTex} />
        </mesh>
      </group>
      <mesh position={[x - (baseW / 2 - inset), baseH / 2, z]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[baseD - 2 * inset, baseH]} />
        <meshBasicMaterial map={brickTex} />
      </mesh>
      <mesh position={[x + (baseW / 2 - inset), baseH / 2, z]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[baseD - 2 * inset, baseH]} />
        <meshBasicMaterial map={brickTex} />
      </mesh>
      <mesh position={[x, baseH - 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[baseW - 2 * inset, baseD - 2 * inset]} />
        <meshBasicMaterial color={0x505050} />
      </mesh>
    </group>
  );
}
function DeskAndLamp({ x, z, darkMode }: { x: number; z: number; darkMode: boolean }) {
  const shadeColor = darkMode ? "#fff7d6" : "#fff",
    shadeEmissive = darkMode ? "#ffd37a" : "#000",
    shadeEmissiveIntensity = darkMode ? 0.9 : 0.0,
    lampLightIntensity = darkMode ? 1.2 : 0.4;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[DESK.cx, 0.25, DESK.cz]}>
        <boxGeometry args={[DESK.w, 0.5, DESK.d]} />
        <meshBasicMaterial color="#654321" />
      </mesh>
      <mesh position={[DESK.cx, 0.55, DESK.cz]}>
        <boxGeometry args={[DESK.w, 0.1, DESK.d]} />
        <meshBasicMaterial color="#8B5A2B" />
      </mesh>
      <mesh position={[DESK.cx, 0.75, DESK.cz]}>
        <cylinderGeometry args={[0.05, 0.05, 0.4, 12]} />
        <meshBasicMaterial color="#808080" />
      </mesh>
      <mesh position={[DESK.cx, 1.1, DESK.cz]}>
        <coneGeometry args={[0.25, 0.3, 16]} />
        <meshStandardMaterial color={shadeColor} emissive={shadeEmissive} emissiveIntensity={shadeEmissiveIntensity} />
      </mesh>
      <pointLight position={[DESK.cx, 1.1, DESK.cz]} intensity={lampLightIntensity} distance={5} color={"#ffd27a"} />

      <mesh position={[BED.cx, 0.2, BED.cz]}>
        <boxGeometry args={[BED.w, 0.4, BED.d]} />
        <meshBasicMaterial color="#5b3b2a" />
      </mesh>
      <mesh position={[BED.cx, 0.5, BED.cz]}>
        <boxGeometry args={[BED.w * 0.98, 0.2, BED.d * 0.96]} />
        <meshBasicMaterial color="#dfe7f1" />
      </mesh>
      <mesh position={[BED.cx + BED.w / 2 - 0.35, 0.62, BED.cz]}>
        <boxGeometry args={[0.6, 0.12, 0.35]} />
        <meshBasicMaterial color="#fff" />
      </mesh>
      <mesh position={[BED.cx - 0.2, 0.58, BED.cz]}>
        <boxGeometry args={[BED.w * 0.7, 0.06, BED.d * 0.95]} />
        <meshBasicMaterial color="#3b82f6" />
      </mesh>
    </group>
  );
}
function HouseInteriors({
  enabled,
  houseDefs,
  setPrompt,
  setExhibit,
  insideId,
  darkMode,
}: {
  enabled: boolean;
  houseDefs: { id: string; x: number; z: number }[];
  setPrompt: (s: string | null) => void;
  setExhibit: (v: { img: string; caption: string } | null) => void;
  insideId: string | null;
  darkMode: boolean;
}) {
  const frameTex = useMemo(() => makePlankTexture(), []);
  const baseW = 8,
    baseD = 8,
    baseH = 4.4;
  const exhibits = [
    { id: "house-0", img: "images/imageme1.jpeg", caption: "Me, IRL." },
    { id: "house-1", img: "images/imagejetbot1.jpeg", caption: "Jetbot build." },
    { id: "house-2", img: "images/imagelidar1.jpeg", caption: "LIDAR project." },
    { id: "house-3", img: "images/imagesnake1.jpg", caption: "C++ Snake." },
  ];
  return (
    <group>
      {houseDefs.map((h, i) => {
        const active = insideId === h.id;
        const ex = exhibits[i % exhibits.length];
        const picCenter = new THREE.Vector3(h.x, 2.2, h.z - (baseD / 2 - 0.3));
        const picLookPos = picCenter.clone().add(new THREE.Vector3(0, 0, 0.8));
        return (
          <group key={`interior-${h.id}`}>
            {active && <InteriorShell x={h.x} z={h.z} baseW={baseW} baseD={baseD} baseH={baseH} />}
            <InteriorPicture img={ex.img} frameTex={frameTex} position={[picCenter.x, picCenter.y, picCenter.z]} />
            <InteractAtPoint
              target={picLookPos}
              enabled={enabled && active}
              keyName="e"
              range={2.2}
              label="Press E to view"
              onTrigger={() => setExhibit({ img: asset(ex.img), caption: ex.caption })}
              setPrompt={setPrompt}
            />
            {active && <DeskAndLamp x={h.x} z={h.z} darkMode={darkMode} />}
          </group>
        );
      })}
    </group>
  );
}
function InteriorPicture({ img, frameTex, position }: { img: string; frameTex: THREE.Texture; position: [number, number, number] }) {
  const tex = useLoader(THREE.TextureLoader, asset(img));
  return (
    <group position={position}>
      <pointLight position={[0, 0, 0.2]} intensity={0.6} distance={3} />
      <mesh position={[0, 0, 0.32]}>
        <planeGeometry args={[2.3, 1.6]} />
        <meshBasicMaterial map={tex} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
      <mesh position={[0, 0, 0.28]}>
        <boxGeometry args={[2.8, 2.0, 0.08]} />
        <meshBasicMaterial map={frameTex} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.3]}>
        <planeGeometry args={[2.5, 1.8]} />
        <meshBasicMaterial color="#f3f4f6" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.32]}>
        <planeGeometry args={[2.3, 1.6]} />
        <meshBasicMaterial map={tex} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ---------- ThickSkySign (uses TITLE_ALT) ---------- */
function ThickSkySign({ text, rgbActive, darkMode }: { text: string; rgbActive: boolean; darkMode: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const texRef = useRef<THREE.CanvasTexture | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const phaseRef = useRef(0);
  const spinning = useRef(false);
  const spinStart = useRef(0);
  const spinDuration = useRef(1200);
  const baseRotation = useRef(0);

  useEffect(() => {
    const startSpin = () => {
      if (!groupRef.current) return;
      spinning.current = true;
      spinStart.current = performance.now();
      baseRotation.current = (((groupRef.current.rotation.y % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
    };
    window.addEventListener("spin-banner", startSpin as any);
    return () => window.removeEventListener("spin-banner", startSpin as any);
  }, []);

  if (!canvasRef.current) {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 900;
    canvasRef.current = canvas;
    ctxRef.current = canvas.getContext("2d");
    texRef.current = new THREE.CanvasTexture(canvas);
    texRef.current.anisotropy = 8;
    texRef.current.needsUpdate = true;
  }

  const draw = (phase: number) => {
    const c = canvasRef.current!,
      ctx = ctxRef.current!;
    ctx.fillStyle = "#7b4f28";
    ctx.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.2})`;
      ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 10, 10);
    }
    if (darkMode) {
      ctx.fillStyle = "#1d3b2a";
      ctx.fillRect(0, 0, c.width, c.height * 0.25);
      ctx.fillStyle = "#245a38";
      ctx.fillRect(0, 0, c.width, c.height * 0.18);
    } else {
      ctx.fillStyle = "#2e7d32";
      ctx.fillRect(0, 0, c.width, c.height * 0.25);
      ctx.fillStyle = "#4caf50";
      ctx.fillRect(0, 0, c.width, c.height * 0.18);
    }
    ctx.lineWidth = 40;
    ctx.strokeStyle = darkMode ? "#0b1220" : "#0f172a";
    ctx.strokeRect(0, 0, c.width, c.height);

    if (rgbActive) {
      const seg = 32,
        perim = 2 * (c.width + c.height);
      for (let p = 0; p < perim; p += seg) {
        const hue = ((p / perim) * 360 + phase * 180) % 360;
        ctx.strokeStyle = `hsl(${hue},100%,60%)`;
        ctx.lineWidth = 60;
        let s = p,
          e = Math.min(p + seg, perim);
        const drawEdge = (x1: number, y1: number, x2: number, y2: number) => {
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        };
        while (s < e) {
          let x1 = 0,
            y1 = 0,
            x2 = 0,
            y2 = 0,
            left = e - s;
          if (s < c.width) {
            const d1 = Math.min(left, c.width - s);
            x1 = s;
            y1 = 0;
            x2 = s + d1;
            y2 = 0;
            drawEdge(x1, y1, x2, y2);
            s += d1;
            continue;
          }
          if (s < c.width + c.height) {
            const k = s - c.width;
            const d1 = Math.min(left, c.height - k);
            x1 = c.width;
            y1 = k;
            x2 = c.width;
            y2 = k + d1;
            drawEdge(x1, y1, x2, y2);
            s += d1;
            continue;
          }
          if (s < c.width * 2 + c.height) {
            const k = s - (c.width + c.height);
            const d1 = Math.min(left, c.width - k);
            x1 = c.width - k;
            y1 = c.height;
            x2 = c.width - (k + d1);
            y2 = c.height;
            drawEdge(x1, y1, x2, y2);
            s += d1;
            continue;
          }
          {
            const k = s - (c.width * 2 + c.height);
            const d1 = Math.min(left, c.height - k);
            x1 = 0;
            y1 = c.height - k;
            x2 = 0;
            y2 = c.height - (k + d1);
            drawEdge(x1, y1, x2, y2);
            s += d1;
            continue;
          }
        }
      }
    }
    ctx.fillStyle = darkMode ? "#000" : "#fff";
    ctx.font = "700 100px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text.toUpperCase(), c.width / 2, c.height / 2 + 10);
    texRef.current!.needsUpdate = true;
  };

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.position.y = TITLE_ALT + Math.sin(t * 0.35) * 0.12;
    if (rgbActive) {
      phaseRef.current += 0.01;
      draw(phaseRef.current);
    }
    if (spinning.current) {
      const now = performance.now();
      const u = Math.min((now - spinStart.current) / spinDuration.current, 1);
      const eased = 1 - Math.pow(1 - u, 3);
      groupRef.current.rotation.y = baseRotation.current + eased * (Math.PI * 2);
      if (u >= 1) {
        spinning.current = false;
        groupRef.current.rotation.y = baseRotation.current + Math.PI * 2;
      }
    }
  });
  useEffect(() => {
    draw(phaseRef.current);
  }, [text, rgbActive, darkMode]);
  return (
    <group ref={groupRef} position={[0, TITLE_ALT, 0]}>
      <mesh>
        <boxGeometry args={[12, 4.5, 0.7]} />
        <meshBasicMaterial map={makePlankTexture()} />
      </mesh>
      <mesh position={[0, 0, 0.36]}>
        <planeGeometry args={[11.8, 4.3]} />
        <meshBasicMaterial key={darkMode ? "dark" : "light"} map={texRef.current!} />
      </mesh>
      <mesh position={[0, 0, -0.36]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[11.8, 4.3]} />
        <meshBasicMaterial key={darkMode ? "dark" : "light"} map={texRef.current!} />
      </mesh>
    </group>
  );
}

/* ---------- Grounded whiteboards ---------- */
function GroundedWhiteboards({
  setActiveBoard,
  darkMode,
  setPrompt,
}: {
  setActiveBoard: (id: string) => void;
  darkMode: boolean;
  setPrompt: (s: string | null) => void;
}) {
  const defs = [
    { id: "board1", x: -10, z: 0, label: "Projects" },
    { id: "board2", x: 10, z: 0, label: "Experience" },
    { id: "board3", x: 0, z: -10, label: "Skills" },
    { id: "board4", x: 0, z: 10, label: "About" },
  ];
  const plank = useMemo(() => makePlankTexture(), []);
  const labels = useMemo(
    () => Object.fromEntries(defs.map((d) => [d.id, makeBoardLabelTextureDirt(d.label, darkMode)])),
    [darkMode]
  );
  return (
    <group>
      {defs.map((d) => (
        <group key={d.id} position={[d.x, BOARD_ALT, d.z]}>
          <BoardStand />
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[4.6, 2.8, 0.3]} />
            <meshBasicMaterial map={plank} />
          </mesh>
          <mesh position={[0, 0, 0.16]}>
            <planeGeometry args={[4.4, 2.6]} />
            <meshBasicMaterial map={labels[d.id]} />
          </mesh>
          <mesh position={[0, 0, -0.16]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[4.4, 2.6]} />
            <meshBasicMaterial map={labels[d.id]} />
          </mesh>
          <InteractAtPoint
            target={new THREE.Vector3(d.x, BOARD_ALT, d.z + 1)}
            enabled={true}
            keyName="e"
            range={2.2}
            label={`Press E to open "${d.label}"`}
            onTrigger={() => setActiveBoard(d.id)}
            setPrompt={setPrompt}
          />
        </group>
      ))}
    </group>
  );
}
function BoardStand() {
  return (
    <group>
      <mesh position={[-1.8, -1.6, 0]}>
        <boxGeometry args={[0.18, 1.2, 0.18]} />
        <meshBasicMaterial color="#4d341d" />
      </mesh>
      <mesh position={[1.8, -1.6, 0]}>
        <boxGeometry args={[0.18, 1.2, 0.18]} />
        <meshBasicMaterial color="#4d341d" />
      </mesh>
      <mesh position={[0, -2.2, 0]}>
        <boxGeometry args={[4.6, 0.2, 0.4]} />
        <meshBasicMaterial color="#4d341d" />
      </mesh>
    </group>
  );
}

/* ---------- Textures ---------- */
function makeFloorWoodTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#a07443";
  ctx.fillRect(0, 0, c.width, c.height);
  const rows = 14;
  for (let r = 0; r < rows; r++) {
    const y = (r * c.height) / rows;
    ctx.fillStyle = r % 2 ? "#8a6236" : "#b8834f";
    ctx.fillRect(0, y, c.width, c.height / rows - 2);
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo(0, y + ((k + 1) * (c.height / rows)) / 6);
      ctx.lineTo(c.width, y + ((k + 1) * (c.height / rows)) / 6);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 2.5);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function makeVoxelGroundTexture(dark = false) {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const base = dark ? "#204d2c" : "#4caf50";
  const speckMin = dark ? "rgba(5,30,15," : "rgba(20,100,40,";
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1200; i++) {
    ctx.fillStyle = `${speckMin}${0.6 + Math.random() * 0.4})`;
    ctx.fillRect(
      Math.random() * size,
      Math.random() * size,
      1 + Math.random() * 2,
      1 + Math.random() * 2
    );
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(40, 40);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function makePlankTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#a07443";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 12; i++) {
    const y = i * (512 / 12);
    ctx.fillStyle = i % 2 ? "#8a6236" : "#b8834f";
    ctx.fillRect(0, y, 512, 512 / 12);
  }
  ctx.strokeStyle = "#5c3b22";
  ctx.lineWidth = 8;
  for (let i = 0; i <= 8; i++) {
    const x = i * (512 / 8);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function makeBrickTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#b4553d";
  ctx.fillRect(0, 0, 512, 512);
  const rows = 12;
  const cols = 16;
  ctx.fillStyle = "#8c3f2c";
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const off = (r % 2) * 16;
      ctx.fillRect(col * 32 + off, r * 32, 26, 26);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function makeBoardLabelTextureDirt(text: string, dark: boolean) {
  const w = 1024;
  const h = 600;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const base = dark ? "#3b2a1d" : "#7b4f28";
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 900; i++) {
    const a = Math.random();
    ctx.fillStyle = dark
      ? `rgba(255,255,255,${a * 0.05})`
      : `rgba(0,0,0,${a * 0.07})`;
    const x = Math.random() * w;
    const y = Math.random() * h;
    const s = 2 + Math.random() * 8;
    ctx.fillRect(x, y, s, s);
  }

  const grass1 = dark ? "#1f3d1f" : "#2e7d32";
  const grass2 = dark ? "#2a5a2a" : "#4caf50";
  const gh = Math.floor(h * 0.18);
  const grad = ctx.createLinearGradient(0, 0, 0, gh);
  grad.addColorStop(0, grass2);
  grad.addColorStop(1, grass1);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, gh);

  ctx.lineWidth = 28;
  ctx.strokeStyle = dark ? "#0f172a" : "#3a2a16";
  ctx.strokeRect(14, 14, w - 28, h - 28);

  ctx.fillStyle = dark ? "#e5e7eb" : "#111827";
  let size = 92;
  ctx.font = `900 ${size}px 'Press Start 2P', monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  while (size > 36 && ctx.measureText(text.toUpperCase()).width > w - 200) {
    size -= 4;
    ctx.font = `900 ${size}px 'Press Start 2P', monospace`;
  }
  ctx.fillText(text.toUpperCase(), w / 2, h / 2 + 6);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}
