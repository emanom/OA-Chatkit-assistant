# Extract private key from PFX for ACM import
$password = ConvertTo-SecureString -String "temp-password-123" -Force -AsPlainText
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2("certificate.pfx", $password)

# Export certificate (public key) in PEM format
$certBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
$certPem = "-----BEGIN CERTIFICATE-----`n"
$certPem += [System.Convert]::ToBase64String($certBytes) -replace '.{64}', '$&`n'
$certPem += "`n-----END CERTIFICATE-----"
$certPem | Out-File -FilePath "cert-only.pem" -Encoding ASCII

# Export private key in PEM format
# Note: This requires the certificate to have an exportable private key
try {
    $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
    if ($rsa) {
        $privateKeyBytes = $rsa.ExportRSAPrivateKey()
        $privateKeyPem = "-----BEGIN RSA PRIVATE KEY-----`n"
        $privateKeyPem += [System.Convert]::ToBase64String($privateKeyBytes) -replace '.{64}', '$&`n'
        $privateKeyPem += "`n-----END RSA PRIVATE KEY-----"
        $privateKeyPem | Out-File -FilePath "private-key.pem" -Encoding ASCII
        Write-Host "Private key extracted successfully"
    } else {
        Write-Host "Could not extract private key. Using PFX file directly for import."
    }
} catch {
    Write-Host "Error extracting private key: $_"
    Write-Host "You can import the PFX file directly, but ACM prefers separate PEM files"
}

Write-Host ""
Write-Host "Files ready for ACM import:"
Write-Host "  - cert-only.pem (certificate)"
if (Test-Path "private-key.pem") {
    Write-Host "  - private-key.pem (private key)"
} else {
    Write-Host "  - certificate.pfx (contains both certificate and private key)"
}

