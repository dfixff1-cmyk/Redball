import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({ mode }) => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'youtube-playables-html',
        transformIndexHtml(html) {
          if (mode !== 'playables') return html;
          const withoutYandex = html.replace(
            /<script src="https:\/\/yandex\.ru\/games\/sdk\/v2"><\/script>/,
            ''
          );
          const withoutExternalAds = withoutYandex.replace(
            /<script data-cfasync="false" src="https:\/\/afders\.org\/[^"]+"><\/script>/,
            ''
          );
          return withoutExternalAds.replace(
            '</head>',
            '    <script src="https://www.youtube.com/game_api/v1"></script>\n  </head>'
          );
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
