import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  // COOP + COEP headers are required to enable SharedArrayBuffer,
  // which FFmpeg.wasm needs for its multi-threaded WASM core.
  // Note: these headers prevent loading cross-origin resources that
  // don't send COEP headers themselves (e.g. Google Fonts CDN).
  // We've moved fonts to a local import to avoid that conflict.
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
