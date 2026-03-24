// Three.js ShaderMaterial will automatically prepend instanceMatrix and instanceColor 
// for an InstancedMesh if it detects they are used in the code.

attribute float aSeed;
attribute float aTaper;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vSeed;
varying vec3 vInstanceColor;

void main() {
    vSeed = aSeed;
    vInstanceColor = instanceColor;
    
    // local position.y is 0 to 1 (because of geometry.translate(0, 0.5, 0))
    float localY = position.y;
    
    float taperScale = 1.0 - (localY * aTaper);
    vec3 taperedPos = position;
    taperedPos.x *= taperScale;
    taperedPos.z *= taperScale;

    vec4 worldPos = instanceMatrix * vec4(taperedPos, 1.0);
    vWorldPosition = worldPos.xyz;
    vUv = uv;
    vNormal = normalize((instanceMatrix * vec4(normal, 0.0)).xyz);
    
    gl_Position = projectionMatrix * modelViewMatrix * worldPos;
}
