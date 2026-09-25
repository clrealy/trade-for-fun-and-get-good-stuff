# Murder Mystery

An online murder mystery game inspired by Roblox's Murder Mystery 2. There are 12 players per round, and bots fill the empty spots. Each round has one Murderer and one Sheriff, and everyone else is Innocent. If the Sheriff dies, an Innocent can pick up the dropped gun and become the Hero. Players collect coins, open crates for knife and gun skins, and trade with bot traders.

## How it works

| Part | What it does |
| --- | --- |
| `shared/sim.js` | The game rules (movement, combat, bots, rounds). The server uses it for online rounds and the browser uses it for offline practice. |
| `server/` | Node server. It runs every online round, checks every move, and owns all coins and items. |
| `public/` | The browser client: sign in, lobby, shop, trading, and drawing the game. |
| Firebase Auth | Email and password accounts. Firebase hashes the passwords, so the game never sees them. |
| Firestore | Stores player profiles (coins, XP, items). Only the server can write to them (see `firestore.rules`). |

### Security

- **Passwords** go straight to Firebase Auth, which stores them as salted scrypt hashes. The game server never receives them.
- **Profiles** are encrypted at rest by Firestore (AES-256). All traffic uses HTTPS and WSS once the game is deployed behind TLS.
- **The server decides everything.** Clients only send their inputs. The server caps movement speed, cooldowns, crate purchases and trades, so a modified client can't give itself coins, items, extra speed or kills.
- **Hidden roles stay hidden.** Each player's updates only include their own role. Other roles are revealed when the round ends.
- **Keys.** The Firebase *web* config is public by design. The *service account* key is the real secret. It only goes in a server environment variable, never in the repo, and `.gitignore` blocks key files.
- **Rate limits.** Each connection has a message budget. Messages are capped at 4 KB. Usernames are validated and must be unique.

## Run it locally (no Firebase needed)

```bash
npm install
npm run dev        # http://localhost:8080. Dev login: any name, nothing is saved
npm test
```

Dev mode has no passwords, so the server refuses to start without Firebase unless `ALLOW_DEV_AUTH=1` is set. Never set it in production.

## Set up Firebase

1. Create a project at <https://console.firebase.google.com>.
2. **Build → Authentication → Get started** → enable **Email/Password**.
3. **Build → Firestore Database → Create database** (production mode).
4. **Firestore → Rules** → paste the contents of `firestore.rules` → Publish.
5. **Project settings → General → Your apps → Web (</>)** → register an app → copy the `firebaseConfig` object. This is `FIREBASE_WEB_CONFIG`, written as JSON with quoted keys.
6. **Project settings → Service accounts → Generate new private key**. This downloads a JSON file, and that is `FIREBASE_SERVICE_ACCOUNT`. Keep it secret. Don't commit it or share it.
7. **Authentication → Settings → Authorized domains** → add the domain you deploy to.

## Deploy

Firebase Hosting can't run a WebSocket game server, so deploy the server somewhere that can. It ships with a `Dockerfile`.

**Render (easiest):** New → Web Service → connect this repo → Runtime *Docker* (or Node with start command `npm start`). Add these environment variables:

- `FIREBASE_SERVICE_ACCOUNT`: the whole key JSON, or `base64 -w0 key.json`
- `FIREBASE_WEB_CONFIG`: the web config JSON
- `ALLOWED_ORIGINS`: your site URL, e.g. `https://your-game.onrender.com`

**Google Cloud Run:** `gcloud run deploy --source . --set-env-vars ...`. It supports WebSockets. On Cloud Run you can set `FIREBASE_USE_ADC=1` instead of a key file, and give the service account the *Firebase Authentication Admin* and *Cloud Datastore User* roles.

## Give items (owner only)

```bash
FIREBASE_SERVICE_ACCOUNT="$(cat key.json)" node scripts/grant.js <username> 25 Godly
```

The last argument is a rarity (Common … Chroma) or an item id like `g13`. It only works with the service account key, so players can't run it.

## Redeem codes

Players type codes in **Inventory → Add code**. Codes ignore caps and spaces, and each account can use each code once. Add or remove codes in `server/codes.js` and redeploy. `GODLY26` gives a random Godly.

## Summer Event

The Play tab tracks kills. At 50 kills a player can claim the summer set (Sunburn + Splash Blaster). The Chroma versions only drop from the ☀️ Sum Box in the Shop (5% chance). Change the goal or rewards in `EVENT` in `server/economy.js`.

## Chat and cheats

Press **Enter** (or **/**) in a round to chat. Commands start with `/`, and `/help` lists them. `/sheffeme` gives you the gun (Murderers can't use it), `/murdme` makes you the Murderer, `/speed` toggles a speed boost, `/whoisit` tells you who the Murderer is, `/r` brings you back to life, and `/god` stops you from dying.

Cheats always work in Practice and on a dev server. Online, only accounts listed in `ADMIN_UIDS` can use them. That's a comma-separated list of Firebase user IDs, found under **Authentication → Users**.

## Solo build

`node scripts/build-standalone.js` writes `dist/standalone.html`, a single file you can open with no server. You play vs bots, and the shop, codes and trading save in your browser. It is not cheat-proof, so the online game never uses it.

## Controls

WASD to move, mouse to aim, left click to stab or shoot, right click or Q to throw the knife, E to pull out or put away your weapon.

On phones and tablets: drag on the left side to move, tap or hold anywhere else to aim and attack, and use the buttons on the right to throw, pull out your weapon, or chat.
