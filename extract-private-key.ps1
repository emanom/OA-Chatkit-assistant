# Extract private key from PFX file
$password = ConvertTo-SecureString -String "temp-password-123" -Force -AsPlainText
$pfx = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2
$pfx.Import("certificate.pfx", $password, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable)

# Get RSA private key
$rsa = $pfx.GetRSAPrivateKey()
if ($rsa) {
    # Export private key in PKCS#8 format
    $privateKeyBytes = $rsa.ExportRSAPrivateKey()
    $privateKeyBase64 = [System.Convert]::ToBase64String($privateKeyBytes)
    
    # Format as PEM
    $keyLines = @("-----BEGIN RSA PRIVATE KEY-----")
    for ($i = 0; $i -lt $privateKeyBase64.Length; $i += 64) {
        $chunkLength = [Math]::Min(64, $privateKeyBase64.Length - $i)
        $chunk = $privateKeyBase64.Substring($i, $chunkLength)
        $keyLines += $chunk
    }
    $keyLines += "-----END RSA PRIVATE KEY-----"
    
    $keyContent = $keyLines -join "`r`n"
    Set-Content -Path "private-key.pem" -Value $keyContent -Encoding ASCII
    
    Write-Host "Private key extracted to private-key.pem"
    Write-Host ""
    Write-Host "First few lines:"
    Get-Content "private-key.pem" -Head 3
} else {
    Write-Host "Could not extract private key. The certificate may not have an exportable private key."
    Write-Host "Try recreating the certificate with exportable private key."
}

