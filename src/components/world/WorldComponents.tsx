import { useMemo, useRef, useEffect, type JSX } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import type { HouseDef, AABB } from "../../types";
import {
  ARENA_HALF,
  BOARD_ALT,
  CLOUD_ALT,
  DESK,
  BED,
  asset,
  getParkourDefs,
  setBlockers,
  setWalkSurfaces,
  setClimbVolumes,
} from "../../constants";
import {
  makeBrickTexture,
  makeFloorWoodTexture,
  makePlankTexture,
  makeVoxelGroundTexture,
  makeBoardLabelTextureDirt,
} from "../../textures";
import { InteractAtPoint } from "../controls/Controls";
import { WHITEBOARD_CONFIG } from "../../constants/boards";

export function World({
  darkMode,
  enabled,
  setPrompt,
  onDefs,
  lowSpec,
  insideHouseId,
}: {
  darkMode: boolean;
  enabled: boolean;
  setPrompt: (s: string | null) => void;
  onDefs: (defs: HouseDef[]) => void;
  lowSpec: boolean;
  insideHouseId: string | null;
}) {
  const houseDefs = useMemo<HouseDef[]>(() => {
    const raw = [
      { id: "house-0", x: -16, z: -12 },
      { id: "house-1", x: 16, z: -10 },
      { id: "house-2", x: -14, z: 14 },
      { id: "house-3", x: 14, z: 14 },
    ];
    const baseH = 4.4, baseD = 8;
    return raw.map((h) => {
      const doorWorld = new THREE.Vector3(h.x, 0, h.z + baseD / 2 + 0.1);
      const insideSpawn = new THREE.Vector3(h.x, 1.6, h.z + baseD / 2 - 2.0);
      const interiorLight = new THREE.Vector3(h.x, baseH * 0.6, h.z);
      return { ...h, doorWorld, insideSpawn, interiorLight };
    });
  }, []);

  useEffect(() => {
    onDefs(houseDefs);
  }, [houseDefs, onDefs]);

  const groundTex = useMemo(() => makeVoxelGroundTexture(darkMode), [darkMode]);

  useEffect(() => {
    const blockers: AABB[] = [];
    const walk: AABB[] = [];
    const climb: AABB[] = [];

    const baseW = 8, baseH = 4.4, baseD = 8, roofT = 0.4, ld = 0.5;

    // Tree trunk blockers (same positions as Trees component, excluding those near houses)
    const fixedTrees: [number, number][] = [
      [-3, -6],
      [4, -8],
    ];
    const ringR = 20, ringN = 18;
    const ringTrees: [number, number][] = Array.from({ length: ringN }, (_, i) => [
      Math.cos((i / ringN) * Math.PI * 2) * ringR,
      Math.sin((i / ringN) * Math.PI * 2) * ringR,
    ]);
    [...fixedTrees, ...ringTrees].forEach(([x, z]) => {
      const w = 0.6, d = 0.6, h = 2.0;
      blockers.push({ min: [x - w / 2, 0, z - d / 2], max: [x + w / 2, h, z + d / 2] });
    });

    // House blockers — single box with tag so collidesXYAt skips it when inside
    houseDefs.forEach((h) => {
      const ladderX = h.x + baseW * 0.35,
        ladderZ = h.z + baseD / 2 + ld / 2 + 0.02;

      blockers.push({
        min: [h.x - baseW / 2, 0, h.z - baseD / 2],
        max: [h.x + baseW / 2, baseH, h.z + baseD / 2],
        tag: h.id,
      });

      const over = 0.6, inset = 0.1;
      walk.push({
        min: [h.x - (baseW + over) / 2 + inset, baseH, h.z - (baseD + over) / 2 + inset],
        max: [h.x + (baseW + over) / 2 - inset, baseH + 0.12, h.z + (baseD + over) / 2 - inset],
      });

      climb.push({
        min: [ladderX - 0.8 / 2, 0, ladderZ - ld / 2],
        max: [ladderX + 0.8 / 2, baseH + roofT, ladderZ + ld / 2],
      });
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
  }, [houseDefs]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[300, 300]} />
        <meshBasicMaterial map={groundTex} color={darkMode ? "#bcdcbc" : "#ffffff"} />
      </mesh>
      <Trees darkMode={darkMode} houseDefs={houseDefs} />
      <Houses darkMode={darkMode} defs={houseDefs} insideId={insideHouseId} />
      {!lowSpec && <ParkourBoxes />}
      {!lowSpec && <CloudField darkMode={darkMode} />}
      <LadderPrompts enabled={enabled} setPrompt={setPrompt} />
      <ArenaWalls />
      {darkMode &&
        houseDefs.map((h) => <pointLight key={h.id} position={h.interiorLight} intensity={0.9} distance={10} color={"#ffd27a"} />)}
    </group>
  );
}

function Trees({ darkMode, houseDefs }: { darkMode: boolean; houseDefs: HouseDef[] }) {
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

const treeGeoTrunk = new THREE.BoxGeometry(0.6, 2, 0.6);
const treeGeoLeaf1 = new THREE.BoxGeometry(2, 1.2, 2);
const treeGeoLeaf2 = new THREE.BoxGeometry(1.4, 1, 1.4);

const treeMatTrunk = new THREE.MeshBasicMaterial({ color: "#8b5a2b" });
const treeMatLeaf1Light = new THREE.MeshBasicMaterial({ color: "#2fad4e" });
const treeMatLeaf2Light = new THREE.MeshBasicMaterial({ color: "#27a046" });
const treeMatLeaf1Dark = new THREE.MeshBasicMaterial({ color: "#013220" });
const treeMatLeaf2Dark = new THREE.MeshBasicMaterial({ color: "#022d1c" });

function Tree({ position = [0, 0, 0] as [number, number, number], darkMode }: { position: [number, number, number]; darkMode: boolean }) {
  return (
    <group position={position}>
      <mesh position={[0, 1, 0]} geometry={treeGeoTrunk} material={treeMatTrunk} />
      <mesh position={[0, 2.4, 0]} geometry={treeGeoLeaf1} material={darkMode ? treeMatLeaf1Dark : treeMatLeaf1Light} />
      <mesh position={[0, 3.3, 0]} geometry={treeGeoLeaf2} material={darkMode ? treeMatLeaf2Dark : treeMatLeaf2Light} />
    </group>
  );
}

function Houses({ darkMode, defs, insideId }: { darkMode: boolean; defs: HouseDef[]; insideId: string | null }) {
  const plank = useMemo(() => makePlankTexture(), []);
  const brick = useMemo(() => makeBrickTexture(), []);
  return (
    <group>
      {defs.map((h) => (
        <House key={h.id} position={[h.x, 0, h.z]} darkMode={darkMode} insideActive={insideId === h.id} plank={plank} brick={brick} />
      ))}
    </group>
  );
}

function House({
  position = [0, 0, 0] as [number, number, number],
  darkMode,
  insideActive = false,
  plank,
  brick,
}: {
  position: [number, number, number];
  darkMode: boolean;
  insideActive?: boolean;
  plank: THREE.Texture;
  brick: THREE.Texture;
}) {
  const baseW = 8,
    baseH = 4.4,
    baseD = 8,
    ridgeY = baseH,
    roofT = 0.36;

  return (
    <group position={position}>
      {/* Exterior Brick Walls */}
      <mesh position={[0, baseH / 2, 0]}>
        <boxGeometry args={[baseW, baseH, baseD]} />
        <meshBasicMaterial map={brick} side={insideActive ? THREE.DoubleSide : THREE.FrontSide} />
      </mesh>

      {/* Solid Wooden Door - Thick 3D Box instead of paper-thin plane */}
      <mesh position={[0, 1.2, baseD / 2 + 0.08]}>
        <boxGeometry args={[1.8, 2.4, 0.16]} />
        <meshBasicMaterial map={plank} />
      </mesh>

      {/* Window */}
      <mesh position={[baseW / 3.1, 2.6, baseD / 2 + 0.01]}>
        <planeGeometry args={[1.4, 1.0]} />
        <meshBasicMaterial color={darkMode ? "#ffe599" : "#a3e7ff"} />
      </mesh>

      {/* Roof */}
      <mesh position={[0, ridgeY + roofT / 2, 0]}>
        <boxGeometry args={[baseW + 0.6, roofT, baseD + 0.6]} />
        <meshBasicMaterial map={plank} />
      </mesh>

      {/* Ladder */}
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

export function DoorPrompts({
  enabled,
  houseDefs,
  setPrompt,
  setInside,
  insideId,
}: {
  enabled: boolean;
  houseDefs: HouseDef[];
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

export function GroundedWhiteboards({
  setActiveBoard,
  darkMode,
  setPrompt,
}: {
  setActiveBoard: (id: string) => void;
  darkMode: boolean;
  setPrompt: (s: string | null) => void;
}) {
  const plank = useMemo(() => makePlankTexture(), []);
  const boards = useMemo(() => WHITEBOARD_CONFIG, []);
  const positions: [number, number][] = [
    [-6, -4],
    [6, -4],
    [-6, 4],
    [6, 4],
  ];

  const defs = useMemo(
    () =>
      boards.map((b: any, i: number) => ({
        id: b.id,
        label: b.title,
        x: positions[i % positions.length][0],
        z: positions[i % positions.length][1],
      })),
    [boards, darkMode]
  );

  const labels = useMemo(() => {
    const map: { [id: string]: THREE.CanvasTexture } = {};
    defs.forEach((d: { id: string; label: string }) => {
      map[d.id] = makeBoardLabelTextureDirt(d.label, darkMode);
    });
    return map;
  }, [defs, darkMode]);

  return (
    <group>
      {defs.map((d: { id: string; label: string; x: number; z: number }) => (
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

export function HouseInteriors({
  enabled,
  houseDefs,
  setPrompt,
  setExhibit,
  insideId,
  darkMode,
}: {
  enabled: boolean;
  houseDefs: HouseDef[];
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

export function ThickSkySign({ text, rgbActive, darkMode }: { text: string; rgbActive: boolean; darkMode: boolean }) {
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
      ctx.fillStyle = "#4caf50";
      ctx.fillRect(0, 0, c.width, c.height * 0.25);
      ctx.fillStyle = "#66bb6a";
      ctx.fillRect(0, 0, c.width, c.height * 0.18);
    }
    const bw = 24;
    if (rgbActive) {
      const grad = ctx.createLinearGradient(0, 0, c.width, 0);
      for (let i = 0; i <= 6; i++) {
        const hue = ((phase * 360 + (i / 6) * 360) % 360).toFixed(0);
        grad.addColorStop(i / 6, `hsl(${hue}, 100%, 50%)`);
      }
      ctx.strokeStyle = grad;
    } else {
      ctx.strokeStyle = "#3a2a16";
    }
    ctx.lineWidth = bw;
    ctx.strokeRect(bw / 2, bw / 2, c.width - bw, c.height - bw);

    ctx.fillStyle = "#111111";
    ctx.fillRect(c.width / 2 - 820, c.height / 2 - 160, 1640, 320);

    ctx.fillStyle = darkMode ? "#a7f3d0" : "#ffffff";
    let fontSZ = 140;
    ctx.font = `900 ${fontSZ}px 'Press Start 2P', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    while (fontSZ > 40 && ctx.measureText(text).width > 1560) {
      fontSZ -= 6;
      ctx.font = `900 ${fontSZ}px 'Press Start 2P', monospace`;
    }
    ctx.fillText(text, c.width / 2, c.height / 2 + 10);
    texRef.current!.needsUpdate = true;
  };

  useFrame((_, delta) => {
    phaseRef.current = (phaseRef.current + delta * 0.25) % 1;
    draw(phaseRef.current);

    if (groupRef.current) {
      if (spinning.current) {
        const elapsed = performance.now() - spinStart.current;
        const progress = Math.min(1, elapsed / spinDuration.current);
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        groupRef.current.rotation.y = baseRotation.current + eased * Math.PI * 2;
        if (progress >= 1) {
          spinning.current = false;
          groupRef.current.rotation.y = baseRotation.current % (Math.PI * 2);
        }
      } else {
        groupRef.current.rotation.y = 0;
      }
    }
  });

  const plank = useMemo(() => makePlankTexture(), []);
  return (
    <group ref={groupRef} position={[0, 10, 0]}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[14, 5.2, 0.4]} />
        <meshBasicMaterial map={plank} />
      </mesh>
      <mesh position={[0, 0, 0.21]}>
        <planeGeometry args={[13.6, 4.8]} />
        <meshBasicMaterial map={texRef.current!} />
      </mesh>
      <mesh position={[0, 0, -0.21]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[13.6, 4.8]} />
        <meshBasicMaterial map={texRef.current!} />
      </mesh>
      {[-6.2, 6.2].map((px, i) => (
        <mesh key={i} position={[px, -5.2 / 2 - 2, 0]}>
          <boxGeometry args={[0.3, 4, 0.3]} />
          <meshBasicMaterial map={plank} />
        </mesh>
      ))}
    </group>
  );
}
