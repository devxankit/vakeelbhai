# Vakeel Bhai API (backend)

One REST API for the mobile app (clients and advocates), the website portals and the admin panel.
Node 22+ · Express 5 · MongoDB (Mongoose 8) · zod · pino · JWT.

Business rules follow `docs/SCOPE-OF-WORK.md` (the working scope, which takes priority over the signed SOW PDF where they differ, see its section 14).

## Status

| Phase | Module | Status |
|---|---|---|
| 2 | Foundation: config, errors, validation, logging, rate limits, input sanitising | ✅ Done, tested |
| 2 | Client/advocate login: mobile OTP, sessions, refresh rotation, logout | ✅ Done, tested (SMS provider not connected) |
| 2 | Admin login (email + password, lock-out), admin team, roles | ✅ Done, tested, admin UI |
| 2 | Settings (commission, GST, auto-confirm, quote validity, wallet cap, WhatsApp, referral) | ✅ Done, tested, admin UI |
| 2 | Service categories, `GET /api/meta`, audit log, dashboard counts | ✅ Done, tested, admin UI |
| 3a | Client profile; advocate registration, photo, 5 documents (encrypted), submit; admin review (approve / retake per document / reject) with history; clients and advocates lists, block/unblock; membership plans (admin) | ✅ Done, tested, admin UI + advocate web portal |
| 3b | Service requests (numbered VB-1001…, documents), admin request queue + assignment/reassignment (eligibility rules), accept/decline with reason, fee quote, private chat (text + photos), live updates (Socket.IO), admin "grant or extend membership" | ✅ Done, tested, admin UI + client and advocate web portals |
| 4a | Pricing engine (paise, parity with the app), wallets + append-only ledger, payments (Razorpay adapter + dev sandbox), quote checkout with wallet, membership purchase, hold → completion → auto-confirm, disputes (release / full refund), withdrawals, bank/UPI details (encrypted), admin payments/withdrawals/ledger/adjustments, dashboard money | ✅ Done, tested (Razorpay not yet run against Razorpay: needs keys), all web screens |
| 4c | **Explore** (verified advocates: photo, name, designation), **help desk** (tickets + chat with the admin team, for clients and advocates), **e-Challan** (vehicles by type and plate, lookup through a provider adapter, pay challans + charge + GST, admin pays the department within 24 h and records the receipt, or refunds) | ✅ Done, tested, admin UI + website. e-Challan runs on the **sandbox** provider until the client picks a real one |
| 4b | Offers and coupons (discount or cashback, % or flat with cap, code or automatic, categories or memberships, dates, total and per-user limits), refer and earn (codes, first-paid-service reward, monthly cap), banners (admin images), GST invoices (PDF, numbered `VB/<FY>/<n>`), reports and CSV export | ✅ Done, tested, admin UI + website + app |
| 5 | GST filing requests (fee set by admin, paid in app, ARN, chat via help desk), content (FAQs, terms, privacy, refund), notification broadcast | ✅ Done, tested, admin UI + website + app. **Still blocked:** the real e-Challan provider adapter (client to choose a provider) |
| 6 | Mobile app on this API (no sample data or demo timers); in-app notifications (`/notifications`); delete my account (`DELETE /auth/account`) | ✅ App connected (`mobile-app/src/api`); offers, refer & earn and GST filing screens say "coming soon" until 4b/5 |

## Run it locally

```bash
cd backend
npm install
cp .env.example .env          # then fill JWT_ACCESS_SECRET and OTP_SECRET (see the comment there)

# MongoDB must be a replica set. No MongoDB installed? Use the dev helper (keep it running):
npm run dev:db                # prints a MONGODB_URI: put it in .env

npm run seed:categories       # the 7 SOW categories (safe to re-run; never overwrites admin edits)
npm run admin:create -- --email you@company.com --name "Your Name"   # first super admin
npm run dev                   # API on http://localhost:5000
```

Website + admin panel: `cd frontend && npm run dev`, then open http://localhost:5173/admin. Vite proxies `/api` to port 5000.

In development, `SMS_PROVIDER=console` prints each OTP to the API log instead of sending an SMS. Production refuses to start with it.

## Tests

```bash
npm test
```

Tests start their own in-memory MongoDB replica set (`mongodb-memory-server`) and a temporary upload folder, so they never touch a real database. The first run downloads a MongoDB binary. 109 tests cover payments (no faked success, double verify, wallet reservation and return, expiry, auto-confirm, disputes, refunds, withdrawal races, membership purchase, Razorpay signatures), the pricing engine (parity with the app), requests, chat, assignment races, advocate verification (locking rules, retakes, concurrent reviews), document security (encryption at rest, content-type sniffing, size limits, who can read what), clients and blocking, plans, website cookie login, OTP login (hashing, single use, attempt limits including parallel guesses, expiry, resend limits, store-review numbers), sessions (rotation, reuse detection, per-device logout, blocked accounts, tampered tokens), admin login and lock-out, role checks, admin team rules, settings, categories, audit log and money units.

## Layout

```text
src/
  app.js, server.js        Express app (no listen) + process entry
  config/                  env (validated with zod), db (+ withTransaction)
  middleware/              auth (requireUser / requireAdmin), validate, sanitize, rateLimit, error
  modules/<area>/          model · routes · service per area
    auth/ users/ admin/ audit/ settings/ categories/ meta/
  providers/sms/           OTP SMS adapter (console | smsindiahub | disabled)
  utils/                   money (paise + basis points), crypto, http helpers, logger
scripts/                   create-admin, seed-categories, dev-db
tests/                     node:test + supertest
```

## Conventions

- **Responses:** `{ success: true, data, meta? }` or `{ success: false, error: { code, message, details? } }`. Validation errors are 422 with `details: [{ in, path, message }]`.
- **Money:** stored as integer paise; rates as basis points (2000 = 20%). The admin API takes percentages and rupees; `/api/meta` gives rates as fractions (0.2), like the apps' `money.ts`.
- **Configurable values** live in the `Settings` document, never in code. Each change is audited with before/after values.
- **Admin actions** are written to `AuditLog` (append-only).
- **Wallet and payment writes** (Phase 4) must use `withTransaction()`, so a balance never changes without its ledger entry.

## Security

- OTP: 6 digits from `crypto.randomInt`, stored as an HMAC, 5-minute expiry, single use, 5 attempts (counted atomically), 30 s resend cooldown, 5 sends per hour per number, plus IP limits.
- Sessions: 15-minute access JWT tied to a session record, so logout, blocking or a password change take effect on the next request. Refresh tokens are random, stored hashed and rotated on every use; re-using an old one revokes the session.
- Admin: bcrypt (cost 12), generic "wrong email or password", lock-out after 5 failures for 15 minutes, last super admin protected. The refresh token is an httpOnly, SameSite=Strict cookie limited to `/api/admin/auth`, and refresh also needs `X-Requested-With`.
- helmet, a CORS allow-list, a 100 kB JSON limit, and rejection of `$`/dotted keys in input. Every field is validated by zod. Secrets, OTPs and tokens are redacted from logs.

## API reference (Phase 2)

All paths start with `/api`. 🔓 public · 👤 client/advocate token · 🛡 admin token · 👑 super admin.

### Health and meta
| | Method | Path | Notes |
|---|---|---|---|
| 🔓 | GET | `/health` | `{ status, db }` |
| 🔓 | GET | `/meta` | Active categories + public settings, in the apps' catalog shape |

```json
GET /api/meta
{ "success": true, "data": {
  "categories": [{ "key": "criminal", "name": "Criminal lawyer", "short": "Criminal", "covers": "...", "long": "...", "docs": ["FIR or complaint copy"], "gstOnService": true, "commission": null }],
  "rates": { "commission": 0.2, "gst": 0.18 },
  "autoConfirmDays": 7, "quoteValidityDays": 7, "walletMaxUsePercent": null, "supportWhatsApp": "", "referralOn": false } }
```

### Client and advocate login
| | Method | Path | Body |
|---|---|---|---|
| 🔓 | POST | `/auth/otp/send` | `{ phone: "9876543210", role: "client" \| "advocate" }` → `{ expiresInSeconds, resendInSeconds }` |
| 🔓 | POST | `/auth/otp/verify` | `{ phone, role, otp: "123456" }` → `{ accessToken, refreshToken, refreshExpiresAt, isNew, user }` |
| 🔓 | POST | `/auth/refresh` | `{ refreshToken }` → new `{ accessToken, refreshToken, refreshExpiresAt }` (the old one stops working) |
| 👤 | POST | `/auth/logout` | Ends this device's session |
| 👤 | GET | `/auth/me` | `{ id, phone, role, status, name, email, createdAt }` |

Error codes to handle in the apps: `OTP_WRONG` / `OTP_EXPIRED` (400, in `details.reason`), `TOO_MANY_REQUESTS` (429 + `Retry-After`), `TOKEN_EXPIRED` (401: refresh, then retry), `SESSION_ENDED` (401: back to login), `ACCOUNT_BLOCKED` (403).

### Admin
| | Method | Path | Notes |
|---|---|---|---|
| 🔓 | POST | `/admin/auth/login` | `{ email, password }` → `{ accessToken, admin }` + refresh cookie |
| 🔓 | POST | `/admin/auth/refresh` | Cookie + `X-Requested-With: XMLHttpRequest` → `{ accessToken, admin }` |
| 🛡 | POST | `/admin/auth/logout` | |
| 🛡 | GET | `/admin/auth/me` | |
| 🛡 | POST | `/admin/auth/password` | `{ currentPassword, newPassword }`. Ends other sessions |
| 🛡 | GET | `/admin/dashboard` | Client/advocate totals, blocked, new in 30 days, active categories |
| 🛡 | GET | `/admin/settings` | Percent / rupee units |
| 👑 | PATCH | `/admin/settings` | Any of `commissionPercent, gstPercent, autoConfirmDays, quoteValidityDays, walletMaxUsePercent, supportWhatsApp, referral{enabled, rewardType, rewardValue, monthlyCap}` |
| 🛡 | GET / POST | `/admin/categories` | Create: `{ key, name, short, covers?, description?, typicalDocs?, gstOnService?, active?, commissionPercent? }` (commission: 👑) |
| 🛡 | PATCH | `/admin/categories/:id` | Partial update; `key` is permanent |
| 🛡 | PUT | `/admin/categories/order` | `{ ids: [...] }`: every id once |
| 🛡 | GET | `/admin/audit-logs` | `?page&limit&entityType&action` |
| 👑 | GET / POST | `/admin/users` | Admin team; create `{ name, email, role, password }` |
| 👑 | PATCH | `/admin/users/:id` | `{ name?, role?, status? }` |
| 👑 | POST | `/admin/users/:id/password` | `{ password }`. Ends their sessions |

### Phase 3a

Website mode: send `X-Client: web` to `/auth/otp/verify`, `/auth/refresh` and `/auth/logout`. The refresh token then goes in an httpOnly cookie (`vb_rt`, path `/api/auth`) instead of the body, and a cookie refresh also needs `X-Requested-With: XMLHttpRequest`. The app keeps using the body.

| | Method | Path | Notes |
|---|---|---|---|
| 👤 client | GET / PATCH | `/client/profile` | `{ name?, email?, city?, state? }` → `{ user, city, state, complete }` |
| 👤 advocate | GET | `/advocate/profile` | Details, `hasPhoto`, `verification { status, submittedAt, reviewedAt, reason }`, `documents[{ key, title, status, note, version }]`, `missing[]` |
| 👤 advocate | PATCH | `/advocate/profile` | `{ name, email, address, state, district, practice[], experienceYears, courts, enrolmentNumber }`, all optional. Only in `draft`; afterwards only `email` (409 `PROFILE_LOCKED`) |
| 👤 advocate | PUT / GET | `/advocate/photo` | multipart field `file` (JPG/PNG/WebP, ≤ 5 MB, checked by content); draft only |
| 👤 advocate | PUT | `/advocate/documents/:key` | key = `districtBar, stateBar, enrolment, aadhaarFront, aadhaarBack`. Draft: any; `reupload`: only those asked for (409 `DOCUMENT_LOCKED`). Replacing the last retake → `pending` |
| 👤 advocate | GET | `/advocate/documents/:key/file` | Own document, `Cache-Control: no-store` |
| 👤 advocate | POST | `/advocate/verification/submit` | 400 with `details.missing` if incomplete |
| 🛡 | GET | `/admin/advocates` | `?status=pending\|reupload\|approved\|rejected\|draft\|blocked&q&district&page&limit`. Pending first, oldest first |
| 🛡 | GET | `/admin/advocates/:id` | Profile, documents, verification, history |
| 🛡 | GET | `/admin/advocates/:id/photo`, `/admin/advocates/:id/documents/:key/file` | |
| 🛡 | POST | `/admin/advocates/:id/review` | `{ decision: 'approve' }` · `{ decision: 'reupload', docs: { aadhaarBack: 'note' } }` · `{ decision: 'reject', reason }`. Only while `pending` (409 `NOT_PENDING`) |
| 🛡 | PATCH | `/admin/advocates/:id/status`, `/admin/clients/:id/status` | `{ status: 'blocked', reason }` or `{ status: 'active' }`. Blocking ends all their sessions |
| 🛡 | GET | `/admin/clients`, `/admin/clients/:id` | `?status=active\|blocked&q&page` |
| 🛡 / 👑 | GET / POST, PATCH `/:id` | `/admin/plans` | `{ name, durationMonths, price (₹ before GST, null = [PRICE]), benefits[], note, highlight, active }`. Changes need a super admin |

`/api/meta` now also returns `plans` in the app's shape `{ id, name, note, months, price, best, benefits }`.

Documents are encrypted on disk with AES-256-GCM (`FILES_ENC_KEY`), named randomly, and served only through the endpoints above (owner or admin), never as static files. **Back up `FILES_ENC_KEY`**: without it the documents cannot be read.

### Phase 3b: requests, assignment, chat

Status on the server: `submitted → assigned → accepted → quoted` (then `paid → done → completed`, or `disputed`, in Phase 4). Each side gets its own vocabulary, as in the app:
- **Client** (`ClientRequest.status`): `assigned` is shown as `submitted`, because the client sees no advocate until they accept (SCOPE-OF-WORK 1.3). `accepted` is shown as `assigned`.
- **Advocate** (`CaseStatus`): `assigned` → `new`. A request they declined stays visible to them as `declined`.

| | Method | Path | Notes |
|---|---|---|---|
| 👤 client | POST | `/client/requests` | `{ category, issue (≥ 15 chars), district, language }` → `{ id: 'VB-1001', status, advocate: null, … }` |
| 👤 client | GET | `/client/requests?tab=active\|completed`, `/client/requests/:id` | `advocate` card (name, verified, years, practice, court, `hasPhoto`; never a phone) only after acceptance; `quote { fee, scope, validTill }` |
| 👤 client | POST / GET | `/client/requests/:id/attachments`, `…/attachments/:aid` | Up to 5 images, private |
| 👤 client | GET | `/client/requests/:id/advocate/photo` | After acceptance only |
| 👤 advocate | GET | `/advocate/cases?tab=new\|active\|completed\|all`, `/advocate/cases/:id` | Verified advocates only (403 `NOT_VERIFIED`). Client shown as first name + initial |
| 👤 advocate | POST | `/advocate/cases/:id/accept` | Needs an active membership (403 `NO_MEMBERSHIP`) |
| 👤 advocate | POST | `/advocate/cases/:id/decline` | `{ reason }`. Back to the admin queue |
| 👤 advocate | POST | `/advocate/cases/:id/quote` | `{ fee (whole ₹, ≥ 100), scope }`. Valid for `quoteValidityDays`; posted in the chat |
| 👤 both | GET / POST | `/requests/:id/messages` | `?after=<ISO>` for new ones. Post `{ text }`. Open from acceptance until completion |
| 👤 both | POST / GET | `/requests/:id/messages/image`, `…/messages/:mid/file` | Photos in chat, private |
| 🛡 | GET | `/admin/requests?tab=unassigned\|waiting\|active\|disputed\|completed\|all&q&category&page` | Queue oldest first |
| 🛡 | GET | `/admin/requests/:id` | Full detail incl. both phone numbers (staff only), assignment history, chat (read-only) |
| 🛡 | GET | `/admin/requests/:id/eligible` | Verified + active membership + practice area + not blocked + not declined before; same district first, then fewest active cases |
| 🛡 | POST | `/admin/requests/:id/assign` | `{ advocateId }`. Assign, or reassign before the advocate answers; locked after acceptance |
| 👑 | POST | `/admin/advocates/:id/membership` | `{ planId, reason }`. Grant or extend (starts at the current end date). Advocate detail and `/advocate/profile` now include `membership { active, planName, memberId, startAt, endAt }` |

**Live updates:** Socket.IO at `/socket.io`, connect with `auth: { token: <access token> }`. Each connection joins only its own room. Events say what changed; the apps then re-fetch over REST:
- `case:new { number }`: to the advocate who was assigned
- `request:update { number }`: to the client and advocate
- `message { number, message }`: to the client and advocate
- `queue:update { number }`: to admins

### Phase 4a: money

**Rules** live in one place, `src/modules/pricing/pricing.js`. Everything is in integer paise, and `tests/pricing.test.js` checks the same cases as the app's `money.test.ts`. Each payment stores the rates and the advocate's payout at payment time, so later rate changes never alter history.

**Payment flow** (client fee or membership):
1. `POST …/checkout` prices the bill on the server and takes the wallet part at once (as a ledger entry).
2. The server creates a gateway order and returns `{ payment, gateway: { provider, keyId, orderId, amount } }`.
3. The browser or app opens Razorpay Checkout and sends the result to `POST /payments/:id/verify`.
4. The server checks the signature, fetches the payment from Razorpay (order, amount, status; captures it if only authorized), and only then marks it paid. The webhook `/api/payments/webhook/razorpay` (raw body, signature checked, duplicate events ignored) does the same if the browser never comes back. Both paths are idempotent.
5. Unpaid checkouts expire after `PAYMENT_EXPIRY_MINUTES`, and any wallet amount goes back. If the wallet covers the whole bill, there is no gateway step.

**After payment:**
- **Paid:** the advocate's net goes on **hold**.
- **Done:** the advocate marks the work done.
- **Completed:** the client confirms (with a rating), or it auto-confirms after `autoConfirmDays`. The net moves from hold to balance (ledger entry with the commission and GST breakup).
- **Disputed:** the client can dispute after paying and before confirming. A super admin then:
  - **releases** the payment, which works like a confirmation, or
  - **refunds in full**: the hold is removed, the wallet part goes back to the wallet, and the gateway part is refunded to the original method (a failed gateway refund is recorded for retry).

A background job runs every 5 minutes for auto-confirm and checkout expiry.

**Wallets:** a balance can never change without a `WalletTransaction` in the same DB transaction. Every entry has a unique key, so retries and duplicate events can't post twice, and debits can't take a balance below zero, even with parallel requests.

| | Method | Path | Notes |
|---|---|---|---|
| 👤 client | GET | `/client/requests/:id/checkout?useWallet=1` | Preview `{ fee, gst, gstPercent, gstOnService, wallet, walletBalance, total }` |
| 👤 client | POST | `/client/requests/:id/checkout` | `{ useWallet }`. 503 `PAYMENTS_DISABLED` if no gateway and the wallet doesn't cover it; 409 `QUOTE_EXPIRED` |
| 👤 any | POST | `/payments/:pay/verify` | `{ orderId, paymentId, signature }` from the gateway |
| 👤 any | POST | `/payments/:pay/cancel` | Payment window closed: releases the checkout and the wallet amount |
| 👤 any | POST | `/payments/:pay/sandbox-pay` | **Sandbox only**: returns what Razorpay's checkout would |
| 👤 client | POST | `/client/requests/:id/confirm` | `{ rating 1–5, review? }` |
| 👤 client | POST | `/client/requests/:id/dispute` | `{ reason }`, while `paid` or `done` |
| 👤 client | GET | `/client/wallet` | `{ balance, tx[] }` |
| 👤 advocate | POST | `/advocate/cases/:id/done` | After payment; sets `autoConfirmAt` |
| 👤 advocate | GET | `/advocate/wallet` | `{ balance, hold, lifetime, month { earned, cases }, account, tx[] (with breakup lines) }` |
| 👤 advocate | GET / PUT | `/advocate/payout-account` | `{ holder, account?, ifsc?, upi? }`. Account stored encrypted; shown as last 4 only |
| 👤 advocate | GET / POST | `/advocate/withdrawals` | `{ amount }`. Reserved from the balance at once; `minWithdrawal` setting applies |
| 👤 advocate | POST | `/advocate/membership/checkout` | `{ planId }`. Price + GST; extends from the current end date |
| 🛡 | GET | `/admin/payments?status&purpose&attention=1` | With GST and commission per payment |
| 👑 | POST | `/admin/payments/:pay/refund` | Only for payments flagged "needs attention" (paid after the request changed) |
| 👑 | POST | `/admin/requests/:id/resolve` | `{ outcome: 'release' \| 'refund', note }` |
| 🛡 / 👑 | GET, POST `/approve`, `/paid { utr }`, `/reject { reason }` | `/admin/withdrawals` | Reject returns the money to the wallet |
| 🛡 | GET | `/admin/wallet-transactions?type` | The full ledger |
| 👑 | POST | `/admin/wallets/:userId/adjust` | `{ amount (±), reason }`. Audited |

`/admin/dashboard` now also returns `requests` counts and `money { thisMonth, allTime: { collected, services, memberships, commission, gst }, withdrawalsPending, paymentsNeedingAttention, openDisputes }`.

**Before going live with Razorpay:**
1. Set the three keys and `PAYMENT_PROVIDER=razorpay`.
2. Register the webhook (URL and events in `.env.example`).
3. Run one test-mode payment, one failed payment and one refund end to end. This adapter has not yet been run against Razorpay.

### Phase 4c: explore, help desk, e-Challan

| | Method | Path | Notes |
|---|---|---|---|
| 👤 client | GET | `/client/advocates?category&q&page` | Verified + active membership + not blocked. Only `{ id, name, designation, hasPhoto }` |
| 👤 client | GET | `/client/advocates/:id/photo` | Listed advocates only |
| 👤 any | GET / POST | `/support/tickets` | Create: `{ topic, subject, message, ref? }` → `HD-1001` |
| 👤 any | GET | `/support/tickets/:n` | With messages; clears the unread marker |
| 👤 any | POST | `/support/tickets/:n/messages`, `…/messages/image`, `…/close` | Writing to a closed ticket reopens it |
| 🛡 | GET | `/admin/support?status=open\|answered\|closed\|all&role&topic&q` | Waiting tickets oldest first |
| 🛡 | GET, POST `/messages`, POST `/close { note? }` | `/admin/support/:n` | Replies show "first name · Vakeel Bhai support" |
| 👤 client | GET / POST / DELETE | `/client/vehicles` | `{ plate, type: bike\|car\|auto\|commercial\|other }`, plate normalised (MP09AB1234), max 10 |
| 👤 client | GET | `/client/vehicles/:id/challans` | From the provider, each marked `due`, `processing` or `paid` |
| 👤 client | POST | `/client/challans/checkout` | `{ vehicleId, challans: [no] }`. Amounts re-fetched from the provider. 503 `CHALLAN_CLOSED` until the admin sets the charge; 409 `CHALLAN_HELD` if already paid or being paid |
| 👤 client | GET | `/client/challans/orders`, `/client/challans/orders/:n` | `EC-1001`: processing (with `dueBy`) → completed (`departmentRef`) or refunded |
| 🛡 | GET | `/admin/challans?status=processing\|completed\|refunded\|all&q` | Closest deadline first, with an `overdue` flag |
| 🛡 / 👑 | POST `/complete { departmentRef }`, `/refund { reason }` | `/admin/challans/:n` | Refund is full (challans + charge + GST); the challans become payable again |

### Phase 4b and 5: offers, referrals, invoices, GST filing, content, reports

| | Method | Path | Notes |
|---|---|---|---|
| 👤 client | GET | `/client/offers` | Live service offers, with `used` per client |
| 👤 client | GET `?code=` / POST `{ code }` | `/client/requests/:id/checkout` | Coupon, or the best automatic offer. Bill has `offer { title, code, kind, cashback }` |
| 👤 advocate | GET `/advocate/offers` · POST `/advocate/membership/checkout { planId, code? }` | | Membership offers |
| 👤 client | GET `/client/referral` · POST `/client/referral/apply { code }` | | Own code (made on first view); apply a friend's code once, before the first paid service |
| 🌐 | GET | `/banners?audience=client\|advocate`, `/banners/:id/image` | Live banners; images are public |
| 🌐 | GET | `/content` | `faqs[]` (audience all/client/advocate), `terms`, `privacy`, `refund` (`draft: true` until the admin saves them) |
| 👤 any | GET | `/invoices` | Own paid payments with invoice numbers |
| 👤 any | GET | `/payments/:pay/invoice` (PDF) · `/payments/:pay/invoice-link` | Link = `/api/invoices/PAY-….pdf?exp&sig`, valid 10 minutes, no login (for the app's browser) |
| 👤 client | GET / POST | `/client/gst-filings` | `{ returnType, gstin?, businessName?, period?, note? }` → `GST-1001` + help-desk ticket |
| 👤 client | POST | `/client/gst-filings/:n/documents` (image), `/:n/checkout` | Pay the fee the team set (fee + GST) |
| 🛡 | GET, POST `/update { status, fee?, filedRef?, note? }`, 👑 `/refund { reason }` | `/admin/gst-filings/:n` | Filed needs the ARN, and the fee paid if there is one |
| 🛡 / 👑 | CRUD | `/admin/offers`, `/admin/banners` (+ `PUT /:id/image`), `GET /admin/referrals` | Writes are super-admin; an offer that was used cannot change its value |
| 🛡 / 👑 | GET / PUT | `/admin/content`, `/admin/content/faqs`, `/admin/content/:terms\|privacy\|refund` | |
| 👑 | POST | `/admin/notifications/broadcast` | `{ audience: clients\|advocates\|all, title, body }` |
| 🛡 | GET | `/admin/reports/summary?from&to`, `/admin/reports/payments.csv`, `/admin/reports/gst.csv`, `/admin/payments/:pay/invoice` | Months in India time; CSV cells are formula-safe |

**Money rules added:** offers reduce the fee before GST and commission (the advocate shares the discount); cashback is credited to the client's wallet when the service completes; an offer use is reserved at checkout and given back if the payment is not completed or is refunded; the referrer is paid once, on the referred client's first completed paid service, within the monthly cap, only while referrals are on. Invoice numbers are gap-free per financial year (April–March). Settings gained `invoice { legalName, gstin, address, email }`.

**Notifications and account deletion (Phase 6):**

| | Method | Path | Notes |
|---|---|---|---|
| 👤 any | GET | `/notifications` | Latest 100, `meta.unread`; also pushed live as `notification`. Each has `link { kind, id }` (request, case, ticket, challan, wallet, membership, verification) |
| 👤 any | POST | `/notifications/read` | `{ ids? }`, all when empty |
| 👤 any | DELETE | `/auth/account` | Refused (409 `ACTIVE_WORK` / `WALLET_NOT_EMPTY`) while work or money is in flight. Erases name and email, ends every session; money and case records stay. Logging in again with the number starts a fresh, empty profile |

**e-Challan money:** the client pays the challan amounts + (charge per challan × number of challans) + GST on the charge only. Settings: `challanFee` (empty = payments closed) and `challanPayHours` (24). Each challan number is locked to one open or paid order (`ChallanLock`), so the same challan cannot be paid twice, even by parallel checkouts. Live events: `challan:update`, `support:update` (to the user and to admins).

**e-Challan provider:** `CHALLAN_PROVIDER=sandbox` (development only, refused in production) returns 1 or 2 sample challans for any plate. The real provider adapter goes in `src/providers/challan/` with the same `lookup({ plate, type })` shape.

## Blocked on the client (not built, nothing faked)

- **e-Challan provider** (a BBPS biller or an aggregator API) and the charge per challan. Until then e-Challan runs only on the development sandbox.

- **SMS provider** (SMS India Hub planned): account, sender ID and a DLT-registered OTP template. Until then real phones get no SMS outside development.
- **Admin "forgot password" by email:** needs an email provider. For now a super admin sets a new password from the Admin team page.

## Business decisions still open

These are kept as settings or marked in code, not invented:

1. Assignment timeout: does an unanswered assignment return to the queue after N hours? (Now: no timeout; the admin can reassign any time before the advocate answers.)
2. Re-quoting and quote limits. (Now: a new quote replaces the old one until the client pays; fee ₹100 to ₹1 crore, whole rupees.)
3. Auto-confirm period (7 by default) and the refund/dispute policy. (Now: disputes allowed after paying and before confirming; refunds are full only, to the original method plus wallet; who bears gateway fees on refunds is undecided.)
4. Who bears offer discounts; cashback timing.
5. Withdrawals: minimum amount (setting exists, empty = none), frequency, manual vs automatic payout (now: admin pays manually and records the UTR); TDS (194-O) on payouts.
6. Client wallet cap per order (setting exists, empty = no cap).
7. Referral reward type, amount and monthly cap (setting exists, off until set).
8. What happens to active cases when a membership expires.
9. **One account per phone + role** is implemented (the same number can be a client and an advocate, with separate wallets). Change `user.model.js` if the client decides otherwise.
10. Plan prices; Aadhaar image retention; payment gateway (Razorpay recommended, not confirmed); e-Challan provider and the charge per challan (setting `challanFee`, empty = closed); who bears the gateway fee when a challan payment is refunded.
11. GST treatment of legal services and TDS, confirmed by the client's CA, plus the platform GSTIN.
