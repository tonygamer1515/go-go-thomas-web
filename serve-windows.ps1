$ErrorActionPreference = 'Stop'
$Root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$Port = 8080
$Address = [System.Net.IPAddress]::Loopback
$Listener = [System.Net.Sockets.TcpListener]::new($Address, $Port)

$Mime = @{
  '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8'
  '.json'='application/json; charset=utf-8'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'
  '.webp'='image/webp'; '.svg'='image/svg+xml'; '.mp3'='audio/mpeg'; '.mp4'='video/mp4'
  '.ttf'='font/ttf'; '.otf'='font/otf'; '.woff2'='font/woff2'; '.gz'='application/gzip'; '.apk'='application/vnd.android.package-archive'
}

function Write-Response($Stream, [int]$Status, [string]$Reason, [string]$Type, [long]$Length, [string[]]$ExtraHeaders) {
  $lines = @("HTTP/1.1 $Status $Reason", "Content-Type: $Type", "Content-Length: $Length", 'Accept-Ranges: bytes', 'Cache-Control: no-cache', 'Connection: close')
  if ($ExtraHeaders) { $lines += $ExtraHeaders }
  $head = [Text.Encoding]::ASCII.GetBytes(($lines -join "`r`n") + "`r`n`r`n")
  $Stream.Write($head, 0, $head.Length)
}

try {
  $Listener.Start()
  $Url = "http://127.0.0.1:$Port/"
  Write-Host "`nGo Go Thomas is running fully offline at $Url" -ForegroundColor Green
  Write-Host 'Press Ctrl+C to stop the local server.' -ForegroundColor Yellow
  Start-Process $Url

  while ($true) {
    $Client = $Listener.AcceptTcpClient()
    try {
      $Stream = $Client.GetStream()
      $Reader = [System.IO.StreamReader]::new($Stream, [Text.Encoding]::ASCII, $false, 4096, $true)
      $requestLine = $Reader.ReadLine()
      if (-not $requestLine) { continue }
      $parts = $requestLine.Split(' ')
      if ($parts.Count -lt 2 -or $parts[0] -notin @('GET','HEAD')) {
        Write-Response $Stream 405 'Method Not Allowed' 'text/plain' 0 @(); continue
      }
      $headers = @{}
      while ($true) {
        $line = $Reader.ReadLine(); if ([string]::IsNullOrEmpty($line)) { break }
        $i = $line.IndexOf(':'); if ($i -gt 0) { $headers[$line.Substring(0,$i).Trim().ToLowerInvariant()] = $line.Substring($i+1).Trim() }
      }
      $rawPath = $parts[1].Split('?')[0]
      $relative = [Uri]::UnescapeDataString($rawPath.TrimStart('/')).Replace('/', [IO.Path]::DirectorySeparatorChar)
      if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $Root $relative))
      if (-not $file.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase) -or -not [IO.File]::Exists($file)) {
        Write-Response $Stream 404 'Not Found' 'text/plain; charset=utf-8' 0 @(); continue
      }
      $info = [IO.FileInfo]::new($file); $start = [long]0; $end = $info.Length - 1; $status = 200; $reason = 'OK'; $extra = @()
      if ($headers.ContainsKey('range') -and $headers['range'] -match '^bytes=(\d*)-(\d*)') {
        if ($Matches[1]) { $start = [long]$Matches[1] }
        if ($Matches[2]) { $end = [Math]::Min([long]$Matches[2], $info.Length - 1) }
        if ($start -le $end -and $start -lt $info.Length) { $status = 206; $reason = 'Partial Content'; $extra += "Content-Range: bytes $start-$end/$($info.Length)" }
      }
      $length = $end - $start + 1; $ext = $info.Extension.ToLowerInvariant(); $type = if ($Mime.ContainsKey($ext)) { $Mime[$ext] } else { 'application/octet-stream' }
      Write-Response $Stream $status $reason $type $length $extra
      if ($parts[0] -eq 'GET') {
        $fs = [IO.File]::OpenRead($file)
        try {
          $fs.Position = $start; $buffer = New-Object byte[] 65536; $left = $length
          while ($left -gt 0) { $read = $fs.Read($buffer,0,[int][Math]::Min($buffer.Length,$left)); if ($read -le 0) { break }; $Stream.Write($buffer,0,$read); $left -= $read }
        } finally { $fs.Dispose() }
      }
    } catch { Write-Warning $_.Exception.Message }
    finally { if ($Reader) { $Reader.Dispose() }; $Client.Close() }
  }
} finally { $Listener.Stop() }
