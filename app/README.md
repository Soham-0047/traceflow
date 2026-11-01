# app/ — Forge app (not created yet)

This folder will hold the Forge app (manifest, resolvers, Custom UI, Rovo agent).

One-time setup (needs your Atlassian developer site; it cannot be done from CI):

1. Install the Forge CLI and log in (`forge login`).
2. Run `forge create` and choose a Custom UI template for Jira.
3. Copy the generated app into this folder and keep the `app.id` line in `manifest.yml` (it is not a secret).
4. Add `FORGE_EMAIL` and `FORGE_API_TOKEN` as GitHub Actions secrets (Settings → Secrets and variables → Actions).

See `docs/PLAN.md` §8 for the validation spikes that come first.
