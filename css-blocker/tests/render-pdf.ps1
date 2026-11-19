param([string]$InputPdf, [string]$OutputPng)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime]
$genericTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await-Operation($Operation, $ResultType) {
  $task = $genericTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}
$file = Await-Operation ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path -LiteralPath $InputPdf).Path)) ([Windows.Storage.StorageFile])
$pdf = Await-Operation ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
$page = $pdf.GetPage(0)
$stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
$actionTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and !$_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
$task = $actionTask.Invoke($null, @($page.RenderToStreamAsync($stream)))
$task.Wait()
$reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
$null = Await-Operation ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
$bytes = New-Object byte[] $stream.Size
$reader.ReadBytes($bytes)
[System.IO.File]::WriteAllBytes($OutputPng, $bytes)
$reader.Dispose(); $stream.Dispose(); $page.Dispose()
Write-Output "Rendered $OutputPng"
