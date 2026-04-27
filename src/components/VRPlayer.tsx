import { onMount, onCleanup, createEffect } from 'solid-js';
import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

interface VRPlayerProps {
  videoElement: HTMLVideoElement | null;
}

export default function VRPlayer(props: VRPlayerProps) {
  let containerRef!: HTMLDivElement;
  let renderer: THREE.WebGLRenderer | undefined;

  onMount(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 2000);
    // Camera is at origin
    camera.position.set(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    containerRef.appendChild(renderer.domElement);

    // Setup VR Button
    const vrButton = VRButton.createButton(renderer);
    // Add custom styling to VR button
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

    let videoTexture: THREE.VideoTexture | undefined;
    let sphereMesh: THREE.Mesh | undefined;

    createEffect(() => {
      if (props.videoElement) {
        if (sphereMesh) {
          scene.remove(sphereMesh);
        }

        const geometry = new THREE.SphereGeometry(500, 60, 40);
        // Invert geometry on x-axis so that all faces point inward
        geometry.scale(-1, 1, 1);

        videoTexture = new THREE.VideoTexture(props.videoElement);
        videoTexture.colorSpace = THREE.SRGBColorSpace;
        
        const material = new THREE.MeshBasicMaterial({ map: videoTexture });
        sphereMesh = new THREE.Mesh(geometry, material);
        scene.add(sphereMesh);
      }
    });

    // Add lighting just in case, though MeshBasicMaterial doesn't strictly need it
    const light = new THREE.AmbientLight(0xffffff, 1);
    scene.add(light);

    // Render loop
    const render = () => {
      if (renderer) {
        renderer.render(scene, camera);
      }
    };
    renderer.setAnimationLoop(render);

    onCleanup(() => {
      window.removeEventListener('resize', handleResize);
      if (renderer) {
        renderer.setAnimationLoop(null);
        renderer.dispose();
      }
      containerRef.innerHTML = ''; // Clean up dom
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
        "z-index": 10,
        background: '#000',
        overflow: 'hidden'
      }} 
    />
  );
}
