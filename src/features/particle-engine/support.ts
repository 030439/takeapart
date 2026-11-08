/** True when the browser can create a WebGL2 context, which the 3D view and the particle engine both need. */
export function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}
