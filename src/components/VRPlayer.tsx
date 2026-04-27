import { onMount, onCleanup, createEffect } from 'solid-js';
import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface VRPlayerProps {
  videoElement: HTMLVideoElement | null;
  compatibilityMode: boolean;
}

export default function VRPlayer(props: VRPlayerProps) {
  let containerRef!: HTMLDivElement;

  onMount(() => {
    // ── Scene Setup ──────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    // Camera sits at the center of the sphere
    camera.position.set(0, 0, 0.001); // tiny offset so OrbitControls doesn't get confused

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    containerRef.appendChild(renderer.domElement);

    // Detect GPU's hard max texture size and stay safely below it
    const gl = renderer.getContext();
    const MAX_TEXTURE = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const SAFE_MAX = Math.min(MAX_TEXTURE - 256, 3840);

    // ── Orbit Controls (drag / pinch to look around) ──────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;       // No zoom — we're inside the sphere
    controls.enablePan = false;        // No panning
    controls.rotateSpeed = -0.3;       // Negative = natural drag direction for inside-sphere view
    controls.target.set(0, 0, 0);
    controls.update();

    // ── Device Orientation (gyroscope) for mobile ─────────────────────
    let deviceOrientationActive = false;
    const euler = new THREE.Euler();
    const quaternion = new THREE.Quaternion();
    // Rotation to convert device orientation to Three.js coordinate system
    const screenTransform = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha === null) return;
      // Disable orbit controls when gyroscope is active so they don't fight
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
      // iOS 13+ requires explicit permission
      if (typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission === 'function') {
        try {
          const permission = await (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
          if (permission === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation, true);
          }
        } catch {
          // Permission denied or not supported, fall back to drag controls
        }
      } else {
        // Android — no permission needed
        window.addEventListener('deviceorientation', handleOrientation, true);
      }
    };

    // Only try gyro on touch devices
    if ('ontouchstart' in window) {
      requestGyro();
    }

    // ── VR Button ─────────────────────────────────────────────────────
    const vrButton = VRButton.createButton(renderer);
    Object.assign(vrButton.style, {
      zIndex: '100',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      position: 'absolute',
      backgroundColor: 'rgba(255,255,255,0.12)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.25)',
      color: 'white',
      padding: '12px 28px',
      borderRadius: '30px',
      fontFamily: 'Inter, sans-serif',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
    });
    containerRef.appendChild(vrButton);

    // ── Resize Handler ────────────────────────────────────────────────
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // ── Sphere Geometry (shared, re-used for both modes) ──────────────
    const geometry = new THREE.SphereGeometry(500, 72, 48);
    geometry.scale(-1, 1, 1); // Invert — faces point inward for 360° viewing

    let sphereMesh: THREE.Mesh | null = null;
    let canvasRafId: number | null = null;
    let offscreenCanvas: HTMLCanvasElement | null = null;
    let offscreenCtx: CanvasRenderingContext2D | null = null;
    let currentTexture: THREE.Texture | null = null;

    const stopCanvasLoop = () => {
      if (canvasRafId !== null) {
        cancelAnimationFrame(canvasRafId);
        canvasRafId = null;
      }
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
      // Correct texture settings for a video/canvas mapped to the inside of a sphere
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;  // Avoids mipmap artifacts on video
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;          // Video textures must NOT generate mipmaps

      currentTexture = texture;

      if (sphereMesh) scene.remove(sphereMesh);
      const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide });
      sphereMesh = new THREE.Mesh(geometry, material);
      scene.add(sphereMesh);
    };

    // ── Reactive: swap texture strategy based on props ────────────────
    createEffect(() => {
      const video = props.videoElement;
      const compat = props.compatibilityMode;

      if (!video) return;

      stopCanvasLoop();

      if (compat) {
        // --- COMPATIBILITY MODE ---
        // Route video through an offscreen canvas clamped to SAFE_MAX
        // This prevents the GPU from refusing to paint an oversized texture
        const vidW = video.videoWidth  || 3840;
        const vidH = video.videoHeight || 1920;
        const aspect = vidW / vidH;

        let cW = Math.min(vidW, SAFE_MAX);
        let cH = Math.round(cW / aspect);
        if (cH > SAFE_MAX) { cH = SAFE_MAX; cW = Math.round(cH * aspect); }

        offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width  = cW;
        offscreenCanvas.height = cH;
        offscreenCtx = offscreenCanvas.getContext('2d');

        const canvasTex = new THREE.CanvasTexture(offscreenCanvas);
        buildSphere(canvasTex);
        startCanvasLoop(video);
      } else {
        // --- NORMAL MODE ---
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
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        'z-index': 10,
        background: '#000',
        overflow: 'hidden',
        cursor: 'grab',
      }}
    />
  );
}
