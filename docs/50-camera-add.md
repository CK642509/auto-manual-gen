# 新增攝影機

這一章說明怎麼在 DemoStreamApp 建立一台攝影機，並填入它的 RTSP 位址。

<!-- protected:start -->
> 重要：攝影機建立並啟用推論後，會持續拍攝並分析畫面中的人員影像。新增前，請確認安裝位置已依當地法規與場域規定設置監視告示，並取得場域管理者同意。未經同意的影像蒐集，由設置者自負法律責任。
<!-- protected:end -->

## 操作步驟

1. 等待左側的「攝影機清單」載入完成。
2. 點擊清單右上角的「新增攝影機」。

{{screenshot:camera-add-01}}

3. 在「{{legend.name}}」輸入「大門西側」。
4. 在「{{legend.source}}」輸入「rtsp://192.0.2.10/live」。

{{screenshot:camera-add-02}}

5. 點擊「{{legend.confirm}}」。

{{screenshot:camera-add-03}}

## 完成後

畫面出現「已新增攝影機『大門西側』」的通知，表示攝影機已經建立。

「{{legend.zone}}」預設為「大門」，「{{legend.enabled}}」預設就是開啟的，這個範例沒有另外變更。

> 注意：「{{legend.name}}」是空的時候，「{{legend.confirm}}」無法點擊。
