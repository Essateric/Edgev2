import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      "Content-Security-Policy": `
        default-src 'self';
        script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://apis.google.com https://identitytoolkit.googleapis.com;
        style-src 'self' 'unsafe-inline';
        img-src 'self' data: https:;
        font-src 'self' data: https:;
        connect-src 'self' 
          https://identitytoolkit.googleapis.com 
          https://firestore.googleapis.com 
          https://securetoken.googleapis.com; 
      `.replace(/\n/g, '')
    }
  }
});
