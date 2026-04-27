/// <reference types="wicg-file-system-access" />
import { createSignal, createEffect, onCleanup, Show } from 'solid-js';
import VRPlayer from './components/VRPlayer';
import RecentVideosDropdown from './components/RecentVideosDropdown';
import { saveVideoMetadata, updateVideoTime, supportsFileSystemAccess } from './lib/storage';
import type { VideoMetadata } from './lib/storage';
import { Upload } from 'lucide-solid';

function App() {
  const [videoElement, setVideoElement] = createSignal<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [currentVideoId, setCurrentVideoId] = createSignal<string | null>(null);

  let hiddenVideoRef!: HTMLVideoElement;

  const loadVideoFile = async (file: File, handle: FileSystemFileHandle | null, startTime: number = 0) => {
    const url = URL.createObjectURL(file);
    hiddenVideoRef.src = url;
    hiddenVideoRef.currentTime = startTime;
    hiddenVideoRef.play();
    
    setVideoElement(hiddenVideoRef);
    setIsPlaying(true);
    setCurrentVideoId(file.name);

    if (supportsFileSystemAccess) {
      await saveVideoMetadata({
        id: file.name,
        filename: file.name,
        lastTime: startTime,
        duration: hiddenVideoRef.duration || 0,
        lastWatched: Date.now(),
        handle: handle,
      });
    }
  };

  const handleFileUpload = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      await loadVideoFile(file, null);
    }
  };

  const handleNativeFilePick = async () => {
    try {
      if (supportsFileSystemAccess) {
        const [fileHandle] = await window.showOpenFilePicker({
          types: [
            {
              description: 'Videos',
              accept: {
                'video/*': ['.mp4', '.webm', '.mkv', '.avi'],
              },
            },
          ],
        });
        const file = await fileHandle.getFile();
        await loadVideoFile(file, fileHandle);
      }
    } catch (err) {
      console.log('User cancelled or error picking file', err);
    }
  };

  const handleResumeVideo = async (meta: VideoMetadata) => {
    try {
      if (meta.handle && supportsFileSystemAccess) {
        // Request permission if not already granted
        const options: FileSystemHandlePermissionDescriptor = { mode: 'read' };
        if ((await meta.handle.queryPermission(options)) !== 'granted') {
          const permission = await meta.handle.requestPermission(options);
          if (permission !== 'granted') {
            alert('Permission to read file was denied.');
            return;
          }
        }
        
        const file = await meta.handle.getFile();
        await loadVideoFile(file, meta.handle, meta.lastTime);
      }
    } catch (error) {
      console.error('Error resuming video:', error);
      alert('Could not resume video. The file may have been moved or deleted.');
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
    
    onCleanup(() => {
      if (interval) clearInterval(interval);
    });
  });

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
            <p>Experience your local 360° & VR videos with zero lag.</p>
            
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
        <VRPlayer videoElement={videoElement()} />
        <button 
          class="btn-close"
          onClick={() => {
            hiddenVideoRef.pause();
            setVideoElement(null);
            setIsPlaying(false);
          }}
        >
          Exit Player
        </button>
      </Show>
    </div>
  );
}

export default App;
