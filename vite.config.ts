import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { extractorPlugin } from './server/extractorPlugin';

export default defineConfig({
  plugins: [react(), extractorPlugin()],
});
