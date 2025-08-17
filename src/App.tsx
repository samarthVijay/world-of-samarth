import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// ===== Theming + Layout =====
const CLOUD_ALT = 12;   // clouds stay above everything
const TITLE_ALT = 10;   // floating sign below clouds, in front of spawn
const BOARD_ALT = 2.8;  // grounded boards' center height
const ARENA_HALF = 26;   // half-width of playable area (for clamping + walls)
// Resolves to "/world-of-samarth/<path>" in production, "/" in dev
// --- movement tolerances (prevents edge fall-through) ---
const EDGE_PAD = 0.12;         // how much to "inflate" walk AABBs in X/Z
const PROBE_FACTOR = 0.55;     // enlarges the feet probe (radius * factor)
const GROUND_SNAP = 0.25;      // snap-to-ground if this close while falling
const MAX_STEP = 0.45;         // optional: allow tiny step-down without falling
const MAX_UP_SNAP = 0.5;      // never snap UP to a surface >50cm above your feet (unless ladder grace)
const ROOF_GRACE_MS = 1200;   // how long after ladder toggle you’re allowed to snap onto the roof
const asset = (p: string) => `${import.meta.env.BASE_URL}${p.replace(/^\/+/, '')}`;

// --- Simple collision system (AABBs) ---
type AABB = { min: [number, number, number]; max: [number, number, number] };

// Solids you cannot pass through (trunks, walls, box sides, arena walls)
let GLOBAL_BLOCKERS: AABB[] = [];
function setBlockers(aabbs: AABB[]) { GLOBAL_BLOCKERS = aabbs; }

// Flat tops you can stand on (box/roof tops only)
let GLOBAL_WALK_SURFACES: AABB[] = []; //idk
function setWalkSurfaces(aabbs: AABB[]) { GLOBAL_WALK_SURFACES = aabbs; }

// Ladders (unchanged)
let GLOBAL_CLIMB_VOLUMES: AABB[] = [];
function setClimbVolumes(vols: AABB[]) { GLOBAL_CLIMB_VOLUMES = vols; }

// Parkour layout shared by renderer + colliders
function getParkourDefs(){
  const defs: {x:number; z:number; w:number; d:number; h:number}[] = [];
  const w = 1.6, d = 1.6; // box footprint
  const R = 14;           // circle radius — outside the 4 boards ring
  const steps = 18;       // boxes aroundx
  const angleStep = w / R; // arc length ~ box width => edge-to-edge
  let h = 0.8;            // starting height
  for(let i=0;i<steps;i++){
    const a = i * angleStep;
    defs.push({ x: Math.cos(a)*R, z: Math.sin(a)*R, w, d, h });
    h += 0.35; // rise per step
  }
  return defs;
}

function getTopButtonPos(){
  const defs = getParkourDefs();
  const top = defs[defs.length-1];
  return new THREE.Vector3(top.x, top.h + 0.25, top.z);
}

// ---------------- Resume-driven board content ----------------
const WHITEBOARD_CONFIG = [
  {
    id: "board1",
    title: "Projects",
    sections: [
      {
        title: "Jetbot Autonomous Vehicle",
        url: "https://github.com/samarthVijay/Jetbot-Autonomous-Parking-and-Self-Driving",
        body:
          "<p><b>Why I built it:</b> I wanted a tiny car that could make decisions on its own without phoning home. Edge compute or bust.</p>\
           <p><b>Perception:</b> Collected hallway/outdoor footage with a CSI camera and built a training set (class balance + augmentations: random crop/flip/brightness). Trained CNNs in PyTorch/TensorFlow; exported to ONNX and optimized with TensorRT/torch2trt on a <b>Jetson Nano</b>. Post‑opt inference runs in the low‑tens of ms on 320×240 frames, which leaves enough CPU for control.</p>\
           <p><b>Control loop:</b> Capture → normalize → model → parse detections → <i>steering policy</i> (simple proportional navigation + collision gating). PWM motor driver for throttle/steer; soft‑start and clamped acceleration to keep the chassis stable. Implemented a parking routine that looks for a rectangular free‑space window and centers the robot between edges before braking.</p>\
           <p><b>Reliability:</b> watchdog resets on camera drops, bounded queues to avoid latency creep, and telemetry prints over UART for quick serial debugging.</p>"
      },
      {
        title: "Embedded LIDAR Project (Object Modeling)",
        url: "https://github.com/samarthVijay/Embedded-LIDAR-Project",
        body:
          "<p><b>Goal:</b> a low‑cost, from‑scratch 3D scanner to understand room geometry.</p>\
           <p><b>Hardware:</b> TI <b>MSP‑EXP432E401Y</b> MCU in C; Time‑of‑Flight sensor over <b>I²C</b> mounted on a small rotating arm (DC motor with gear reduction). Angle is tracked from a simple encoder; distance samples streamed over <b>UART</b>.</p>\
           <p><b>Pipeline:</b> MCU emits [angle, distance] at fixed intervals → Python/MATLAB consumes serial, converts polar → Cartesian, stitches revolutions into a 3D point cloud. Added debouncing + median filtering and a quick calibration pass to account for sensor offset.</p>\
           <p><b>Result:</b> live 3D visualization with basic surface coloring by range — surprisingly usable for mapping corners, tables, and walkways.</p>"
      },
      {
        title: "C++ Snake (Terminal UI, 2‑Player)",
        url: "https://github.com/samarthVijay/Snake-Game-Cpp",
        body:
          "<p><b>Design:</b> classic snake, but written as an <b>OOD</b> C++ project with clean separation — <code>Game</code>, <code>Board</code>, <code>Snake</code>, <code>Renderer</code>, <code>Input</code>. Terminal graphics (ANSI/ncurses‑style) render a pixel‑art feel right in the console.</p>\
           <p><b>Data structures:</b> the snake body uses a linked list / deque so head‑insert + tail‑pop are O(1). Food cells tracked with a hash set for O(1) collision checks; a queue drives event batching for smooth input.</p>\
           <p><b>Algorithms:</b> constant‑time collision checks, modular wrap/clip logic, and a fixed‑timestep loop using <code>std::chrono</code>. Two‑player mode runs independent snakes with deterministic updates so both stay in sync at the same tick rate.</p>\
           <p><b>Memory:</b> careful stack/heap usage, RAII for resource safety, and zero needless copies on hot paths. The point was to learn DS&A by building something I’d actually play.</p>"
      },
      {
        title: "Minecraft‑inspired Web World (this site)",
        body:
          "<p>I grew up playing Minecraft — this site is my little nod to that era. It’s built with <b>React + @react-three/fiber</b> and a bunch of hand‑rolled canvas textures. The world has pointer‑lock movement, jump physics, thick wooden banner signs, houses with gable roofs, and a scrollable modal that renders résumé content.</p>\
           <p>Under the hood: custom textures (planks/bricks/grass), simple voxel vibe, keyboard controls, and a thin state layer so opening a board unlocks the cursor and snaps back into pointer‑lock when you exit.</p>"
      }
    ],
    images: [
      asset('images/imagejetbot1.jpeg'),
      asset('images/imagejetbot3.gif'),
      asset('images/imagejetbot2.jpeg'),
      asset('images/imagelidar1.jpeg'),
      asset('images/imagesnake1.jpg'),
    ],
    image: "https://via.placeholder.com/400x300/4ade80/ffffff?text=Projects",
  },
  {
    id: "board2",
    title: "Experience",
    sections: [
      {
        title: "MAD Elevators — IoT/Embedded Developer",
        body:
          "<p>Shipped an escalator‑monitoring device that flags faults and ships logs to the cloud.</p>\
           <ul>\
             <li>Linux gateways in <b>Go/Python</b> talking to diagnostics over <b>UART/RS-485</b> and sensors on <b>I²C</b>.</li>\
             <li><b>Zero‑Touch Provisioning</b> using PowerShell/Plink/Bash — fresh devices enroll themselves, fetch certs/config, and come online with no keyboard time.</li>\
             <li>Integrated <b>MosaicONE</b> REST: telemetry uplink, remote logs, and firmware operations with proper back‑off and retry.</li>\
             <li>Pinned dependencies in containers and added safety interlocks so comms faults never stall escalator operation.</li>\
           </ul>"
      },
      {
        title: "Maple Leaf Foods — Automation Analyst",
        body:
          "<p>Focus: make internal workflows faster and more visible.</p>\
           <ul>\
             <li>Built Power Platform apps (with GenAI copilots) used across teams — estimated <b>~$700k</b> in annualized savings from time reclaimed.</li>\
             <li>Department‑wide bot that hits ITSM <b>REST</b> endpoints; configs via JSON; feedback loop to keep triage quality high.</li>\
             <li>Automated license provisioning with <b>Microsoft Graph</b> and PowerShell; added guardrails + audit trails.</li>\
             <li><b>Power BI</b> dashboards backed by SQL Server to surface usage, aging tickets, and process hotspots.</li>\
           </ul>"
      }
    ],
    images: [
      "https://via.placeholder.com/360x540/60a5fa/ffffff?text=Exp+1",
      "https://via.placeholder.com/360x540/3b82f6/ffffff?text=Exp+2",
      "https://via.placeholder.com/360x540/2563eb/ffffff?text=Exp+3"
    ],
    image: "https://via.placeholder.com/400x300/60a5fa/ffffff?text=Experience",
  },
  {
    id: "board3",
    title: "Skills",
    sections: [
      { title: "Embedded & Systems", body: "<ul><li>Jetson Nano, UART/RS‑485, I²C, SPI; Linux, Docker, Git, VS Code/CLion.</li><li>Debugging with logic analyzer/serial consoles; writing lean C/C++ for MCUs.</li></ul>" },
      { title: "ML & Computer Vision", body: "<ul><li>PyTorch, TensorFlow, TensorRT/torch2trt, ONNX; OpenCV + NumPy.</li><li>Data curation, augmentation, latency budgeting, and small‑model deployment at the edge.</li></ul>" },
      { title: "Cloud & Microsoft", body: "<ul><li>REST APIs, Microsoft Graph, Power Platform (Power Apps/Automate), SharePoint, Power BI.</li><li>SQL Server modeling and report tuning.</li></ul>" },
      { title: "Web", body: "<ul><li>React, TypeScript/JavaScript, Tailwind, shadcn/ui.</li></ul>" }
    ],
    images: [
      "https://via.placeholder.com/360x540/fbbf24/ffffff?text=Skill+1",
      "https://via.placeholder.com/360x540/f59e0b/ffffff?text=Skill+2",
      "https://via.placeholder.com/360x540/d97706/ffffff?text=Skill+3"
    ],
    image: "https://via.placeholder.com/400x300/fbbf24/ffffff?text=Skills",
  },
  {
    id: "board4",
    title: "About + Contact",
    sections: [
      { title: "About me", body: "<p>I’m Samarth — a Computer Engineering student at McMaster who likes building practical things that move bits <i>and</i> atoms. I gravitate to embedded ML and real‑time systems where constraints make the problem interesting.</p>" },
      { title: "How I work", body: "<ul><li>Bias for working prototypes early; iterate with measurements.</li><li>Prefer readable, testable code over clever one‑liners.</li><li>Automate the boring parts (scripts, dashboards, bots) so people can focus on the work that matters.</li></ul>" },
      { title: "Contact", body: "<p><a href=\"mailto:samarthvijay714@gmail.com\" target=\"_blank\" rel=\"noopener noreferrer\">Email</a> · <a href=\"https://www.linkedin.com/in/samarth-vijay714/\" target=\"_blank\" rel=\"noopener noreferrer\">LinkedIn</a> · <a href=\"https://github.com/samarthVijay\" target=\"_blank\" rel=\"noopener noreferrer\">GitHub</a></p>" }
    ],
    images: [
      asset('images/imageme1.jpeg'),
      asset('images/imageme2.jpeg'),
      asset('images/imageme3.jpeg'),
    ],
    image: "https://via.placeholder.com/400x300/f87171/ffffff?text=Contact",
  },
];
function BackgroundMusic({ src = "audio/bg.mp3", maxVolume = 0.4 }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}${src.replace(/^\/+/, "")}`;
    const audio = new Audio(url);
    audio.loop = true;
    audio.preload = "auto";
    (audio as any).playsInline = true;
    audio.volume = 0;
    audioRef.current = audio;

    const start = async () => {
      if (startedRef.current || !audioRef.current) return;
      try {
        await audioRef.current.play();
        startedRef.current = true;
        let v = 0;
        const id = window.setInterval(() => {
          v += 0.05;
          audioRef.current!.volume = Math.min(maxVolume, v);
          if (audioRef.current!.volume >= maxVolume) window.clearInterval(id);
        }, 100);
      } catch {
        startedRef.current = false;
      }
      if (!audioRef.current!.paused) {
        window.removeEventListener("click", start, true);
      }
    };

    window.addEventListener("click", start, true);

    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m" && audioRef.current) {
        audioRef.current.muted = !audioRef.current.muted;
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("click", start, true);
      window.removeEventListener("keydown", onKey);
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.src = "";
      audioRef.current = null;
    };
  }, [src, maxVolume]);

  return null;
}

export default function App() {
  const [activeBoard, setActiveBoard] = useState<string | null>(null);
  const [rgbBorder, setRgbBorder] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const topBtnPos = useMemo(()=>getTopButtonPos(),[]);

  useEffect(() => {
    const anyModal = !!activeBoard;
    if (anyModal && document.pointerLockElement) document.exitPointerLock();
    document.body.style.cursor = anyModal ? "auto" : "none";
    return () => { if (!anyModal) document.body.style.cursor = "none"; };
  }, [activeBoard]);

  // Global toggle event for the RGB border animation
  useEffect(()=>{
    const onToggle = () => setRgbBorder(v=>!v);
    window.addEventListener('toggle-rgb-border', onToggle as any);
    return () => window.removeEventListener('toggle-rgb-border', onToggle as any);
  },[]);
  // Global toggle for dark mode
  useEffect(() => {
    const onToggle = () => setDarkMode(v => !v);
    window.addEventListener('toggle-dark-mode', onToggle as any);
    return () => window.removeEventListener('toggle-dark-mode', onToggle as any);
}, []);
  const closeAndRelock = () => {
    setActiveBoard(null);
    setTimeout(() => window.dispatchEvent(new CustomEvent("relock-pointer")), 0);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      {/* Sky gradient */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "linear-gradient(#7ec8ff 0%, #9ed2ff 40%, #bfe0ff 60%, #e8f5ff 100%)" }} />

      {!activeBoard && (
        <div style={{ position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.5)", color: "#fff", padding: "8px 12px", borderRadius: 10, zIndex: 10, fontSize: 14 }}>
          Click to lock the mouse · WASD move · Space jump · F to toggle ladder climb · Press <b>E</b> near the golden button · ESC to close · Click M to mute/unmute
        </div>
      )}
      <BackgroundMusic src="audio/bg.mp3" maxVolume={0.6} />
      <Canvas camera={{ fov: 70, position: [0, 1.6, 6] }} onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[8, 20, 10]} intensity={1} />

        <World />
        <GroundedWhiteboards setActiveBoard={setActiveBoard} isDark={darkMode} />
        <ThickSkySign text="WELCOME TO MY WORLD" rgbActive={rgbBorder} isDark={darkMode} />

        <MouseLookControls enabled={!activeBoard} initialYaw={0} initialPitch={-0.1} />
        <MovementControls enabled={!activeBoard} speed={3.5} />
        <Crosshair enabled={!activeBoard} />
        <InteractionManager
          target={topBtnPos}
          enabled={!activeBoard}
          onInteract={()=>{ 
            window.dispatchEvent(new CustomEvent('toggle-rgb-border')); 
            window.dispatchEvent(new CustomEvent('spin-banner'));
            window.dispatchEvent(new CustomEvent('toggle-dark-mode'));
          }}
        />
      </Canvas>

      {activeBoard && (
        <WhiteboardModal config={WHITEBOARD_CONFIG.find((b) => b.id === activeBoard)!} onClose={closeAndRelock} isDark={darkMode} />
      )}
    </div>
  );
}

/* ---------- Pure proximity + keybind (E) — no DOM inside <Canvas> ---------- */
function InteractionManager({ target, enabled, onInteract, range = 2.0 }:{ target: THREE.Vector3; enabled: boolean; onInteract: ()=>void; range?: number; }){
  const { camera } = useThree();
  const inRangeRef = useRef(false);

  useEffect(()=>{
    function onKey(e: KeyboardEvent){
      if(!enabled) return;
      if(!inRangeRef.current) return;
      if(e.key === 'e' || e.key === 'E'){ onInteract(); }
    }
    window.addEventListener('keydown', onKey);
    return ()=>window.removeEventListener('keydown', onKey);
  }, [enabled, onInteract]);

  useFrame(()=>{
    if(!enabled){ inRangeRef.current = false; return; }
    const d = camera.position.distanceTo(target);
    inRangeRef.current = d < range;
  });

  return null;
}

/* ---------- Whiteboard Modal (Minecraft-themed, scrollable + ESC) ---------- */
function WhiteboardModal({
  config,
  onClose,
  isDark,
}: {
  config: (typeof WHITEBOARD_CONFIG)[0];
  onClose: () => void;
  isDark: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key.toLowerCase() === "q") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // pixel frame + tile (kept as-is for the Minecraft vibe)
  const pixelBorder = (thick = 6) => ({
    boxShadow: `0 0 0 ${thick}px #111827, 0 0 0 ${thick * 2}px #6b7280, 0 0 0 ${thick * 3}px #111827` as string,
  });
  const pixelTile = {
    backgroundImage:
      "repeating-linear-gradient(45deg, #9b6b43 0 16px, #8d5e37 16px 32px, #a7744d 32px 48px)",
    imageRendering: "pixelated" as const,
  };
  const grassStrip = {
    background: "linear-gradient(#16a34a, #16a34a)",
    height: 24,
    width: "100%",
    borderBottom: "6px solid #14532d",
  } as const;

  // 🎨 theme helpers (used throughout)
  const paper = isDark ? "#0b1220" : "#ffffff";   // main reading surface
  const ink = isDark ? "#e5e7eb" : "#111827";     // text color
  const frame = isDark ? "#0b1220" : "#0f172a";   // borders/frames
  const panel = isDark ? "#131a2a" : "#fefefe";   // lighter panel/heading

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 30,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "2rem",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "92vw",
          height: "92vh",
          background: isDark ? "#0f172a" : "#d6c2a5", // container backdrop tint
          borderRadius: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          ...pixelBorder(6),
          ...pixelTile,
        }}
      >
        <div style={grassStrip} />

        {/* EXIT button unchanged for now */}
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
          {/* LEFT: title + scrollable content */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            {/* Title bar */}
            <div
              style={{
                background: panel,
                padding: "0.75rem 1rem",
                border: `4px solid ${frame}`,
                fontFamily: "monospace",
                fontWeight: 900,
                fontSize: "1.8rem",
                letterSpacing: 1,
                color: isDark ? "#e5e7eb" : "#0f172a",
                ...pixelBorder(2),
              }}
            >
              {config.title.toUpperCase()}
            </div>

            {/* Content panel */}
            <div
              style={{
                marginTop: "1rem",
                background: paper,
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
              {Array.isArray((config as any).sections) ? (
                (config as any).sections.map((sec: any, i: number) => (
                  <div key={i} style={{ marginBottom: "1.1rem" }}>
                    <div
                      style={{
                        fontSize: "1.35rem",
                        fontWeight: 900,
                        marginBottom: 6,
                        color: ink,
                      }}
                    >
                      {sec.url ? (
                        <a
                          href={sec.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: isDark ? "#93c5fd" : "#0f172a",
                            textDecoration: "underline",
                          }}
                        >
                          {sec.title}
                        </a>
                      ) : (
                        sec.title
                      )}
                    </div>

                    <div
                      style={{ fontSize: "1.05rem", color: ink }}
                      dangerouslySetInnerHTML={{ __html: sec.body }}
                    />
                  </div>
                ))
              ) : (
                <div style={{ fontSize: "1.05rem", color: ink }}>
                  No content yet. Add <code>sections</code> to this board to
                  populate it.
                </div>
              )}

              <div style={{ height: 24 }} />
              <p style={{ color: ink }}>
                Tip: Press <b>ESC</b> or <b>Q</b> to close. Everything here
                scrolls.
              </p>
            </div>
          </div>

          {/* RIGHT: image column */}
          <div
            style={{
              width: 420,
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 12,
              minWidth: 0,
              overflow: "auto",
            }}
          >
            {(
              (config as any).images ??
              ((config as any).image ? [(config as any).image] : [])
            ).map((src: string, idx: number) => (
              <div
                key={idx}
                style={{
                  width: "100%",
                  border: `4px solid ${frame}`,
                  background: paper,
                  boxShadow:
                    "0 0 0 6px #111827, 0 0 0 12px #6b7280, 0 0 0 18px #111827",
                }}
              >
                <img
                  src={src}
                  alt={`${config.title} ${idx + 1}`}
                  style={{
                    width: "100%",
                    height: 360,
                    objectFit: "cover",
                    imageRendering: "pixelated",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
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

/* ---------- Pointer‑lock mouse look ---------- */
function MouseLookControls({ enabled, initialYaw = 0, initialPitch = -0.1 }: { enabled: boolean; initialYaw?: number; initialPitch?: number; }) {
  const { camera, gl } = useThree();
  const yaw = useRef(initialYaw); const pitch = useRef(initialPitch); const locked = useRef(false);
  useEffect(() => {
    const canvas = gl.domElement;
    const relock = () => { if (enabled && document.pointerLockElement !== canvas) canvas.requestPointerLock(); };
    const onRelockEvent = () => relock();
    function onClick() { if (enabled && document.pointerLockElement !== canvas) canvas.requestPointerLock(); }
    function onLockChange() { locked.current = document.pointerLockElement === canvas; }
    function onMouseMove(e: MouseEvent) { if (!locked.current || !enabled) return; const s = 0.0025; yaw.current -= e.movementX * s; pitch.current -= e.movementY * s; const max = Math.PI/2 - 0.05; pitch.current = Math.max(-max, Math.min(max, pitch.current)); }
    canvas.addEventListener("click", onClick); document.addEventListener("pointerlockchange", onLockChange); window.addEventListener("mousemove", onMouseMove); window.addEventListener("relock-pointer", onRelockEvent as any);
    return () => { canvas.removeEventListener("click", onClick); document.removeEventListener("pointerlockchange", onLockChange); window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("relock-pointer", onRelockEvent as any); };
  }, [enabled, gl]);
  useFrame(() => { const q = new THREE.Quaternion(); q.setFromEuler(new THREE.Euler(pitch.current, yaw.current, 0, "YXZ")); camera.quaternion.copy(q); });
  return null;
}

/* ---------- Movement (WASD + JUMP + Ladder toggle F + Sprint) ---------- */
function MovementControls({
  enabled,
  speed = 3.5,
  sprint = 1.9, // hold Shift to sprint
}: { enabled: boolean; speed?: number; sprint?: number }) {
  const { camera } = useThree();
  const keys = useRef<{ [k: string]: boolean }>({});
  const velocity = useRef(new THREE.Vector3());
  const vY = useRef(0);
  const last = useRef(performance.now());

  const baseEye = 1.6;   // camera eye above “feet”
  const gravity = 20;
  const jumpSpeed = 7.5;
  const climbSpeed = 3.0;
  const radius = 0.4;    // player radius

  const climbing = useRef(false);
  const climbVolRef = useRef<AABB | null>(null);

  // Keys + ladder toggle (F)
  const lastLadderToggle = useRef(0); 
  useEffect(() => {
    function down(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      keys.current[k] = true;
      keys.current[e.code] = true;

      if (k === "f" && climbVolRef.current) {
        // toggle climbing if inside ladder volume
        climbing.current = !climbing.current;
        lastLadderToggle.current = performance.now();
        const a = climbVolRef.current;
        const cx = (a.min[0] + a.max[0]) / 2;
        const cz = (a.min[2] + a.max[2]) / 2;
        camera.position.x = cx;
        camera.position.z = cz;
      }
    }
    function up(e: KeyboardEvent) {
      keys.current[e.key.toLowerCase()] = false;
      keys.current[e.code] = false;
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [camera]);

  const isDown = (name: string) =>
    !!(keys.current[name] || keys.current[name.toLowerCase()]);

  // Horizontal collision against BLOCKERS using the player's current feet..head span
  function collidesXYAt(x: number, z: number) {
    const yMin = (camera.position.y - baseEye) + 0.02; // feet
    const yMax = camera.position.y - 0.02;             // head
    for (const a of GLOBAL_BLOCKERS) {
      if (
        x >= a.min[0] - radius && x <= a.max[0] + radius &&
        z >= a.min[2] - radius && z <= a.max[2] + radius
      ) {
        if (yMax > a.min[1] + 1e-3 && yMin < a.max[1] - 1e-3) {
          return true; // vertical spans overlap -> blocked
        }
      }
    }
    return false;
  }
  function groundAtLimited(
    x: number,
    z: number,
    footY: number,
    allowHighSnap: boolean
  ) {
    const walkList = GLOBAL_WALK_SURFACES;
    const probe = Math.max(0, radius * PROBE_FACTOR);
    let best = 0;
  
    for (const a of walkList) {
      const minX = a.min[0] - EDGE_PAD - probe;
      const maxX = a.max[0] + EDGE_PAD + probe;
      const minZ = a.min[2] - EDGE_PAD - probe;
      const maxZ = a.max[2] + EDGE_PAD + probe;
      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
        const top = a.max[1];
        // Only consider tops not far ABOVE current feet unless grace is active
        if (allowHighSnap || top <= footY + MAX_UP_SNAP) {
          best = Math.max(best, top);
        }
      }
    }
    return best;
  }
  
  // Ground probe ONLY from WALKABLES (thin, slightly inset caps for tops/roofs)

  function inClimbVol(x: number, z: number): AABB | null {
    for (const a of GLOBAL_CLIMB_VOLUMES) {
      if (x >= a.min[0] && x <= a.max[0] && z >= a.min[2] && z <= a.max[2]) return a;
    }
    return null;
  }

  useFrame(() => {
    const now = performance.now();
    const dt = (now - last.current) / 1000;
    last.current = now;
    if (!enabled) return;

    // Desired horizontal move (+ sprint)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const sprintMul = (isDown("ShiftLeft") || isDown("ShiftRight") || isDown("shift")) ? sprint : 1;

    let wish = new THREE.Vector3();
    if (isDown("w")) wish.add(forward);
    if (isDown("s")) wish.sub(forward);
    if (isDown("a")) wish.sub(right);
    if (isDown("d")) wish.add(right);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed * sprintMul);

    // Smooth accel
    velocity.current.lerp(wish, 0.18);

    // Try XY move with per-axis resolution
    const next = camera.position.clone().addScaledVector(velocity.current, dt);
    let nx = camera.position.x, nz = camera.position.z;

    if (!collidesXYAt(next.x, next.z)) {
      nx = next.x; nz = next.z;
    } else {
      if (!collidesXYAt(next.x, camera.position.z)) nx = next.x;
      if (!collidesXYAt(camera.position.x, next.z)) nz = next.z;
    }
    camera.position.x = nx;
    camera.position.z = nz;

    // Ladder state
    const hereClimb = inClimbVol(camera.position.x, camera.position.z);
    climbVolRef.current = hereClimb;
    if (!hereClimb) climbing.current = false;

    // Vertical motion
    if (climbing.current && hereClimb) {
      let y = camera.position.y;
      if (isDown("w")) y += climbSpeed * dt;
      if (isDown("s")) y -= climbSpeed * dt;
      const minY = hereClimb.min[1] + baseEye;
      const maxY = hereClimb.max[1] + baseEye + 0.2;
      camera.position.y = Math.max(minY, Math.min(maxY, y));
      vY.current = 0;
    } else {
      const now = performance.now();
      const allowHighSnap = (now - lastLadderToggle.current) < ROOF_GRACE_MS;

      // Compute ground under current X/Z with limited upward snap
      const footY = camera.position.y - baseEye;
      const gY = groundAtLimited(camera.position.x, camera.position.z, footY, allowHighSnap);
      const minY = gY + baseEye;
    
      // gravity
      vY.current -= gravity * dt;
      camera.position.y += vY.current * dt;
    
      // --- sticky landing / edge-proof snap ---
      if (vY.current <= 0) { // only when descending or resting
        const dist = camera.position.y - minY;
    
        // Snap cleanly if we're close enough to the top surface
        if (dist <= GROUND_SNAP) {
          camera.position.y = minY;
          vY.current = 0;
        } else {
          // Optional small step-down allowance (prevents "hovering" at ledge)
          if (dist > 0 && dist < MAX_STEP) {
            camera.position.y = minY;
            vY.current = 0;
          }
        }
      }
    
      // grounded check AFTER potential snap
      const onGround = Math.abs(camera.position.y - minY) < 0.005 || camera.position.y < minY;
      if (onGround) {
        camera.position.y = minY;
        vY.current = 0;
      }
    
      // jump (Space) — only if grounded
      if ((isDown(" ") || isDown("Space")) && onGround) {
        vY.current = jumpSpeed * (sprintMul > 1 ? 1.05 : 1);
      }
    }
    

    // Clamp inside arena
    const H = ARENA_HALF;
    camera.position.x = Math.max(-H, Math.min(H, camera.position.x));
    camera.position.z = Math.max(-H, Math.min(H, camera.position.z));
  });

  return null;
}


/* ---------- World ---------- */
function World() {
  const groundTex = useMemo(() => makeVoxelGroundTexture(), []);
  useEffect(() => {
    const blockers: AABB[] = [];
    const walk: AABB[] = [];
    const climb: AABB[] = [];
   
    // --- Trees (blockers only) ---
    const fixedTrees: [number, number][] = [[-3,-6],[6,-3],[-6,5],[4,-8]];
    const ringR = 20; const ringN = 18;
    const ringTrees: [number, number][] = Array.from({length: ringN}, (_,i)=>[
      Math.cos((i/ringN)*Math.PI*2)*ringR,
      Math.sin((i/ringN)*Math.PI*2)*ringR
    ]);
    const allTrees = [...fixedTrees, ...ringTrees];
    allTrees.forEach(([x,z])=>{
      const w=0.6, d=0.6, h=2.0;
      blockers.push({ min:[x-w/2, 0, z-d/2], max:[x+w/2, h, z+d/2] });
    });
  
    // --- Houses: walls = blockers, roof slab = walkable ---
    const houses: [number,number][] = [[-16,-12],[16,-10],[-14,14],[14,14]];
    const baseW=8, baseH=4.4, baseD=8;
    const roofT = 0.4, over=0.6;
  
    houses.forEach(([x,z])=>{
      // Base brick box blocks movement
      blockers.push({ min:[x-baseW/2, 0, z-baseD/2], max:[x+baseW/2, baseH, z+baseD/2] });
  
      // Flat roof: add a thin walkable top slightly inset to avoid side-grab
      const inset = 0.1;
      const topMin:[number,number,number] = [
        x-(baseW+over)/2 + inset, baseH, z-(baseD+over)/2 + inset
      ];
      const topMax:[number,number,number] = [
        x+(baseW+over)/2 - inset, baseH + 0.12, z+(baseD+over)/2 - inset
      ];
      walk.push({ min: topMin, max: topMax });
  
      // Ladder climb volume (same as you had)
      const lw = 0.8, ld = 0.5, lh = baseH + roofT;
      const lx = x + baseW*0.35; const lz = z + baseD/2 + ld/2 + 0.02;
      climb.push({ min:[lx-lw/2, 0, lz-ld/2], max:[lx+lw/2, lh, lz+ld/2] });
    });
  
    // --- Parkour boxes: sides = blockers, top = walkable ---
    getParkourDefs().forEach(b=>{
      // solid column blocks horizontally
      blockers.push({ min:[b.x-b.w/2, 0, b.z-b.d/2], max:[b.x+b.w/2, b.h, b.z+b.d/2] });
  
      const overhang = 0.06; // tweak 0.04–0.1 depending on feel
      walk.push({
      min: [b.x - b.w/2 - overhang, b.h - 0.02,       b.z - b.d/2 - overhang],
      max: [b.x + b.w/2 + overhang, b.h + 0.20,       b.z + b.d/2 + overhang]
});
    });
  
    // --- Arena walls: blockers only ---
    const H = ARENA_HALF, wallH = 10, thick = 0.6, span = H*2+2;
    blockers.push({ min:[ H+thick/2- thick/2, 0, -span/2], max:[ H+thick/2+ thick/2, wallH,  span/2] });
    blockers.push({ min:[-H-thick/2- thick/2,0, -span/2], max:[-H-thick/2+ thick/2, wallH,  span/2] });
    blockers.push({ min:[-span/2, 0,  H+thick/2- thick/2], max:[ span/2, wallH,  H+thick/2+ thick/2] });
    blockers.push({ min:[-span/2, 0, -H-thick/2- thick/2], max:[ span/2, wallH, -H-thick/2+ thick/2] });
  
    setBlockers(blockers);
    setWalkSurfaces(walk);
    setClimbVolumes(climb);
  }, []);

  return (
    <group>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,0,0]}>
        <planeGeometry args={[300,300]} />
        <meshBasicMaterial map={groundTex} />
      </mesh>
      <Trees />
      <Houses />
      <ParkourBoxes />
      <CloudField />
      <ArenaWalls />
    </group>
  );
}

function Trees() {
  const trees: JSX.Element[] = [];
  const fixed = [[-3,-6],[6,-3],[-6,5],[4,-8]];
  fixed.forEach(([x,z],i)=>trees.push(<Tree key={`t-fixed-${i}`} position={[x,0,z]} />));
  const radius = 20; for (let i=0;i<18;i++){ const a=(i/18)*Math.PI*2; trees.push(<Tree key={`t-ring-${i}`} position={[Math.cos(a)*radius,0,Math.sin(a)*radius]} />); }
  return <group>{trees}</group>;
}

function Tree({ position = [0,0,0] as [number,number,number] }) {
  return (
    <group position={position}>
      <mesh position={[0,1,0]}><boxGeometry args={[0.6,2,0.6]} /><meshBasicMaterial color="#8b5a2b" /></mesh>
      <mesh position={[0,2.4,0]}><boxGeometry args={[2,1.2,2]} /><meshBasicMaterial color="#2fad4e" /></mesh>
      <mesh position={[0,3.3,0]}><boxGeometry args={[1.4,1,1.4]} /><meshBasicMaterial color="#27a046" /></mesh>
    </group>
  );
}

function Houses(){
  const list: [number,number][] = [[-16,-12],[16,-10],[-14,14],[14,14]];
  return <group>{list.map(([x,z],i)=>(<House key={i} position={[x,0,z]} />))}</group>;
}
function House({ position=[0,0,0] as [number,number,number] }){
  const plank = useMemo(()=>makePlankTexture(),[]);
  const brick = useMemo(()=>makeBrickTexture(),[]);
  const baseW=8, baseH=4.4, baseD=8;
  const centerY = baseH/2; // keeps the base on the ground
  const ridgeY = baseH;    // top of brick box
  return (
    <group position={position}>
      {/* base */}
      <mesh position={[0,centerY,0]}><boxGeometry args={[baseW,baseH,baseD]} /><meshBasicMaterial map={brick} /></mesh>
      {/* door + window */}
      <mesh position={[0,1.2,baseD/2+0.01]}><planeGeometry args={[1.8,2.4]} /><meshBasicMaterial map={plank} /></mesh>
      <mesh position={[baseW/3.1,2.6,baseD/2+0.01]}><planeGeometry args={[1.4,1.0]} /><meshBasicMaterial color="#a3e7ff" /></mesh>
      {/* flat roof slab for walkable top */}
      <mesh position={[0, ridgeY + 0.2, 0]}>
        <boxGeometry args={[baseW+0.6, 0.4, baseD+0.6]} />
        <meshBasicMaterial map={plank} />
      </mesh>
      {/* ladder on front face (climbable via volume) */}
      <group position={[baseW*0.35, 1.6, baseD/2 + 0.02]}>
        {/* side rails */}
        <mesh position={[-0.35, 0.0, 0]}><boxGeometry args={[0.12, 3.0, 0.06]} /><meshBasicMaterial map={plank} /></mesh>
        <mesh position={[ 0.35, 0.0, 0]}><boxGeometry args={[0.12, 3.0, 0.06]} /><meshBasicMaterial map={plank} /></mesh>
        {/* rungs */}
        {Array.from({length:7}).map((_,i)=> (
          <mesh key={i} position={[0, -1.4 + i*(3.0/6), 0]}>
            <boxGeometry args={[0.7, 0.08, 0.06]} />
            <meshBasicMaterial map={plank} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function ParkourBoxes(){
  const plank = useMemo(()=>makePlankTexture(),[]);
  const defs = useMemo(()=>getParkourDefs(),[]);
  const top = defs[defs.length-1];

  // pulsing ring to show interactivity (no DOM)
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const s = 1 + Math.sin(clock.getElapsedTime() * 3) * 0.08;
    ringRef.current.scale.set(s, 1, s);
  });

  return (
    <group>
      {defs.map((b,i)=> (
        <mesh key={i} position={[b.x, b.h/2, b.z]}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshBasicMaterial map={plank} />
        </mesh>
      ))}
      {top && (
        <group position={[top.x, top.h + 0.25, top.z]}>
          <mesh>
            <cylinderGeometry args={[0.45,0.45,0.2,20]} />
            <meshBasicMaterial color="#f59e0b" />
          </mesh>
          <mesh ref={ringRef} position={[0,0.02,0]}>
            <torusGeometry args={[0.65, 0.05, 10, 40]} />
            <meshBasicMaterial color="#fde68a" />
          </mesh>
        </group>
      )}
    </group>
  );
}

function Cloud({ position=[0,0,0] as [number,number,number] }){
  return (
    <group position={position}>
      {[[0,0,0],[1.2,0.3,0.4],[-1,0.2,-0.4],[0.2,-0.1,0.9]].map((o,i)=>(
        <mesh key={i} position={[o[0],o[1],o[2]]}>
          <boxGeometry args={[2,1,1]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  );
}

function CloudField(){
  const groups: JSX.Element[] = [];
  const ringRadius = 14, ringCount=12;
  for(let i=0;i<ringCount;i++){ const ang=(i/ringCount)*Math.PI*2; groups.push(<Cloud key={"ring"+i} position={[Math.cos(ang)*ringRadius, CLOUD_ALT, Math.sin(ang)*ringRadius]} />); }
  const grid=[-2,-1,0,1,2];
  grid.forEach(gx=>grid.forEach(gz=>{ if(gx===0&&gz===0) return; const x=gx*10+(gx%2===0?2:-2); const z=gz*12+(gz%2===0?-2:2); const y=CLOUD_ALT+(((gx+gz+5)%3)-1); groups.push(<Cloud key={`grid-${gx}-${gz}`} position={[x,y,z]} />); }));
  return <group>{groups}</group>;
}

/* Tall perimeter walls to keep players in-bounds */
function ArenaWalls(){
  const brick = useMemo(()=>makeBrickTexture(),[]);
  const H = ARENA_HALF; const wallH = 10; const thick=0.6; const span = H*2+2;
  return (
    <group>
      {/* +X wall */}
      <mesh position={[ H+thick/2, wallH/2, 0 ]}>
        <boxGeometry args={[thick, wallH, span]} />
        <meshBasicMaterial map={brick} />
      </mesh>
      {/* -X wall */}
      <mesh position={[ -H-thick/2, wallH/2, 0 ]}>
        <boxGeometry args={[thick, wallH, span]} />
        <meshBasicMaterial map={brick} />
      </mesh>
      {/* +Z wall */}
      <mesh position={[ 0, wallH/2, H+thick/2 ]}>
        <boxGeometry args={[span, wallH, thick]} />
        <meshBasicMaterial map={brick} />
      </mesh>
      {/* -Z wall */}
      <mesh position={[ 0, wallH/2, -H-thick/2 ]}>
        <boxGeometry args={[span, wallH, thick]} />
        <meshBasicMaterial map={brick} />
      </mesh>
    </group>
  );
}

/* ---------- Grounded Whiteboards (with poles) ---------- */
function GroundedWhiteboards({ setActiveBoard, isDark }: { setActiveBoard: (id: string) => void; isDark:boolean; }){
  const squareSize = 9.5;
  const positions: [number,number,number][] = [[squareSize,BOARD_ALT,0],[0,BOARD_ALT,-squareSize],[-squareSize,BOARD_ALT,0],[0,BOARD_ALT,squareSize]];
  const rotations: [number,number,number][] = [[0,-Math.PI/2,0],[0,0,0],[0,Math.PI/2,0],[0,Math.PI,0]];
  return (
    <group>
      {WHITEBOARD_CONFIG.map((cfg,i)=>(
        <GroundedBoard key={cfg.id} position={positions[i]} rotation={rotations[i]} config={cfg} onClick={()=>setActiveBoard(cfg.id)} isDark={isDark} />
      ))}
    </group>
  );
}

function GroundedBoard({ position, rotation, config, isDark, onClick}: { position:[number,number,number]; rotation:[number,number,number]; config:(typeof WHITEBOARD_CONFIG)[0]; isDark: boolean; onClick:()=>void; }){
  const plank = useMemo(()=>makePlankTexture(),[]);
  const banner = useMemo(() => makeCenterBannerTextureThemed(config.title, isDark), [config.title, isDark]);
  const W=7.5, H=3.4, D=0.6; // wood core size
  const poleHeight = position[1]-0.1;
  return (
    <group position={position} rotation={rotation}>
      {/* wood core */}
      <mesh>
        <boxGeometry args={[W, H, D]} />
        <meshBasicMaterial map={plank} />
      </mesh>
      {/* clickable front banner */}
      <mesh position={[0,0,D/2+0.01]} onClick={(e)=>{e.stopPropagation();onClick();}}>
        <planeGeometry args={[W*0.97, H*0.95]} />
        <meshBasicMaterial map={banner} />
      </mesh>
      {/* large invisible hit area */}
      <mesh position={[0,0,D/2+0.2]} onClick={(e)=>{e.stopPropagation();onClick();}}>
        <planeGeometry args={[W*1.2,H*1.2]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      {/* poles + feet */}
      <mesh position={[ W*0.33,-poleHeight/2,0]}><boxGeometry args={[0.15,poleHeight,0.15]} /><meshBasicMaterial color="#334155" /></mesh>
      <mesh position={[-W*0.33,-poleHeight/2,0]}><boxGeometry args={[0.15,poleHeight,0.15]} /><meshBasicMaterial color="#334155" /></mesh>
      <mesh position={[ W*0.33,-poleHeight,0]}><boxGeometry args={[0.8,0.25,1.3]} /><meshBasicMaterial color="#111827" /></mesh>
      <mesh position={[-W*0.33,-poleHeight,0]}><boxGeometry args={[0.8,0.25,1.3]} /><meshBasicMaterial color="#111827" /></mesh>
    </group>
  );
}

/* ---------- Thick floating sign with RGB border animation ---------- */
function ThickSkySign({ text, rgbActive, isDark }: { text: string; rgbActive: boolean; isDark: boolean; }){
  const groupRef = useRef<THREE.Group>(null);
  const texRef = useRef<THREE.CanvasTexture | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const phaseRef = useRef(0);


  // --- one-shot spin state ---
  const spinning = useRef(false);
  const spinStart = useRef(0);
  const spinDuration = useRef(1200); // ms (tweak speed here)
  const baseRotation = useRef(0);
  useEffect(() => {
    const startSpin = () => {
      if (!groupRef.current) return;
      spinning.current = true;
      spinStart.current = performance.now();
      // normalize current Y rotation so we don't drift
      baseRotation.current =
        (groupRef.current.rotation.y % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    };
    window.addEventListener('spin-banner', startSpin as any);
    return () => window.removeEventListener('spin-banner', startSpin as any);
  }, []);
  // init canvas + texture once
  if(!canvasRef.current){
    const canvas=document.createElement('canvas'); canvas.width=2048; canvas.height=900; canvasRef.current=canvas; ctxRef.current=canvas.getContext('2d');
    texRef.current = new THREE.CanvasTexture(canvas); texRef.current.anisotropy=8; texRef.current.needsUpdate=true;
  }

  const drawBanner = (phase:number)=>{
    const canvas = canvasRef.current!; const ctx = ctxRef.current!;
    // background wood + top green band
    ctx.fillStyle="#7b4f28"; ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<500;i++){ ctx.fillStyle=`rgba(0,0,0,${Math.random()*0.2})`; ctx.fillRect(Math.random()*canvas.width, Math.random()*canvas.height, 10,10); }
     // top band (dark vs light)
    if (isDark){
      ctx.fillStyle="#1d3b2a"; ctx.fillRect(0,0,canvas.width,canvas.height*0.25);
      ctx.fillStyle="#245a38"; ctx.fillRect(0,0,canvas.width,canvas.height*0.18);
    } else {
      ctx.fillStyle="#2e7d32"; ctx.fillRect(0,0,canvas.width,canvas.height*0.25);
      ctx.fillStyle="#4caf50"; ctx.fillRect(0,0,canvas.width,canvas.height*0.18);
    }

    // frame
    ctx.lineWidth=40;
    ctx.strokeStyle = isDark ? "#0b1220" : "#0f172a";
    ctx.strokeRect(0,0,canvas.width,canvas.height);


    // RGB chasing border when active
    if(rgbActive){
      const seg = 32; // segment length in px
      const perim = 2*(canvas.width+canvas.height);
      for(let p=0; p<perim; p+=seg){
        const hue = ( (p/perim)*360 + phase*180 ) % 360;
        ctx.strokeStyle = `hsl(${hue} 100% 60%)`;
        ctx.lineWidth = 60;
        let s = p, e = Math.min(p+seg, perim);
        const drawEdge = (x1:number,y1:number,x2:number,y2:number)=>{ ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); };
        while(s<e){
          let x1=0,y1=0,x2=0,y2=0; let left = e-s;
          if(s < canvas.width){
            const d1 = Math.min(left, canvas.width - s);
            x1 = s; y1 = 0; x2 = s + d1; y2 = 0; drawEdge(x1,y1,x2,y2); s += d1; continue;
          }
          if(s < canvas.width + canvas.height){
            const k = s - canvas.width; const d1 = Math.min(left, canvas.height - k);
            x1 = canvas.width; y1 = k; x2 = canvas.width; y2 = k + d1; drawEdge(x1,y1,x2,y2); s += d1; continue;
          }
          if(s < canvas.width*2 + canvas.height){
            const k = s - (canvas.width + canvas.height); const d1 = Math.min(left, canvas.width - k);
            x1 = canvas.width - k; y1 = canvas.height; x2 = canvas.width - (k + d1); y2 = canvas.height; drawEdge(x1,y1,x2,y2); s += d1; continue;
          }
          {
            const k = s - (canvas.width*2 + canvas.height); const d1 = Math.min(left, canvas.height - k);
            x1 = 0; y1 = canvas.height - k; x2 = 0; y2 = canvas.height - (k + d1); drawEdge(x1,y1,x2,y2); s += d1; continue;
          }
        }
      }
    }

     // text
    ctx.fillStyle = isDark ? "#e5e7eb" : "#ffffff";
    ctx.font = "900 200px 'Press Start 2P', monospace";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(text.toUpperCase(), canvas.width/2, canvas.height/2+10);

    texRef.current!.needsUpdate = true;
  };

  // animate float + RGB when active
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
  
    // float
    const t = clock.getElapsedTime();
    groupRef.current.position.y = TITLE_ALT + Math.sin(t * 0.35) * 0.12;
  
    // RGB border animation
    if (rgbActive) {
      phaseRef.current += 0.01;
      drawBanner(phaseRef.current);
    }
  
    // one-shot 360° spin (easeOutCubic)
    if (spinning.current) {
      const now = performance.now();
      const u = Math.min((now - spinStart.current) / spinDuration.current, 1); // 0→1
      const eased = 1 - Math.pow(1 - u, 3);
      groupRef.current.rotation.y = baseRotation.current + eased * (Math.PI * 2);
      if (u >= 1) {
        spinning.current = false;
        groupRef.current.rotation.y = baseRotation.current + Math.PI * 2; // snap cleanly
      }
    }
  });
  

  useEffect(()=>{ drawBanner(phaseRef.current); /* initial draw */ }, [text, rgbActive, isDark]);

  return (
    <group ref={groupRef} position={[0,TITLE_ALT,0]}>
      <mesh><boxGeometry args={[12,4.5,0.7]} /><meshBasicMaterial map={makePlankTexture()} /></mesh>
      <mesh position={[0,0,0.36]}><planeGeometry args={[11.8,4.3]} /><meshBasicMaterial map={texRef.current!} /></mesh>
      <mesh position={[0,0,-0.36]} rotation={[0,Math.PI,0]}><planeGeometry args={[11.8,4.3]} /><meshBasicMaterial map={texRef.current!} /></mesh>
    </group>
  );
}

/* ---------- Texture Helpers ---------- */
function makeCenterBannerTextureThemed(text: string, isDark: boolean){
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 900;
  const ctx = canvas.getContext('2d')!;

  // wood base (same)
  ctx.fillStyle = "#7b4f28"; ctx.fillRect(0,0,canvas.width,canvas.height);
  for (let i=0;i<500;i++){ ctx.fillStyle = `rgba(0,0,0,${Math.random()*0.2})`;
    ctx.fillRect(Math.random()*canvas.width, Math.random()*canvas.height, 10,10);
  }

  // top band — darker in dark mode
  if (isDark){
    ctx.fillStyle="#1d3b2a"; ctx.fillRect(0,0,canvas.width,canvas.height*0.25);
    ctx.fillStyle="#245a38"; ctx.fillRect(0,0,canvas.width,canvas.height*0.18);
  } else {
    ctx.fillStyle="#2e7d32"; ctx.fillRect(0,0,canvas.width,canvas.height*0.25);
    ctx.fillStyle="#4caf50"; ctx.fillRect(0,0,canvas.width,canvas.height*0.18);
  }

  // frame
  ctx.lineWidth = 40;
  ctx.strokeStyle = isDark ? "#0b1220" : "#0f172a";
  ctx.strokeRect(0,0,canvas.width,canvas.height);

  // text
  ctx.fillStyle = isDark ? "#e5e7eb" : "#ffffff";
  ctx.font = "900 200px 'Press Start 2P', monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), canvas.width/2, canvas.height/2+10);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8; texture.needsUpdate = true;
  return texture;
}

function makeVoxelGroundTexture(){
  const size=256; const c=document.createElement("canvas"); c.width=size; c.height=size; const ctx=c.getContext("2d")!;
  ctx.fillStyle="#4caf50"; ctx.fillRect(0,0,size,size);
  for(let i=0;i<1200;i++){ ctx.fillStyle=`rgba(20,100,40,${0.6+Math.random()*0.4})`; const x=Math.random()*size; const y=Math.random()*size; ctx.fillRect(x,y,1+Math.random()*2,1+Math.random()*2); }
  const tex=new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(40,40); tex.anisotropy=8; tex.needsUpdate=true; return tex;
}

function makePlankTexture(){
  const c=document.createElement("canvas"); c.width=512; c.height=512; const ctx=c.getContext("2d")!;
  ctx.fillStyle="#a07443"; ctx.fillRect(0,0,512,512);
  for(let i=0;i<12;i++){ const y=i*(512/12); ctx.fillStyle=i%2?"#8a6236":"#b8834f"; ctx.fillRect(0,y,512,512/12); }
  ctx.strokeStyle="#5c3b22"; ctx.lineWidth=8; for(let i=0;i<=8;i++){ const x=i*(512/8); ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,512); ctx.stroke(); }
  const tex=new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(1,1); tex.anisotropy=8; tex.needsUpdate=true; return tex;
}

function makeBrickTexture(){
  const c=document.createElement("canvas"); c.width=512; c.height=512; const ctx=c.getContext("2d")!;
  ctx.fillStyle="#b4553d"; ctx.fillRect(0,0,512,512);
  const rows=12, cols=16; ctx.fillStyle="#8c3f2c"; for(let r=0;r<rows;r++){ for(let col=0;col<cols;col++){ const off=(r%2)*16; ctx.fillRect(col*32+off, r*32, 26,26); }}
  const tex=new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(1,1); tex.anisotropy=8; tex.needsUpdate=true; return tex;
}
