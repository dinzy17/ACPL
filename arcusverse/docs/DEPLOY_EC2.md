# ArcusVerse EC2 deploy

## Public URLs (internet — no same Wi‑Fi required)

| Role | URL |
|------|-----|
| Admin / Owner / Auctioneer | http://3.16.112.125:3000 |
| Spectator | http://3.16.112.125:3000/live |
| Spectator + auction code | http://3.16.112.125:3000/live/CODE |
| Registration | http://3.16.112.125:3000/register/ACPL-6 |

Registration links are built from `PUBLIC_URL` (systemd unit or
`deploy/production.env`), so that value has to name a port the outside world can
actually reach — see below.

## Port 80 and WhatsApp links

WhatsApp only turns a URL into a tap-able link when it has no `:port`, which is
why `PUBLIC_URL` was once set to plain `http://3.16.112.125`. That only works if
port 80 is reachable, and on security group `sg-003e3a08a29694c44` it is not:
three independent external nodes time out on TCP 80 while TCP 3000 connects in
~100 ms. nginx is up and `curl http://127.0.0.1/` returns 200 on the host, so the
block is in the security group, not the server.

The result was silent: the app looked healthy on `:3000`, nginx looked healthy
locally, and only the shared registration links were dead.

To get linkified URLs back:

1. Add inbound **TCP 80** from `0.0.0.0/0` to the security group.
2. Set `PUBLIC_URL=http://3.16.112.125` (no port) in `deploy/production.env` and
   the systemd unit.
3. Run the verification script below — it fails loudly if port 80 still is not
   reachable, instead of leaving you with dead links.

`server.mjs` binds the port named by `PUBLIC_URL` itself when it differs from
`PORT`, so no reverse proxy is needed. Two things make that work:

- `AmbientCapabilities=CAP_NET_BIND_SERVICE` in `deploy/arcusverse.service`, since
  the service runs as `ec2-user` and ports below 1024 are privileged.
- Nothing else holding the port. A leftover nginx/httpd keeps accepting
  connections even when it can no longer proxy.

If the port cannot be bound, the app logs the reason and advertises
`http://3.16.112.125:3000` instead, so copied links still work.

A security-group block cannot be detected from inside the instance, so
Registration → Settings also probes the advertised URL from the browser and shows
a warning plus a working URL when it does not answer.

## Verifying the public port

```bash
bash deploy/serve-public-port.sh http://3.16.112.125:3000
```

It frees the port of any reverse proxy (only when it differs from `PORT`),
restarts `arcusverse`, and checks loopback, the app port, and the **public**
address. The public check is the one that catches a closed security group.

```bash
sudo ss -ltnp "( sport = :80 )"      # who owns port 80
sudo journalctl -u arcusverse -n 50  # bind errors
```

## Deploy from Windows

```powershell
.\scripts\deploy-ec2.ps1
```

Requires OpenSSH (`ssh`, `scp`) and the PEM at:
`C:\Users\osinha\OneDrive - Qualys, Inc\Desktop\Keys\Arcusverse.pem`

## AWS security group

Inbound rules on `sg-003e3a08a29694c44`:

- TCP **22** (SSH) from your IP
- TCP **3000** from `0.0.0.0/0` — currently how everyone reaches the app
- TCP **80** from `0.0.0.0/0` — **not present today**; needed for portless,
  WhatsApp-linkified URLs

## Service

```bash
sudo systemctl status arcusverse
sudo journalctl -u arcusverse -f
```
