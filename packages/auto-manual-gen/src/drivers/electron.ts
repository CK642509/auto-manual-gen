import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { _electron, type ElectronApplication, type Page } from 'playwright'
import { envError, usageError } from '../errors.js'
import { storageInitScript, type AppDriver, type DriverContext } from './types.js'

/**
 * Electron 形態。
 *
 * 手冊要拍的是打包後的樣子：`app.electron.build` 有寫，第一章開機前就先在 projectDir 執行一次打包指令。
 */
export class ElectronDriver implements AppDriver {
  #app?: ElectronApplication
  #page?: Page
  #pendingStorage: Record<string, string> = {}
  #userDataDir?: string

  constructor(private readonly ctx: DriverContext) {}

  get #projectDir(): string {
    return path.resolve(this.ctx.root, this.ctx.app.electron!.projectDir)
  }

  async launch(): Promise<Page> {
    const projectDir = this.#projectDir

    this.#preflight(projectDir)
    const build = this.ctx.app.electron!.build
    if (this.ctx.build && typeof build === 'string') this.#build(projectDir, build)

    // 每次開機都給一個全新的 userData 目錄。Electron 的 localStorage 預設存在使用者目錄裡、跨執行保留，
    // 上一次執行存下的設定或版面設定會跟到這一次 —— 一章一次開機的前提就是「每章從同一個乾淨狀態開始」。
    this.#userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-manual-electron-'))

    this.#app = await _electron.launch({
      executablePath: this.#resolveElectronBinary(projectDir),
      // App 目錄要排在第一個，其餘是往下傳給 Chromium 的旗標。
      args: [
        projectDir,
        // 不強制固定的話，同一份程式碼在不同系統縮放比例的機器上截出來的尺寸會不一致，
        // 直接影響後面標號座標的計算（Day 11 的 boundingBox 疊層）。
        '--force-device-scale-factor=1',
        `--user-data-dir=${this.#userDataDir}`,
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
    if (this.#userDataDir) fs.rmSync(this.#userDataDir, { recursive: true, force: true, maxRetries: 3 })
    this.#userDataDir = undefined
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
   * 範例 App 沒有 splash，但很多正式產品有。
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

  #build(projectDir: string, command: string): void {
    const result = spawnSync(command, {
      cwd: projectDir,
      shell: true,
      // 打包的輸出導到 stderr：--json 時 stdout 只能有最後那一份 JSON
      stdio: ['ignore', 2, 2],
    })

    if (result.status !== 0) {
      throw envError('APP_BUILD_FAILED', `在 ${projectDir} 執行 ${command} 失敗（exit code ${result.status}）。`, { command })
    }
  }

  /**
   * 啟動前的前置檢查。
   *
   * 提早在這裡失敗，錯誤訊息才會是「找不到 X，請檢查 Y」，
   * 而不是等 Playwright 內部逾時之後丟出一個難以定位的例外。
   */
  #preflight(projectDir: string): void {
    const pkgPath = path.join(projectDir, 'package.json')
    if (!fs.existsSync(pkgPath)) {
      throw usageError('CONFIG_INVALID', `找不到 ${pkgPath} —— 檢查 manual.yaml 的 app.electron.projectDir。`)
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { main?: string }
    if (!pkg.main) {
      throw usageError('CONFIG_INVALID', `${pkgPath} 沒有 main 欄位，Electron 不知道要載入哪一支主行程程式。`)
    }
    if (!fs.existsSync(path.resolve(projectDir, pkg.main))) {
      throw usageError('CONFIG_INVALID', `找不到主行程進入點 ${path.resolve(projectDir, pkg.main)}（${pkgPath} 的 main）。`)
    }
  }

  /**
   * 解析 electron 執行檔位置。
   *
   * 用的是 App 自己裝的那一份 Electron（從 projectDir 往上解析），手冊拍的才會是產品實際打包的樣子。
   * 在 Node 裡 require('electron') 回傳的是 binary 的路徑字串（在 Electron 裡才是 API 物件）。
   */
  #resolveElectronBinary(projectDir: string): string {
    try {
      return createRequire(path.join(projectDir, 'package.json'))('electron') as string
    } catch (cause) {
      throw envError('ELECTRON_MISSING', `從 ${projectDir} 解析不到 electron —— App 的相依套件裝好了嗎？`, { projectDir }, { cause })
    }
  }
}
