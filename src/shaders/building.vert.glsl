attribute float aSeed;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;
varying float vSeed;
varying vec3 vInstanceColor;

void main() {
    vSeed = aSeed;
    vInstanceColor = instanceColor;
    vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vUv = uv;
    vNormal = normalize((instanceMatrix * vec4(normal, 0.0)).xyz);
    
    vec4 mvPosition = modelViewMatrix * worldPosition;
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
}
