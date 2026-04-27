import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { Play, Pause, ZoomIn, ZoomOut, Volume2, VolumeX } from 'lucide-solid';

interface PlayerControlsProps {
  videoElement: HTMLVideoElement | null;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export default function PlayerControls(props: PlayerControlsProps) {
  const [visible, setVisible] = createSignal(true);
  const [isPlaying, setIsPlaying] = createSignal(true);
  const [isMuted, setIsMuted] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [duration, setDuration] = createSignal(0);
  const [isSeeking, setIsSeeking] = createSignal(false);
  let hideTimer: number;

  const showControls = () => {
    setVisible(true);
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => setVisible(false), 5000);
  };

  onMount(() => {
    showControls();
    window.addEventListener('mousemove', showControls);
    // Tap anywhere (not on a button) to re-show controls on mobile
    document.addEventListener('pointerdown', showControls, { passive: true });

    // Poll video state — more reliable than events for cross-component sync
    const interval = window.setInterval(() => {
      const v = props.videoElement;
      if (!v) return;
      if (!isSeeking()) setCurrentTime(v.currentTime);
      if (v.duration && !isNaN(v.duration) && isFinite(v.duration)) {
        setDuration(v.duration);
      }
      setIsPlaying(!v.paused);
      setIsMuted(v.muted);
    }, 200);

    onCleanup(() => {
      window.removeEventListener('mousemove', showControls);
      document.removeEventListener('pointerdown', showControls);
      clearTimeout(hideTimer);
      clearInterval(interval);
    });
  });

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const togglePlay = () => {
    const v = props.videoElement;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
    showControls();
  };

  const toggleMute = () => {
    const v = props.videoElement;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
    showControls();
  };

  // Seeking: update display immediately while dragging, commit on release
  const handleSeekInput = (e: Event) => {
    setIsSeeking(true);
    setCurrentTime(parseFloat((e.target as HTMLInputElement).value));
    showControls();
  };

  const handleSeekChange = (e: Event) => {
    const v = props.videoElement;
    if (!v) return;
    v.currentTime = parseFloat((e.target as HTMLInputElement).value);
    setIsSeeking(false);
    showControls();
  };

  const progress = () => duration() > 0 ? (currentTime() / duration()) * 100 : 0;

  return (
    <div
      class={`player-controls-overlay ${visible() ? 'controls-visible' : 'controls-hidden'}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Seek bar row */}
      <div class="seek-row">
        <span class="time-label">{formatTime(currentTime())}</span>
        <div class="seek-track">
          <div class="seek-fill" style={{ width: `${progress()}%` }} />
          <input
            type="range"
            class="seek-input"
            min={0}
            max={duration() || 100}
            value={currentTime()}
            step={0.5}
            onInput={handleSeekInput}
            onChange={handleSeekChange}
          />
        </div>
        <span class="time-label">{formatTime(duration())}</span>
      </div>

      {/* Button row */}
      <div class="controls-btn-row">
        <button class="ctrl-btn" title="Zoom Out" onClick={() => { props.onZoomOut(); showControls(); }}>
          <ZoomOut size={20} />
        </button>

        <button class="ctrl-btn ctrl-btn-play" title="Play / Pause" onClick={togglePlay}>
          <Show when={isPlaying()} fallback={<Play size={24} />}>
            <Pause size={24} />
          </Show>
        </button>

        <button class="ctrl-btn" title="Zoom In" onClick={() => { props.onZoomIn(); showControls(); }}>
          <ZoomIn size={20} />
        </button>

        <button class="ctrl-btn ctrl-mute" title="Mute / Unmute" onClick={toggleMute}>
          <Show when={isMuted()} fallback={<Volume2 size={18} />}>
            <VolumeX size={18} />
          </Show>
        </button>
      </div>
    </div>
  );
}
