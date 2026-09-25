import * as THREE from 'three';

// Art pixels per tile. All world units are tiles.
export const PX = 16;

// Internal render resolution; the canvas is upscaled by an integer factor so pixels stay square and crisp.
// ~360px tall gives SMB's zoomed-out framing (~40 tiles across at 16:9).
export const VIEW = { w: 640, h: 360, scale: 1 };

export function fitView(renderer) {
  const scale = Math.max(1, Math.round(innerHeight / 360));
  // Even dimensions keep the camera centre on a pixel boundary.
  VIEW.w = Math.ceil(innerWidth / scale / 2) * 2;
  VIEW.h = Math.ceil(innerHeight / scale / 2) * 2;
  VIEW.scale = scale;
  renderer.setSize(VIEW.w, VIEW.h, false);
  renderer.domElement.style.width = `${VIEW.w * scale}px`;
  renderer.domElement.style.height = `${VIEW.h * scale}px`;
}

export function pixelCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  draw?.(g, c);
  return c;
}

export function texture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A quad sized to its art at PX per tile. `bottom` anchors the origin at the bottom centre (feet).
export function sprite(tex, { anchor = 'center', transparent = false, opacity = 1 } = {}) {
  const { width, height } = tex.image;
  const geo = new THREE.PlaneGeometry(width / PX, height / PX);
  if (anchor === 'bottom') geo.translate(0, height / PX / 2, 0);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, side: THREE.DoubleSide, transparent, opacity, alphaTest: transparent ? 0.01 : 0.5, depthWrite: !transparent,
  });
  return new THREE.Mesh(geo, mat);
}

export const snap = (v, zoom = 1) => Math.round(v * PX * zoom) / (PX * zoom);

export function orthoCamera() {
  const c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  c.position.z = 50;
  return c;
}

export const halfView = (zoom = 1) => ({ hw: VIEW.w / (2 * PX * zoom), hh: VIEW.h / (2 * PX * zoom) });

// One art pixel maps to `zoom` internal pixels; the camera centre snaps to the pixel grid.
export function fitCamera(cam, x, y, zoom = 1) {
  const { hw, hh } = halfView(zoom);
  cam.left = -hw;
  cam.right = hw;
  cam.top = hh;
  cam.bottom = -hh;
  cam.updateProjectionMatrix();
  cam.position.set(snap(x, zoom), snap(y, zoom), 50);
}

export function disposeScene(scene) {
  scene.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [o.material].flat()) m?.dispose();
  });
}
