# Vakeel Bhai: Project Plan

Sources: [SCOPE-OF-WORK.md](SCOPE-OF-WORK.md) (our working scope), the client's signed SOW PDF, and the decision session of 18 Nov 2026.
Build method: `E:\Appzeto Projects\scrapto\docs\NATIVE-APP-PLAYBOOK.md`, with **Driver Finder** (`E:\Appzeto Projects\driver finder new`) as the code and release reference.

---

## 1. Decision log

| # | Topic | Decision |
|---|---|---|
| 1 | Payment | The client pays in the app. The advocate sends a quote in the chat, and the platform holds the money until completion. **The commission % is set by the admin** (global and per category, 20% default) and stored on each request. |
| 2 | Assignment | **The admin assigns manually** from a request queue. The advocate accepts, or declines with a reason. |
| 3 | Contact | **In-app chat only** (text, photos, documents). No phone numbers. |
| 4 | Advocate visibility | Categories only before assignment. The advocate's profile card is shown after they accept. |
| 5 | Completion | The advocate marks the work done, then the client confirms (or it auto-confirms after N days, set by the admin). Disputes go to the admin. |
| 6 | Website | **Full web app:** public SEO pages, a client portal, an advocate portal, and the admin panel at `/admin`. |
| 7 | e-Challan | Full UI on sample data now; the provider is plugged in during the backend phase. |
| 8 | Aadhaar | Image upload checked by the admin; eKYC later. |
| 9 | Languages | en, hi, mr, gu, bn, pa, ta, te, kn (i18next), as in Driver Finder. |
| 10 | Logo | **Mixed as designed:** the navy shield (`app_icon.png`) is the launcher icon, the gold laurel emblem is the splash/hero, and the script wordmark is the header/website. |
| 11 | Palette | **Black + gold + white.** No navy in the UI. The splash and placeholder art are redone in black and gold. |
| 12 | Photos | The provided persona images are **not used** (baked-in names, possibly real people). Free stock photos (Pexels/Unsplash licence) are used, labelled as sample. |
| 13 | Membership | Plans are managed by the admin, shown as `[PRICE]`. |
| 14 | Referral | **Clients only.** The reward is paid on the referred client's first paid service and set by the admin. |
| 15 | Mobile | One React Native CLI app (TypeScript, latest stable RN, 0.87.x as in Driver Finder) for both roles. Folder `mobile-app/`, package **`com.vakeelbhai.app`** (permanent). |
| 16 | iOS | iOS-ready code; Android APK/AAB built on this PC; iOS built later on a Mac. |
| 17 | Build order | **Design canvas (approval) → mobile app on sample data → website + admin on sample data → backend, then connect everything.** |
| 18 | Login | **Mobile OTP only** for clients and advocates (no email/password). The admin panel keeps email + password. |

### Defaults I chose (change any of them)
- Payment gateway **Razorpay**, OTP over **SMS India Hub** with an on/off switch, chat over **Socket.IO**, storage on the server disk with private KYC files. All the same as Driver Finder.
- GST rate 18%, editable by the admin. The commission formula is in SOW section 5 and is to be confirmed by the client's CA.
- Withdrawals are approved by the admin and paid manually, with an optional Razorpay payout later.
- A declined assignment goes back to the admin queue with the decline reason.

---

## 2. Folder layout

```text
vakeel bhai/
  assets/        client's logos, placeholder art (source files)
  docs/          SOW PDF, SCOPE-OF-WORK.md, this plan, design notes
  mobile-app/    React Native CLI app (Client + Advocate), com.vakeelbhai.app
  frontend/      Vite + React 19 + Tailwind 4: public site, client and advocate portals, /admin
  backend/       Node + Express + MongoDB + Socket.IO: one API for app, web and admin
  deploy.sh      VPS update script (git pull → build web → pm2 restart → health check)
```

> The path has a space (`vakeel bhai`). Build Android from a `subst` drive (playbook 4.8).

---

## 3. Mobile app: screen map (about 68 screens)

### 3.1 Shared: start and auth
1. Splash (routing: language → role chosen → logged in → profile/verification state → home)
2. Language picker (each language in its own script)
3. Intro: 3 slides
4. **Role picker** (its own screen): "I am a Client" and "I am an Advocate" as two full-width cards stacked vertically, then Continue
5. Login (separate screen, shows the chosen role): mobile number, OTP only, no email/password
6. OTP (auto-read SMS, resend timer)

### 3.2 Client
**Onboarding:** 9. Basic profile (name, email, city/state, referral code optional)

**Tabs: Home · Requests · Wallet · Profile**
10. **Home:** sliding offer banners, legal service category grid, e-Challan card, GST filing card, offers row, refer-and-earn strip, WhatsApp support FAB
11. All categories
12. Category detail (what it covers, typical documents, how it works) → "Request an advocate"
13. Request form (issue, district, preferred language, attach documents)
14. Request submitted (what happens next)
15. My requests: Active / Completed tabs
16. **Request detail:** status timeline, assigned advocate card, quote, actions
17. Chat thread (text, photos, documents, **quote card** with "Pay")
18. Chats list
19. Checkout: fee, offer/coupon, wallet use, GST breakup, total
20. Payment processing → success → receipt / invoice
21. Confirm completion → rate the advocate
22. Raise a dispute
23. Advocate profile (after assignment)
24. **e-Challan home:** saved vehicles, add vehicle
25. Challan list: Pending / Paid tabs
26. Challan detail → select several → pay
27. Challan receipt
28. Vehicle challan history
29. **GST filing:** service info → request form (GSTIN, return type, period, documents)
30. GST filing request status + chat with support
31. Offers list → offer detail
32. **Wallet:** balance, cashback/referral entries, history
33. **Refer and earn:** code, share, how it works, referral list and earnings
34. Profile, edit profile
35. Notifications

### 3.3 Advocate
**Onboarding and verification**
36. Personal details (name, email, address, state, district)
37. Practice details (practice types, experience, courts, Bar enrolment no.)
38. Profile photo (camera)
39. Document step: District Bar Association card
40. Document step: State Bar Council certificate
41. Document step: Enrolment certificate
42. Document step: Aadhaar front and back
43. Review and submit
44. **Verification pending** (timeline, support)
45. Re-upload requested / rejected (reason, retake only those documents)
46. Approved → choose a membership

**Membership:** 47. Plans · 48. Checkout (GST) · 49. Success · 50. **Membership card** (QR, validity) · 51. My membership (renew, history, invoices)

**Tabs: Dashboard · Requests · Wallet · Profile**
52. **Dashboard:** membership card strip, new requests, active cases, earnings, commission and GST summary, wallet balance
53. New request detail → accept / decline (reason)
54. My requests: New / Active / Completed
55. Case detail: client card, timeline, documents, chat
56. Send quote (amount, scope; shows the live breakup: commission, GST, you receive)
57. Mark as done
58. Chats list / thread (shared)
59. **Wallet:** balance, earnings, commission and GST breakup per entry
60. Transaction detail / invoice
61. Withdraw: amount → bank/UPI → submitted
62. Bank and UPI details
63. Payment history
64. Profile, my documents, edit practice details

### 3.4 Shared
65. Settings (language, notifications, logout, delete account)
66. Help: FAQs + WhatsApp support by topic
67. Terms, privacy, refund policy
68. Notifications
69. Offline / error states
70. Demo switch (simulate admin approval and assignment), shown only in demo builds

---

## 4. Website (`frontend/`)

| Area | Pages |
|---|---|
| Public | Home, Services, one page per category, e-Challan, GST filing, For advocates, About, Contact, FAQs, Terms/Privacy/Refund. SEO: per-page titles/meta, sitemap, clean URLs |
| Client portal `/app` | The same flows as the mobile client (requests, chat, checkout, wallet, e-Challan, GST filing, refer) |
| Advocate portal `/advocate` | Registration and documents, membership, dashboard, requests, chat, quote, wallet, withdraw |
| Admin `/admin` | Every module in SOW section 12, as a separate bundle |

---

## 5. Design direction

- **Palette:** ink black `#0E0E0E` (headers, splash, premium cards), legal gold around `#D9A520` (sampled from the emblem's `#E2AA3C`; final value after a contrast check) for primary actions and highlights, white surfaces, warm off-white page `#FAF8F3`, grey text scale. Green only for verified/approved/paid, red only for rejected/disputes/errors. Each service category gets its own muted accent.
- **Type:** Noto Sans (covers all 9 scripts) for the UI, static weights. A serif display face is used only for the English brand moments (splash, membership card, website hero), to give a legal feel.
- **Rules (playbook 2.4):** real stock photos, dense real information, flat tab bar with a hairline border, 10–16px corners, sentence-case titles, no gradient washes or decorative italics, no initial-letter avatars.
- **Black is the premium layer:** the membership card, dashboard header and splash are black with gold. Working screens are white and readable.

### Canvas boards for approval (12)
1. **Design system:** logos (shield icon, gold emblem, wordmark), palette, category colours, type, components (buttons, inputs, chips, status pills, list rows, quote card)
2. Splash, language and role picker, OTP login
3. **Client home** (banners, categories, e-Challan, offers, GST filing, refer, WhatsApp)
4. Category → request form → submitted
5. Request detail (timeline + assigned advocate) and chat with a quote card
6. Checkout with offer, wallet and GST breakup
7. e-Challan: vehicle → pending/paid → pay → receipt
8. Advocate verification wizard step and pending state
9. Advocate membership plans and **membership card**
10. **Advocate dashboard** and wallet (commission and GST breakup, withdraw)
11. Admin: request queue with assignment drawer, and advocate document review
12. Website home hero + client portal view

---

## 6. Execution phases

| # | Phase | Output |
|---|---|---|
| 0 | Analysis and decisions | SCOPE-OF-WORK.md, this plan (**done**) |
| 1 | Design canvas | **In review:** https://claude.ai/artifact/55nX3BjQ7zThQVscjzrwiK (15 boards). Tokens go into this plan once it is approved |
| 2 | Mobile setup | `mobile-app/` scaffolded (RN 0.87.x, `com.vakeelbhai.app`), fonts, icon script, **release keystore and guard**, baseline release build |
| 3 | Mobile architecture | Theme, `T` text, UI kit, i18n (9 languages), sample data, AppStore, role-based navigation, money helpers (commission/GST calculation with unit tests) |
| 4 | Mobile screens | Auth → Client flows → Advocate onboarding/membership → Advocate flows → shared, plus a demo switch |
| 5 | Mobile release | `tsc`/`eslint`/`jest` clean, emulator walkthrough with screenshots, signed APK in `mobile-app/release/` |
| 6 | Website + admin | Vite app: public pages → client portal → advocate portal → admin, on sample data |
| 7 | Backend | Express + MongoDB API, Razorpay, OTP, Socket.IO chat, uploads, invoices, GST reports; app and web switched to the live API |
| 8 | Deploy | VPS (pm2 + nginx + HTTPS), `deploy.sh`, Play Store AAB, data-safety form |
