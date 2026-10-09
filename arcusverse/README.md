# ArcusVerse

An auction app for cricket, badminton and table tennis with live bidding and spectator view.

Runs on LAN or a public host (e.g. EC2). Spectators use `/live`; staff and owners sign in at the app URL.

## Quick start

```bash
npm install
npm run dev
```

Open the printed URL. For internet hosting set `PUBLIC_URL` (see `docs/DEPLOY_EC2.md`).

### Default access

| Role | How to sign in |
| --- | --- |
| Super Admin | username `osinha` · password `12345abc` |
| Auctioneer / Admin | create users under Admin → Users |
| Owners | owner accounts linked to teams |
| Spectators | open `/live` or `/live/CODE` (no login) |

## What it covers

- **Tournaments** with sport, dates, venue, and auction Yes/No
- **Players / Teams / Owners** CRUD, photo & logo upload, CSV bulk players, sport tagging
- **Auctions** with purse, increment slabs, max squad, base-price caps, live hammer desk
- **Owner home** with team roster, enter auction by code or listed auction
- **ACPL historical stats** on hammer desk and player details
- **Post-auction summary** and schedule tools

Amounts are stored in **lakhs** (1 Cr = 100 L) and shown as ₹ Cr / ₹ L.
