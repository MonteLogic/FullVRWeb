/// <reference types="wicg-file-system-access" />
import { createSignal, createEffect, onCleanup, Show } from 'solid-js';
import VRPlayer from './components/VRPlayer';
import PlayerControls from './components/PlayerControls';
import RecentVideosDropdown from './components/RecentVideosDropdown';
import { saveVideoMetadata, updateVideoTime, supportsFileSystemAccess } from './lib/storage';
import type { VideoMetadata } from './lib/storage';
import { Upload, Smartphone } from 'lucide-solid';

// FOV clamp limits (degrees). Lower = more zoomed in, higher = wider view.
const MIN_FOV = 30;
const MAX_FOV = 110;

function App() {
  const [videoElement, setVideoElement] = createSignal<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [currentVideoId, setCurrentVideoId] = createSignal<string | null>(null);
  const [compatibilityMode, setCompatibilityMode] = createSignal(false);
  const [fov, setFov] = createSignal(60); // 60° feels natural on flat screens; wider in headset

  let hiddenVideoRef!: HTMLVideoElement;

  const handleFovChange = (delta: number) => {
    setFov(f => Math.min(MAX_FOV, Math.max(MIN_FOV, f + delta)));
  };

  const loadVideoFile = async (
    file: File,
    handle: FileSystemFileHandle | null,
    startTime: number = 0
  ) => {
    const url = URL.createObjectURL(file);
    hiddenVideoRef.src = url;
    hiddenVideoRef.currentTime = startTime;
    hiddenVideoRef.play();

    setVideoElement(hiddenVideoRef);
    setIsPlaying(true);
    setCurrentVideoId(file.name);

    // ALWAYS save metadata regardless of FS API support so recent videos work
    await saveVideoMetadata({
      id: file.name,
      filename: file.name,
      lastTime: startTime,
      duration: hiddenVideoRef.duration || 0,
      lastWatched: Date.now(),
      handle: supportsFileSystemAccess ? handle : null,
    });
  };

  const handleFileUpload = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      await loadVideoFile(target.files[0], null);
    }
  };

  const handleNativeFilePick = async () => {
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: 'Videos', accept: { 'video/*': ['.mp4', '.webm', '.mkv', '.avi', '.mov'] } }],
      });
      const file = await fileHandle.getFile();
      await loadVideoFile(file, fileHandle);
    } catch (err) {
      console.log('File pick cancelled or failed:', err);
    }
  };

  const handleResumeVideo = async (meta: VideoMetadata) => {
    try {
      if (meta.handle && supportsFileSystemAccess) {
        // Request file permission if needed
        const options: FileSystemHandlePermissionDescriptor = { mode: 'read' };
        if ((await meta.handle.queryPermission(options)) !== 'granted') {
          if ((await meta.handle.requestPermission(options)) !== 'granted') {
            alert('Permission denied.');
            return;
          }
        }
        const file = await meta.handle.getFile();
        await loadVideoFile(file, meta.handle, meta.lastTime);
      } else {
        // No stored handle (loaded via <input> or non-HTTPS) — ask user to re-pick
        // We'll jump to the saved time automatically after they pick the file
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) await loadVideoFile(file, null, meta.lastTime);
        };
        input.click();
      }
    } catch (error) {
      console.error('Error resuming video:', error);
      alert('Could not resume. The file may have been moved or deleted.');
    }
  };

  // Periodically save play time
  createEffect(() => {
    let interval: number;
    if (isPlaying() && currentVideoId()) {
      interval = window.setInterval(() => {
        if (hiddenVideoRef) {
          updateVideoTime(currentVideoId()!, hiddenVideoRef.currentTime, hiddenVideoRef.duration || 0);
        }
      }, 5000);
    }
    onCleanup(() => { if (interval) clearInterval(interval); });
  });

  const exitPlayer = () => {
    hiddenVideoRef.pause();
    setVideoElement(null);
    setIsPlaying(false);
  };

  return (
    <div class="app-container">
      <video
        ref={hiddenVideoRef}
        style={{ display: 'none' }}
        crossorigin="anonymous"
        loop
        playsinline
      />

      <Show when={isPlaying()} fallback={
        <div class="hero-section">
          <div class="glass-panel">
            <h1>Immersive VR Player</h1>
            <p>Experience your local 360° &amp; VR videos in full immersion.</p>

            {/* Compatibility Mode Toggle */}
            <div class="compat-toggle-row">
              <div class="compat-label">
                <Smartphone size={16} />
                <span>Mobile Compatibility Mode</span>
              </div>
              <button
                class={`toggle-btn ${compatibilityMode() ? 'active' : ''}`}
                onClick={() => setCompatibilityMode(v => !v)}
                title="Enable to fix 4K VR black screen on mobile GPUs"
              >
                <span class="toggle-knob" />
              </button>
            </div>
            <Show when={compatibilityMode()}>
              <p class="compat-hint">⚡ On — 4K videos downscaled to fit your GPU. Fixes black screen on mobile.</p>
            </Show>

            <div class="actions">
              <Show when={supportsFileSystemAccess} fallback={
                <label class="btn-primary">
                  <Upload size={20} />
                  <span>Select Video File</span>
                  <input type="file" accept="video/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
              }>
                <button class="btn-primary" onClick={handleNativeFilePick}>
                  <Upload size={20} />
                  <span>Select Video File</span>
                </button>
              </Show>

              <RecentVideosDropdown onSelect={handleResumeVideo} />
            </div>
          </div>
        </div>
      }>
        {/* 3D VR Sphere */}
        <VRPlayer
          videoElement={videoElement()}
          compatibilityMode={compatibilityMode()}
          fov={fov()}
          onFovChange={handleFovChange}
        />

        {/* Playback controls — position:fixed, no wrapper needed */}
        <PlayerControls
          videoElement={videoElement()}
          onZoomIn={() => handleFovChange(-10)}
          onZoomOut={() => handleFovChange(10)}
        />

        {/* Exit button */}
        <button class="btn-close" onClick={exitPlayer}>
          Exit Player
        </button>
      </Show>
    </div>
  );
}

export default App;
