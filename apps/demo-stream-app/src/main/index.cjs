const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

// 有值就載開發伺服器，沒有就載打包後的 dist/index.html。
// 產線（Playwright）走的一律是後者 —— 手冊要拍的是打包後的樣子。
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,

    // useContentSize 讓 1600×900 指的是「內容區」而不是含邊框的視窗。
    // 截圖尺寸要跨平台一致，這行是必要的。
    useContentSize: true,

    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.setMenuBarVisibility(false)
  win.once('ready-to-show', () => win.show())

  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL)
    return
  }

  const indexHtml = path.join(__dirname, '../../dist/index.html')

  // 前置檢查：錯誤訊息要在「還看得懂」的階段爆出來，
  // 而不是讓 Playwright 對著一片白畫面等 30 秒 timeout。
  if (!fs.existsSync(indexHtml)) {
    throw new Error(`找不到 ${indexHtml} —— 請先執行 npm run build -w demo-stream-app`)
  }

  win.loadFile(indexHtml)
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
