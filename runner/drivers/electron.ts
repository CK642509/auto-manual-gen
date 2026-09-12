import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { _electron, type ElectronApplication, type Page } from 'playwright'
import { repoRoot, type AppConfig } from '../config.js'
import { storageInitScript, type AppDriver } from './types.js'

const require = createRequire(import.meta.url)

/**
 * Electron 形態。
 *
 * 手冊要拍的是打包後的樣子，所以一律走 `dist/index.html`（不設 `VITE_DEV_SERVER_URL`）。
 */
export class ElectronDriver implements AppDriver {
  #app?: ElectronApplication
  #page?: Page
  #pendingStorage: Record<string, string> = {}

  constructor(private readonly config: AppConfig) {}

  get #projectDir(): string {
    return path.resolve(repoRoot, this.config.app.electron.projectDir)
  }

  async launch(): Promise<Page> {
    const projectDir = this.#projectDir

    if (this.config.app.electron.buildBeforeLaunch) this.#build(projectDir)
    this.#preflight(projectDir)

    this.#app = await _electron.launch({
      executablePath: this.#resolveElectronBinary(),
      // App 目錄要排在第一個，其餘是往下傳給 Chromium 的旗標。
      args: [
        projectDir,
        // 不強制固定的話，同一份程式碼在不同系統縮放比例的機器上截出來的尺寸會不一致，
        // 直接影響後面標號座標的計算（Day 11 的 boundingBox 疊層）。
        '--force-device-scale-factor=1',
      ],
      cwd: projectDir,
      // 註：容器環境可能還需要 --no-sandbox 與關掉 GPU 加速的旗標，Day 23 談 CI 時再補。
    })

    this.#page = await this.#firstRealWindow()

    // Electron 在 firstWindow() 拿到手時已經 navigate 過了，沒有 Web 那種「還沒導航」的空檔，
    // 所以排隊中的狀態只能走「註冊 init script + reload」這條路。
    if (Object.keys(this.#pendingStorage).length > 0) {
      await this.#injectAndReload(this.#pendingStorage)
    }

    return this.#page
  }

  async setStorage(kv: Record<string, string>): Promise<void> {
    Object.assign(this.#pendingStorage, kv)
    if (!this.#app || !this.#page) return
    await this.#injectAndReload(kv)
  }

  async resize(width: number, height: number): Promise<void> {
    if (!this.#app) throw new Error('resize 必須在 launch 之後呼叫。')

    // 調視窗大小得透過主行程 —— page 物件操作的是渲染行程，碰不到 BrowserWindow。
    await this.#app.evaluate(async ({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) return
      // App 開了 useContentSize，所以尺寸指的是內容區；用 setContentSize 才對得上 viewport。
      win.setContentSize(size.width, size.height)
      win.setAlwaysOnTop(false)
    }, { width, height })
  }

  async close(): Promise<void> {
    await this.#app?.close()
    this.#app = undefined
    this.#page = undefined
  }

  // --- 內部 ---

  async #injectAndReload(kv: Record<string, string>): Promise<void> {
    await this.#app!.context().addInitScript(storageInitScript(kv))
    await this.#page!.reload({ waitUntil: 'domcontentloaded' })
  }

  /**
   * 抓到真正要操作的主視窗。
   *
   * `firstWindow()` 在有 splash window 的 App 上可能抓到載入畫面而不是主視窗，
   * 所以這裡多一道檢查：URL 還是 about:blank 就繼續等下一個 window。
   * DemoStreamApp 沒有 splash，但這個防護對別人的專案是必要的。
   */
  async #firstRealWindow(): Promise<Page> {
    const isPlaceholder = (url: string) => url === '' || url.startsWith('about:')

    let page = await this.#app!.firstWindow()

    if (isPlaceholder(page.url())) {
      page = await this.#app!.waitForEvent('window', {
        predicate: (w) => !isPlaceholder(w.url()),
      })
    }

    await page.waitForLoadState('domcontentloaded')
    return page
  }

  #build(projectDir: string): void {
    const result = spawnSync('npm', ['run', 'build'], {
      cwd: projectDir,
      shell: true,
      stdio: 'inherit',
    })

    if (result.status !== 0) {
      throw new Error(`在 ${projectDir} 執行 npm run build 失敗（exit code ${result.status}）。`)
    }
  }

  /**
   * 啟動前的前置檢查。
   *
   * 提早在這裡失敗，錯誤訊息才會是「找不到 X，請先執行 Y」，
   * 而不是等 Playwright 內部逾時之後丟出一個難以定位的例外。
   */
  #preflight(projectDir: string): void {
    const pkgPath = path.join(projectDir, 'package.json')
    if (!fs.existsSync(pkgPath)) {
      throw new Error(`找不到 ${pkgPath} —— 檢查 config 的 app.electron.projectDir。`)
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { main?: string }
    if (!pkg.main) {
      throw new Error(`${pkgPath} 沒有 main 欄位，Electron 不知道要載入哪一支主行程程式。`)
    }

    const mainEntry = path.resolve(projectDir, pkg.main)
    const required: Array<[string, string]> = [
      [mainEntry, '主行程進入點'],
      [path.join(path.dirname(mainEntry), 'preload.cjs'), 'preload（執行環境靠它注入，不是靠 userAgent）'],
      [path.join(projectDir, 'dist', 'index.html'), '打包產物 —— 請先執行 npm run demo:build'],
    ]

    const missing = required.filter(([p]) => !fs.existsSync(p))
    if (missing.length > 0) {
      throw new Error(
        `啟動 Electron 前的前置檢查失敗，缺少：\n` +
          missing.map(([p, why]) => `  - ${path.relative(repoRoot, p)}（${why}）`).join('\n'),
      )
    }
  }

  /**
   * 解析 electron 執行檔位置。
   *
   * 在 Node 裡 require('electron') 回傳的是 binary 的路徑字串（在 Electron 裡才是 API 物件）。
   * 明確解析而不是讓 Playwright 自己找，是為了在找不到時能給出有用的訊息。
   */
  #resolveElectronBinary(): string {
    try {
      return require('electron') as unknown as string
    } catch (cause) {
      throw new Error('解析不到 electron 執行檔 —— 請先在 repo 根目錄執行 npm install。', { cause })
    }
  }
}
