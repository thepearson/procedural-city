uniform float numSegments;
uniform sampler2D uRoadData; // Row 0: Coords, Row 1: Type
uniform float roadWidth;
uniform float footpathWidth;
uniform float lampInterval;
uniform float lampRadius;
uniform float uTerrainSize;

varying vec2 vUv;

void getRoadSegment(int index, out vec4 coords, out float type) {
    float fi = float(index);
    float u = (fi + 0.5) / 1024.0; 
    coords = texture2D(uRoadData, vec2(u, 0.25)); // Row 0
    type = texture2D(uRoadData, vec2(u, 0.75)).r;  // Row 1
}

float distanceToSegment(vec2 p, vec2 a, vec2 b, out float bFactor, out float uFactor) {
    vec2 v = b - a;
    vec2 w = p - a;
    float l2 = dot(v, v);
    if (l2 == 0.0) {
        bFactor = 0.0; uFactor = 0.0;
        return distance(p, a);
    }
    float t = clamp(dot(w, v) / l2, 0.0, 1.0);
    vec2 pb = a + t * v;
    bFactor = t * length(v);
    vec2 normal = normalize(vec2(-v.y, v.x));
    uFactor = dot(p - pb, normal);
    return distance(p, pb);
}

void main() {
    // Map UV to world coordinates
    vec2 p = (vUv - 0.5) * uTerrainSize;
    
    float minDist = 1e10;
    float nearestIndex = -1.0;
    float totalLampLight = 0.0;

    for (int i = 0; i < 1024; i++) {
        if (float(i) >= numSegments) break;
        
        vec4 coords;
        float currentType;
        getRoadSegment(i, coords, currentType);
        
        vec2 a = coords.xy;
        vec2 b_pos = coords.zw;
        float b, u;
        float dist = distanceToSegment(p, a, b_pos, b, u);
        
        // 1. Find Nearest Index for SDF optimization
        if (dist < minDist) {
            minDist = dist;
            nearestIndex = float(i);
        }

        // 2. Accumulate Lighting from ALL segments (independent of nearest)
        if (lampInterval > 0.0) {
            float currentRoadWidth = roadWidth * (currentType > 0.5 ? 1.5 : 1.0);
            float halfRoadWidth = currentRoadWidth * 0.5;
            float currentFootpathWidth = (currentType < 0.5) ? footpathWidth : 0.0;
            float halfTotalWidth = halfRoadWidth + currentFootpathWidth;
            
            vec2 vDir = b_pos - a;
            float L = length(vDir);
            if (L > 0.1) {
                vec2 vNorm = vDir / L;
                vec2 nNorm = vec2(-vNorm.y, vNorm.x);
                float bProj = dot(p - a, vNorm);
                
                // Find number of lamps on this segment
                float numLamps = floor(L / lampInterval);
                // Closest lamp index on this segment
                float lampIndexClamp = clamp(floor(bProj / lampInterval + 0.5), 0.0, numLamps);
                
                for (float side = -1.0; side <= 1.0; side += 2.0) {
                    vec2 pLamp = a + (lampIndexClamp * lampInterval) * vNorm + (side * halfTotalWidth) * nNorm;
                    float dLamp = distance(p, pLamp);
                    if (dLamp < lampRadius) {
                        float falloff = clamp(1.0 - dLamp / lampRadius, 0.0, 1.0);
                        falloff = smoothstep(0.0, 1.0, falloff);
                        totalLampLight += falloff;
                    }
                }
            }
        }
    }

    // Packing into RGBA
    // R: Nearest Index
    // G: SDF Distance
    // B: Accumulated Lamp Light
    // A: 1.0 (opaque)
    gl_FragColor = vec4(nearestIndex, minDist, totalLampLight, 1.0);
}
