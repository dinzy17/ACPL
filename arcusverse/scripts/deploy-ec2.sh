#!/usr/bin/env bash
# Deploy current ArcusVerse tree to the EC2 host (Linux/macOS equivalent of deploy-ec2.ps1).
set -euo pipefail

HOST_IP="${HOST_IP:-3.16.112.125}"
USER_NAME="${USER_NAME:-ec2-user}"
PEM="${PEM:-${EC2_SSH_KEY_PATH:-}}"
PUBLIC_URL="${PUBLIC_URL:-http://3.16.112.125:3000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${USER_NAME}@${HOST_IP}"
BUNDLE="$(mktemp -t arcusverse-deploy.XXXXXX.tgz)"

cleanup() { rm -f "$BUNDLE" "${BUNDLE}.pem" 2>/dev/null || true; }
trap cleanup EXIT

if [[ -z "$PEM" ]]; then
  echo "Set PEM=/path/to/Arcusverse.pem or EC2_SSH_KEY_PATH" >&2
  exit 1
fi
if [[ ! -f "$PEM" ]]; then
  echo "PEM not found: $PEM" >&2
  exit 1
fi

PEM_USE="$(mktemp -t Arcusverse-deploy.XXXXXX.pem)"
cp "$PEM" "$PEM_USE"
chmod 600 "$PEM_USE"
SSH_OPTS=(-i "$PEM_USE" -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes)

echo "Packing $ROOT ..."
tar -C "$ROOT" -czf "$BUNDLE" \
  --exclude=node_modules --exclude=.next --exclude=.git --exclude='*.log' .

echo "Uploading to $REMOTE ..."
scp "${SSH_OPTS[@]}" "$BUNDLE" "${REMOTE}:/home/ec2-user/arcusverse-deploy.tgz"
scp "${SSH_OPTS[@]}" "$ROOT/deploy/arcusverse.service" "${REMOTE}:/home/ec2-user/arcusverse.service"

ssh "${SSH_OPTS[@]}" "$REMOTE" bash -s <<EOF
set -euo pipefail
PUBLIC_URL='$PUBLIC_URL'
echo "Extracting..."
mkdir -p /home/ec2-user/ArcusVerse
cd /home/ec2-user/ArcusVerse
tar -xzf /home/ec2-user/arcusverse-deploy.tgz
rm -f /home/ec2-user/arcusverse-deploy.tgz

NODE_BIN=\$(command -v node)
sed -i "s|Environment=PUBLIC_URL=.*|Environment=PUBLIC_URL=\${PUBLIC_URL}|" /home/ec2-user/arcusverse.service
sed -i "s|ExecStart=.*|ExecStart=\${NODE_BIN} server.mjs|" /home/ec2-user/arcusverse.service

echo "npm install + build..."
npm install
npm run build

echo "Installing systemd service..."
sudo cp /home/ec2-user/arcusverse.service /etc/systemd/system/arcusverse.service
sudo systemctl daemon-reload
sudo systemctl enable arcusverse
if [[ -x /home/ec2-user/ArcusVerse/deploy/serve-public-port.sh ]]; then
  bash /home/ec2-user/ArcusVerse/deploy/serve-public-port.sh "\${PUBLIC_URL}" || true
fi
sudo systemctl restart arcusverse
sudo systemctl --no-pager --full status arcusverse | head -20
echo "Deployed. Open \${PUBLIC_URL}/admin/auctions (hard refresh)."
EOF

echo "Done."
