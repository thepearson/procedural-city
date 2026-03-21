uniform vec3 grassColor;
uniform vec3 zoneCentralColor;
uniform vec3 zoneCommercialColor;
uniform vec3 zoneResidentialColor;
uniform vec3 roadColor;
uniform vec3 footpathColor;
uniform vec3 centerLineColor;
uniform vec3 laneLineColor;
uniform float roadWidth;
uniform float footpathWidth;
uniform float dashLength;
uniform float dashWidth;
uniform float numSegments;

// Data Texture for Road Data
uniform sampler2D uRoadData; // Row 0: Coords (x1,y1,x2,y2), Row 1: Type

uniform float lampIntensity;
uniform vec3 lampColor;
uniform float lampRadius;

uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uAmbientColor;

// Optimization Texture
uniform sampler2D uBakeMap; // R: nearest index, G: distance, B: total lamp intensity
uniform float uTerrainSize;
uniform int uDebugMode;
uniform bool uShowBuildingZones;

varying vec2 vUv;
varying vec3 vPosition;

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
    vec2 p = vPosition.xz;
    vec2 terrainUV = p / uTerrainSize + 0.5;
    
    // Fetch pre-baked optimization data
    vec4 lookup = texture2D(uBakeMap, terrainUV);
    float nearestIndexFloat = lookup.r;
    float sdfDist = lookup.g;
    float bakedLampLight = lookup.b;

    // Debug Visualizations
    if (uDebugMode == 1) {
        gl_FragColor = vec4(vec3(sdfDist / 20.0), 1.0);
        return;
    }
    if (uDebugMode == 2) {
        gl_FragColor = vec4(fract(nearestIndexFloat * vec3(0.1, 0.2, 0.3)), 1.0);
        return;
    }
    if (uDebugMode == 4) { // New: Visualize Light Map
        gl_FragColor = vec4(vec3(bakedLampLight), 1.0);
        return;
    }

    // Shading
    vec3 normal = normalize(cross(dFdx(vPosition), dFdy(vPosition)));
    float noise = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 baseColor = grassColor;
    
    float bestB = 0.0;
    float bestU = 0.0;
    float bestType = 0.0;
    bool onRoad = false;
    bool onFootpath = false;

    // --- $O(1)$ Optimization Path ---
    if (nearestIndexFloat >= 0.0 && uDebugMode != 3) {
        int segIndex = int(nearestIndexFloat + 0.5);
        float b, u;
        vec4 coords;
        float currentType;
        getRoadSegment(segIndex, coords, currentType);
        
        float dist = distanceToSegment(p, coords.xy, coords.zw, b, u);
        float currentRoadWidth = roadWidth * (currentType > 0.5 ? 1.5 : 1.0);
        float halfRoadWidth = currentRoadWidth * 0.5;
        float currentFootpathWidth = currentType < 0.5 ? footpathWidth : 0.0;
        float halfTotalWidth = halfRoadWidth + currentFootpathWidth;

        if (dist < halfTotalWidth) {
            bestB = b; bestU = u; bestType = currentType;
            if (dist < halfRoadWidth) onRoad = true;
            else onFootpath = true;
        }
    } else if (uDebugMode == 3) {
        // Mode 3: Fallback full loop
        float minDist = 1e10;
        for (int i = 0; i < 1024; i++) {
            if (float(i) >= numSegments) break;
            float b, u;
            vec4 coords;
            float currentType;
            getRoadSegment(i, coords, currentType);
            
            float dist = distanceToSegment(p, coords.xy, coords.zw, b, u);
            float currentRoadWidth = roadWidth * (currentType > 0.5 ? 1.5 : 1.0);
            float halfRoadWidth = currentRoadWidth * 0.5;
            float halfTotalWidth = halfRoadWidth + (currentType < 0.5 ? footpathWidth : 0.0);
            if (dist < halfTotalWidth && dist < minDist) {
                minDist = dist; bestB = b; bestU = u; bestType = currentType;
                if (dist < halfRoadWidth) { onRoad = true; onFootpath = false; }
                else { onRoad = false; onFootpath = true; }
            }
        }
    }
    
    if (onRoad) {
        baseColor = roadColor;
        float absU = abs(bestU);
        float currentRoadWidth = roadWidth * (bestType > 0.5 ? 1.5 : 1.0);
        float normU = absU / (currentRoadWidth * 0.5);
        if (absU < 0.05) baseColor = centerLineColor;
        if (bestType > 0.5) {
            if (abs(normU - 0.5) < 0.02 && fract(bestB / dashLength) > 0.5) baseColor = laneLineColor;
        }
        if (normU > 0.95) baseColor = laneLineColor;
    } else if (onFootpath) {
        baseColor = footpathColor;
        float tileSize = 1.0;
        float tilePattern = step(0.05, fract(bestB / tileSize)) * step(0.05, fract(abs(bestU) / tileSize));
        baseColor *= (0.9 + 0.1 * tilePattern);
    } else if (uShowBuildingZones) {
        // --- 3-Zone System ---
        float maxBuildingDist = 30.0;
        if (sdfDist < maxBuildingDist) {
            float distFromCenter = length(p);
            vec3 targetZoneColor = zoneResidentialColor;
            float commercialNoise = fract(sin(dot(floor(p * 0.05), vec2(12.9898, 78.233))) * 43758.5453);
            
            if (distFromCenter < 150.0) {
                targetZoneColor = zoneCentralColor;
            } else if (distFromCenter < 350.0 || commercialNoise > 0.8) {
                targetZoneColor = zoneCommercialColor;
            }
            
            float intensity = 1.0 - (sdfDist / maxBuildingDist);
            vec3 zonedColor = mix(baseColor, targetZoneColor, 0.7);
            float grid = step(0.1, fract(p.x * 0.2)) * step(0.1, fract(p.y * 0.2));
            baseColor = mix(baseColor, zonedColor * (0.9 + 0.1 * grid), intensity);
        }
    }
    
    // Final Lighting
    float diffuse = max(dot(normal, uSunDirection), 0.0);
    vec3 dayLighting = (uAmbientColor + uSunColor * diffuse) * uSunIntensity;
    
    // Apply smooth baked lamps
    vec3 lampLighting = lampColor * bakedLampLight * lampIntensity;
    
    gl_FragColor = vec4(baseColor * (dayLighting + lampLighting), 1.0);
}
