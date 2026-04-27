import { onMount, onCleanup, createEffect } from 'solid-js';
import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface VRPlayerProps {
  videoElement: HTMLVideoElement | null;
  compatibilityMode: boolean;
  fov: number;
  onFovChange: (delta: number) => void;
}

export default function VRPlayer(props: VRPlayerProps) {
  let containerRef!: HTMLDivElement;

  onMount(() => {
    // ── Scene Setup ──────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(props.fov, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 0, 0.001);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    containerRef.appendChild(renderer.domElement);

    // Detect GPU hard max texture size
    const gl = renderer.getContext();
    const MAX_TEXTURE = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const SAFE_MAX = Math.min(MAX_TEXTURE - 256, 3840);

    // ── Orbit Controls (drag / touch-swipe to look around) ───────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;  // Zoom via FOV, not orbit distance
    controls.enablePan = false;
    controls.rotateSpeed = -0.3;  // Negative = natural inside-sphere drag direction
    controls.target.set(0, 0, 0);
    controls.update();

    // ── Reactive: update FOV when prop changes ────────────────────────
    // (Called both from pinch/scroll here AND from buttons in PlayerControls)
    createEffect(() => {
      camera.fov = props.fov;
      camera.updateProjectionMatrix();
    });

    // ── Scroll Wheel Zoom (desktop) ───────────────────────────────────
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Positive delta = scroll down = zoom out (increase FOV)
      props.onFovChange(e.deltaY * 0.05);
    };
    containerRef.addEventListener('wheel', handleWheel, { passive: false });

    // ── Pinch Zoom (mobile) ───────────────────────────────────────────
    let lastPinchDist = 0;
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        lastPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const delta = (lastPinchDist - dist) * 0.3; // Pinch in = zoom in = reduce FOV
        props.onFovChange(delta);
        lastPinchDist = dist;
      }
    };
    containerRef.addEventListener('touchstart', handleTouchStart, { passive: true });
    containerRef.addEventListener('touchmove', handleTouchMove, { passive: true });

    // ── Device Orientation (gyroscope) for mobile ─────────────────────
    let deviceOrientationActive = false;
    const euler = new THREE.Euler();
    const quaternion = new THREE.Quaternion();
    const screenTransform = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha === null) return;
      controls.enabled = false;
      deviceOrientationActive = true;
      const alpha = THREE.MathUtils.degToRad(event.alpha ?? 0);
      const beta  = THREE.MathUtils.degToRad(event.beta  ?? 0);
      const gamma = THREE.MathUtils.degToRad(event.gamma ?? 0);
      euler.set(beta, alpha, -gamma, 'YXZ');
      quaternion.setFromEuler(euler);
      quaternion.multiply(screenTransform);
      camera.quaternion.copy(quaternion);
    };

    const requestGyro = async () => {
      if (typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission === 'function') {
        try {
          const perm = await (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
          if (perm === 'granted') window.addEventListener('deviceorientation', handleOrientation, true);
        } catch { /* fall back to drag controls */ }
      } else {
        window.addEventListener('deviceorientation', handleOrientation, true);
      }
    };
    if ('ontouchstart' in window) requestGyro();

    // ── VR Button ─────────────────────────────────────────────────────
    const vrButton = VRButton.createButton(renderer);
    Object.assign(vrButton.style, {
      zIndex: '200', bottom: '90px', left: '50%',
      transform: 'translateX(-50%)', position: 'absolute',
      backgroundColor: 'rgba(255,255,255,0.12)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.25)',
      color: 'white', padding: '12px 28px', borderRadius: '30px',
      fontFamily: 'Inter, sans-serif', fontWeight: '600',
      cursor: 'pointer', transition: 'all 0.3s ease',
    });
    containerRef.appendChild(vrButton);

    // ── Resize Handler ────────────────────────────────────────────────
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Sphere geometry — BackSide renders inner faces without flipping UVs,
    // giving a correct equirectangular 360° projection from the center.
    const geometry = new THREE.SphereGeometry(500, 72, 48);

    let sphereMesh: THREE.Mesh | null = null;
    let canvasRafId: number | null = null;
    let offscreenCanvas: HTMLCanvasElement | null = null;
    let offscreenCtx: CanvasRenderingContext2D | null = null;
    let currentTexture: THREE.Texture | null = null;

    const stopCanvasLoop = () => {
      if (canvasRafId !== null) { cancelAnimationFrame(canvasRafId); canvasRafId = null; }
    };

    const startCanvasLoop = (video: HTMLVideoElement) => {
      stopCanvasLoop();
      const draw = () => {
        if (offscreenCtx && offscreenCanvas && !video.paused && !video.ended) {
          offscreenCtx.drawImage(video, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
          if (currentTexture) currentTexture.needsUpdate = true;
        }
        canvasRafId = requestAnimationFrame(draw);
      };
      canvasRafId = requestAnimationFrame(draw);
    };

    const buildSphere = (texture: THREE.Texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      currentTexture = texture;
      if (sphereMesh) scene.remove(sphereMesh);
      const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
      sphereMesh = new THREE.Mesh(geometry, material);
      scene.add(sphereMesh);
    };

    // ── Reactive: swap texture when video/mode changes ────────────────
    createEffect(() => {
      const video = props.videoElement;
      const compat = props.compatibilityMode;
      if (!video) return;

      stopCanvasLoop();

      if (compat) {
        const vidW = video.videoWidth  || 3840;
        const vidH = video.videoHeight || 1920;
        const aspect = vidW / vidH;
        let cW = Math.min(vidW, SAFE_MAX);
        let cH = Math.round(cW / aspect);
        if (cH > SAFE_MAX) { cH = SAFE_MAX; cW = Math.round(cH * aspect); }

        offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = cW;
        offscreenCanvas.height = cH;
        offscreenCtx = offscreenCanvas.getContext('2d');
        const canvasTex = new THREE.CanvasTexture(offscreenCanvas);
        buildSphere(canvasTex);
        startCanvasLoop(video);
      } else {
        offscreenCanvas = null;
        offscreenCtx = null;
        const videoTex = new THREE.VideoTexture(video);
        buildSphere(videoTex);
      }
    });

    // ── Render Loop ───────────────────────────────────────────────────
    renderer.setAnimationLoop(() => {
      if (!deviceOrientationActive) controls.update();
      renderer.render(scene, camera);
    });

    // ── Cleanup ───────────────────────────────────────────────────────
    onCleanup(() => {
      stopCanvasLoop();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('deviceorientation', handleOrientation, true);
      containerRef.removeEventListener('wheel', handleWheel);
      containerRef.removeEventListener('touchstart', handleTouchStart);
      containerRef.removeEventListener('touchmove', handleTouchMove);
      renderer.setAnimationLoop(null);
      controls.dispose();
      geometry.dispose();
      renderer.dispose();
      containerRef.innerHTML = '';
    });
  });

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: '100%',
        'z-index': 10, background: '#000',
        overflow: 'hidden', cursor: 'grab',
      }}
    />
  );
}
