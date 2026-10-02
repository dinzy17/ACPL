param(
  [string]$HostIp = "3.16.112.125",
  [string]$User = "ec2-user",
  [string]$Pem = "C:\Users\osinha\OneDrive - Qualys, Inc\Desktop\Keys\Arcusverse.pem",
  [string]$PublicUrl = "http://3.16.112.125:3000"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$remote = "${User}@${HostIp}"
$bundle = Join-Path $env:TEMP "arcusverse-deploy.tgz"

if (!(Test-Path $Pem)) { throw "PEM not found: $Pem" }

# OpenSSH on Windows rejects keys with broad ACLs — use a locked temp copy
$pemUse = Join-Path $env:TEMP "Arcusverse-deploy.pem"
Copy-Item -Force $Pem $pemUse
icacls $pemUse /inheritance:r | Out-Null
icacls $pemUse /grant:r "$env:USERNAME`:R" | Out-Null
$sshArgs = @("-i", $pemUse, "-o", "StrictHostKeyChecking=accept-new", "-o", "IdentitiesOnly=yes")

Write-Host "Packing project from $root ..."
if (Test-Path $bundle) { Remove-Item $bundle -Force }

Push-Location $root
& tar -czf $bundle --exclude=node_modules --exclude=.next --exclude=.git --exclude="*.log" .
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "tar failed" }
Pop-Location

Write-Host "Bundle size: $([math]::Round((Get-Item $bundle).Length / 1MB, 1)) MB"
Write-Host "Using key $pemUse"
Write-Host "Uploading to $remote ..."

& scp @sshArgs $bundle "${remote}:/home/ec2-user/arcusverse-deploy.tgz"
if ($LASTEXITCODE -ne 0) { throw "scp bundle failed" }
& scp @sshArgs (Join-Path $root "deploy\arcusverse.service") "${remote}:/home/ec2-user/arcusverse.service"
if ($LASTEXITCODE -ne 0) { throw "scp service failed" }

$remoteScript = @"
set -euo pipefail
PUBLIC_URL='$PublicUrl'
echo "Node setup..."
if ! command -v node >/dev/null 2>&1; then
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nodejs npm || true
  fi
fi
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - || true
  sudo yum install -y nodejs || sudo dnf install -y nodejs || true
fi
if ! command -v node >/dev/null 2>&1; then
  cd /tmp
  curl -fsSLO https://nodejs.org/dist/v20.19.0/node-v20.19.0-linux-x64.tar.xz
  sudo tar -xJf node-v20.19.0-linux-x64.tar.xz -C /usr/local --strip-components=1
  hash -r
fi
node -v
npm -v

echo "Extracting..."
mkdir -p /home/ec2-user/ArcusVerse
cd /home/ec2-user/ArcusVerse
tar -xzf /home/ec2-user/arcusverse-deploy.tgz
rm -f /home/ec2-user/arcusverse-deploy.tgz

NODE_BIN=`$(command -v node)
sed -i "s|Environment=PUBLIC_URL=.*|Environment=PUBLIC_URL=$${PUBLIC_URL}|" /home/ec2-user/arcusverse.service
sed -i "s|ExecStart=.*|ExecStart=$${NODE_BIN} server.mjs|" /home/ec2-user/arcusverse.service

echo "npm install + build..."
npm install
npm run build

echo "Installing systemd service..."
sudo cp /home/ec2-user/arcusverse.service /etc/systemd/system/arcusverse.service
sudo systemctl daemon-reload
sudo systemctl enable arcusverse

bash /home/ec2-user/ArcusVerse/deploy/serve-public-port.sh "$${PUBLIC_URL}"

if command -v firewall-cmd >/dev/null 2>&1; then
  sudo firewall-cmd --permanent --add-port=3000/tcp || true
  sudo firewall-cmd --reload || true
fi
"@

$remoteScript = $remoteScript -replace "`r`n", "`n"
$remoteScriptPath = Join-Path $env:TEMP "arcusverse-remote.sh"
[System.IO.File]::WriteAllText($remoteScriptPath, $remoteScript)

Write-Host "Installing and starting on server ..."
Get-Content -Raw $remoteScriptPath | & ssh @sshArgs $remote "bash -s"
if ($LASTEXITCODE -ne 0) { throw "remote install failed" }

Write-Host ""
Write-Host "Done."
Write-Host "  App:        $PublicUrl"
Write-Host "  Spectator:  $PublicUrl/live"
