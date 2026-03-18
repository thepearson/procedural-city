uniform vec3 grassColor;
uniform vec3 roadColor;
uniform vec3 footpathColor;
uniform vec3 centerLineColor;
uniform vec3 laneLineColor;
uniform float roadWidth;
uniform float footpathWidth;
uniform float dashLength;
uniform float dashWidth;
uniform float numSegments;
uniform vec4 roadSegments[256]; // x1, z1, x2, z2
uniform float roadTypes[256];    // 0 = street, 1 = highway

uniform float lampInterval;
uniform float lampIntensity;
uniform vec3 lampColor;
uniform float lampRadius;

uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uAmbientColor;

varying vec2 vUv;
varying vec3 vPosition;

float distanceToSegment(vec2 p, vec2 a, vec2 b, out float bFactor, out float uFactor) {
    vec2 v = b - a;
    vec2 w = p - a;
    float c1 = dot(w, v);
    float c2 = dot(v, v);
    
    float b_norm = clamp(c1 / c2, 0.0, 1.0);
    vec2 pb = a + b_norm * v;
    
    bFactor = b_norm * length(v); // Distance along road
    
    // Cross distance (signed)
    vec2 normal = normalize(vec2(-v.y, v.x));
    uFactor = dot(p - pb, normal);
    
    return distance(p, pb);
}

void main() {
    vec2 p = vPosition.xz;
    
    // Calculate normal using derivatives for shading
    // Using dFdx cross dFdy for correct upward normal in Three.js default screen/world orientation
    vec3 normal = normalize(cross(dFdx(vPosition), dFdy(vPosition)));
    
    // Base grass color with simple noise
    float noise = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 baseColor = grassColor * (0.8 + 0.2 * noise);
    
    float minDist = 1e10;
    float bestB = 0.0;
    float bestU = 0.0;
    float bestType = 0.0;
    bool onRoad = false;
    bool onFootpath = false;
    
    float totalLampLight = 0.0;
    
    for (int i = 0; i < 256; i++) {
        if (float(i) >= numSegments) break;
        
        float b, u;
        float dist = distanceToSegment(p, roadSegments[i].xy, roadSegments[i].zw, b, u);
        
        float currentType = roadTypes[i];
        float currentRoadWidth = roadWidth * (currentType > 0.5 ? 1.5 : 1.0);
        float halfRoadWidth = currentRoadWidth * 0.5;
        float currentFootpathWidth = currentType < 0.5 ? footpathWidth : 0.0;
        float halfTotalWidth = halfRoadWidth + currentFootpathWidth;
        
        // Lamp lighting (only for streets, placed at interval)
        if (currentType < 0.5 && lampInterval > 0.0) {
            vec2 a = roadSegments[i].xy;
            vec2 b_pos = roadSegments[i].zw;
            vec2 vDir = b_pos - a;
            float L = length(vDir);
            if (L > 0.1) {
                vec2 vNorm = vDir / L;
                vec2 nNorm = vec2(-vNorm.y, vNorm.x);
                
                // Project point onto segment axis to find nearest lamp index
                float bProj = dot(p - a, vNorm);
                float lampIndex = clamp(floor(bProj / lampInterval + 0.5), 0.0, floor(L / lampInterval));
                
                // Check both sides of the road for the nearest lamp point
                for (float side = -1.0; side <= 1.0; side += 2.0) {
                    vec2 pLamp = a + (lampIndex * lampInterval) * vNorm + (side * halfTotalWidth) * nNorm;
                    
                    // Simple Euclidean distance to the lamp on the ground plane
                    float dLamp = distance(p, pLamp);
                    
                    // Smooth circular falloff
                    float falloff = clamp(1.0 - dLamp / lampRadius, 0.0, 1.0);
                    falloff = smoothstep(0.0, 1.0, falloff);
                    totalLampLight += falloff * lampIntensity;
                }
            }
        }

        if (dist < halfTotalWidth) {
            if (dist < minDist) {
                minDist = dist;
                bestB = b;
                bestU = u;
                bestType = currentType;
                
                if (dist < halfRoadWidth) {
                    onRoad = true;
                    onFootpath = false;
                } else {
                    onRoad = false;
                    onFootpath = true;
                }
            }
        }
    }
    
    if (onRoad) {
        baseColor = roadColor;
        float absU = abs(bestU);
        float currentRoadWidth = roadWidth * (bestType > 0.5 ? 1.5 : 1.0);
        float normU = absU / (currentRoadWidth * 0.5);
        
        float centerLineWidth = 0.1;
        if (absU < centerLineWidth * 0.5) {
            baseColor = centerLineColor;
        }
        
        float laneLineWidth = dashWidth;
        if (bestType > 0.5) {
            float laneBoundary = 0.5;
            if (abs(normU - laneBoundary) < laneLineWidth / (currentRoadWidth * 0.5)) {
                if (fract(bestB / dashLength) > 0.5) {
                    baseColor = laneLineColor;
                }
            }
        }
        
        if (normU > 0.95) {
            baseColor = laneLineColor;
        }
    } else if (onFootpath) {
        baseColor = footpathColor;
        float tileSize = 1.0;
        float tilePattern = step(0.05, fract(bestB / tileSize)) * step(0.05, fract(abs(bestU) / tileSize));
        baseColor *= (0.9 + 0.1 * tilePattern);
    }
    
    // Lighting calculation
    float diffuse = max(dot(normal, uSunDirection), 0.0);

    // Standard sun/ambient lighting - scaled by sun intensity as requested
    vec3 dayLighting = (uAmbientColor + uSunColor * diffuse) * uSunIntensity;
    
    // Streetlamp additive lighting contribution
    vec3 lampLighting = lampColor * totalLampLight;
    
    // Final color combines both lighting systems additively
    gl_FragColor = vec4(baseColor * (dayLighting + lampLighting), 1.0);
}
