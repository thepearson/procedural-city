uniform float numSegments;
uniform float numBuildings;
uniform sampler2D uRoadData; // Row 0: Road Coords, Row 1: Road Type, Row 2: Build Pos/Scale, Row 3: Build Rot
uniform float roadWidth;
uniform float footpathWidth;
uniform float lampInterval;
uniform float lampRadius;
uniform float uTerrainSize;

varying vec2 vUv;

void getRoadSegment(int index, out vec4 coords, out float type) {
    float fi = float(index);
    float u = (fi + 0.5) / 8192.0; 
    coords = texture2D(uRoadData, vec2(u, 0.125)); // Row 0
    type = texture2D(uRoadData, vec2(u, 0.375)).r;  // Row 1
}

void getBuilding(int index, out vec4 posScale, out float rot) {
    float fi = float(index);
    float u = (fi + 0.5) / 8192.0;
    posScale = texture2D(uRoadData, vec2(u, 0.625)); // Row 2: x,z,w,d
    rot = texture2D(uRoadData, vec2(u, 0.875)).r;    // Row 3: rotation
}

float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p)-b;
    return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
}

void main() {
    vec2 p = (vUv - 0.5) * uTerrainSize;
    
    float minDist = 1e10;
    float nearestIndex = -1.0;
    float totalLampLight = 0.0;
    float isBuilding = 0.0;

    // 1. Roads & Lights
    for (int i = 0; i < 1024; i++) {
        if (float(i) >= numSegments) break;
        
        vec4 coords; float currentType;
        getRoadSegment(i, coords, currentType);
        vec2 a = coords.xy; vec2 b_pos = coords.zw;
        
        vec2 v = b_pos - a;
        float l2 = dot(v, v);
        float t = clamp(dot(p - a, v) / l2, 0.0, 1.0);
        float dist = distance(p, a + t * v);
        
        if (dist < minDist) {
            minDist = dist;
            nearestIndex = float(i);
        }

        if (lampInterval > 0.0) {
            float cRoadWidth = roadWidth * (currentType > 0.5 ? 1.5 : 1.0);
            float hTotalWidth = (cRoadWidth * 0.5) + ((currentType < 0.5) ? footpathWidth : 0.0);
            vec2 vDir = normalize(v);
            float L = length(v);
            float numLamps = floor(L / lampInterval);
            float lpIdx = clamp(floor(dot(p - a, vDir) / lampInterval + 0.5), 0.0, numLamps);
            for (float side = -1.0; side <= 1.0; side += 2.0) {
                vec2 pLamp = a + (lpIdx * lampInterval) * vDir + (side * hTotalWidth) * vec2(-vDir.y, vDir.x);
                float dL = distance(p, pLamp);
                if (dL < lampRadius) totalLampLight += smoothstep(0.0, 1.0, clamp(1.0 - dL / lampRadius, 0.0, 1.0));
            }
        }
    }

    // 2. Buildings (Sampled from Texture - PERFECT SYNC)
    for (int i = 0; i < 8192; i++) {
        if (float(i) >= numBuildings) break;
        vec4 posScale; float rot;
        getBuilding(i, posScale, rot);
        
        vec2 bPos = posScale.xy;
        vec2 bScale = posScale.zw;

        // Skip empty/invalid building slots
        if (bScale.x <= 0.0 || bScale.y <= 0.0) continue;
        
        // Transform pixel p to building-local coordinate space
        vec2 localP = p - bPos;
        float cosR = cos(-rot);
        float sinR = sin(-rot);
        vec2 rotP = vec2(localP.x * cosR - localP.y * sinR, localP.x * sinR + localP.y * cosR);
        
        // sdBox(rotated p, half-extents)
        // We add a tiny bit of bloat (0.5m) to the shader map so it covers the 3D footprint perfectly
        if (sdBox(rotP, bScale * 0.5 + 0.5) < 0.0) {
            isBuilding = 1.0;
            break; 
        }
    }

    gl_FragColor = vec4(nearestIndex, minDist, totalLampLight, isBuilding);
}
