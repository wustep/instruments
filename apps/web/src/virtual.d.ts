/** URLs of the build-time piano filter designs, by sample rate (see vite.config.ts). */
declare module 'virtual:piano-designs' {
  const urls: Record<number, string>;
  export default urls;
}
