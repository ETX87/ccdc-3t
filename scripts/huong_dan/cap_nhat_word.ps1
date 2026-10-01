# Mo DOCX bang Word: cap nhat muc luc + so trang, luu lai, xuat PDF (de xem truoc / gui kem).
param([string]$Docx)
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($Docx)
  foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
  $doc.Fields.Update() | Out-Null
  foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
  $doc.Save()
  $pdf = [System.IO.Path]::ChangeExtension($Docx, '.pdf')
  $doc.ExportAsFixedFormat($pdf, 17)
  "Trang: " + $doc.ComputeStatistics(2)
  $doc.Close()
} finally { $word.Quit() }
