/**
 * Which store channel this bundle is built for.
 *
 * `play` hides external checkout: Google Play policy forbids linking to an
 * outside payment page for digital goods. The sideloaded APK keeps Polar.
 */
export const isPlayBuild = import.meta.env.VITE_DISTRIBUTION === "play";
