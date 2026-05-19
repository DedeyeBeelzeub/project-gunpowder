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

Optional mobile model:

- `models/scifi-scene-mobile.glb` - if present, the main mobile viewer will use this lighter file automatically

## Hosting

This can deploy as a static site on Cloudflare Pages, Vercel, Netlify, or GitHub Pages. The current model is about 15.5 MB, so it is small enough for a first pass on most static hosts.

Recommended launch path:

1. Push this folder to GitHub.
2. Import the GitHub repository into Vercel or Cloudflare Pages.
3. Set the custom domain to `projectgunpowder.com`.
4. Add the DNS records shown by the hosting provider inside GoDaddy.
5. After DNS verifies, keep making changes locally and redeploy from GitHub.
