# Original vector artwork: ../icons/icon.svg. No external packages required.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$icons = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../icons'))
$bitmap = New-Object System.Drawing.Bitmap(768, 768)
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode = 'AntiAlias'
$g.ScaleTransform(6, 6)
$background = New-Object System.Drawing.Drawing2D.GraphicsPath
$background.AddArc(4, 4, 56, 56, 180, 90)
$background.AddArc(68, 4, 56, 56, 270, 90)
$background.AddArc(68, 68, 56, 56, 0, 90)
$background.AddArc(4, 68, 56, 56, 90, 90)
$background.CloseFigure()
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#203f34'))
$g.FillPath($brush, $background)
$pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#bde8cc'), 8)
$pen.StartCap = $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
function Draw-Lines($coordinates) {
  $points = @()
  for ($i=0; $i -lt $coordinates.Count; $i+=2) { $points += New-Object System.Drawing.PointF($coordinates[$i], $coordinates[$i+1]) }
  $g.DrawLines($pen, [System.Drawing.PointF[]]$points)
}
Draw-Lines @(40,47,24,64,40,81)
Draw-Lines @(90,47,106,64,90,81)
$flag = [System.Drawing.PointF[]]@((New-Object System.Drawing.PointF(58,37)),(New-Object System.Drawing.PointF(83,37)),(New-Object System.Drawing.PointF(76,48)),(New-Object System.Drawing.PointF(83,59)),(New-Object System.Drawing.PointF(58,59)))
$flagBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#edc880'))
$g.FillPolygon($flagBrush, $flag)
$pen.Color = [System.Drawing.ColorTranslator]::FromHtml('#fff9ed'); $pen.Width = 7
Draw-Lines @(58,37,58,91)
foreach ($size in @(16,32,48,128)) {
  $output = New-Object System.Drawing.Bitmap($size, $size)
  $scaled = [System.Drawing.Graphics]::FromImage($output)
  $scaled.InterpolationMode = 'HighQualityBicubic'; $scaled.PixelOffsetMode = 'HighQuality'
  $scaled.DrawImage($bitmap, 0, 0, $size, $size)
  $output.Save((Join-Path $icons "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $scaled.Dispose(); $output.Dispose()
}
$g.Dispose(); $bitmap.Dispose(); $brush.Dispose(); $flagBrush.Dispose(); $background.Dispose(); $pen.Dispose()
Write-Output 'Generated 16, 32, 48 and 128 px icons.'
