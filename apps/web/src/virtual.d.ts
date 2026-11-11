/** URLs of the build-time piano filter designs, by sample rate (see vite.config.ts). */
declare module 'virtual:piano-designs' {
  const urls: Record<number, string>;
  export default urls;
  /** each shipped piano's designs (grand, upright), by sample rate */
  export const byPreset: Record<string, Record<number, string>>;
}
