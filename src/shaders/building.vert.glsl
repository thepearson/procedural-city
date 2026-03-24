// Three.js ShaderMaterial will automatically prepend instanceMatrix and instanceColor 
// for an InstancedMesh if it detects they are used in the code.

attribute float aSeed;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vSeed;
varying vec3 vInstanceColor;

float hash11(float p) {
    p = fract(p * .1031);
    p *= (p + 33.33);
    p *= (p + p);
    return fract(p);
}

void main() {
    vSeed = aSeed;
    vInstanceColor = instanceColor;
    
    // local position.y is 0 to 1 (because of geometry.translate(0, 0.5, 0))
    float localY = position.y;
    
    // 40% chance of tapering
    float taperRand = hash11(vSeed * 7.0);
    float taperAmount = (taperRand > 0.6) ? (taperRand - 0.6) * 1.5 : 0.0; 
    
    float taperScale = 1.0 - (localY * taperAmount);
    vec3 taperedPos = position;
    taperedPos.x *= taperScale;
    taperedPos.z *= taperScale;

    vec4 worldPos = instanceMatrix * vec4(taperedPos, 1.0);
    vWorldPosition = worldPos.xyz;
    vUv = uv;
    vNormal = normalize((instanceMatrix * vec4(normal, 0.0)).xyz);
    
    gl_Position = projectionMatrix * modelViewMatrix * worldPos;
}
