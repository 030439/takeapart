// Round, opaque, slightly shaded points. Opaque + depth write avoids sorting 250k translucent sprites.
varying vec3 vColor;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;
  gl_FragColor = vec4(vColor * (1.0 - r2 * 1.2), 1.0);
}
