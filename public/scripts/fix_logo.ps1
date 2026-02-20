Add-Type -AssemblyName System.Drawing
$inPath = "C:\Users\Gol D. Roger\OneDrive\Belgeler\GitHub\public\img\logo.png"
$img = New-Object System.Drawing.Bitmap($inPath)
$pixel = $img.GetPixel(0,0)
$img.MakeTransparent($pixel)
$tempPath = "C:\Users\Gol D. Roger\OneDrive\Belgeler\GitHub\public\img\logo_temp.png"
$img.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()
Move-Item -Path $tempPath -Destination $inPath -Force
