# Project Murder Mystery

Project Murder Mystery is an online murder mystery game inspired by Roblox's Murder Mystery 2. There are 12 players per round, and bots fill the empty spots. Each round has one Murderer and one Sheriff, and everyone else is Innocent. If the Sheriff dies, an Innocent can pick up the dropped gun and become the Hero. Players collect coins, open crates for knife and gun skins, and trade with bot traders.

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

## itch.io (free)

`npm run build:itch` builds `dist/project-murder-mystery-itch.zip`: the solo game plus three.js in one zip, ready to upload as an HTML game. **[ITCH.md](ITCH.md)** walks through the page setup and has a description ready to paste. The cover image and screenshots are in `store/itch/`.

## Android app (Google Play)

The online game is an installable web app: it has a manifest, icons, a service worker, a privacy policy at `/privacy`, in-app account deletion and an `assetlinks.json` route. **[PLAYSTORE.md](PLAYSTORE.md)** walks through turning it into an Android app and publishing it. Extra server environment variables for this:

- `CONTACT_EMAIL`: shown on the privacy page.
- `ANDROID_PACKAGE`: the app's package ID, used in `/.well-known/assetlinks.json`.
- `ANDROID_SHA256`: the signing fingerprints, comma-separated, used in `/.well-known/assetlinks.json`.

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
- **Chroma Raygun Set** (Chroma Raygun + Chroma Ray Blade): 93,000 coins in the Shop. The Chroma Raygun fires rainbow lasers.

## Shop

The Shop looks like MM2's. It has:
- A title bar with your coins.
- Big colored category tabs: **Weapons**, **Halloween**, **Pets** and **Bundles**.
- A **Latest Box** panel.
- A **LIMITED TIME OFFER** spotlight for the bundle of the day, with a countdown to tomorrow's.
- A **🔥 Hot Items** row of what the tab sells.

Below the window are the drop rates for that tab's box. The Pets tab also lists every pet inside. Anything you can't afford is dimmed.

## "You got" popup

Opening a box, redeeming a code that gives a random item, and getting an accepted trade all show a full-screen popup with what you got. The items pop in with their 3D pictures and rarity glow, and you close it with the big **CLAIM** button at the bottom of the screen (or Esc). Trades show everything the trader gave you. A gift trade, where you get nothing back, has no popup.

## Alt accounts (solo game)

In the solo game (the claude.ai page and itch.io), **Play → 👥 Accounts → ➕ New account** starts a fresh alt from nothing: no items, starter coins, level 1. Your main is saved, and **Play** next to any account switches to it, so you can grind an alt from zero up to a Cookie Scope and go back to your main any time.
- You can have up to 5 alts, and you can delete an alt (not your main).
- The game remembers which account you played last.
- When you're signed in to claude.ai, alts save to your account like your main does.
- Only your main shows on the leaderboard.

In the online game, alts are just separate logins: sign up again with another email.

## Bot chat

Bots talk in the round chat:
- At the start, a couple say hi.
- Every 10 to 20 seconds, someone says something ("who is murd??", "im hiding lol").
- When you take a bot out, it often gets mad at you ("BRO 😡", "hacker!!", "I QUIT 😤😤"). Only you see that line, so it never gives away who the Murderer is.
- When you win, the losing bots are salty in public ("rematch rn", "i wasnt even trying"). When the bots win, they flex.
- A murderer bot that gets you sends you a taunt.
- Bots answer your chat: greetings, "gg", "ez", "who is murd?", "ur sus", "help", "trade?", jokes, questions and insults all get replies, and most other messages do too. Say a bot's name and that bot answers you.

## Trading

- **Trade requests:** while you're in the menus, every 40 to 80 seconds a trader may send you a trade. A popup shows what you'd get and give, with values and a W/L meter, plus **Accept** and **Decline** buttons. It auto-declines after 30 seconds. Normal traders usually lowball a bit, and noob traders overpay a lot. Traders never ask for your equipped items or the default weapons. Turn requests off with **📨 Trade requests** in the Trade tab.
- **Counter-offers:** when a trader says no, they say what to add ("add Retro Blaster and it's a deal 🤝"), and **➕ Add it** puts it in your offer.
- **Search:** filter your items by name or rarity.
- **Recent trades:** your last 8 trades, with how much value you won or lost. Saved in this browser.

## Noob traders

Half the time you open the Trade tab (or hit **🔄 New traders**), one of the three traders is a noob, marked 🤪. Noobs carry good stuff (Legendary, Godly, Ancient, sometimes Chroma) but can't read values. They barely know rarities apart, think more items means more value, and get some items totally wrong. A few Commons can get you a Godly. Normal traders still know real values. The W/L meter always shows real values.

## Pets

The **🐾 Pet Box** in the Shop (120 coins) gives a pet that follows you around in every round, trotting behind you or flying next to you. There are 10 pets: Doggo and Kitty (Common), Bunny and Slime (Uncommon), Bat and Pumpkin (Rare), Ghosty (Legendary), Phoenix (Godly), Void Wisp (Ancient) and Chroma Dragon (Chroma). Equip one under **Inventory → Pets**, and tap it again to put it away. Pets only come from the Pet Box, never from knife or gun boxes or rarity codes, and some bots bring their own.

## Maps in 3D

Every map has its own look in 3D: its own floor (wood planks, carpet, marble, hospital tiles, concrete, ice, stone), walls (wallpaper with wood panels, office panels, brick, tiles, metal with hazard stripes, ice blocks), sky, fog and light. Door frames, windows, pictures, wall lamps and rugs are added from the map layout, and the furniture matches the map: vases in the Mansion, computers in the Office, gold in the Bank, medkits in the Hospital, toolboxes and crates in the Factory, crystals in the Ice Castle and candles in the Haunted Manor.

Outside the walls there's a whole world: trees and an iron fence around the Mansion, a city skyline around the Office, Hotel and Bank, a road with parked cars by the Office, Bank and Hospital, barrels and smokestacks by the Factory, snowy pines and falling snow at the Ice Castle, and dead trees and gravestones around the Haunted Manor. There are stars and a moon in the sky, and street lamps glow at night. Lamp and candle glows are 3D Ultra only. The 2D view is unchanged.

## Gun reload sound

After every shot, normal guns play a 2.2 s reload: the shell hits the floor, the mag comes out, the new mag clicks in, the slide racks and a ping says you're ready. Only the shooter hears it. Every gun reloads now, including the Raygun, Bruh Blaster and Cookie Scope sets, which used to fire nonstop. The Void Scope keeps its own faster reload and sound.

## Haunted Manor

A new map with rain, candles on every table, purple trees and lightning that lights up the whole map every 8 to 16 seconds, followed by thunder. The rain and candle glow are 3D Ultra only. If your device asks for reduced motion, the lightning is dimmer.

## 1v1

**Play → ⚔️ 1v1 vs bot** (solo) or **⚔️ Create 1v1 room** (online, share the code with one friend). It's one Murderer against one Sheriff with a 2-minute timer. Players start far apart, and the Sheriff wins if time runs out. Murderer kills play a kill sound, and the killer hears an extra sting.

## Trophies

The **🏆 Trophies** tab has 25 trophies for grinding: kills, rounds, wins, Murderer/Sheriff/Hero/1v1 wins, surviving, coins earned, boxes opened, trades, levels and owning Chromas. The server unlocks each one once and hands over its reward right away: an exclusive knife or gun (25 trophy-only weapons, never in boxes or trades from bots) plus coins. A popup shows what you got. Edit the list in `TROPHIES` in `server/economy.js`.

## Chat and cheats

Press **Enter** (or **/**) in a round to chat. Commands start with `/`, and `/help` lists them. `/sheffeme` gives you the gun (Murderers can't use it), `/murdme` makes you the Murderer, `/speed` toggles a speed boost, `/whoisit` tells you who the Murderer is, `/r` brings you back to life, and `/god` stops you from dying, `/gun` gives you a gun and makes every other gun holder miss every shot for the rest of the round (a Murderer keeps the knife and just gets the misses), and `/esp` colors everyone by role, even through walls: red Murderer, blue Sheriff, green Innocent, gold Hero (their name tags show it too; only you see it).

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

## Roblox-style camera

In 3D the camera works like Roblox:
- **Turn:** hold the **right mouse button** and drag to orbit around your character and tilt it up or down.
- **Zoom:** use the **scroll wheel**.
- **Movement:** WASD moves relative to where the camera faces.
- **Walls:** the camera slides in front of any wall that would block the view. If it ends up right behind you, your character hides so you can see.
- **Saving:** the angle and zoom are saved in your browser.
- **Phones:** keep the follow camera.

**Shift Lock** (press **Shift**):
- **Camera:** sits over your right shoulder, and the mouse turns it with no button held (the cursor hides).
- **Aim:** your character always faces where the camera looks, and the crosshair marks the spot straight ahead.
- **Turning it off:** Shift again, Esc, or opening chat.

## Avatars

The **👤 Avatar** tab lets players make their own look:
- **Skin:** 9 tones.
- **Shirt:** 15 colors.
- **Pants:** 8 colors.
- **Hat:** none, cap, hair, top hat, crown, beanie, headphones, horns or halo.
- **Face:** smile, grin, cool, angry, wink or surprised.

It has a spinning 3D preview you can drag, a 🎲 Randomize button and Save. The server only accepts the offered options. Everyone in the round sees your look, and bots get random ones.

## Controls

WASD to move, mouse to aim, left click to stab or shoot, Q (or a quick tap of right click) to throw the knife, E to pull out or put away your weapon. **F** jukes (a quick dash, 1.5 s cooldown). **Shift** toggles Shift Lock in 3D. **Space** jumps (clears tables and plants), **B** bomb jumps way up (no cooldown, works mid-jump for extra height), hold **C** to crouch (slower, smaller target). Stabs miss players in the air and bullets fly under them.

On phones and tablets: drag on the left side to move, tap or hold anywhere else to aim and attack, and use the buttons on the right to throw, pull out your weapon, or chat. It works upright or sideways.
