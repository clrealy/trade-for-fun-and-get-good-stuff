# Murder Mystery (MM2-style)

A browser game inspired by Roblox's Murder Mystery 2. Open `index.html` in a browser; no build step.

- **Roles:** 1 Murderer, 1 Sheriff, everyone else Innocent (11 bots + you). There's an MM2-style chance system: your odds of being Murderer or Sheriff go up each round you don't get it.
- **Murderer:** stab (left click), throw knife (right click / Q), hide knife (E). Bots that see your knife out will run away, or shoot you.
- **Sheriff:** shoot the murderer. Shoot an innocent and you die too, and the gun drops.
- **Hero:** an innocent who picks up the dropped gun.
- **Coins:** collect up to 40 per round. Spend them on Knife, Gun and Mystery boxes (Common to Chroma).
- **Trading:** trade skins with bot traders. They accept only fair or overpay offers.
- Progress (coins, level, inventory) is saved in localStorage.
