# Putting Project Murder Mystery on itch.io (free)

itch.io hosts browser games for free. The itch version is the **solo game**: you play vs bots, and coins, items, pets and trades save in the player's browser. No server or accounts needed.

## 1. Build the zip

```bash
npm install
npm run build:itch      # writes dist/project-murder-mystery-itch.zip
```

The zip has `index.html` (the whole game) and `three.min.js` (the 3D engine), so it doesn't depend on any other website.

## 2. Make the page

1. Make a free account at <https://itch.io> (you need to be 13 or older).
2. Click your profile → **Upload new project**.
3. Fill in the page:

| Field | What to put |
| --- | --- |
| Title | `Project Murder Mystery` |
| Project URL | `project-murder-mystery` |
| Short description | `Find the murderer before they find you 🔪` |
| Classification | Games |
| Kind of project | **HTML** |
| Release status | Released, or In development |
| Pricing | No payments (or "$0 or donate") |
| Uploads | Upload `dist/project-murder-mystery-itch.zip` and tick **This file will be played in the browser** |
| Cover image | `store/itch/cover-630x500.png` |
| Screenshots | everything in `store/itch/` that starts with `screenshot-` |
| Genre | Action |
| Tags | `murder-mystery`, `3d`, `bots`, `trading`, `pets`, `browser`, `ai-generated` |
| **AI generation disclosure** | **Yes**: tick **Code**, **Graphics**, **Text** and **Sound**. See below. |

### Don't skip the AI disclosure

itch.io requires projects made with AI to say so, and pages that hide it can be taken down. On the edit page, find **AI generation disclosure** and answer **Yes**. Tick every box, because Claude wrote all of it:
- **Code**: the whole game.
- **Graphics**: the 3D models, icon, cover and screenshots are all made by code Claude wrote.
- **Text**: names, descriptions and this page text.
- **Sound**: the sound effects and music are synthesized by code Claude wrote.

itch then shows an "AI Generated" label on your page. That, plus the 🤖 Made by AI tag inside the game and the line in the description, keeps you in the clear.

4. Under **Embed options**:

| Setting | Value |
| --- | --- |
| Embed in page | Manually set size: **1280 × 720** |
| Mobile friendly | ✅ (orientation: Default) |
| Automatically start on page load | ✅ |
| Fullscreen button | ✅ |
| Enable scrollbars | ❌ |

5. Paste the description below, click **Save & view page**, and test it.
6. When it works, set **Visibility** to **Public** and save.

## Description (copy and paste)

> **One of you is the Murderer. One of you is the Sheriff. Everyone else? Run.** 🔪🔫
>
> Project Murder Mystery is a 3D murder mystery game in your browser. Each round you get a random role:
>
> - 😇 **Innocent:** hide, grab coins, and pick up the gun if the Sheriff goes down.
> - 🔫 **Sheriff:** find the Murderer and take the shot. Shoot an innocent and you die too.
> - 🔪 **Murderer:** take everyone out without getting caught with your knife out.
>
> **Features**
> - 8 maps, including the spooky Haunted Manor with rain and lightning ⛈️
> - 100+ knives and guns, from Common to Chroma 🌈
> - Boxes, a shop with daily deals, trading with bot traders, and trophies 🏆
> - 🐾 Pets that follow you around
> - 🌌 The Void Gun, an Evo weapon you level up into the Void Scope
> - Jump, bomb jump and juke past danger 💨
> - 1v1 mode ⚔️
> - Roblox-style 3D camera (hold right mouse to turn it), or a faster 2D mode for old devices
> - Works on phones and tablets 📱
>
> **Controls**
>
> | Action | Keys |
> | --- | --- |
> | Move | WASD |
> | Stab / shoot | Mouse + click |
> | Throw knife | Q |
> | Weapon out / away | E |
> | Jump | Space |
> | Bomb jump | B |
> | Juke | Shift |
> | Crouch | C |
> | Chat | Enter |
>
> On phones, drag on the left to move and tap anywhere else to aim and attack.
>
> 🤖 **Made by AI:** this game was built with Claude, an AI.
>
> Your progress saves in your browser. Codes are hidden around… good luck finding them 👀

## Updating the game later

Run `npm run build:itch` again, then on your itch page go to **Edit game → Uploads**. Delete the old zip, upload the new one, and tick **played in the browser** again. Players keep their progress because it's saved in their browser.
