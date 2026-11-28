# Publishing Sidekick to the Chrome Web Store

Everything for version 1.0.28 is in this folder.

| What | File |
| --- | --- |
| Package to upload | `release/sidekick-1.0.28.zip` |
| Every dashboard field, ready to paste | `LISTING.md` |
| Store icon (128x128) | `store-icon-128.png` |
| Screenshots (1280x800) | `sidekick-shot-1-record.png`, `sidekick-shot-2-review.png`, `sidekick-shot-3-privacy.png` |
| Promo tiles | `promo-small-440x280.png`, `promo-marquee-1400x560.png` |

## Steps

1. Open the Developer Dashboard (https://chrome.google.com/webstore/devconsole) with the account that owns
   "drafted. Capture" (item ID `lpjabpanndaajdijdmlibdamdcjcdnni`, live at version 1.0.0).
2. Open that item, go to **Package**, click **Upload new package**, and pick
   `release/sidekick-1.0.28.zip`. Uploading to this item (instead of creating a new one) keeps
   the same ID, so current installs update on their own.
3. **Store listing**: paste the description, set the category, and replace the icon and
   screenshots and promo tiles with the files above. Remove the old "drafted. Capture" screenshots.
4. **Privacy**: paste the single purpose and the permission justifications from `LISTING.md`.
   This version adds four permissions that need a justification: `scripting`, `idle`,
   `offscreen` and `notifications`. Tick the data types listed there and the three
   certifications.
5. **Distribution**: Unlisted (only people with the link can install), or Public if you want
   it searchable.
6. Click **Submit for review**. A first review with new permissions usually takes a few days.

## Rebuilding the package

```sh
npm run build
rm -f store/release/sidekick-<version>.zip
cd dist && zip -qrX ../store/release/sidekick-<version>.zip . -x '.DS_Store'
```

Delete the old zip first: `zip` adds to an existing file instead of replacing it, so old
build files would stay in the package.

Bump `version` in `manifest.json` first. The store rejects a package whose version is not
higher than the last one uploaded.
