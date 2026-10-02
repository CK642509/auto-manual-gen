#!/usr/bin/env node
// 編譯後的程式在 dist/。這支轉接檔本身不需要編譯，所以 npm 建立 bin 連結時它一定已經存在。
import '../dist/cli.js'
