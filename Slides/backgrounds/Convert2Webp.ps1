Add-Type -AssemblyName System.Drawing

$TARGET_WIDTH = 1920
$TARGET_HEIGHT = 1080

function Get-ResizeParams {
    param($FilePath)
    try {
        $img = [System.Drawing.Image]::FromFile($FilePath)
        $w = $img.Width
        $h = $img.Height
        $img.Dispose()

        # Scale only if both dimensions exceed targets
        if ($w -gt $TARGET_WIDTH -and $h -gt $TARGET_HEIGHT) {
            $ratio = [Math]::Max($TARGET_WIDTH / $w, $TARGET_HEIGHT / $h)
            $newW = [Math]::Round($w * $ratio)
            $newH = [Math]::Round($h * $ratio)
            return @("-resize", "$newW", "$newH")
        }
    } catch {
        Write-Error "Could not read image metadata for $FilePath"
    }
    return @()
}

# Process JPEG/JPG
Get-ChildItem -Path . -Include *.jpg, *.jpeg -File -Recurse | ForEach-Object {
    $dest = [System.IO.Path]::ChangeExtension($_.FullName, ".webp")
    $resizeArgs = Get-ResizeParams $_.FullName
    
    # Execute cwebp with splatted arguments for resize
    & cwebp -mt -m 6 -pass 5 -q 80 @resizeArgs "$($_.FullName)" -o "$dest"
    
    # Strict deletion check
    if ($LASTEXITCODE -eq 0 -and (Test-Path "$dest") -and (Get-Item "$dest").Length -gt 0) {
        Remove-Item "$($_.FullName)"
    } else {
        Write-Error "Conversion failed or output empty. Preserving: $($_.FullName)"
    }
}

# Process PNG
Get-ChildItem -Path . -Filter *.png -File -Recurse | ForEach-Object {
    $dest = [System.IO.Path]::ChangeExtension($_.FullName, ".webp")
    $resizeArgs = Get-ResizeParams $_.FullName
    
    & cwebp -mt -m 6 -pass 5 -lossless @resizeArgs "$($_.FullName)" -o "$dest"
    
    if ($LASTEXITCODE -eq 0 -and (Test-Path "$dest") -and (Get-Item "$dest").Length -gt 0) {
        Remove-Item "$($_.FullName)"
    } else {
        Write-Error "Conversion failed or output empty. Preserving: $($_.FullName)"
    }
}