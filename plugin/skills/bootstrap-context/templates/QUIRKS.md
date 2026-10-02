# QUIRKS

這個 App 的行為特性 —— 不是「有沒有這個 testid」，而是「這個 testid 什麼時候會變成什麼樣子」。

## 時序

- **`<testid>` <什麼時候出現 / 消失>**。<manifest 該怎麼等：waitFor 哪個、state: detached、不要插入 wait>

## 條件渲染

- `<testid>` **只在 <條件> 時存在**。<不是 disabled / 不是 CSS 隱藏>

## 每次都會變的內容

- `<testid>` <多久變一次>。不要放進 annotate，也不要在正文引用它的值。

## 待確認

<探勘時懷疑、但沒有證據的行為，列在這裡給人確認>
