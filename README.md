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

## Halloween

- **🌌 Void Event** (Play tab): 100 kills unlocks the **Void Knife** and the **Void Gun**.
- **Void Gun Evo:** the Void Gun is an Evo weapon. Equip it and play to fill its Evo bar: +2 per round, +5 per kill, +5 for a win, 60 to fill. Then hit **EVOLVE** on the Play tab. It turns into the **Void Scope** (Ancient), stays equipped, and the bar resets.
- **Void Scope:** a long-range scoped gun that fires a purple void laser with its own sound. Its reload is 1.2 s instead of 2.2 s, and you hear it: a click, a charge-up whine, a clack and a ready ping. Only the shooter hears the reload.
- **Summer items are retired:** the Summer Event and the Sum Box are gone and nothing gives the summer items anymore. Anyone who already has them keeps them.

- **Halloween Event** (Play tab): 150 kills unlocks the **Death Gun**.
- **🎃 Halloween Box** (250 coins): the Death Set and Chroma Death Set. 10% **Death Knife**, 5% **Death Gun**, 2% **Chroma Death Knife**, 1% **Chroma Death Gun**. The Knives and the Chroma Death Gun drop nowhere else.
- **Owner luck:** accounts in `ADMIN_UIDS`, or anyone who redeems the secret code `DEATHLUCK95`, get a 95% chance at a Death item from the Halloween Box. Keep that code private.
- **Raygun Set** (Raygun + Ray Blade, the Raygun fires a green laser with its own sound): 3,999 coins in the Shop, or the secret code `ZAPZAPBOOM13`. The game reveals it when you tap the lobby logo 13 times fast.
- **Chroma Raygun Set** (Chroma Raygun + Chroma Ray Blade): 93,000 coins in the Shop. The Chroma Raygun fires rainbow lasers with no reload.

## 1v1

**Play → ⚔️ 1v1 vs bot** (solo) or **⚔️ Create 1v1 room** (online, share the code with one friend). It's one Murderer against one Sheriff with a 2-minute timer. Players start far apart, and the Sheriff wins if time runs out. Murderer kills play a kill sound, and the killer hears an extra sting.

## Trophies

The **🏆 Trophies** tab has 25 trophies for grinding: kills, rounds, wins, Murderer/Sheriff/Hero/1v1 wins, surviving, coins earned, boxes opened, trades, levels and owning Chromas. The server unlocks each one once and hands over its reward right away: an exclusive knife or gun (25 trophy-only weapons, never in boxes or trades from bots) plus coins. A popup shows what you got. Edit the list in `TROPHIES` in `server/economy.js`.

## Chat and cheats

Press **Enter** (or **/**) in a round to chat. Commands start with `/`, and `/help` lists them. `/sheffeme` gives you the gun (Murderers can't use it), `/murdme` makes you the Murderer, `/speed` toggles a speed boost, `/whoisit` tells you who the Murderer is, `/r` brings you back to life, and `/god` stops you from dying.

Cheats always work in Practice and on a dev server. Online, only accounts listed in `ADMIN_UIDS` can use them. That's a comma-separated list of Firebase user IDs, found under **Authentication → Users**.

## Solo build

`node scripts/build-standalone.js` writes `dist/standalone.html`, a single file you can open with no server. You play vs bots, and the shop, codes and trading save in your browser. It is not cheat-proof, so the online game never uses it.

The solo build is obfuscated with `javascript-obfuscator`: strings (including the redeem codes) are encoded and names are scrambled, so view-source shows gibberish. That slows down curious players but doesn't stop a determined one. The real protection is the online server, which never sends codes to players. Use `--plain` for a readable build.

### Accounts in the solo build

When the solo build is published as a claude.ai Artifact, players sign in with their claude.ai account. There's no extra password.
- **Saving:** each player's profile (coins, items, trophies, stats) is saved to the artifact's database in a private folder only they can read. It follows them to any device.
- **First sign-in:** anything they earned as a guest in that browser comes along.
- **Names:** players pick a game name (tap it in the lobby to change it). The game suggests one from their claude.ai name.
- **Leaderboard:** the 🏅 Leaderboard under Trophies ranks everyone by kills.
- **Guests:** anyone signed out, or opening the file directly, plays as a guest saved in their browser.
- **View-only shares:** people shared as Viewer can play but their progress stays on their device. Share the artifact as **Contributor** so friends can save to their accounts.
- **Not cheat-proof:** like the rest of the solo build, the game runs in the player's browser, so a determined player could edit their own save. The online server is the cheat-proof version.

## 3D

Rounds render in 3D with three.js (`public/render3d.js`): blocky characters, real walls and a tilted camera that follows you. The menus, HUD and controls are the same as in 2D. The online server hosts three.js itself (`/vendor/three.min.js`, from the `three` npm package), and the solo build loads it from cdnjs. Players can switch to 2D under **Play → Graphics**, and the game uses 2D automatically if WebGL isn't available.

## Graphics and effects

**Play → Graphics** has three settings. **3D Ultra** is the default on computers: real shadows, gunshot and explosion lights, floating dust, glowing tracers and rare weapons. **3D** is the default on phones and skips the costly parts. **2D** is the flat view.

Every setting gets the game-feel effects:
- **Role roulette**: role names spin before landing on yours, like MM2.
- **Screen shake** on shots, explosions and kills. It's turned off if your device asks for reduced motion.
- **Kill feed**: it shows who went down, never who did it.
- **Killer banners**: ELIMINATED, DOUBLE KILL and up to GODLIKE, plus MURDERER DOWN for whoever shoots the Murderer.
- **Final kill cam**: slow motion with letterbox bars.
- **Heartbeat** and red screen edges when a visible knife is close.
- **Timer**: ticks in the last 15 seconds.
- **Death**: bodies fall over and souls float up, and blood stays on the floor.
- **Movement dust**: footstep dust, landing rings and juke after-images.
- **End screen**: confetti when you win.

**🎵 Music** (next to Graphics) is a synth loop that speeds up and gets heavier as players die, time runs out or the Murderer gets close. Sounds are panned left or right and get quieter with distance.

## Controls

WASD to move, mouse to aim, left click to stab or shoot, right click or Q to throw the knife, E to pull out or put away your weapon. **Shift** jukes (a quick dash, 1.5 s cooldown). **Space** jumps (clears tables and plants), **B** bomb jumps way up (5 s cooldown, works mid-jump for extra height), hold **C** to crouch (slower, smaller target). Stabs miss players in the air and bullets fly under them.

On phones and tablets: drag on the left side to move, tap or hold anywhere else to aim and attack, and use the buttons on the right to throw, pull out your weapon, or chat. It works upright or sideways.
