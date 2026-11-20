# Interim body-map art

These WebP layers are **third-party art**. They are not ours and we have no licence to ship them.
They exist so the body map can be built and tested in development.

**They must be replaced before launch** (our own vector art, or a licence) and must never reach
real users. [ADR 0034](../../../../../../docs/adr/0034-exercise-library.md) records the gate.

- One transparent layer per drawn muscle and view, and a grey silhouette per view, all on the
  same canvas (about 303 by 738 pixels).
- Exercise maps use the original grey body and red muscle layers. The weekly map recolours
  the layers with a luminance filter that keeps shading and alpha. Hit masks read each layer's alpha.
- `group-layers.ts` maps each muscle group to layers; `generate-assets.ts` rebuilds the two
  generated tables (hit masks, `require` sources) from this folder. It needs ImageMagick.
- Replacing the art is a change to this folder, the two generated tables and `group-layers.ts`;
  the props of `BodyMap` do not change.
