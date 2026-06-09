/**
 * svg3d.js — Lightweight 3D SVG renderer (vanilla JS)
 * Inspired by 3dsvg.design (MIT) by Renato Costa
 * Uses Three.js + SVGLoader for SVG extrusion, PBR materials, and animations.
 */

import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

// ---------------------------------------------------------------------------
// Material Presets (from 3dsvg engine)
// ---------------------------------------------------------------------------
const PRESETS = {
  default:  { metalness: 0.15, roughness: 0.35, opacity: 1 },
  plastic:  { metalness: 0.0,  roughness: 0.3,  opacity: 1 },
  metal:    { metalness: 0.9,  roughness: 0.2,  opacity: 1 },
  glass:    { metalness: 0.1,  roughness: 0.05, opacity: 0.35 },
  chrome:   { metalness: 1.0,  roughness: 0.05, opacity: 1 },
  gold:     { metalness: 1.0,  roughness: 0.25, opacity: 1 },
  clay:     { metalness: 0.0,  roughness: 1.0,  opacity: 1 },
  emissive: { metalness: 0.0,  roughness: 0.5,  opacity: 1, emissive: 0.8 },
};

// ---------------------------------------------------------------------------
// SVG → Three.js Shapes
// ---------------------------------------------------------------------------
function parseSVGToShapes(svgString) {
  const loader = new SVGLoader();
  const data = loader.parse(svgString);
  const shapes = [];

  // Detect viewBox for background rect filtering
  const vb = svgString.match(/viewBox\s*=\s*["']\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)/);
  const vbW = vb ? parseFloat(vb[3]) : null;
  const vbH = vb ? parseFloat(vb[4]) : null;

  data.paths.forEach(path => {
    const style = path.userData?.style;
    const hasFill = style?.fill && style.fill !== 'none' && style.fill !== 'transparent';
    const hasStroke = style?.stroke && style.stroke !== 'none' && style.stroke !== 'transparent';

    if (hasFill || (!hasFill && !hasStroke)) {
      SVGLoader.createShapes(path).forEach(shape => {
        // Skip full-viewBox background rects
        if (vbW && vbH) {
          const pts = shape.getPoints(4);
          if (pts.length >= 4 && pts.length <= 5) {
            const bb = new THREE.Box2();
            pts.forEach(p => bb.expandByPoint(p));
            const sz = new THREE.Vector2();
            bb.getSize(sz);
            if (Math.abs(sz.x - vbW) / vbW < 0.02 && Math.abs(sz.y - vbH) / vbH < 0.02) return;
          }
        }
        shapes.push(shape);
      });
    }

    if (hasStroke) {
      const sw = parseFloat(style?.strokeWidth ?? '2');
      path.subPaths.forEach(sub => {
        const pts = sub.getPoints(12);
        if (pts.length < 2) return;
        const half = sw / 2;
        const left = [], right = [];
        for (let i = 0; i < pts.length; i++) {
          const prev = pts[Math.max(0, i - 1)];
          const next = pts[Math.min(pts.length - 1, i + 1)];
          const dx = next.x - prev.x, dy = next.y - prev.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = -dy / len, ny = dx / len;
          left.push(new THREE.Vector2(pts[i].x + nx * half, pts[i].y + ny * half));
          right.push(new THREE.Vector2(pts[i].x - nx * half, pts[i].y - ny * half));
        }
        const s = new THREE.Shape();
        s.moveTo(left[0].x, left[0].y);
        left.slice(1).forEach(p => s.lineTo(p.x, p.y));
        right.reverse().forEach(p => s.lineTo(p.x, p.y));
        s.closePath();
        shapes.push(s);
      });
    }
  });

  return shapes;
}

// ---------------------------------------------------------------------------
// Extrude + Merge
// ---------------------------------------------------------------------------
function extrudeShapes(shapes, depth, smoothness) {
  if (!shapes.length) return null;

  // Measure flat size for proportional depth
  const flatGeo = new THREE.ShapeGeometry(shapes);
  flatGeo.computeBoundingBox();
  const flatSize = new THREE.Vector3();
  flatGeo.boundingBox.getSize(flatSize);
  const maxFlat = Math.max(flatSize.x, flatSize.y, 1);
  flatGeo.dispose();

  const scaledDepth = (depth / 10) * maxFlat;
  const bevelScale = Math.min(maxFlat * 0.02, 1);
  const quality = shapes.length > 200 ? 0.3 : shapes.length > 50 ? 0.6 : 1;

  const settings = {
    depth: scaledDepth,
    bevelEnabled: true,
    bevelThickness: bevelScale * (0.15 + smoothness * 0.2),
    bevelSize: bevelScale * (0.15 + smoothness * 0.2),
    bevelSegments: Math.round((3 + smoothness * 20) * quality),
    curveSegments: Math.round((24 + smoothness * 176) * quality),
  };

  const geos = shapes.map(s => new THREE.ExtrudeGeometry(s, settings));

  // Merge into single geometry
  const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos);
  if (geos.length > 1) geos.forEach(g => g.dispose());

  merged.computeBoundingBox();
  merged.computeVertexNormals();

  return merged;
}

function mergeGeometries(geos) {
  // Simple merge without BufferGeometryUtils (avoid extra import)
  let totalVerts = 0, totalIdx = 0;
  geos.forEach(g => {
    totalVerts += g.attributes.position.count;
    totalIdx += g.index ? g.index.count : 0;
  });

  const pos = new Float32Array(totalVerts * 3);
  const norm = new Float32Array(totalVerts * 3);
  const idx = new Uint32Array(totalIdx);
  let vOff = 0, iOff = 0, vBase = 0;

  geos.forEach(g => {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    for (let i = 0; i < p.count * 3; i++) {
      pos[vOff * 3 + i] = p.array[i];
      norm[vOff * 3 + i] = n.array[i];
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) {
        idx[iOff + i] = g.index.array[i] + vBase;
      }
      iOff += g.index.count;
    }
    vBase += p.count;
    vOff += p.count;
  });

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  if (totalIdx > 0) merged.setIndex(new THREE.BufferAttribute(idx, 1));
  return merged;
}

// ---------------------------------------------------------------------------
// SVG3D Renderer Class
// ---------------------------------------------------------------------------
class SVG3DRenderer {
  constructor(container, opts = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.opts = Object.assign({
      svg: null,           // SVG string or URL
      color: '#ffffff',
      material: 'default',
      depth: 1,
      smoothness: 0.2,
      animate: 'float',    // none, spin, float, pulse, spinFloat, wobble
      animateSpeed: 1,
      zoom: 8,
      fov: 50,
      interactive: true,
      background: 'transparent',
      lightIntensity: 1.2,
      ambientIntensity: 0.4,
      shadow: true,
      intro: 'zoom',       // zoom, fade, none
      introDuration: 2.0,
    }, opts);

    this._destroyed = false;
    this._elapsed = 0;
    this._introProgress = 0;
    this._introComplete = false;
    this._isDragging = false;
    this._lastPointer = { x: 0, y: 0 };
    this._velocity = { x: 0, y: 0 };
    this._baseRotation = { x: 0, y: 0 };

    this._init();
  }

  async _init() {
    const { container, opts } = this;
    const w = container.clientWidth || 200;
    const h = container.clientHeight || 200;
    const dpr = Math.min(window.devicePixelRatio, 2);

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    const startZoom = opts.intro === 'zoom' ? 18 : opts.zoom;
    this.camera = new THREE.PerspectiveCamera(opts.fov, w / h, 0.1, 100);
    this.camera.position.z = startZoom;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'default',
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(dpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.setClearColor(0x000000, 0);

    if (opts.background && opts.background !== 'transparent') {
      this.scene.background = new THREE.Color(opts.background);
    }

    const canvas = this.renderer.domElement;
    canvas.style.opacity = opts.intro === 'none' ? '1' : '0';
    canvas.style.transition = 'none';
    container.appendChild(canvas);

    // Lighting
    this.scene.add(new THREE.AmbientLight(0xffffff, opts.ambientIntensity));

    const key = new THREE.DirectionalLight(0xffffff, opts.lightIntensity);
    key.position.set(5, 8, 5);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-5, 3, -3);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.2);
    rim.position.set(0, -4, 6);
    this.scene.add(rim);

    this.scene.add(new THREE.HemisphereLight(0xb1e1ff, 0xb97a20, 0.5));

    // Animation group (for loop animations like float)
    this.animGroup = new THREE.Group();
    this.scene.add(this.animGroup);

    // Mesh group (for drag rotation)
    this.meshGroup = new THREE.Group();
    this.animGroup.add(this.meshGroup);

    // Load SVG
    let svgString = opts.svg;
    if (svgString && (svgString.startsWith('/') || svgString.startsWith('http') || svgString.startsWith('./'))) {
      try {
        const resp = await fetch(svgString);
        svgString = await resp.text();
      } catch (e) {
        console.warn('SVG3D: Failed to load SVG', e);
        return;
      }
    }

    if (!svgString || this._destroyed) return;

    // Parse + Extrude
    const shapes = parseSVGToShapes(svgString);
    if (!shapes.length) return;

    const geometry = extrudeShapes(shapes, opts.depth, opts.smoothness);
    if (!geometry || this._destroyed) return;

    // Center and scale
    const bb = geometry.boundingBox;
    const center = new THREE.Vector3();
    bb.getCenter(center);
    const size = new THREE.Vector3();
    bb.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = maxDim > 0 ? 4 / maxDim : 1;

    // Material
    const preset = PRESETS[opts.material] || PRESETS.default;
    const isGold = opts.material === 'gold';
    const isEmissive = opts.material === 'emissive';
    const baseColor = isGold ? '#d4a017' : opts.color;
    const transparent = preset.opacity < 1;

    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(baseColor),
      metalness: preset.metalness,
      roughness: transparent ? Math.max(0.02, preset.roughness * 0.3) : preset.roughness,
      transmission: transparent ? (1 - preset.opacity) : 0,
      thickness: transparent ? 2.5 : 0,
      ior: transparent ? 1.5 : 1.45,
      wireframe: false,
      emissive: isEmissive ? new THREE.Color(opts.color) : new THREE.Color(0x000000),
      emissiveIntensity: preset.emissive || 0,
      clearcoat: transparent ? 1 : 0,
      clearcoatRoughness: 0.05,
      side: THREE.FrontSide,
      envMapIntensity: 1,
    });

    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(-center.x, -center.y, -center.z);

    const wrapper = new THREE.Group();
    wrapper.scale.set(scale, -scale, scale); // flip Y (SVG coord system)
    wrapper.add(mesh);
    this.meshGroup.add(wrapper);

    // Interaction
    if (opts.interactive) this._setupInteraction(canvas);

    // Resize observer
    this._resizeObs = new ResizeObserver(() => this._onResize());
    this._resizeObs.observe(container);

    // Start render loop
    this._animate = this._animate.bind(this);
    this._rafId = requestAnimationFrame(this._animate);
  }

  _animate(time) {
    if (this._destroyed) return;
    this._rafId = requestAnimationFrame(this._animate);

    const delta = this._lastTime ? (time - this._lastTime) / 1000 : 0.016;
    this._lastTime = time;
    this._elapsed += delta * this.opts.animateSpeed;

    // Intro animation
    if (!this._introComplete) {
      this._introProgress = Math.min(1, this._introProgress + delta / this.opts.introDuration);
      const t = 1 - Math.pow(1 - this._introProgress, 4); // easeOutQuart
      const canvas = this.renderer.domElement;

      if (this.opts.intro === 'zoom') {
        this.camera.position.z = 18 + (this.opts.zoom - 18) * t;
        canvas.style.opacity = String(Math.min(1, t * 1.5));
      } else if (this.opts.intro === 'fade') {
        this.camera.position.z = this.opts.zoom;
        canvas.style.opacity = String(t);
      }

      if (this._introProgress >= 1) {
        this._introComplete = true;
        canvas.style.opacity = '1';
        this.camera.position.z = this.opts.zoom;
      }
    }

    // Loop animation
    const e = this._elapsed;
    const ag = this.animGroup;
    switch (this.opts.animate) {
      case 'spin':
        ag.rotation.y += delta * 0.5 * this.opts.animateSpeed;
        break;
      case 'float':
        ag.position.y = Math.sin(e * 1.5) * 0.3;
        break;
      case 'pulse': {
        const p = 1 + Math.sin(e * 2) * 0.05;
        ag.scale.setScalar(p);
        break;
      }
      case 'wobble':
        ag.rotation.z = Math.sin(e * 2) * 0.1;
        break;
      case 'spinFloat':
        ag.rotation.y += delta * 0.4 * this.opts.animateSpeed;
        ag.position.y = Math.sin(e * 1.2) * 0.25;
        break;
      case 'swing':
        ag.rotation.y = Math.sin(e * 1.5) * 0.26;
        break;
    }

    // Drag momentum
    if (!this._isDragging) {
      this._velocity.x *= 0.92;
      this._velocity.y *= 0.92;
      if (Math.abs(this._velocity.x) > 0.0001) this._baseRotation.x += this._velocity.x;
      if (Math.abs(this._velocity.y) > 0.0001) this._baseRotation.y += this._velocity.y;
    }

    // Smooth rotation
    const mg = this.meshGroup;
    mg.rotation.x += (this._baseRotation.x - mg.rotation.x) * 0.08;
    mg.rotation.y += (this._baseRotation.y - mg.rotation.y) * 0.08;

    // Responsive zoom
    if (this._introComplete) {
      const aspect = this.container.clientWidth / (this.container.clientHeight || 1);
      const factor = aspect < 1 ? 1 / aspect : 1;
      const targetZ = this.opts.zoom * factor;
      this.camera.position.z += (targetZ - this.camera.position.z) * 0.08;
    }

    this.renderer.render(this.scene, this.camera);
  }

  _setupInteraction(canvas) {
    const onDown = (e) => {
      this._isDragging = true;
      this._lastPointer = { x: e.clientX, y: e.clientY };
      this._velocity = { x: 0, y: 0 };
    };
    const onMove = (e) => {
      if (!this._isDragging) return;
      const dx = e.clientX - this._lastPointer.x;
      const dy = e.clientY - this._lastPointer.y;
      this._lastPointer = { x: e.clientX, y: e.clientY };
      this._baseRotation.x += dy * 0.01;
      this._baseRotation.y += dx * 0.01;
      this._velocity = { x: dy * 0.01, y: dx * 0.01 };
    };
    const onUp = () => { this._isDragging = false; };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onUp);

    // Touch support (prevent scroll while dragging)
    canvas.style.touchAction = 'none';

    this._cleanupInput = () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onUp);
    };
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  destroy() {
    this._destroyed = true;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._resizeObs) this._resizeObs.disconnect();
    if (this._cleanupInput) this._cleanupInput();

    // Dispose Three.js resources
    this.scene?.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    this.renderer?.dispose();
    this.renderer?.domElement?.remove();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
window.SVG3D = {
  create(container, options) {
    return new SVG3DRenderer(container, options);
  }
};

export { SVG3DRenderer };
export default { create: (c, o) => new SVG3DRenderer(c, o) };
