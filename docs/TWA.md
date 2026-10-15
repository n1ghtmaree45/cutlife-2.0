# Android APK (Trusted Web Activity) notes

- Tooling on the box: Temurin JDK 17 (`~/jdk17`), Android cmdline-tools + platform-tools, build-tools 34, platform 34 (`~/android-sdk`), `@bubblewrap/cli` (global). Bubblewrap config: `~/.bubblewrap/config.json`.
- Keystore: `android-keystore/cutline-release.jks`, alias `cutline`, password in `.env` (gitignored). **Back up both files offline.** If you lose them you can't ship updates that install over the old APK.
- Release cert SHA-256: `30:D8:32:7D:55:A5:16:D5:AE:C6:E7:42:20:7A:F4:EE:A3:D2:22:C7:BC:D4:F2:0F:A0:5A:AC:8F:80:5D:91:EA` (already in `public/.well-known/assetlinks.json` with package `app.cutline.twa`).
- twa-manifest key fields (set by `scripts/build-apk.sh`): packageId `app.cutline.twa` (override with `CUTLINE_PACKAGE_ID`), host = domain argument (default `$CUTLINE_DOMAIN` / `cutline.vercel.app`), startUrl `/`, themeColor `#1B5E20`, background/navigation `#0E1A10`, display standalone, fallback customtabs, notifications off.
- **Digital Asset Links:** Android checks `https://<domain>/.well-known/assetlinks.json` at the domain root. On Vercel the site *is* the root, so `public/.well-known/assetlinks.json` is served there (`vercel.json` sets `application/json`). The APK then opens full-screen with no URL bar. Verify with `curl -i https://<domain>/.well-known/assetlinks.json` or Google's Statement List tester.
- Without Play Store, the APK is sideloaded; Samsung will warn about unknown sources.
- If the domain changes (e.g. a custom domain), rebuild the APK with the new domain. assetlinks is per-host.
