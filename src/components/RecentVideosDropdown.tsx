import { createSignal, onMount, For, Show } from 'solid-js';
import { getRecentVideos } from '../lib/storage';
import type { VideoMetadata } from '../lib/storage';
import { PlayCircle, Clock, FileVideo } from 'lucide-solid';

interface Props {
  onSelect: (video: VideoMetadata) => void;
}

export default function RecentVideosDropdown(props: Props) {
  const [recentVideos, setRecentVideos] = createSignal<VideoMetadata[]>([]);
  const [isOpen, setIsOpen] = createSignal(false);

  onMount(async () => {
    const videos = await getRecentVideos();
    setRecentVideos(videos);
  });

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSelect = (video: VideoMetadata) => {
    setIsOpen(false);
    props.onSelect(video);
  };

  return (
    <Show when={recentVideos().length > 0}>
      <div class="dropdown-container">
        <button 
          class="dropdown-trigger" 
          onClick={() => setIsOpen(!isOpen())}
        >
          <Clock size={18} />
          <span>Resume Recent</span>
        </button>
        
        <Show when={isOpen()}>
          <div class="dropdown-menu">
            <div class="dropdown-header">Continue Watching</div>
            <div class="dropdown-list">
              <For each={recentVideos()}>
                {(video) => (
                  <button 
                    class="dropdown-item" 
                    onClick={() => handleSelect(video)}
                  >
                    <div class="item-icon">
                      <FileVideo size={20} />
                    </div>
                    <div class="item-details">
                      <span class="item-name">{video.filename}</span>
                      <div class="item-meta">
                        <PlayCircle size={12} />
                        <span>Left off at {formatTime(video.lastTime)}</span>
                        {video.duration > 0 && <span> / {formatTime(video.duration)}</span>}
                      </div>
                    </div>
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}
