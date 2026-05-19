# 3D Portfolio

Dark, minimal portfolio prototype centered on an interactive GLB model.

## Local Preview

```powershell
node server.mjs
```

Then open:

```text
http://localhost:4173
```

## Files

- `index.html` - static portfolio page
- `styles.css` - visual system and responsive layout
- `site.js` - camera controls and loading state
- `models/scifi-scene.glb` - current featured 3D model
- `models/ac.glb` - AC hard-surface model
- `models/freedom-dorrito-ed.glb` - Freedom Dorrito experimental form
- `models/x.glb` - X hard-surface symbol model
- `models/hailmary.glb` - Hail Mary figure/pose model
- `models/spaceship.glb` - SpaceShip sci-fi vehicle model
- `models/citadel.glb` - Citadel structure model
- `models/deathsphere.glb` - Deathsphere hard-surface artifact model

Mobile model:

- `models/scifi-scene-mobile.glb` - lighter phone version used automatically by the main mobile viewer
- `models/ac-mobile.glb` - lighter phone version of the AC hard-surface model
- `models/freedom-dorrito-ed-mobile.glb` - phone version of Freedom Dorrito
- `models/x-mobile.glb` - phone version of X
- `models/hailmary-mobile.glb` - phone version of Hail Mary
- `models/spaceship-mobile.glb` - phone version of SpaceShip
- `models/citadel-mobile.glb` - phone version of Citadel
- `models/deathsphere-mobile.glb` - compressed phone version of Deathsphere
- `tools/make-mobile-glb.py` - rebuilds the mobile GLB by resizing embedded textures

## Hosting

This can deploy as a static site on Cloudflare Pages, Vercel, Netlify, or GitHub Pages. The current model is about 15.5 MB, so it is small enough for a first pass on most static hosts.

Recommended launch path:

1. Push this folder to GitHub.
2. Import the GitHub repository into Vercel or Cloudflare Pages.
3. Set the custom domain to `projectgunpowder.com`.
4. Add the DNS records shown by the hosting provider inside GoDaddy.
5. After DNS verifies, keep making changes locally and redeploy from GitHub.
