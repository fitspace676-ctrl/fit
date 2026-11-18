// Declares hardware the app can live without as optional.
//
// Google Play turns two things in the merged manifest into *required* features and
// hides the app from devices that lack them:
//   - `android:screenOrientation="portrait"` implies `android.hardware.screen.portrait`
//     (missing on some tablets, Chromebooks and TVs that report landscape only);
//   - the Wi-Fi state permissions a dependency merges in imply `android.hardware.wifi`
//     (missing on mobile-data-only and wired devices).
// The app runs fine on both kinds of device, so each feature is declared with
// `android:required="false"`, which overrides the implied requirement.
const { withAndroidManifest } = require('expo/config-plugins');

const OPTIONAL_FEATURES = ['android.hardware.screen.portrait', 'android.hardware.wifi'];

/** @type {import('expo/config-plugins').ConfigPlugin} */
module.exports = function withOptionalHardware(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const features = (manifest['uses-feature'] ?? []).filter(
      (feature) => !OPTIONAL_FEATURES.includes(feature.$['android:name']),
    );
    for (const name of OPTIONAL_FEATURES) {
      features.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    manifest['uses-feature'] = features;
    return mod;
  });
};
