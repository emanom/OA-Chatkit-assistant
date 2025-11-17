# Export certificate from Windows certificate store to PEM format
$thumbprint = "3804D68E772A486548101651282492B9849C3205"
$cert = Get-ChildItem "Cert:\CurrentUser\My\$thumbprint"

if ($cert) {
    # Export certificate to PEM format
    $certBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
    $base64 = [System.Convert]::ToBase64String($certBytes)
    
    # Format as PEM (64 characters per line)
    $pemLines = @("-----BEGIN CERTIFICATE-----")
    for ($i = 0; $i -lt $base64.Length; $i += 64) {
        $chunkLength = [Math]::Min(64, $base64.Length - $i)
        $chunk = $base64.Substring($i, $chunkLength)
        $pemLines += $chunk
    }
    $pemLines += "-----END CERTIFICATE-----"
    
    $pemContent = $pemLines -join "`r`n"
    Set-Content -Path "cert-final.pem" -Value $pemContent -Encoding ASCII
    
    Write-Host "Certificate exported to cert-final.pem"
    Write-Host ""
    Write-Host "First few lines:"
    Get-Content "cert-final.pem" -Head 5
    
    Write-Host ""
    Write-Host "Now you can import to ACM with:"
    Write-Host 'aws acm import-certificate --certificate fileb://cert-final.pem --private-key fileb://certificate.pfx --region ap-southeast-2'
} else {
    Write-Host "Certificate not found in store. Using existing certificate.pem file."
}

