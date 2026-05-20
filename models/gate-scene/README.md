# Gate Scene Parts

Generated from `gate.glb` with:

```powershell
python tools\extract-glb-nodes.py "C:\Users\noble\Desktop\Blender Assets for unreal\gate.glb" "D:\PORTFOLIO\models\gate-scene" --scene-id gate-scene --max-texture-size 1024 --jpeg-quality 72
```

The raw source GLB is intentionally not committed because it is larger than normal GitHub/Vercel limits.

- `manifest.json` stores the original object names and transforms.
- `parts/` contains one web-sized GLB per extracted object.
- Textures are capped to 1024px during extraction.
