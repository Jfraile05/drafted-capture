// The toolbar icon's antenna orb shows whether the student is recording: lit
// mint while capturing, dark otherwise. The dark icons are the manifest icons;
// the lit ones live in public/icons so the build copies them as they are. Both
// sets are drawn from the SVGs in icons/src.
const iconSet = (suffix: string) => ({
  16: `icons/icon${suffix}-16.png`,
  48: `icons/icon${suffix}-48.png`,
  128: `icons/icon${suffix}-128.png`,
});

export function setRecordingIcon(recording: boolean): Promise<void> {
  return chrome.action.setIcon({ path: iconSet(recording ? '-on' : '') }).catch(() => {});
}
