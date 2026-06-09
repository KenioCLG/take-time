/**
 * svg3d.js — Lightweight 3D SVG renderer (vanilla JS)
 * Inspired by 3dsvg.design (MIT) by Renato Costa
 * Uses Three.js + SVGLoader for SVG extrusion, PBR materials, and animations.
 */

import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Material Presets
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
// Environment Map Generator (for realistic reflections on metallic materials)
// ---------------------------------------------------------------------------
function createEnvironmentMap(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileCubemapShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color('#0a0a12');

  // Sky dome
  const skyGeo = new THREE.SphereGeometry(50, 32, 32);
  const skyMat = new THREE.MeshBasicMaterial({ color: '#0a0a12', side: THREE.BackSide });
  envScene.add(new THREE.Mesh(skyGeo, skyMat));

  // Top light sphere (key light reflection)
  const topGeo = new THREE.SphereGeometry(20, 16, 16);
  const topMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const topLight = new THREE.Mesh(topGeo, topMat);
  topLight.position.set(0, 25, 0);
  envScene.add(topLight);

  // Front fill
  const frontGeo = new THREE.SphereGeometry(15, 16, 16);
  const frontMat = new THREE.MeshBasicMaterial({ color: '#555555' });
  const frontFill = new THREE.Mesh(frontGeo, frontMat);
  frontFill.position.set(0, 0, 30);
  envScene.add(frontFill);

  // Side accent
  const sideGeo = new THREE.SphereGeometry(10, 16, 16);
  const sideMat = new THREE.MeshBasicMaterial({ color: '#333333' });
  const sideFill = new THREE.Mesh(sideGeo, sideMat);
  sideFill.position.set(-20, 5, 10);
  envScene.add(sideFill);

  const envMap = pmrem.fromScene(envScene, 0.04).texture;

  // Cleanup
  pmrem.dispose();
  skyGeo.dispose(); skyMat.dispose();
  topGeo.dispose(); topMat.dispose();
  frontGeo.dispose(); frontMat.dispose();
  sideGeo.dispose(); sideMat.dispose();

  return envMap;
}

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
    const fillVal = style?.fill;
    // Treat as filled if: explicit fill color, OR no fill/stroke set at all (SVG default is black fill)
    const hasFill = fillVal && fillVal !== 'none' && fillVal !== 'transparent';
    const noFillAttr = !fillVal || fillVal === '';
    const hasStroke = style?.stroke && style.stroke !== 'none' && style.stroke !== 'transparent';

    if (hasFill || (noFillAttr && !hasStroke)) {
      SVGLoader.createShapes(path).forEach(shape => {
        // Skip shapes that cover the entire viewBox (backgrounds)
        if (vbW && vbH) {
          const bb = new THREE.Box2();
          shape.getPoints(12).forEach(p => bb.expandByPoint(p));
          const sz = new THREE.Vector2();
          bb.getSize(sz);
          if (Math.abs(sz.x - vbW) / vbW < 0.05 && Math.abs(sz.y - vbH) / vbH < 0.05) return;
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
// Extrude + Merge (using BufferGeometryUtils)
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

  let merged;
  if (geos.length === 1) {
    merged = geos[0];
  } else {
    merged = BufferGeometryUtils.mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());
  }

  if (!merged) return null;

  merged.computeBoundingBox();
  merged.computeVertexNormals();

  return merged;
}

// ---------------------------------------------------------------------------
// SVG3D Renderer Class
// ---------------------------------------------------------------------------
class SVG3DRenderer {
  constructor(container, opts = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.opts = Object.assign({
      svg: null,           // SVG string or URL path
      color: '#ffffff',
      material: 'default',
      depth: 1,
      smoothness: 0.2,
      animate: 'float',    // none, spin, float, pulse, spinFloat, wobble, swing
      animateSpeed: 1,
      zoom: 8,
      fov: 50,
      interactive: true,
      background: 'transparent',
      lightIntensity: 1.2,
      ambientIntensity: 0.4,
      intro: 'zoom',       // zoom, fade, none
      introDuration: 2.0,
      onReady: null,       // callback when first frame renders
    }, opts);

    this._destroyed = false;
    this._elapsed = 0;
    this._introProgress = 0;
    this._introComplete = false;
    this._isDragging = false;
    this._lastPointer = { x: 0, y: 0 };
    this._velocity = { x: 0, y: 0 };
    this._baseRotation = { x: 0, y: 0 };
    this._lastTime = 0;

    this._init();
  }

  async _init() {
    const { container, opts } = this;
    if (!container) { console.warn('SVG3D: container not found'); return; }

    const w = container.clientWidth || 200;
    const h = container.clientHeight || 200;
    const dpr = Math.min(window.devicePixelRatio, 2);

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    const startZoom = opts.intro === 'zoom' ? 16 : opts.zoom;
    this.camera = new THREE.PerspectiveCamera(opts.fov, w / h, 0.1, 100);
    this.camera.position.z = startZoom;

    // Renderer
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'default',
        failIfMajorPerformanceCaveat: false,
      });
    } catch (e) {
      console.warn('SVG3D: WebGL not available', e);
      return;
    }

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
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    // Environment map (critical for metallic materials)
    this.envMap = createEnvironmentMap(this.renderer);
    this.scene.environment = this.envMap;

    // Lighting
    this.scene.add(new THREE.AmbientLight(0xffffff, opts.ambientIntensity));

    const keyLight = new THREE.DirectionalLight(0xffffff, opts.lightIntensity);
    keyLight.position.set(5, 8, 5);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-5, 3, -3);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.2);
    rimLight.position.set(0, -4, 6);
    this.scene.add(rimLight);

    const topPoint = new THREE.PointLight(0xffffff, 0.3);
    topPoint.position.set(0, 5, 0);
    this.scene.add(topPoint);

    this.scene.add(new THREE.HemisphereLight(0xb1e1ff, 0xb97a20, 0.5));

    // Animation group (for loop animations like float)
    this.animGroup = new THREE.Group();
    this.scene.add(this.animGroup);

    // Mesh group (for drag rotation)
    this.meshGroup = new THREE.Group();
    this.animGroup.add(this.meshGroup);

    // Load SVG — detect URLs (absolute, relative, or bare paths)
    let svgString = opts.svg;
    if (svgString && !svgString.trim().startsWith('<')) {
      // It's a URL/path, not inline SVG
      try {
        const resp = await fetch(svgString);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        svgString = await resp.text();
      } catch (e) {
        console.warn('SVG3D: Failed to load SVG from', opts.svg, e);
        return;
      }
    }

    if (!svgString || this._destroyed) return;

    // Parse + Extrude
    const shapes = parseSVGToShapes(svgString);
    if (!shapes.length) {
      console.warn('SVG3D: No shapes found in SVG');
      return;
    }

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
      side: THREE.DoubleSide,
      envMap: this.envMap,
      envMapIntensity: 1.5,
    });

    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(-center.x, -center.y, -center.z);

    const wrapper = new THREE.Group();
    wrapper.scale.set(scale, -scale, scale); // flip Y (SVG coordinate system)
    wrapper.add(mesh);
    this.meshGroup.add(wrapper);

    // Interaction
    if (opts.interactive) this._setupInteraction(canvas);

    // Resize observer
    this._resizeObs = new ResizeObserver(() => this._onResize());
    this._resizeObs.observe(container);

    // Start render loop
    this._readyFired = false;
    this._animate = this._animate.bind(this);
    this._rafId = requestAnimationFrame(this._animate);
  }

  _animate(time) {
    if (this._destroyed) return;
    this._rafId = requestAnimationFrame(this._animate);

    const delta = this._lastTime ? (time - this._lastTime) / 1000 : 0.016;
    this._lastTime = time;
    if (delta > 0.1) return; // skip large gaps (tab switch)

    // Fire onReady after first render
    if (!this._readyFired) {
      this._readyFired = true;
      if (typeof this.opts.onReady === 'function') this.opts.onReady();
    }

    this._elapsed += delta * this.opts.animateSpeed;

    // Intro animation
    if (!this._introComplete) {
      this._introProgress = Math.min(1, this._introProgress + delta / this.opts.introDuration);
      const t = 1 - Math.pow(1 - this._introProgress, 4); // easeOutQuart
      const canvas = this.renderer.domElement;

      if (this.opts.intro === 'zoom') {
        this.camera.position.z = 16 + (this.opts.zoom - 16) * t;
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

    // Smooth rotation lerp
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
    if (w === 0 || h === 0 || !this.camera || !this.renderer) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  destroy() {
    this._destroyed = true;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._resizeObs) this._resizeObs.disconnect();
    if (this._cleanupInput) this._cleanupInput();
    if (this.envMap) this.envMap.dispose();

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
