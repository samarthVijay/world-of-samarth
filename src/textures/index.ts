import * as THREE from "three";

let floorWoodCache: THREE.CanvasTexture | null = null;
export function makeFloorWoodTexture() {
  if (floorWoodCache) return floorWoodCache;
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
  floorWoodCache = tex;
  return tex;
}

const voxelGroundCache: { [key: string]: THREE.CanvasTexture } = {};
export function makeVoxelGroundTexture(dark = false) {
  const key = dark ? "dark" : "light";
  if (voxelGroundCache[key]) return voxelGroundCache[key];
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
  voxelGroundCache[key] = tex;
  return tex;
}

let plankCache: THREE.CanvasTexture | null = null;
export function makePlankTexture() {
  if (plankCache) return plankCache;
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
  plankCache = tex;
  return tex;
}

let brickCache: THREE.CanvasTexture | null = null;
export function makeBrickTexture() {
  if (brickCache) return brickCache;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  // High quality distinct mortar and bevel brick texture
  ctx.fillStyle = "#5c2a1e"; // Mortar line background
  ctx.fillRect(0, 0, 512, 512);
  const rows = 16;
  const cols = 8;
  const h = 512 / rows;
  const w = 512 / cols;

  for (let r = 0; r < rows; r++) {
    const isShifted = r % 2 === 1;
    const offset = isShifted ? w / 2 : 0;
    for (let col = -1; col <= cols; col++) {
      const bx = col * w + offset;
      const by = r * h;
      // Main brick face
      ctx.fillStyle = r % 3 === 0 ? "#b44832" : r % 3 === 1 ? "#a63f2b" : "#c2523a";
      ctx.fillRect(bx + 2, by + 2, w - 4, h - 4);
      // Subtle top/left brick highlight for 3D depth
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.fillRect(bx + 2, by + 2, w - 4, 2);
      ctx.fillRect(bx + 2, by + 2, 2, h - 4);
      // Subtle bottom/right shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.fillRect(bx + 2, by + h - 4, w - 4, 2);
      ctx.fillRect(bx + w - 4, by + 2, 2, h - 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  brickCache = tex;
  return tex;
}

const boardLabelCache: { [key: string]: THREE.CanvasTexture } = {};
export function makeBoardLabelTextureDirt(text: string, dark: boolean) {
  const key = `${text}_${dark}`;
  if (boardLabelCache[key]) return boardLabelCache[key];
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
  boardLabelCache[key] = tex;
  return tex;
}
