# Extract private key from PFX using Windows certificate store
$password = ConvertTo-SecureString -String "temp-password-123" -Force -AsPlainText

# Import PFX to temporary certificate store
$pfxPath = "certificate.pfx"
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2
$cert.Import($pfxPath, $password, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable -bor [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::UserKeySet)

Write-Host "Certificate imported. Thumbprint: $($cert.Thumbprint)"

# Try to get the private key using RSACng
try {
    $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
    if ($rsa) {
        Write-Host "Found RSA private key, exporting..."
        
        # Export as PKCS#8 private key
        $privateKeyBytes = $rsa.ExportPkcs8PrivateKey()
        $privateKeyBase64 = [System.Convert]::ToBase64String($privateKeyBytes)
        
        # Format as PEM
        $keyLines = @("-----BEGIN PRIVATE KEY-----")
        for ($i = 0; $i -lt $privateKeyBase64.Length; $i += 64) {
            $chunkLength = [Math]::Min(64, $privateKeyBase64.Length - $i)
            $chunk = $privateKeyBase64.Substring($i, $chunkLength)
            $keyLines += $chunk
        }
        $keyLines += "-----END PRIVATE KEY-----"
        
        $keyContent = $keyLines -join "`r`n"
        Set-Content -Path "private-key.pem" -Value $keyContent -Encoding ASCII
        
        Write-Host "Private key extracted successfully to private-key.pem"
        Write-Host ""
        Write-Host "First few lines:"
        Get-Content "private-key.pem" -Head 3
    } else {
        Write-Host "Could not get RSA private key"
    }
} catch {
    Write-Host "Error: $_"
    Write-Host ""
    Write-Host "Trying alternative method..."
    
    # Alternative: Try to export using certificate store
    try {
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store([System.Security.Cryptography.X509Certificates.StoreName]::My, [System.Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser)
        $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
        $store.Add($cert)
        
        # Now try to get it from the store
        $storedCert = $store.Certificates.Find([System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint, $cert.Thumbprint, $false)[0]
        if ($storedCert -and $storedCert.HasPrivateKey) {
            Write-Host "Certificate stored, trying to export private key..."
            # The private key should now be accessible
        }
        $store.Close()
    } catch {
        Write-Host "Alternative method also failed: $_"
    }
}

