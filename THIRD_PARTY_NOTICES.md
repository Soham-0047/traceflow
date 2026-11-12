# Third-party notices

## Hallmark

`.claude/skills/hallmark/` is a copy of the Hallmark design skill, https://github.com/Nutlope/hallmark (`skills/hallmark`), used under the MIT License. The upstream license text is kept at `.claude/skills/hallmark/LICENSE`. Theme preview images were left out of the copy.

## compromise

`packages/core` depends on `compromise` (https://github.com/spencermountain/compromise, npm package `compromise`), used under the MIT License. It is the first runtime dependency of the otherwise dependency-free engine: the in-house NLU (`packages/core/src/nlp.ts`) uses its part-of-speech tagger and lexicon-teaching API to gate the answer layer's lazy lanes and to keep the domain idioms whole ("bus number", "knock-on effect"). The library carries no network access and no models — it tags strings deterministically, offline. Its license text ships inside the published package (`node_modules/compromise/LICENSE` after `npm install`).

## Fonts

The demo loads General Sans (Fontshare, Indian Type Foundry free license) and Geist Mono (SIL Open Font License, via Google Fonts) from their CDNs. No font files are stored in this repository.
