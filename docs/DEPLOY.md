# Deploying to a VPS (later)

Nothing is deployed yet. When you have a VPS and a domain:

1. **VPS**: any small Linux box (1 vCPU / 1 GB RAM is plenty) with Docker and the compose plugin
   installed (`curl -fsSL https://get.docker.com | sh`). Open ports 80 and 443 in its firewall.
2. **DNS**: create an `A` record, e.g. `keywords.yourdomain.com`, pointing at the VPS IP.
3. **Code and config** on the VPS:
   ```bash
   git clone https://github.com/seobeaker/seo-app-1.git && cd seo-app-1
   cp .env.example .env
   ```
   Fill in `.env`: DataForSEO login/password, `DATAFORSEO_MOCK=false`, your spend cap, and:
   ```
   SITE_ADDRESS=keywords.yourdomain.com
   BASIC_AUTH_USER=deepu
   BASIC_AUTH_HASH=<hash>
   ```
   Make the hash with `docker run --rm caddy:2 caddy hash-password --plaintext 'a-strong-password'`
   and write each `$` in it as `$$` inside `.env`.
4. **Start**:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```
   Caddy fetches a Let's Encrypt certificate on first start. Visit https://keywords.yourdomain.com
   and log in with the basic‑auth user.
5. **Update** later: `git pull` then the same `up -d --build` command.
6. **Backup**: everything that matters is `./data/app.db` (saved lists, cache, spend log).

Only the `web` (Caddy) container is exposed; the backend is reachable only inside the compose network,
and the DataForSEO credentials never leave the backend.
