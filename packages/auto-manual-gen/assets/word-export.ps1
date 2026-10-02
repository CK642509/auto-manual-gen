# pandoc 產出的 docx 交給 Word 做最後一哩路（Day 20），由 `npm run build -- --pdf` 呼叫：
#
#   1. 更新目錄：pandoc 只放了一個 TOC 欄位，頁碼要 Word 排過版才算得出來
#   2. 存回 docx：交付出去的 Word 檔打開就是更新好的目錄，不必請客戶按 F9
#   3. 轉出 PDF：標題轉成 PDF 書籤
#
# 只能在裝有 Word 的 Windows 上跑，這是 CI 的硬限制（Day 23）。

param(
  [Parameter(Mandatory = $true)][string]$Docx,
  [Parameter(Mandatory = $true)][string]$Pdf
)

$ErrorActionPreference = 'Stop'
$Docx = (Resolve-Path $Docx).Path

# 在暫存檔上處理：Word 被強制結束過的話，會對原路徑記著「上次沒關好」，下次開同一個路徑會跳出看不見的對話框
$work = Join-Path $env:TEMP "manual-$([guid]::NewGuid()).docx"
Copy-Item $Docx $work

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($work)

  foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
  $doc.Fields.Update() | Out-Null
  $doc.Save()

  # 17 = wdExportFormatPDF；最後一個參數 1 = wdExportCreateHeadingBookmarks
  $doc.ExportAsFixedFormat($Pdf, 17, $false, 0, 0, 1, 1, 0, $true, $true, 1)
  $doc.Close([ref]0)
  Copy-Item $work $Docx -Force
}
catch {
  throw "Word 轉檔失敗（第 $($_.InvocationInfo.ScriptLineNumber) 行）：$($_.Exception.Message)"
}
finally {
  $word.Quit([ref]0)
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  Remove-Item $work -Force -ErrorAction SilentlyContinue
}
