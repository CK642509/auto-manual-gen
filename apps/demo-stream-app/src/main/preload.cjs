const { contextBridge } = require('electron')

// 同一份 renderer 要能跑在 Web 與 Electron 兩種容器裡，
// 所以「我是誰」這件事由 preload 注入，而不是讓前端去偵測 userAgent。
// Web 模式下 window.demoStreamApp 不存在，前端據此判斷。
contextBridge.exposeInMainWorld('demoStreamApp', {
  platform: 'electron',
  electronVersion: process.versions.electron,
})
