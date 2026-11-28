# Deploying Vakeel Bhai

One Ubuntu server runs everything:

| Part | How |
|---|---|
| Website, client and advocate portals, `/admin` | Static files built by Vite, served by nginx |
| API (`/api`) and live updates (`/socket.io`) | Node 22 under pm2 on `127.0.0.1:5000`, proxied by nginx |
| Database | MongoDB 8 as a **single-node replica set** (the money code needs transactions), or MongoDB Atlas |
| HTTPS | Let's Encrypt (certbot) |
| Mobile app | Talks to `https://api.<domain>` (`mobile-app/src/api/config.ts`, `PROD_API_URL`) |

Replace `vakeelbhai.com` everywhere below with the real domain. DNS first: `A` records for `vakeelbhai.com`, `www` and `api` pointing at the server.

## 1. Server (once)

Ubuntu 24.04, 2 vCPU / 4 GB RAM is enough at launch.

```bash
# as root
adduser --disabled-password vb && usermod -aG sudo vb
apt update && apt -y upgrade
apt -y install nginx git curl ufw certbot python3-certbot-nginx
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable

# Node 22 + pm2
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt -y install nodejs
npm i -g pm2
pm2 startup systemd -u vb --hp /home/vb      # run the command it prints

mkdir -p /srv/vakeelbhai /var/log/vakeelbhai /var/backups/vakeelbhai /var/www/certbot
chown -R vb:vb /srv/vakeelbhai /var/log/vakeelbhai /var/backups/vakeelbhai
```

### MongoDB (on the server)

Install MongoDB 8 Community from mongodb.org's apt repository (`mongodb-org`, which also gives `mongodump` for backups). Then turn it into a one-node replica set, listening only on localhost:

```yaml
# /etc/mongod.conf (the parts to change)
net:
  bindIp: 127.0.0.1
  port: 27017
replication:
  replSetName: rs0
security:
  authorization: enabled
```

```bash
systemctl enable --now mongod
mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
# create the app user (choose a long password)
mongosh admin --eval 'db.createUser({user:"vbadmin",pwd:"<ADMIN-PASSWORD>",roles:["root"]})'
mongosh -u vbadmin -p --authenticationDatabase admin --eval 'db.getSiblingDB("vakeelbhai").createUser({user:"vb",pwd:"<APP-PASSWORD>",roles:[{role:"readWrite",db:"vakeelbhai"}]})'
```

> With authorization on, a replica set also needs a keyfile (`security.keyFile`); follow MongoDB's "Deploy a self-managed replica set with keyfile authentication" guide. **MongoDB Atlas** (M10 or above, Mumbai region) avoids all of this: use its connection string instead.

## 2. Code and configuration (once)

```bash
sudo -iu vb
git clone <repo-url> /srv/vakeelbhai
cd /srv/vakeelbhai/backend && cp .env.example .env && chmod 600 .env
```

Fill `backend/.env`. The API refuses to start in production with unsafe values (console SMS, sandbox payments or e-Challan, empty CORS).

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `5000` |
| `TRUST_PROXY` | `1` (behind nginx, for real client IPs in rate limits) |
| `MONGODB_URI` | `mongodb://vb:<APP-PASSWORD>@127.0.0.1:27017/vakeelbhai?replicaSet=rs0&authSource=vakeelbhai` (or the Atlas string) |
| `CORS_ORIGINS` | `https://vakeelbhai.com,https://www.vakeelbhai.com` |
| `JWT_ACCESS_SECRET`, `OTP_SECRET` | two different long random strings: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `FILES_ENC_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Store a copy in a password manager now.** Without it the advocate documents can never be read again |
| `UPLOAD_DIR` | `/srv/vakeelbhai-uploads` (outside the code folder; `mkdir` it, owner `vb`, mode 700) |
| `PAYMENT_PROVIDER` | `razorpay` with `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (live keys only after a test-mode run) |
| `SMS_PROVIDER` | the SMS provider once connected (`disabled` until then: nobody can log in) |
| `CHALLAN_PROVIDER` | `disabled` until the client's e-Challan provider is connected |
| `OTP_TEST_NUMBERS` | only the store-review account, if Google asks for one |

Then:

```bash
cd /srv/vakeelbhai/backend && npm ci --omit=dev
npm run seed:categories
npm run admin:create -- --email owner@company.com --name "Owner Name"   # asks for the password (10+ characters)
cd ../frontend && npm ci && npm run build
cd .. && pm2 start deploy/ecosystem.config.cjs && pm2 save
curl -s http://127.0.0.1:5000/api/health      # {"status":"ok","db":"up"}
```

`frontend/.env` for the build (optional): `VITE_PLAY_STORE_URL=<Play Store link>` once the app is live. Leave `VITE_API_URL` empty: the website calls `/api` on its own domain.

## 3. nginx and HTTPS (once)

```bash
sudo cp /srv/vakeelbhai/deploy/nginx.conf /etc/nginx/sites-available/vakeelbhai
sudo sed -i 's/vakeelbhai\.com/<your-domain>/g' /etc/nginx/sites-available/vakeelbhai
sudo ln -s /etc/nginx/sites-available/vakeelbhai /etc/nginx/sites-enabled/ && sudo rm -f /etc/nginx/sites-enabled/default
sudo certbot --nginx -d <your-domain> -d www.<your-domain> -d api.<your-domain>
sudo nginx -t && sudo systemctl reload nginx
```

Check: `https://<your-domain>` (website), `https://<your-domain>/admin`, `https://api.<your-domain>/api/health`.

## 4. After the server is up

1. **Razorpay webhook:** `https://api.<your-domain>/api/payments/webhook/razorpay`, events `payment.captured`, `order.paid`, `payment.failed`. Then one test-mode payment, one failed payment and one refund (backend/README.md).
2. **Admin settings:** GSTIN and invoice details, commission and GST, auto-confirm days, e-Challan charge, WhatsApp number, referral reward, membership plan prices, content (FAQs, terms, privacy, refund).
3. **Mobile app:** set `PROD_API_URL` to `https://api.<your-domain>` and `RELEASE_USES_DEV_SERVER = false` in `mobile-app/src/api/config.ts`, `VB_ALLOW_HTTP=false` in `mobile-app/android/gradle.properties`, then build the signed AAB for the Play Store.
4. **Backups:** `crontab -e` as `vb`, add `30 2 * * * bash /srv/vakeelbhai/deploy/backup.sh >> /var/log/vakeelbhai/backup.log 2>&1`, and copy `/var/backups/vakeelbhai` off the server (another provider or region). Test a restore once: `mongorestore --gzip --archive=<file> --uri=<test db>`.
5. **Logs:** `pm2 logs vakeelbhai-api`; rotate with `pm2 install pm2-logrotate`.

## Updating

```bash
sudo -iu vb && cd /srv/vakeelbhai && bash deploy/deploy.sh
```

It pulls the branch (fast-forward only), installs, builds the website, reloads the API and waits for a healthy `/api/health`. Run the backend tests (`cd backend && npm test`) before you push. If the health check fails, the script prints the commit to go back to.

Database changes are additive so far (new fields have defaults), so no migration step is needed. Indexes are created by the API at start.
