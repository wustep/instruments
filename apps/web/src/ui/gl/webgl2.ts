// Whether this browser can draw the 3D stage (WebGL2). Kept apart from the stage itself so the
// page can decide to offer 3D without loading three.js.
export function webgl2Available(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}
