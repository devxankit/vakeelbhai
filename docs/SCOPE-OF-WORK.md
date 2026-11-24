# Vakeel Bhai: Scope of Work (working version)

This is our working scope. It is based on the client's signed SOW (`Complete Vakeel Bhai (Android + IOS) Application Development SOW.pdf`) and the decisions taken on 18 Nov 2026. Where the two differ, this file wins, and the difference is listed in section 14.

| | |
|---|---|
| Product | Vakeel Bhai: a legal-services marketplace that connects clients with verified advocates |
| Platforms | One mobile app (Android + iOS, React Native) for both roles · a website with client and advocate portals · an admin panel · one backend |
| Users | Client (general public) · Advocate (verified lawyer) · Admin (super admin and staff) |
| Revenue | Advocate memberships, plus a commission on every completed paid service. The commission rate is set by the admin (20% at launch). |
| Languages | English, Hindi, Marathi, Gujarati, Bengali, Punjabi, Tamil, Telugu, Kannada (i18n from day one). Non-English text is drafted by us and reviewed by the client. |

---

## 1. Core rules (decided)

1. **Clients never browse advocates.** They choose a service category and describe what they need.
2. **The admin assigns every request manually** to an approved advocate with an active membership. The advocate can accept the request, or decline it with a reason. A declined request goes back to the admin queue.
3. **Identity after assignment.** Until a request is assigned, the client sees only categories. Once an advocate accepts, the client sees the advocate's name, photo, verified badge, experience, practice areas and court.
4. **Contact is in-app chat only**, with text, photos and documents. Phone numbers are never shown to either side.
5. **The client pays in the app.** The advocate sends a fee quote in the chat. The client pays it through the payment gateway, can apply wallet balance and offers, and the platform holds the money.
6. **Completion.** The advocate marks the work as done. The client confirms, or the request auto-confirms after *N* days (set by the admin). Only then is the advocate's share credited to the wallet. A client can raise a dispute instead of confirming, and the admin then releases or refunds.
7. **The commission % is set by the admin** and can change at any time. Each request stores the rate that applied when it was paid, so history never changes. The admin can also set a different rate per category.
8. **Advocates must be approved and paid.** An advocate gets requests only after the admin approves their documents and they have paid for an active membership.

## 2. Login and registration

- The first screen asks the user to choose **"I am a Client"** or **"I am an Advocate"**.
- Login is **mobile number + OTP only**: no email and password, and so no "forgot password" flow. Email is collected in the profile, for invoices and receipts only.
- Secure session: JWT, rate-limited OTP, a fixed test OTP for store-review accounts. Logging out signs the user out on that device only.
- Admin panel login (website `/admin`) stays email + password, for staff only.

## 3. Advocate module

### 3.1 Registration
Full name, mobile, email, address, state, district, practice type (one or more categories), years of experience, court(s) of practice, Bar enrolment number, profile photo.

### 3.2 Verification documents (mandatory, as images)
1. District Bar Association membership card
2. State Bar Council certificate
3. Enrolment certificate or copy
4. Aadhaar, front and back. **Checked manually by the admin.** A paid Aadhaar OTP eKYC can be added later.

The app takes one document per screen, using the camera with a guide frame or the gallery.

### 3.3 Admin approval
The profile stays **inactive** until the admin acts. The admin can view each document (zoom, rotate, compare with the photo) and then:
- **Approve**
- **Reject** with a reason
- **Ask for a re-upload** of specific documents. The advocate retakes only those.

### 3.4 Membership
- Plans are created by the admin: name, duration, price, benefits and an active toggle. Prices show as `[PRICE]` until the client provides them.
- Membership is active only when **documents are approved and payment has succeeded**.
- GST is added to the membership fee, and an invoice is generated.
- Validity is tracked: expiry reminders, renewal that extends from the current end date, and expired memberships stop new assignments.
- A **digital membership card** appears on the dashboard: name, photo, enrolment number, member ID, validity and a QR code.

### 3.5 Advocate dashboard
Membership status and card · new and active requests · total earnings · commission deducted · GST details · wallet balance · payment history.

### 3.6 Advocate request flow
New assignment → accept or decline → chat with the client → send a fee quote → client pays → work in progress (shared documents, updates) → mark as done → client confirms → wallet credited.

## 4. Client module

### 4.1 Registration
Name, mobile, email, city and state. Simple and fast: OTP first, and the rest can be filled in later.

### 4.2 Home
Sliding offer banners · legal service categories · e-Challan section · offers · GST filing · refer and earn · WhatsApp support.

### 4.3 Service categories (managed by the admin)
Criminal lawyer · Civil lawyer · Matrimonial / family lawyer · Accident case · Consumer court · Notary services · Other legal services. The admin can add, rename, reorder or hide categories and set an icon for each.

### 4.4 Service request
Choose a category → describe the issue (short form: what happened, city or district, preferred language, optional documents) → submit → track the status: *Submitted → Advocate assigned → Quote received → Paid → In progress → Done → Confirmed*.

### 4.5 My requests
Active and past requests, chat, quote and payment, receipts, confirm completion, raise a dispute, rate the advocate.

## 5. Commission, GST and money flow

For a quoted fee **F** (after any offer discount), with commission rate **c** and GST rate **g**. Both rates are set by the admin; the defaults are c = 20% and g = 18%.

| Item | Amount |
|---|---|
| Client pays | F, plus GST on F where applicable (a per-category setting) |
| Platform commission | C = c × F |
| GST on commission | g × C |
| Credited to the advocate's wallet on completion | F − C − (g × C) |

- Commission is deducted automatically on completion, and the full breakup is shown in the wallet and on invoices.
- GST is also applied to membership fees and to the client payments where it is enabled.
- **Offers:** commission and GST are calculated on the discounted amount, and GST is applied after the discount.

> These formulas are our proposal. The client's CA should confirm the GST treatment of legal services (including reverse charge for business clients) before go-live.

## 6. Wallets

### 6.1 Advocate wallet
Earnings credited · commission deduction details · GST breakup · bank/UPI details · **withdrawal request**, which the admin approves and marks paid · full transaction history.

### 6.2 Client wallet
Referral rewards · cashback from offers · use of the balance at checkout (the admin can cap how much of an order the wallet can pay) · transaction history. Wallet money cannot be withdrawn.

## 7. Refer and earn (clients only)

- Every client has a unique referral code and share link.
- The referrer earns a reward when the referred client completes their **first paid service**.
- The admin sets the reward as a fixed amount or a percentage, a monthly cap per user, and an on/off switch.
- Rewards are credited to the wallet with a GST breakup where applicable.

## 8. Offers and discounts

- The admin creates an offer: a title, a banner image, a discount (% or flat) with a maximum, the categories or membership plans it applies to, start and end dates, a usage limit, and a coupon code or auto-apply.
- Banners are shown on the home screen and website while the offer is live.
- Earnings and GST are calculated on the discounted amount.

## 9. e-Challan

The client can:
- Add a vehicle number, or save several vehicles
- See **pending** and **paid** challans and the vehicle's challan history
- Pay one or several challans online and get a payment receipt

**Phase 1 builds the full flow on sample data.** The backend phase connects a paid challan data and payment provider that the client chooses and pays for (for example a BBPS biller or an aggregator API). The Parivahan system has no open API.

## 10. GST management and GST filing service

- GST is calculated automatically on memberships, commission, services and offers.
- **GST invoices** (PDF) are generated for every payment.
- The admin gets GST summary reports by month and type, exportable to CSV/Excel.
- GST is visible in every wallet entry and transaction.
- **GST filing assistance:** a user requests help (GSTIN, return type, period, documents) → the admin team works the request (*Requested → In review → Documents needed → Filed → Closed*) → the user tracks it and chats with support. The service fee is set by the admin.

## 11. Support

- WhatsApp support button (the number is set by the admin), with a prefilled message by topic: payments, membership, services, technical.
- Help centre FAQs, which the admin manages.

## 12. Admin panel (`/admin` on the website)

| Module | Contents |
|---|---|
| Dashboard | Total clients, total advocates, pending verifications, open requests, earnings, commission, GST, with charts |
| Advocate verification | Document viewer; approve, reject, or ask for a re-upload per document |
| Advocates | List and filters; detail (profile, documents, membership, requests, wallet); block or unblock; membership control (grant or extend) |
| Clients | List; detail (requests, wallet, referrals); activity log; block or unblock |
| **Request queue** | New requests → **assign an advocate** (filtered by category, district and active membership) → track; reassign when declined |
| Disputes | Release or refund |
| Payments and wallet | All transactions, withdrawal approvals, refunds, wallet adjustments |
| Commission and GST settings | Global commission %, per-category overrides, GST rates, auto-confirm days |
| Membership plans | Create and edit plans |
| Offers and banners | Offer builder, banner management |
| Categories | Service categories with icons and order |
| Referral settings | Reward type and value, caps, on/off |
| e-Challan | Transactions and provider status |
| GST filing | Request workflow |
| Reports | Earnings, commission, GST, membership, with CSV export |
| Content | FAQs, terms, privacy, refund policy, WhatsApp support number, notifications broadcast |
| Admin users | Super admin and staff roles |

## 13. Website (`frontend/`)

- **Public pages (SEO-friendly):** home, services and a page per category, e-Challan, GST filing, for advocates (join), about, contact, FAQs, terms, privacy and refund policy.
- **Client portal:** the same features as the app (requests, chat, payments, wallet, e-Challan, GST filing, referral).
- **Advocate portal:** the same features as the app (registration and documents, membership, requests, chat, wallet).
- Responsive, multi-language, secure login, content managed by the admin.

## 14. Changes from the signed SOW

| SOW says | We decided | Why |
|---|---|---|
| Login by "Mobile + OTP" and "Email + Password" | **Mobile OTP only** for clients and advocates | Client decision, 18 Nov 2026 (simpler, no passwords) |
| "System assigns a suitable advocate" | The **admin assigns manually**; the advocate accepts or declines | Quality control at launch |
| Referral: "unique referral code for each user" | **Clients only** | Client decision, 18 Nov 2026 |
| Commission fixed at 20% | **Set by the admin** (global and per category), 20% default | Client decision |
| "Aadhaar verification" | Image upload checked by the admin (eKYC later) | No paid provider yet |
| "Advocate contacts client through platform" | **In-app chat only**, no phone numbers | Protects the commission |
| Not stated | Dispute flow; auto-confirm after N days | Needed for in-app payments |
| e-Challan payments | UI now; provider integration in the backend phase | Needs a paid third-party provider |

## 15. Security and compliance

JWT auth, OTP rate limits, hashed admin passwords · HTTPS everywhere · documents stored privately (only admins and the owner can open them) · payment signatures verified on the server · Aadhaar images masked in lists and visible only to admins · audit log of admin actions · Play Store data-safety and privacy policy · DPDP Act 2023 basics (consent and account deletion).

## 16. Deliverables

Android app (signed APK + AAB) · iOS-ready source (built on a Mac later) · website with client and advocate portals · admin panel · backend API · source code · deployment support (VPS, pm2, nginx, HTTPS, `deploy.sh`).

## 17. Facts still needed from the client (placeholders until then)

1. Membership plans and prices
2. The GST treatment confirmed by their CA, and the platform's GSTIN for invoices
3. The auto-confirm period and the refund/dispute policy text
4. The referral reward amount
5. The e-Challan provider, and the payment gateway account (Razorpay recommended)
6. The SMS/OTP provider and DLT template
7. WhatsApp support number; terms, privacy and refund text
8. Who reviews the Indian-language translations
9. Real advocate and client photos for marketing (the demo uses free stock photos)
