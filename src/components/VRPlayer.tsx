import { onMount, onCleanup, createEffect } from 'solid-js';
import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

interface VRPlayerProps {
  videoElement: HTMLVideoElement | null;
  compatibilityMode: boolean;
}

export default function VRPlayer(props: VRPlayerProps) {
  let containerRef!: HTMLDivElement;
  let renderer: THREE.WebGLRenderer | undefined;

  onMount(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    containerRef.appendChild(renderer.domElement);

    // Detect the GPU's hard max texture size limit
    const gl = renderer.getContext();
    const MAX_TEXTURE = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    // Stay safely under the limit (leave headroom)
    const SAFE_MAX = Math.min(MAX_TEXTURE - 256, 3840);

    // Style and add the VR button
    const vrButton = VRButton.createButton(renderer);
    vrButton.style.zIndex = '100';
    vrButton.style.bottom = '20px';
    vrButton.style.left = '50%';
    vrButton.style.transform = 'translateX(-50%)';
    vrButton.style.position = 'absolute';
    vrButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    vrButton.style.backdropFilter = 'blur(10px)';
    vrButton.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    vrButton.style.color = 'white';
    vrButton.style.padding = '12px 24px';
    vrButton.style.borderRadius = '30px';
    vrButton.style.fontFamily = 'Inter, sans-serif';
    vrButton.style.fontWeight = '600';
    vrButton.style.cursor = 'pointer';
    vrButton.style.transition = 'all 0.3s ease';
    containerRef.appendChild(vrButton);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      if (renderer) renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Offscreen canvas used in compatibility mode
    let offscreenCanvas: HTMLCanvasElement | null = null;
    let offscreenCtx: CanvasRenderingContext2D | null = null;

    let currentTexture: THREE.VideoTexture | THREE.CanvasTexture | undefined;
    let sphereMesh: THREE.Mesh | undefined;
    // Track the animation frame handle for the compat mode loop
    let compatRafId: number | null = null;

    const stopCompatLoop = () => {
      if (compatRafId !== null) {
        cancelAnimationFrame(compatRafId);
        compatRafId = null;
      }
    };

    // Drives the offscreen canvas drawing loop for compatibility mode
    const startCompatLoop = (video: HTMLVideoElement) => {
      stopCompatLoop();
      const draw = () => {
        if (!offscreenCtx || !offscreenCanvas || video.paused || video.ended) {
          compatRafId = requestAnimationFrame(draw);
          return;
        }
        // Draw the video frame scaled to the safe canvas dimensions
        offscreenCtx.drawImage(video, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
        if (currentTexture) {
          currentTexture.needsUpdate = true;
        }
        compatRafId = requestAnimationFrame(draw);
      };
      compatRafId = requestAnimationFrame(draw);
    };

    const buildSphere = (texture: THREE.VideoTexture | THREE.CanvasTexture) => {
      if (sphereMesh) scene.remove(sphereMesh);
      const geometry = new THREE.SphereGeometry(500, 60, 40);
      geometry.scale(-1, 1, 1); // Invert so faces point inward
      const material = new THREE.MeshBasicMaterial({ map: texture });
      sphereMesh = new THREE.Mesh(geometry, material);
      scene.add(sphereMesh);
    };

    createEffect(() => {
      const video = props.videoElement;
      const compat = props.compatibilityMode;

      if (!video) return;

      stopCompatLoop();

      if (compat) {
        // --- COMPATIBILITY MODE: Route through offscreen canvas ---
        // Calculate safe canvas dimensions matching video's aspect ratio
        const vidW = video.videoWidth || 3840;
        const vidH = video.videoHeight || 1920;
        const aspect = vidW / vidH;

        let canvasW = Math.min(vidW, SAFE_MAX);
        let canvasH = Math.round(canvasW / aspect);

        // If height still exceeds limit, clamp that too
        if (canvasH > SAFE_MAX) {
          canvasH = SAFE_MAX;
          canvasW = Math.round(canvasH * aspect);
        }

        offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = canvasW;
        offscreenCanvas.height = canvasH;
        offscreenCtx = offscreenCanvas.getContext('2d');

        currentTexture = new THREE.CanvasTexture(offscreenCanvas);
        currentTexture.colorSpace = THREE.SRGBColorSpace;
        buildSphere(currentTexture);
        startCompatLoop(video);
      } else {
        // --- NORMAL MODE: Standard VideoTexture (efficient, full quality) ---
        offscreenCanvas = null;
        offscreenCtx = null;
        currentTexture = new THREE.VideoTexture(video);
        currentTexture.colorSpace = THREE.SRGBColorSpace;
        buildSphere(currentTexture);
      }
    });

    const light = new THREE.AmbientLight(0xffffff, 1);
    scene.add(light);

    const render = () => {
      if (renderer) renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(render);

    onCleanup(() => {
      stopCompatLoop();
      window.removeEventListener('resize', handleResize);
      if (renderer) {
        renderer.setAnimationLoop(null);
        renderer.dispose();
      }
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
      }}
    />
  );
}
