/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// preload 注入的橋接物件。Web 模式下不存在，所以是 optional。
declare global {
  interface Window {
    demoStreamApp?: {
      platform: 'electron'
      electronVersion: string
    }
  }
}

export {}
