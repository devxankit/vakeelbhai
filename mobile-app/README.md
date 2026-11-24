# Vakeel Bhai: mobile app (React Native CLI)

One app for both sides of the platform. The user picks **Client** or **Advocate**, then logs in with a mobile OTP.

- **Clients** pick a legal service and describe their problem. The admin assigns a verified advocate, who chats privately and sends a fee quote. The client pays in the app (held until they confirm the work), pays e-Challans, requests GST filing, and uses the wallet, offers and refer-and-earn.
- **Advocates** register, photograph their Bar Council documents and Aadhaar one at a time, wait for admin approval, take a membership, then accept assigned cases, chat, send quotes, mark work done and withdraw their earnings. Every payout shows the commission and GST breakup.

Built from the approved design canvas (`docs/Claude Design canvas.txt`): black, gold and white, Noto Sans with Noto Serif for brand headings.

## Stack

- React Native 0.87.1 (New Architecture, Hermes), TypeScript, the same setup as Driver Finder
- React Navigation 7 (native stack, flat custom tab bar; separate tabs for clients and advocates)
- `lucide-react-native` + `react-native-svg` for icons, `react-native-image-picker` for the camera and gallery
- AsyncStorage 2.2 keeps all state on the phone
- 9 languages (en, hi, mr, gu, bn, pa, ta, te, kn). Screens are written in English and `<T>` looks each string up in `src/i18n/dict.ts`. Hindi covers the main flows; the other languages cover the start, login, tabs and home, and fall back to English elsewhere. **All non-English text is a draft for the client's reviewers.**
- Application ID `com.vakeelbhai.app`, app name "Vakeel Bhai", version 1.0.0 (code 1)

## Demo build: what is simulated

This is the UI-only phase on sample data. Nothing is sent to a server.

| Feature | Now (demo) | Backend phase |
|---|---|---|
| OTP | Any 6-digit code works | SMS India Hub OTP with an on/off switch |
| Admin assigns an advocate | About 6 s after a request is submitted | Admin panel request queue |
| Advocate greeting and quote | About 8 s after assignment | The real advocate in chat (Socket.IO) |
| Advocate marks work done | About 25 s after the client pays | The real advocate |
| Advocate verification | Buttons on the status screen: **Approve** or **Ask for a retake** | Admin KYC queue |
| Client pays the advocate's quote | About 10 s after the quote is sent | The real client |
| Client confirms | About 12 s after "Mark work as done" | The real client, or auto-confirm after 7 days |
| Payments (client fee, membership, e-Challan) | No money is taken | Razorpay; e-Challan provider chosen by the client |
| Membership prices | `[PRICE]` | Set in the admin panel |
| Support WhatsApp number | Opens WhatsApp without a number | Set in the admin panel |

The timers use timestamps, so they also complete after the app is closed and reopened. Money rules (commission, GST, offers, wallet) are pure functions in `src/utils/money.ts`, covered by `__tests__/money.test.ts`, and the backend must use the same rules.

## Project layout

```text
mobile-app/
  App.tsx                    SafeArea → AppStore → RootNavigator
  src/
    theme/index.ts           Design tokens from the canvas (ink #0E0E0E, gold #DDA62B, category tones)
    i18n/                    Language list, tr(), dictionaries
    components/T.tsx         Text: Noto font per weight, translated, font scale capped at 1.3×
    components/ui.tsx        Button, AppBar, InkHeader, Card, Pill, Field, Chip, Toggle, Timeline, BillRow…
    components/brand.tsx     Wordmark, emblem, advocate row, status labels, membership card
    data/catalog.ts          SAMPLE categories, advocates, offers, plans, challans, FAQs
    store/AppStore.tsx       All state + demo timers (tick) + first-login history
    navigation/              Stack, client tabs, advocate tabs, start-up routing (routes.ts)
    screens/auth.tsx         Splash, language, intro, role, login, OTP
    screens/client.tsx       Setup, home, categories, request, detail, checkout, confirm, dispute, offers, wallet, refer, profile
    screens/services.tsx     e-Challan, receipt, GST filing
    screens/advocate.tsx     Details, practice, document wizard, review, status, plans, card, dashboard, cases, quote, wallet, withdraw, bank, profile
    screens/shared.tsx       Chat, notifications, help, legal, settings
    utils/money.ts           Commission / GST / offer / wallet maths, ₹ formatting
  scripts/generate-icons.py  Launcher icons from assets/brand/app-icon.png
  assets/fonts               Noto Sans (5 weights) + Noto Serif Bold
  release/                   Signed APKs (git-ignored)
```

## Run in development

```bash
cd mobile-app
npm install
npm start            # Metro
npm run android      # USB phone
```

## Checks

```bash
npx tsc --noEmit
npx eslint src App.tsx __tests__
npx jest
```

## Build the signed release APK (Windows)

The project path has a space, so map a drive letter first (it is lost on reboot):

```cmd
subst V: "E:\Appzeto Projects\vakeel bhai"
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.13.11-hotspot"
cd /d V:\mobile-app\android
gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a"
```

Output: `android/app/build/outputs/apk/release/app-release.apk`, copied to `release/VakeelBhai-<version>.apk`. For the Play Store, run `gradlew.bat bundleRelease` (AAB) with the same key. `gradle.properties` limits Gradle to one worker: parallel native compiles failed on this machine with temp-file errors.

## Signing (important)

- Upload key: `android/app/vakeelbhai-upload.keystore` (alias `vakeelbhai-upload`)
- Passwords: `android/keystore.properties` (git-ignored)
- A release build **fails on purpose** if `keystore.properties` is missing, so it never falls back to the debug key.
- **Back up the keystore file and keystore.properties somewhere safe, outside this folder.** Every future Play Store update must be signed with this same key.

## Notes

- Icons: `python scripts/generate-icons.py` after changing `assets/brand/app-icon.png`.
- iOS: the code is iOS-ready; building needs a Mac (`npx pod-install`, then Xcode, and `npx react-native-asset` for the fonts).
- Photos are free Pexels stock (see `docs/design/stock/CREDITS.md`) and the names are invented. Replace them with real, consented photos before launch. The service tile images will be replaced by the client's own artwork.
