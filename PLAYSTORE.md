# Putting Project Murder Mystery on the Google Play Store

The game is already set up to be an Android app. This repo has:

- **App manifest, icons and offline cache** (`public/manifest.webmanifest`, `public/icons/`, `public/sw.js`). Chrome counts the game as an installable app.
- **Privacy policy** at `/privacy`. Google requires one.
- **In-app account deletion**: Play tab → Account → Delete my account. Google requires this for any app with accounts.
- **App link file** at `/.well-known/assetlinks.json`. It lets the Android app open the game full screen with no browser bar.
- **Store art** in `store/`: a 512×512 icon and a 1024×500 feature graphic.

The Android app is a thin wrapper (a "Trusted Web Activity") around the online game. Multiplayer works in the app, and every time you update the server, the app updates too.

The steps below need accounts, money or secret keys, so you (or a parent) have to do them.

## 1. Put the game online

Follow **Set up Firebase** and **Deploy** in the README (Render is the easiest). Then add these to the server's environment variables:

| Variable | What to put |
| --- | --- |
| `CONTACT_EMAIL` | An email players can reach you at. It shows on the privacy page. Google requires it. |
| `ALLOWED_ORIGINS` | Your site, e.g. `https://project-mm.onrender.com` |

Check that these all work:
- **The game:** `https://YOUR-SITE/` loads and you can log in.
- **The privacy page:** `https://YOUR-SITE/privacy` shows your email.
- **Installing:** on an Android phone in Chrome, the ⋮ menu shows **Install app**.

## 2. Make a Google Play developer account

<https://play.google.com/console/signup>. It costs **$25 once**, and the account owner must be **18 or older**, so a parent or guardian has to make it. Google also checks your ID.

New personal accounts must run a **closed test with at least 12 testers for 14 days** before the game can go public. Line up friends with Android phones.

## 3. Build the Android app

The easiest way is **PWABuilder**, which needs no installs:

1. Go to <https://www.pwabuilder.com>, paste `https://YOUR-SITE/`, and click **Start**.
2. Choose **Android → Generate package**.
3. Fill in the form:
   - **Package ID:** something like `com.yourname.projectmm`. You can never change it later.
   - **App name:** `Project Murder Mystery`
   - **Signing key:** create a new one.
4. Download the zip. It contains:
   - `app-release-bundle.aab`: the file you upload to Google Play.
   - `signing.keystore` + `signing-key-info.txt`: **back these up somewhere safe.** Without them you can never update the app.
   - `assetlinks.json`: you need the fingerprint in it for step 4.

Or use Bubblewrap from a terminal (it needs Node + Java): `npm i -g @bubblewrap/cli`, then `bubblewrap init --manifest https://YOUR-SITE/manifest.webmanifest`, then `bubblewrap build`.

## 4. Link the app to your site

Add two more environment variables to the server and redeploy:

| Variable | What to put |
| --- | --- |
| `ANDROID_PACKAGE` | Your package ID from step 3, e.g. `com.yourname.projectmm` |
| `ANDROID_SHA256` | The SHA-256 fingerprint(s), comma-separated. Use the one from your `assetlinks.json` **and** the one Google shows under Play Console → your app → **Test and release → App integrity → App signing**. Google re-signs your app, so you need both. |

Then open `https://YOUR-SITE/.well-known/assetlinks.json` and check that it shows your package ID. If this step is wrong, the app shows a browser bar at the top.

## 5. Fill in the Play Console

1. **Create app:** name *Project Murder Mystery*, type **Game**, **Free**.
2. **Store listing:**
   - **App icon:** `store/play-icon-512.png`
   - **Feature graphic:** `store/feature-graphic-1024x500.png`
   - **Screenshots:** at least 2 phone screenshots of the game.
   - **Short description:** "Find the murderer before they find you! 🔪"
   - **Full description:** your own words about the rounds, roles, boxes, pets and trading.
3. **Privacy policy URL:** `https://YOUR-SITE/privacy`
4. **App access:** say a login is needed and give Google a test account (email + password) so they can play.
5. **Ads:** No.
6. **Content rating:** answer the questionnaire honestly. There's cartoon violence (knives and guns, no gore), players can chat, and items are bought with in-game coins only, never real money.
7. **Target audience:** 13 and over. A game aimed at kids under 13 has extra rules.
8. **Data safety:**
   - **Collected:** email address (account management), user IDs and username (app functionality), in-game progress (app functionality).
   - **Shared with third parties:** none.
   - **Encrypted in transit:** yes.
   - **Users can ask for deletion:** yes. Point to `https://YOUR-SITE/privacy`, which explains how.
9. **Account deletion URL:** `https://YOUR-SITE/privacy`. Its "Deleting your account" section explains the in-app button.
10. **Release:**
    1. Upload `app-release-bundle.aab` to **Testing → Closed testing**.
    2. Add your 12+ testers.
    3. After 14 days, apply for **Production**.

## Things that get games rejected

- **Copying Roblox / MM2:** Google can pull apps that use another game's name or content. Before you submit, rename the items that use MM2's names (Luger, Harvester, Icewing, Lightbringer and so on) and don't mention Roblox or "Murder Mystery 2" anywhere in the listing.
- **A dead server:** the app is your online game. If the server is down, players see an error and reviewers reject it. Render's free tier sleeps when nobody's playing, so a paid plan (or another always-on host) is safer for launch.
- **Missing account deletion:** it's already in the game, so don't remove it.
