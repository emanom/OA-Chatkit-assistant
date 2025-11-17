# Convert PFX to PEM format for ACM import
$password = ConvertTo-SecureString -String "temp-password-123" -Force -AsPlainText
$pfx = Get-PfxData -FilePath "certificate.pfx" -Password $password
$cert = $pfx.EndEntityCertificates[0]

# Get certificate bytes
$certBytes = $cert.Certificate.RawData
$base64 = [System.Convert]::ToBase64String($certBytes)

# Format as PEM (64 characters per line)
$lines = @()
$lines += "-----BEGIN CERTIFICATE-----"
for ($i = 0; $i -lt $base64.Length; $i += 64) {
    $chunk = $base64.Substring($i, [Math]::Min(64, $base64.Length - $i))
    $lines += $chunk
}
$lines += "-----END CERTIFICATE-----"

# Write PEM file
$lines -join "`n" | Out-File -FilePath "cert-pem.pem" -Encoding ASCII

Write-Host "Certificate converted to PEM format: cert-pem.pem"
Write-Host ""
Write-Host "Now extracting private key..."

# Try to extract private key
try {
    $key = $cert.PrivateKey
    if ($key) {
        # Export private key
        $keyBytes = $key.Export([System.Security.Cryptography.CngKeyBlobFormat]::Pkcs8PrivateBlob)
        $keyBase64 = [System.Convert]::ToBase64String($keyBytes)
        
        $keyLines = @()
        $keyLines += "-----BEGIN PRIVATE KEY-----"
        for ($i = 0; $i -lt $keyBase64.Length; $i += 64) {
            $chunk = $keyBase64.Substring($i, [Math]::Min(64, $keyBase64.Length - $i))
            $keyLines += $chunk
        }
        $keyLines += "-----END PRIVATE KEY-----"
        
        $keyLines -join "`n" | Out-File -FilePath "private-key.pem" -Encoding ASCII
        Write-Host "Private key extracted: private-key.pem"
    } else {
        Write-Host "Warning: Could not extract private key. ACM may accept the PFX file."
    }
} catch {
    Write-Host "Note: Private key extraction failed. You may need to use the PFX file directly."
    Write-Host "Error: $_"
}

Write-Host ""
Write-Host "Files ready:"
Write-Host "  - cert-pem.pem (certificate in PEM format)"
if (Test-Path "private-key.pem") {
    Write-Host "  - private-key.pem (private key)"
} else {
    Write-Host "  - certificate.pfx (contains private key)"
}

