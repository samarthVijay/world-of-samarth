import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { IS_TOUCH, getBlockers, getWalkSurfaces, getClimbVolumes, getInteriorBlockers, EDGE_PAD, PROBE_FACTOR, GROUND_SNAP, MAX_STEP, MAX_UP_SNAP, ROOF_GRACE_MS, ARENA_HALF } from "../../constants";
import type { AABB } from "../../types";

export function Crosshair({ enabled = true }: { enabled?: boolean }) {
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

export function MouseLookControls({
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

/* ---------- Movement + ladders (faithful port of original) ---------- */
export function MovementControls({
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
  const lastLadderToggle = useRef(0);

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

  // Key handlers — original does NOT gate on enabled; stores both key and code
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
    const all = [...getBlockers(), ...getInteriorBlockers()];
    for (const a of all) {
      if (insideHouseId && a.tag === insideHouseId) continue;
      if (
        x >= a.min[0] - radius &&
        x <= a.max[0] + radius &&
        z >= a.min[2] - radius &&
        z <= a.max[2] + radius
      ) {
        if (yMax > a.min[1] + 1e-3 && yMin < a.max[1] - 1e-3) return true;
      }
    }
    return false;
  }

  function groundAtLimited(x: number, z: number, footY: number, allowHighSnap: boolean) {
    const probe = Math.max(0, radius * PROBE_FACTOR);
    let best = 0;
    for (const a of getWalkSurfaces()) {
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
    for (const a of getClimbVolumes()) {
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

/* ---------- InteractAtPoint ---------- */
export function InteractAtPoint({
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
