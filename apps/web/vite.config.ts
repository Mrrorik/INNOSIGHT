import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const target = process.env.API_INTERNAL_URL || 'http://localhost:4000';
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target }, '/proxy': { target } } },
  preview: { proxy: { '/api': { target }, '/proxy': { target } } },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/node_modules\/(react|react-dom|react-is|scheduler)\//.test(id)) return 'react';
          if (id.includes('/@xyflow/') || id.includes('/@dagrejs/')) return 'graph';
          if (id.includes('/recharts/') || id.includes('/d3-') || id.includes('/victory-vendor/'))
            return 'charts';
          if (
            [
              '/codemirror/',
              '/@codemirror/',
              '/@lezer/',
              '/@uiw/',
              '/style-mod/',
              '/w3c-keyname/',
              '/crelt/',
            ].some((part) => id.includes(part))
          )
            return 'editor';
          return 'vendor';
        },
      },
    },
  },
});
