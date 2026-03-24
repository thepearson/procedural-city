uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uAmbientColor;
uniform float uLampIntensity;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;
varying float vSeed;
varying vec3 vInstanceColor;

float hash12(vec2 p) {
	vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float hash11(float p) {
    p = fract(p * .1031);
    p *= (p + 33.33);
    p *= (p + p);
    return fract(p);
}

void main() {
    vec3 normal = normalize(vNormal);
    vec3 worldPos = vWorldPosition;
    
    // --- 1. RANDOMIZE WINDOW PARAMETERS BASED ON SEED ---
    float winWidth = 0.3 + hash11(vSeed) * 0.4; // 0.3 - 0.7
    float winHeight = 0.5 + hash11(vSeed + 1.0) * 0.35; // 0.5 - 0.85
    float spacingX = 0.4 + hash11(vSeed + 2.0) * 1.6; // 0.4 - 2.0
    float spacingY = 2.0 + hash11(vSeed + 3.0) * 1.5; // 2.0 - 3.5

    // --- 2. GENERATE WINDOW GRID ---
    vec2 gridUV;
    if (abs(normal.y) > 0.9) {
        gridUV = worldPos.xz * 0.2; // Roof
    } else {
        // Use vUv for more reliable horizontal mapping across various shapes
        // We multiply vUv.x by a factor related to the building's perimeter, 
        // but since we don't have that easily, we'll use a heuristic.
        // For a box, vUv.x usually goes 0-1 around the perimeter or per face.
        // In Three.js geometries, it's often per-face.
        
        float horizontal = (abs(normal.z) > 0.5) ? worldPos.x : worldPos.z;
        // If it's a cylinder, worldPos.x/z alone isn't enough for wrapping.
        // Heuristic: if normal is not axis-aligned, use worldPos length-based mapping
        if (abs(normal.x) > 0.1 && abs(normal.z) > 0.1) {
             float angle = atan(normal.z, normal.x);
             horizontal = angle * 5.0; // Scaled angle
        }

        gridUV = vec2(horizontal / spacingX, worldPos.y / spacingY);
    }
    
    vec2 g = fract(gridUV);
    vec2 id = floor(gridUV);
    
    // Window Mask
    // Centered horizontally, fixed bottom offset for "sill"
    float horizontalMask = step(abs(g.x - 0.5), winWidth * 0.5);
    float verticalMask = step(0.15, g.y) * step(g.y, winHeight);
    float windowMask = horizontalMask * verticalMask;
    
    // Randomize per-window properties
    // Mix building seed with window ID for unique window randomization per building
    float winRand = hash12(id + vSeed * 10.0);
    
    // --- 3. COLORING ---
    vec3 col = vInstanceColor;
    
    // Roof logic
    if (abs(normal.y) > 0.9) {
        windowMask = 0.0;
        col *= 0.7; // Darker roof
    }
    
    // Day Window Color (Dark Glass)
    vec3 windowDayCol = vec3(0.05, 0.05, 0.1) + (winRand * 0.05);
    
    // Night Window Color (Lit)
    // Palette: Light Yellow -> White -> Cool Grey -> Warm Orange
    vec3 c1 = vec3(1.0, 0.9, 0.7);   // Light Yellow
    vec3 c2 = vec3(1.0, 1.0, 1.0);   // White
    vec3 c3 = vec3(0.85, 0.85, 0.9); // Cool Grey
    vec3 c4 = vec3(1.0, 0.8, 0.5);   // Warm Orange
    
    float p = hash11(winRand * 13.0);
    vec3 windowNightBaseCol;
    if (p < 0.33) windowNightBaseCol = mix(c1, c2, p / 0.33);
    else if (p < 0.66) windowNightBaseCol = mix(c2, c3, (p - 0.33) / 0.33);
    else windowNightBaseCol = mix(c3, c4, (p - 0.66) / 0.34);

    // Vary brightness significantly (simulating curtains, blinds, or different bulb wattages)
    float brightness = 0.4 + hash11(winRand * 17.0) * 1.6; // 0.4 to 2.0
    
    // Add internal noise to the window (shadows, curtains, etc.)
    float internalNoise = 0.8 + 0.4 * hash12(g * 100.0 + winRand);
    // Add a vertical gradient to simulate floor/ceiling shadows
    internalNoise *= (0.7 + 0.3 * smoothstep(0.0, 0.2, g.y) * smoothstep(winHeight, winHeight - 0.2, g.y));
    
    vec3 windowNightCol = (windowNightBaseCol * brightness) * internalNoise;
    
    // Not all windows are lit at night
    float lightThreshold = 0.3 + hash11(vSeed * 5.0) * 0.4;
    float isLit = step(lightThreshold, winRand);
    
    // Final window color interpolates based on light intensity (time of day)
    vec3 currentWindowCol = mix(windowDayCol, windowNightCol, isLit * clamp(uLampIntensity, 0.0, 1.0));
    
    col = mix(col, currentWindowCol, windowMask);
    
    // --- 4. SHADING ---
    float diffuse = max(dot(normal, uSunDirection), 0.0);
    vec3 dayLighting = (uAmbientColor + uSunColor * diffuse * uSunIntensity);
    
    // Emissive component for windows at night
    vec3 emissive = (windowMask * isLit * currentWindowCol) * clamp(uLampIntensity, 0.0, 1.0) * 0.8;
    
    gl_FragColor = vec4(col * dayLighting + emissive, 1.0);
}
