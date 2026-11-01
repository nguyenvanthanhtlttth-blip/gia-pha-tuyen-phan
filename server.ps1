# Built-in Windows PowerShell HTTP Server for Gia Pha Dai Gia Dinh Tuyen - Phan (Port 3001)
# Works on 100% of Windows 10/11 machines without needing Node.js or Python!

$ErrorActionPreference = "Continue"
$Port = 3001
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PublicDir = Join-Path $RootDir "public"
$DbFile = Join-Path $RootDir "data\giapha-db.json"

$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add("http://localhost:$Port/")
$Listener.Prefixes.Add("http://127.0.0.1:$Port/")

try {
    $Listener.Start()
} catch {
    Write-Host "Cong $Port dang duoc su dung hoac da chay san!" -ForegroundColor Yellow
    Start-Process "http://localhost:$Port/"
    exit
}

Write-Host "==================================================================" -ForegroundColor Green
Write-Host "  GIA PHA DAI GIA DINH TUYEN - PHAN DA CHAY TAI:" -ForegroundColor Green
Write-Host "  👉 http://localhost:$Port/" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Green

Start-Process "http://localhost:$Port/"

$MimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

while ($Listener.IsListening) {
    try {
        $Context = $Listener.GetContext()
        $Req = $Context.Request
        $Res = $Context.Response
        $Res.Headers.Add("Access-Control-Allow-Origin", "*")
        $Res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        $Res.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

        if ($Req.HttpMethod -eq "OPTIONS") {
            $Res.StatusCode = 200
            $Res.Close()
            continue
        }

        $UrlPath = $Req.Url.LocalPath

        # API: GET /api/giapha
        if ($UrlPath -eq "/api/giapha" -and $Req.HttpMethod -eq "GET") {
            if (Test-Path $DbFile) {
                $Bytes = [System.IO.File]::ReadAllBytes($DbFile)
                $Res.ContentType = "application/json; charset=utf-8"
                $Res.StatusCode = 200
                $Res.OutputStream.Write($Bytes, 0, $Bytes.Length)
            } else {
                $Res.StatusCode = 404
            }
            $Res.Close()
            continue
        }

        # API: POST /api/restore (also used to save full DB state from frontend)
        if ($UrlPath -eq "/api/restore" -and $Req.HttpMethod -eq "POST") {
            $Reader = New-Object System.IO.StreamReader($Req.InputStream, [System.Text.Encoding]::UTF8)
            $Body = $Reader.ReadToEnd()
            $Reader.Close()
            if ($Body -and $Body.Length -gt 10) {
                [System.IO.File]::WriteAllText($DbFile, $Body, [System.Text.Encoding]::UTF8)
            }
            $OutBytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
            $Res.ContentType = "application/json; charset=utf-8"
            $Res.StatusCode = 200
            $Res.OutputStream.Write($OutBytes, 0, $OutBytes.Length)
            $Res.Close()
            continue
        }

        # Static files from public/
        if ($UrlPath -eq "/" -or $UrlPath -eq "") {
            $FilePath = Join-Path $PublicDir "index.html"
        } else {
            $CleanRel = $UrlPath.TrimStart('/').Replace('/', '\')
            if ($CleanRel.StartsWith("public\")) {
                $CleanRel = $CleanRel.Substring(7)
            }
            $FilePath = Join-Path $PublicDir $CleanRel
        }

        if (Test-Path $FilePath -PathType Leaf) {
            $Ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
            $Res.ContentType = if ($MimeTypes.ContainsKey($Ext)) { $MimeTypes[$Ext] } else { "application/octet-stream" }
            $Bytes = [System.IO.File]::ReadAllBytes($FilePath)
            $Res.StatusCode = 200
            $Res.OutputStream.Write($Bytes, 0, $Bytes.Length)
        } else {
            # Fallback to index.html
            $IndexFile = Join-Path $PublicDir "index.html"
            $Bytes = [System.IO.File]::ReadAllBytes($IndexFile)
            $Res.ContentType = "text/html; charset=utf-8"
            $Res.StatusCode = 200
            $Res.OutputStream.Write($Bytes, 0, $Bytes.Length)
        }
        $Res.Close()
    } catch {
        # Ignore transient listener errors
    }
}
