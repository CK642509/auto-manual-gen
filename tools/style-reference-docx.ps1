# 把 pandoc 的預設 reference.docx 調成手冊用的樣式（Day 20）。
#
#   pandoc -o templates/reference.docx --print-default-data-file reference.docx
#   powershell -ExecutionPolicy Bypass -File tools/style-reference-docx.ps1 templates/reference.docx
#
# 這支腳本做的事，跟「用 Word 打開 reference.docx、一個一個改樣式、存檔」完全一樣，
# 只是寫成腳本比較好 review，也方便讀者重現。改完的 reference.docx 已經進版控，
# 平常不需要再跑這支，要換企業識別時直接用 Word 改 reference.docx 就好。
#
# 只能在裝有 Word 的 Windows 上跑。內建樣式用 WdBuiltinStyle 常數取，不用名稱 ——
# 中文版 Word 的「Heading 1」叫「標題 1」，用名稱會因為介面語言不同而找不到。

param([Parameter(Mandatory = $true)][string]$Path)

$ErrorActionPreference = 'Stop'
$full = (Resolve-Path $Path).Path
# 在暫存檔上改完再複製回去：Word 被強制結束過的話，會對原路徑記著「上次沒關好」，
# 下次開同一個路徑時跳出看不見的對話框，腳本就卡住了
$work = Join-Path $env:TEMP "reference-$([guid]::NewGuid()).docx"
Copy-Item $full $work

$FONT = 'Microsoft JhengHei'
$ACCENT = 100 * 65536 + 56 * 256 + 31   # Word 的顏色是 BGR：RGB(31, 56, 100)
$GRAY = 110 * 65536 + 110 * 256 + 110

function Set-Font($style, [double]$size, [bool]$bold = $false, $color = $null) {
  $style.Font.Name = $FONT
  $style.Font.NameFarEast = $FONT
  $style.Font.Size = $size
  $style.Font.Bold = [int]$bold
  if ($null -ne $color) { $style.Font.Color = $color }
}

# Date、TOC Heading 是 Word 內建但沒有 WdBuiltinStyle 常數的樣式，只能用名稱找，
# 而名稱又跟著介面語言走 —— 英文名稱找不到就試中文名稱
function Get-Style($styles, [string[]]$names) {
  foreach ($n in $names) { try { return $styles.Item($n) } catch {} }
  throw "找不到樣式：$($names -join ' / ')"
}

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0   # 不要跳任何對話框：看不見的 Word 跳對話框，腳本只會卡住
try {
  $doc = $word.Documents.Open($work)
  $styles = $doc.Styles

  # 版面：A4，左右各留 2.5 cm，版心寬 16 cm ≈ 6.3 吋 —— 圖片寬度上限就是從這裡來的
  $ps = $doc.Sections(1).PageSetup
  $ps.PaperSize = 7                       # wdPaperA4
  $ps.LeftMargin = 70.87; $ps.RightMargin = 70.87
  $ps.TopMargin = 70.87; $ps.BottomMargin = 70.87
  $ps.DifferentFirstPageHeaderFooter = -1 # 封面不放頁碼

  # 頁尾置中頁碼
  $doc.Sections(1).Footers(1).PageNumbers.Add(1, $false) | Out-Null

  # 正文：pandoc 的段落會用 Body Text / First Paragraph / Compact，三個都繼承 Normal
  $normal = $styles.Item(-1)              # wdStyleNormal
  Set-Font $normal 11
  $normal.ParagraphFormat.LineSpacingRule = 5   # wdLineSpaceMultiple
  $normal.ParagraphFormat.LineSpacing = 15.6    # 1.3 倍
  $normal.ParagraphFormat.SpaceAfter = 6

  # 標題：每一章從新的一頁開始
  $h1 = $styles.Item(-2)                  # wdStyleHeading1
  Set-Font $h1 20 $true $ACCENT
  $h1.ParagraphFormat.PageBreakBefore = -1
  $h1.ParagraphFormat.SpaceBefore = 0
  $h1.ParagraphFormat.SpaceAfter = 18

  $h2 = $styles.Item(-3)                  # wdStyleHeading2
  Set-Font $h2 14 $true $ACCENT
  $h2.ParagraphFormat.SpaceBefore = 18
  $h2.ParagraphFormat.SpaceAfter = 6

  # 封面：Title / Subtitle / Date 是 pandoc 從 metadata 產生的
  $title = $styles.Item(-63)              # wdStyleTitle
  Set-Font $title 30 $true $ACCENT
  $title.ParagraphFormat.Alignment = 1
  $title.ParagraphFormat.SpaceBefore = 200
  $title.ParagraphFormat.SpaceAfter = 12

  $subtitle = $styles.Item(-75)           # wdStyleSubtitle
  Set-Font $subtitle 14 $false $GRAY
  $subtitle.ParagraphFormat.Alignment = 1
  $subtitle.ParagraphFormat.SpaceBefore = 0
  $subtitle.ParagraphFormat.SpaceAfter = 6

  $date = Get-Style $styles @('Date', '日期')
  Set-Font $date 12 $false $GRAY
  $date.ParagraphFormat.Alignment = 1
  $date.ParagraphFormat.SpaceBefore = 0

  # 目錄從新的一頁開始，封面才會獨立一頁
  $tocHeading = Get-Style $styles @('TOC Heading', '目錄標題')
  Set-Font $tocHeading 20 $true $ACCENT
  $tocHeading.ParagraphFormat.PageBreakBefore = -1
  Set-Font ($styles.Item(-20)) 12         # wdStyleTOC1

  # 圖：圖與圖說置中，並且跟下一段黏在一起，不要圖在這頁、圖說在下一頁
  foreach ($name in @('Figure', 'Captioned Figure')) {
    $s = $styles.Item($name)
    $s.ParagraphFormat.Alignment = 1
    $s.ParagraphFormat.KeepWithNext = -1
  }
  $caption = $styles.Item('Image Caption')
  Set-Font $caption 9 $false $GRAY
  $caption.ParagraphFormat.Alignment = 1
  $caption.ParagraphFormat.KeepWithNext = -1

  # legend 表格：加上框線、置中
  $table = $styles.Item('Table')
  $table.Table.Borders.Enable = 1
  $table.Table.Alignment = 1              # wdAlignRowCenter
  $table.Font.Size = 10

  # 引用區塊：保護區裡的警語、「注意」都是 blockquote
  $block = $styles.Item(-85)              # wdStyleBlockQuotation（Block Text）
  Set-Font $block 10.5
  $block.ParagraphFormat.LeftIndent = 12
  $block.ParagraphFormat.RightIndent = 0
  $block.ParagraphFormat.Shading.BackgroundPatternColor = 245 * 65536 + 245 * 256 + 245
  $block.ParagraphFormat.Borders.Item(-2).LineStyle = 1   # wdBorderLeft
  $block.ParagraphFormat.Borders.Item(-2).LineWidth = 18  # 2.25 pt
  $block.ParagraphFormat.Borders.Item(-2).Color = $ACCENT

  $doc.Save()
  $doc.Close([ref]0)
  Copy-Item $work $full -Force
  Write-Output "已更新 $full"
}
catch {
  throw "第 $($_.InvocationInfo.ScriptLineNumber) 行失敗：$($_.Exception.Message)"
}
finally {
  $word.Quit([ref]0)                           # wdDoNotSaveChanges：失敗時不要留下改到一半的檔案
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  Remove-Item $work -Force -ErrorAction SilentlyContinue
}
