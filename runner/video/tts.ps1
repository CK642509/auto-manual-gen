# 用 Windows 內建的 System.Speech（SAPI）把一批句子念成 wav。
# 輸入是一個 JSON 檔：[{ "text": "...", "out": "C:\...\cue-01.wav" }, ...]，一次開一個 PowerShell 念完全部。
# 檔案要存成 UTF-8 with BOM：Windows PowerShell 5.1 會把沒有 BOM 的檔案當成 ANSI 讀，中文註解會讓整支解析失敗。
# 需要系統裝有對應語言的語音（設定 > 時間與語言 > 語音），例如 zh-TW 的 Hanhan、en-US 的 Zira。
param(
  [Parameter(Mandatory)] [string]$Jobs,
  [Parameter(Mandatory)] [string]$Culture
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq $Culture } | Select-Object -First 1
  if (-not $voice) {
    $have = ($synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Culture.Name }) -join ' / '
    throw "沒有 $Culture 的語音。目前裝有：$have"
  }
  $synth.SelectVoice($voice.VoiceInfo.Name)

  foreach ($job in (Get-Content -Raw -Encoding UTF8 $Jobs | ConvertFrom-Json)) {
    $synth.SetOutputToWaveFile($job.out)
    $synth.Speak($job.text)
  }
  $synth.SetOutputToNull()
} finally {
  $synth.Dispose()
}
