import { createHash } from 'node:crypto'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

// バックエンド (uvicorn) へのプロキシ設定
// 開発時は `pnpm dev` (localhost:5173) からバックエンド (localhost:8000) へ中継する
const backend = process.env.BACKEND_URL || 'http://localhost:8000'

/**
 * Service Worker が install 時に precache する URL の一覧を書き出す。
 *
 * 画面はルート単位で分割されている (src/router.ts の動的 import) ため、
 * 実行時キャッシュだけでは「オンラインのときに開いていない画面」がオフラインで
 * 白くなる。一覧はビルドしないと分からない (ファイル名にハッシュが入る) ので、
 * ここで生成して public/sw.js が importScripts で読み込む。
 *
 * importScripts したファイルの中身も SW の更新判定に含まれる。version を
 * 一覧のハッシュにしておくと、アセットが変わったデプロイでだけ SW が
 * 「更新された」と判定される。
 */
function swPrecacheManifest(): Plugin {
  return {
    name: 'es-sw-precache-manifest',
    apply: 'build',
    // アセットが出揃ってから走らせる
    enforce: 'post',
    generateBundle(_options, bundle) {
      const urls = [
        // オフライン時のナビゲーションのフォールバック
        '/index.html',
        ...Object.keys(bundle)
          .filter((name) => name.startsWith('assets/'))
          .sort()
          .map((name) => '/' + name),
      ]
      const version = createHash('sha256').update(urls.join('\n')).digest('hex').slice(0, 12)
      this.emitFile({
        type: 'asset',
        fileName: 'precache-manifest.js',
        source:
          '// このファイルはビルドで生成される (frontend/vite.config.ts)。編集しても次のビルドで消える。\n' +
          `self.__ES_PRECACHE = ${JSON.stringify({ version, urls }, null, 2)}\n`,
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), swPrecacheManifest()],
  server: {
    proxy: {
      '/api': backend,
      '/auth': backend,
      '/uploads': backend,
      '/public': backend,
    },
  },
})
