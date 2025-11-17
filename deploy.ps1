# Ensure the ChatKit domain key is available for build steps
$resolveDomainKey = {
    param(
        [string]$existingVite,
        [string]$existingOpenAI,
        [string]$envFilePath
    )

    if ($existingVite -and $existingVite.Trim()) {
        Write-Host "Using existing VITE_CHATKIT_DOMAIN_KEY value."
        return $existingVite.Trim()
    }

    if ($existingOpenAI -and $existingOpenAI.Trim()) {
        Write-Host "Inheriting VITE_CHATKIT_DOMAIN_KEY from OPENAI_DOMAIN_KEY."
        return $existingOpenAI.Trim()
    }

    if (Test-Path $envFilePath) {
        $fileContent = Get-Content $envFilePath | Where-Object { $_ -match "=" }
        foreach ($line in $fileContent) {
            if ($line -match '^\s*VITE_CHATKIT_DOMAIN_KEY\s*=\s*(.+?)\s*$') {
                Write-Host "Loaded VITE_CHATKIT_DOMAIN_KEY from $envFilePath."
                $value = $Matches[1].Trim()
                $trimChars = @([char]39, [char]34, [char]96)
                $value = $value.Trim($trimChars)
                return $value
            }
        }
        foreach ($line in $fileContent) {
            if ($line -match '^\s*OPENAI_DOMAIN_KEY\s*=\s*(.+?)\s*$') {
                Write-Host "Loaded OPENAI_DOMAIN_KEY from $envFilePath for Vite build."
                $value = $Matches[1].Trim()
                $trimChars = @([char]39, [char]34, [char]96)
                $value = $value.Trim($trimChars)
                return $value
            }
        }
    }

    return $null
}

$resolvedDomainKey = & $resolveDomainKey $env:VITE_CHATKIT_DOMAIN_KEY $env:OPENAI_DOMAIN_KEY ".env.local"

if (-not $resolvedDomainKey) {
    Write-Error "Unable to determine ChatKit domain key. Set VITE_CHATKIT_DOMAIN_KEY or OPENAI_DOMAIN_KEY before running deploy.ps1."
    exit 1
}

$env:VITE_CHATKIT_DOMAIN_KEY = $resolvedDomainKey
Write-Host "ChatKit domain key resolved (length $($resolvedDomainKey.Length))."

# Build the production bundle so the env var is baked into the UI
Write-Host "Building production assets..."
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "npm run build failed"
    exit 1
}

# Build the docker image that will be pushed to ECR
Write-Host "Building docker image..."
docker build --build-arg VITE_CHATKIT_DOMAIN_KEY=$resolvedDomainKey -t fyi-cascade:latest .
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker build failed"
    exit 1
}

# Resolve AWS account ID for the current CLI credentials
Write-Host "Resolving AWS account..."
$accountId = aws sts get-caller-identity --query Account --output text
if ($LASTEXITCODE -ne 0 -or -not $accountId) {
    Write-Error "Failed to determine AWS account ID"
    exit 1
}

$registry = "$accountId.dkr.ecr.ap-southeast-2.amazonaws.com"
$imageTag = "$registry/fyi-cascade:latest"

# Get ECR login password and login
Write-Host "Authenticating with ECR registry $registry ..."
aws ecr get-login-password --region ap-southeast-2 | Out-File -FilePath ecr-password.txt -Encoding ASCII -NoNewline
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to get ECR password"
    exit 1
}

Get-Content ecr-password.txt -Raw | docker login --username AWS --password-stdin $registry
Remove-Item ecr-password.txt -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to login to ECR"
    exit 1
}

# Tag image
Write-Host "Tagging image as $imageTag ..."
docker tag fyi-cascade:latest $imageTag
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to tag image"
    exit 1
}

# Push image
Write-Host "Pushing image to ECR..."
docker push $imageTag
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to push image"
    exit 1
}

# Force new deployment
Write-Host "Triggering ECS deployment..."
aws ecs update-service --cluster fyi-cascade-cluster --service fyi-cascade-svc --force-new-deployment --region ap-southeast-2
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to trigger deployment"
    exit 1
}

Write-Host "Deployment triggered successfully!"
