import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // Permite acessar do celular via Wi-Fi (ex: http://192.168.x.x:5173)
    port: 5173
  }
});
