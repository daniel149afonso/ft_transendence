import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { AddressInfo } from 'net'

const MARKER = path.join(process.cwd(), 'node_modules/.tmp/.browser-opened')
const ONE_HOUR = 60 * 60 * 1000

function browserWasRecentlyOpened(): boolean {
  try {
    const age = Date.now() - fs.statSync(MARKER).mtimeMs
    return age < ONE_HOUR
  } catch {
    return false
  }
}

function markBrowserOpened() {
  fs.mkdirSync(path.dirname(MARKER), { recursive: true })
  fs.writeFileSync(MARKER, Date.now().toString())
}

function smartOpen(): Plugin {
  return {
    name: 'smart-open',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        if (browserWasRecentlyOpened()) return

        const addr = server.httpServer?.address() as AddressInfo | null
        const port = addr?.port ?? 5173
        const url = `http://localhost:${port}`

        markBrowserOpened()

        if (process.env.WSL_DISTRO_NAME) {
          exec(`/mnt/c/Windows/System32/cmd.exe /c start ${url}`)
        } else if (process.platform === 'darwin') {
          exec(`open ${url}`)
        } else if (process.platform === 'win32') {
          exec(`start ${url}`)
        } else {
          exec(`xdg-open ${url}`)
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), smartOpen()],
  server: {
    watch: {
      usePolling: true,
    },
  },
})
