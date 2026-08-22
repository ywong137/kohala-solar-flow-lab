# Kohala Solar Flow Lab

An interactive 3D wind-screening model for the fixed-tilt solar array at the North Kohala desalination site.

The model includes:

- a panel-level pressure and vibration screening solver;
- editable row counts, offsets, spacing, tilt, rack clearance, and dynamics;
- porous screens, under-panel vanes, edge deflectors, and rail dampers;
- immediate damage, post-storm cleanup, and fully restored site views;
- photo-based gravel, a southeast retaining wall, a raised field, fences, ocean, hills, and sky geometry.

This is a screening model. It is not final CFD or a structural design calculation.

## Local development

Use Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local address shown in the terminal.

## Checks

```bash
npm run lint
npm run build
node --experimental-strip-types --test tests/physics.test.mjs
```

## Deployment

The application does not depend on ChatGPT Sites. It has no required database, private API, or server secret.

You can deploy it in these ways:

1. ChatGPT Sites: use the included `.openai/hosting.json` project configuration.
2. Cloudflare Workers: authenticate Wrangler, then run `npx vinext deploy`.
3. A Node container host: run `npm install`, `npm run build`, and `npm run start`.

Cloudflare Workers is the closest independent target because vinext builds this application for the Workers runtime.

A custom domain only needs DNS and TLS configuration at the selected host. Each browser saves array changes in local storage.

## Main files

- `app/components/WindScene.tsx`: Three.js site and array model.
- `app/components/WindLab.tsx`: controls and scenario interface.
- `app/components/ArrayConfiguration.tsx`: saved geometry editor.
- `app/lib/physics.ts`: panel-level screening solver.
- `app/lib/array-config.ts`: calibrated default geometry.
