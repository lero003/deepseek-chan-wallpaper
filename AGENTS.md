# Project guidance

- This is a private Web prototype of くじらの散歩道. No publishing, GitHub deployment, desktop host, analytics, AI/API integration, audio, or extra characters without a new request.
- The current programmatic whale-girl sprites are an unapproved placeholder, not the accepted design. The user supplied a visual reference; follow `docs/art-direction.md`. Generate and review a faithful design master before making sixteen sprite frames. Do not add official logos or third-party artwork to the runtime.
- The user requested synchronization to the private repository `lero003/deepseek-chan-wallpaper`. Keep it private and push only on explicit sync requests. Do not change visibility or enable Pages. Publication remains blocked until character-design and per-asset permissions are documented.
- `private-art/` contains unapproved references, generated concepts, prompts, and local review metadata. It is ignored by Git; never force-add it. The generated design is not integrated into the runtime yet.
- TypeScript + Canvas 2D is deliberate; keep the simulation independent of the browser and renderer. Use a fixed simulation step and seeded randomness only at behavior transitions.
- Node >=22.18 runs the built-in unit test runner. npm is the local package manager. Read package definitions, the lockfile, and scripts before dependency actions; install with lifecycle scripts disabled.
- Do not install or restore Playwright or dedicated automated browsers, including through transitive dependencies or temporary commands. Use unit tests, typechecking, build checks, and manual testing in an existing normal browser.
- Run `npm run check` and `npm run build` after meaningful changes. `npm run assets:check` verifies byte-for-byte reproducibility and the asset ledger.
- Art lives in `assets/`; its editable source is `scripts/generate-art.mjs`. Use `npm run assets:generate` only after reviewing generator changes. Keep code and art terms separate; no redistribution license has been chosen.
- No secrets or `.env` files are needed. The Vite config disables env-directory loading. Keep reports temporary; do not inspect personal folders or browser profiles.
- At handoff, update `docs/current_status.md` with actual checks and unverified manual acceptance items.
