import { createSignal, Show } from 'solid-js';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Upload, RefreshCw, Download, X, AlertCircle, CheckCircle } from 'lucide-solid';

type State = 'idle' | 'loading-engine' | 'converting' | 'done' | 'error';

interface ConverterProps {
  onClose: () => void;
}

// Singleton FFmpeg instance — keep loaded across conversions
let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;

export default function Converter(props: ConverterProps) {
  const [state, setState] = createSignal<State>('idle');
  const [inputFile, setInputFile] = createSignal<File | null>(null);
  const [progress, setProgress] = createSignal(0);
  const [statusText, setStatusText] = createSignal('');
  const [outputUrl, setOutputUrl] = createSignal<string | null>(null);
  const [outputName, setOutputName] = createSignal('');
  const [inputSize, setInputSize] = createSignal(0);
  const [outputSize, setOutputSize] = createSignal(0);
  const [errorMsg, setErrorMsg] = createSignal('');
  const [isDragging, setIsDragging] = createSignal(false);

  const formatBytes = (b: number) => {
    if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`;
    if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`;
    return `${(b / 1e3).toFixed(0)} KB`;
  };

  const pickFile = (file: File) => {
    setInputFile(file);
    setInputSize(file.size);
    setOutputUrl(null);
    setState('idle');
    setErrorMsg('');
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files[0];
    if (file) pickFile(file);
  };

  const handleInput = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) pickFile(file);
  };

  const convert = async () => {
    const file = inputFile();
    if (!file) return;
    setErrorMsg('');
    setProgress(0);

    try {
      // ── Load FFmpeg.wasm engine (once) ──────────────────────────────
      if (!ffmpegInstance) {
        ffmpegInstance = new FFmpeg();
        ffmpegInstance.on('log', ({ message }) => console.log('[FFmpeg]', message));
      }

      if (!ffmpegLoaded) {
        setState('loading-engine');
        setStatusText('Downloading FFmpeg WASM engine (~32 MB, one-time)…');

        // Use multi-threaded core (requires COOP/COEP headers, set in vite.config)
        const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd';
        ffmpegInstance.on('progress', ({ progress: p }) => {
          setProgress(Math.round(p * 100));
          setStatusText(`Converting… ${Math.round(p * 100)}%`);
        });

        await ffmpegInstance.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
          workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
        });
        ffmpegLoaded = true;
      }

      // ── Write input into FFmpeg virtual FS ──────────────────────────
      setState('converting');
      setStatusText('Reading file into memory…');
      await ffmpegInstance.writeFile('input.mp4', await fetchFile(file));

      // ── Run conversion (mirrors our CLI script exactly) ─────────────
      setStatusText('Starting VP9 encode…');
      await ffmpegInstance.exec([
        '-i', 'input.mp4',
        '-c:v', 'libvpx-vp9',
        '-crf', '32',          // Constant quality (matches CLI script)
        '-b:v', '0',           // Pure CRF mode
        '-deadline', 'good',   // Good quality/speed tradeoff
        '-cpu-used', '2',      // Balanced speed (0=slow/best, 5=fast/worst)
        '-row-mt', '1',        // Multi-threaded row encoding
        '-c:a', 'libopus',     // Best WebM audio codec
        '-b:a', '192k',
        'output.webm',
      ]);

      // ── Read output and create download URL ─────────────────────────
      setStatusText('Packaging output…');
      const data = await ffmpegInstance.readFile('output.webm') as Uint8Array;
      const blob = new Blob([data as unknown as BlobPart], { type: 'video/webm' });
      setOutputSize(blob.size);
      setOutputUrl(URL.createObjectURL(blob));
      setOutputName(file.name.replace(/\.[^.]+$/, '_vp9.webm'));

      // Clean up virtual FS
      await ffmpegInstance.deleteFile('input.mp4');
      await ffmpegInstance.deleteFile('output.webm');

      setState('done');
    } catch (err) {
      console.error('[Converter]', err);
      setErrorMsg(`Conversion failed: ${String(err)}`);
      setState('error');
    }
  };

  const cancel = () => {
    ffmpegInstance?.terminate();
    ffmpegInstance = null;
    ffmpegLoaded = false;
    setState('idle');
    setProgress(0);
    setStatusText('');
  };

  const savingsPercent = () =>
    outputSize() > 0 ? Math.round((1 - outputSize() / inputSize()) * 100) : 0;

  return (
    <div class="conv-overlay" onClick={props.onClose}>
      <div class="conv-panel" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div class="conv-header">
          <div>
            <h2>AV1 → VP9 Converter</h2>
            <p class="conv-subtitle">Runs entirely in your browser via WebAssembly — no upload, no server.</p>
          </div>
          <button class="icon-btn" onClick={props.onClose}><X size={20} /></button>
        </div>

        {/* Drop Zone */}
        <Show when={state() === 'idle' || state() === 'error'}>
          <label
            class={`conv-dropzone ${isDragging() ? 'dragging' : ''} ${inputFile() ? 'has-file' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <Upload size={36} />
            <Show when={inputFile()} fallback={
              <span>Drop AV1 / MP4 here or <u>click to browse</u></span>
            }>
              <div class="conv-file-info">
                <span class="conv-filename">{inputFile()!.name}</span>
                <span class="conv-filesize">{formatBytes(inputFile()!.size)}</span>
              </div>
            </Show>
            <input type="file" accept="video/mp4,.mp4,.webm,.mkv" style={{ display: 'none' }} onChange={handleInput} />
          </label>

          <Show when={state() === 'error'}>
            <div class="conv-error"><AlertCircle size={16} /><span>{errorMsg()}</span></div>
          </Show>

          <div class="conv-actions">
            <button class="btn-primary" disabled={!inputFile()} onClick={convert}>
              <RefreshCw size={18} />
              <span>Convert to VP9 WebM</span>
            </button>
          </div>

          <p class="conv-note">
            ⚠ First run downloads the ~32 MB FFmpeg WASM engine. Subsequent conversions are instant to start.
          </p>
        </Show>

        {/* Progress */}
        <Show when={state() === 'loading-engine' || state() === 'converting'}>
          <div class="conv-progress-section">
            <div class="conv-status-text">{statusText()}</div>
            <div class="conv-progress-track">
              <div
                class="conv-progress-fill"
                style={{ width: state() === 'loading-engine' ? '8%' : `${progress()}%` }}
              />
            </div>
            <div class="conv-progress-pct">
              {state() === 'loading-engine' ? 'Loading…' : `${progress()}%`}
            </div>
            <button class="btn-cancel" onClick={cancel}><X size={14} /> Cancel</button>
          </div>
        </Show>

        {/* Done */}
        <Show when={state() === 'done'}>
          <div class="conv-done-section">
            <div class="conv-done-icon"><CheckCircle size={48} /></div>
            <h3>Conversion Complete!</h3>

            <div class="conv-size-compare">
              <div class="conv-size-box">
                <span>Input</span>
                <strong>{formatBytes(inputSize())}</strong>
                <small>AV1 MP4</small>
              </div>
              <div class="conv-arrow">→</div>
              <div class="conv-size-box">
                <span>Output</span>
                <strong>{formatBytes(outputSize())}</strong>
                <small>VP9 WebM</small>
              </div>
              <div class={`conv-savings ${savingsPercent() > 0 ? 'savings-positive' : 'savings-negative'}`}>
                {savingsPercent() > 0 ? `${savingsPercent()}% smaller` : `${Math.abs(savingsPercent())}% larger`}
              </div>
            </div>

            <a class="btn-primary" href={outputUrl()!} download={outputName()}>
              <Download size={18} />
              <span>Download {outputName()}</span>
            </a>
            <button
              class="btn-secondary"
              onClick={() => { setState('idle'); setInputFile(null); setOutputUrl(null); }}
            >
              Convert Another File
            </button>
          </div>
        </Show>

      </div>
    </div>
  );
}
