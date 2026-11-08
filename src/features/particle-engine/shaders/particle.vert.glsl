// Particle vertex shader (three.js compiles this as GLSL ES 3.00 on a WebGL2 context).
// Motion is a pure function of per-particle attributes and a few uniforms, so a transition costs
// one uniform write per frame and no per-frame buffer uploads.
//   position  start of the current transition
//   aTo       end of the current transition
attribute vec3 aTo;
attribute vec3 aColor;
attribute vec3 aColorTo;
attribute vec3 aVel;     // outward direction scaled by a random speed
attribute vec4 aSeed;    // x: start delay, y: weight, z: phase, w: size jitter
attribute float aSize;

uniform float uProgress;       // 0..1 across the whole transition
uniform float uStagger;        // fraction of the transition spent staggering particle start times
uniform float uArc;            // world-space lift along aVel, zero at both ends
uniform float uJitter;         // world-space wobble, zero at both ends
uniform float uShimmer;        // idle movement amplitude for particles at rest
uniform float uTime;
uniform float uPointSize;      // world-space diameter
uniform float uPixelsPerUnit;  // pixels per world unit at distance 1
uniform float uAttract;        // 0..1 pull towards uAttractor
uniform vec3 uAttractor;       // in the same space as position (the model's local space)

varying vec3 vColor;

void main() {
  float p = clamp((uProgress - aSeed.x * uStagger) / max(1.0 - uStagger, 1e-4), 0.0, 1.0);
  float e = p * p * (3.0 - 2.0 * p);
  vec3 pos = mix(position, aTo, e);          // equals aTo exactly when e == 1

  float bump = sin(3.14159265 * p);          // 0 at p = 0 and p = 1, so rest positions are exact
  float ph = aSeed.z * 6.2831853;
  pos += aVel * (uArc * bump);
  pos += vec3(sin(ph + uTime * 1.7 + aSeed.y * 5.0), sin(ph * 1.3 + uTime * 1.3), sin(ph * 0.7 + uTime * 1.9)) * (uJitter * bump);
  pos += vec3(sin(ph + uTime * 0.9), sin(ph * 1.7 + uTime * 1.1), sin(ph * 0.5 + uTime * 1.3)) * uShimmer;

  vec3 d = uAttractor - pos;
  pos += d * (uAttract * (0.35 + 0.65 * aSeed.y)) / (1.0 + 0.5 * length(d));

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uPointSize * uPixelsPerUnit / max(-mv.z, 1e-3), 1.0, 48.0);
  vColor = mix(aColor, aColorTo, e);
}
