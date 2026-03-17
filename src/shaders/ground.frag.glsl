uniform vec3 grassColor;
uniform vec3 roadColor;
uniform vec3 centerLineColor;
uniform vec3 laneLineColor;
uniform float roadWidth;
uniform float dashLength;
uniform float dashWidth;
uniform float numSegments;
uniform vec4 roadSegments[256]; // x1, z1, x2, z2
uniform float roadTypes[256];    // 0 = street, 1 = highway

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
    vec3 normal = normalize(cross(dFdx(vPosition), dFdy(vPosition)));
    
    // Base grass color with simple noise
    float noise = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 baseColor = grassColor * (0.8 + 0.2 * noise);
    
    float minDist = 1e10;
    float bestB = 0.0;
    float bestU = 0.0;
    float bestType = 0.0;
    bool onRoad = false;
    
    for (int i = 0; i < 256; i++) {
        if (float(i) >= numSegments) break;
        
        float b, u;
        float dist = distanceToSegment(p, roadSegments[i].xy, roadSegments[i].zw, b, u);
        
        float currentType = roadTypes[i];
        float currentWidth = roadWidth * (currentType > 0.5 ? 1.5 : 1.0);
        
        if (dist < currentWidth * 0.5) {
            onRoad = true;
            if (dist < minDist) {
                minDist = dist;
                bestB = b;
                bestU = u;
                bestType = currentType;
            }
        }
    }
    
    if (onRoad) {
        baseColor = roadColor;
        
        float absU = abs(bestU);
        float currentWidth = roadWidth * (bestType > 0.5 ? 1.5 : 1.0);
        float normU = absU / (currentWidth * 0.5); // 0 at center, 1 at edge
        
        // Center line (yellow)
        float centerLineWidth = 0.1;
        if (absU < centerLineWidth * 0.5) {
            baseColor = centerLineColor;
        }
        
        // Dash line width logic
        float laneLineWidth = dashWidth;
        
        if (bestType > 0.5) {
            // HIGHWAY: 4 lanes (center + 2 dividers)
            float laneBoundary = 0.5; // Halfway to edge
            if (abs(normU - laneBoundary) < laneLineWidth / (currentWidth * 0.5)) {
                // Dashed line logic
                if (fract(bestB / dashLength) > 0.5) {
                    baseColor = laneLineColor;
                }
            }
        }
        
        // Edge lines (white solid)
        if (normU > 0.95) {
            baseColor = laneLineColor;
        }
    }
    
    // Lighting calculation
    float diffuse = max(dot(normal, uSunDirection), 0.0);
    vec3 lightEffect = uAmbientColor + uSunColor * diffuse * uSunIntensity;
    
    gl_FragColor = vec4(baseColor * lightEffect, 1.0);
}
