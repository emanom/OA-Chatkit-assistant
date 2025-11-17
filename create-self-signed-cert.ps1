# PowerShell script to create self-signed certificate for ALB testing
# Note: This will show a browser warning, but allows HTTPS testing

Write-Host "Creating self-signed certificate for ALB testing..."

# Create certificate using PowerShell (requires Windows 10+)
$cert = New-SelfSignedCertificate `
    -DnsName "fyi-cascade-alb-2139030396.ap-southeast-2.elb.amazonaws.com", "*.elb.amazonaws.com" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -Provider "Microsoft RSA SChannel Cryptographic Provider" `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddYears(1)

Write-Host "Certificate created: $($cert.Thumbprint)"

# Export certificate and private key
$password = ConvertTo-SecureString -String "temp-password-123" -Force -AsPlainText

# Export certificate (public key)
Export-Certificate -Cert $cert -FilePath ".\certificate.pem" -Type CERT

# Export private key
$certPath = "Cert:\CurrentUser\My\$($cert.Thumbprint)"
Export-PfxCertificate -Cert $certPath -FilePath ".\certificate.pfx" -Password $password

Write-Host ""
Write-Host "Certificate files created:"
Write-Host "  - certificate.pem (public key)"
Write-Host "  - certificate.pfx (private key + certificate)"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Import certificate.pfx to AWS Certificate Manager (ACM)"
Write-Host "2. Use the ACM certificate ARN to create HTTPS listener on ALB"
Write-Host ""
Write-Host "To import to ACM, run:"
Write-Host 'aws acm import-certificate --certificate fileb://certificate.pem --private-key fileb://certificate.pfx --region ap-southeast-2'

