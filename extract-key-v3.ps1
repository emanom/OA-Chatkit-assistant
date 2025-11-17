# Extract private key using ExportParameters method
$password = ConvertTo-SecureString -String "temp-password-123" -Force -AsPlainText
$pfxPath = "certificate.pfx"

$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2
$cert.Import($pfxPath, $password, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable -bor [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::UserKeySet)

Write-Host "Certificate imported. Thumbprint: $($cert.Thumbprint)"

try {
    # Get RSA private key
    $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
    if ($rsa) {
        Write-Host "Found RSA private key, exporting using ExportParameters..."
        
        # Export RSA parameters
        $parameters = $rsa.ExportParameters($true)  # true = include private key
        
        # Convert to PKCS#1 format (RSA PRIVATE KEY)
        # We'll use a helper function to convert RSA parameters to PEM
        $modulus = $parameters.Modulus
        $exponent = $parameters.Exponent
        $d = $parameters.D
        $p = $parameters.P
        $q = $parameters.Q
        $dp = $parameters.DP
        $dq = $parameters.DQ
        $inverseQ = $parameters.InverseQ
        
        # Build ASN.1 DER encoded RSA private key
        # This is complex, so let's try using the RSACryptoServiceProvider instead
        $csp = New-Object System.Security.Cryptography.RSACryptoServiceProvider
        $csp.ImportParameters($parameters)
        
        # Export as XML (contains private key)
        $xml = $csp.ToXmlString($true)
        Write-Host "Private key exported to XML format"
        Write-Host "Note: We need to convert this to PEM format"
        
        # For now, let's try a simpler approach - use certutil to export
        Write-Host ""
        Write-Host "Trying certutil export method..."
        
    } else {
        Write-Host "Could not get RSA private key"
    }
} catch {
    Write-Host "Error: $_"
    Write-Host ""
    Write-Host "Let's try using certutil to export the private key..."
}

# Alternative: Use certutil to export private key
Write-Host ""
Write-Host "Attempting to export private key using certutil..."
Write-Host "Certificate thumbprint: $($cert.Thumbprint)"

# Try exporting using certutil
$thumbprint = $cert.Thumbprint
$exportCmd = "certutil -exportPFX -p temp-password-123 -f -user My $thumbprint temp-export.pfx"
Write-Host "Run this command in an elevated PowerShell: $exportCmd"
Write-Host ""
Write-Host "Then use OpenSSL to extract:"
Write-Host "openssl pkcs12 -in temp-export.pfx -nocerts -nodes -out private-key.pem -passin pass:temp-password-123"

