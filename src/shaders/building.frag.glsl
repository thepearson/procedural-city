uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uAmbientColor;
uniform float uLampIntensity;
// uniform vec3 cameraPosition; // Removed, Three.js adds this automatically

uniform float uWinWidth;
uniform float uWinHeight;
uniform float uSpacingX;
uniform float uSpacingY;
uniform float uWinShininess;

varying vec2 vUv;
varying vec3 vNormal;
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
    vec3 normal = normalize(vNormal + 0.00001);
    vec3 worldPos = vWorldPosition;
    vec3 viewDir = normalize(cameraPosition - vWorldPosition + 0.00001);
    
    // Safety check for uniforms
    float winWidth = max(uWinWidth, 0.01);
    float winHeight = max(uWinHeight, 0.01);
    float spacingX = max(uSpacingX, 0.01);
    float spacingY = max(uSpacingY, 0.01);
    
    // --- 2. GENERATE WINDOW GRID ---
    vec2 gridUV;
    if (abs(normal.y) > 0.9) {
        gridUV = worldPos.xz * 0.2; // Roof
    } else {
        float horizontal = (abs(normal.z) > 0.5) ? worldPos.x : worldPos.z;
        // Circular/Hexagonal logic
        if (abs(normal.x) > 0.1 && abs(normal.z) > 0.1) {
             float angle = atan(normal.z, normal.x);
             horizontal = angle * 5.0;
        }
        gridUV = vec2(horizontal / spacingX, worldPos.y / spacingY);
    }
    
    vec2 g = fract(gridUV);
    vec2 id = floor(gridUV);
    
    // Window Mask
    float horizontalMask = step(abs(g.x - 0.5), winWidth * 0.5);
    float verticalMask = step(0.15, g.y) * step(g.y, winHeight);
    float windowMask = horizontalMask * verticalMask;
    
    // Per-window randomization
    float winRand = hash12(id + vSeed * 10.0);
    
    // --- 3. COLORING ---
    vec3 col = vInstanceColor;
    
    // Roof logic
    if (abs(normal.y) > 0.9) {
        windowMask = 0.0;
        col *= 0.7;
    }
    
    // DAYTIME REFLECTIONS
    vec3 reflectDir = reflect(-viewDir, normal);
    vec3 skyBlue = vec3(0.2, 0.5, 1.0);
    vec3 horizonColor = vec3(0.6, 0.7, 0.8);
    // Ensure reflectDir.y is safe
    float ry = clamp(reflectDir.y, -1.0, 1.0);
    vec3 skyCol = mix(horizonColor, skyBlue, smoothstep(-0.1, 0.6, ry));
    
    // Sun reflection (specular)
    float sunDot = max(dot(reflectDir, uSunDirection), 0.0);
    float sunSpec = pow(sunDot, 32.0) * uSunIntensity * uWinShininess;
    skyCol += uSunColor * sunSpec * 2.0;

    vec3 windowDayCol = mix(vec3(0.02, 0.02, 0.05), skyCol, 0.4 + 0.4 * hash11(winRand));
    
    // NIGHTTIME EMISSIVE
    vec3 c1 = vec3(1.0, 0.9, 0.7);
    vec3 c2 = vec3(1.0, 1.0, 1.0);
    vec3 c3 = vec3(0.85, 0.85, 0.9);
    vec3 c4 = vec3(1.0, 0.8, 0.5);
    
    float p = hash11(winRand * 13.0);
    vec3 windowNightBaseCol;
    if (p < 0.33) windowNightBaseCol = mix(c1, c2, p / 0.33);
    else if (p < 0.66) windowNightBaseCol = mix(c2, c3, (p - 0.33) / 0.33);
    else windowNightBaseCol = mix(c3, c4, (p - 0.66) / 0.34);

    float brightness = 0.4 + hash11(winRand * 17.0) * 1.6;
    float internalNoise = 0.8 + 0.4 * hash12(g * 100.0 + winRand);
    internalNoise *= (0.7 + 0.3 * smoothstep(0.0, 0.2, g.y) * smoothstep(winHeight, winHeight - 0.2, g.y));
    vec3 windowNightCol = (windowNightBaseCol * brightness) * internalNoise;
    
    float isLit = step(0.3 + hash11(vSeed * 5.0) * 0.4, winRand);
    
    // Final window color
    vec3 currentWindowCol = mix(windowDayCol, windowNightCol, isLit * clamp(uLampIntensity, 0.0, 1.0));
    col = mix(col, currentWindowCol, windowMask);
    
    // --- 4. SHADING ---
    float diffuse = max(dot(normal, uSunDirection), 0.0);
    vec3 dayLighting = (uAmbientColor + uSunColor * diffuse * uSunIntensity);
    
    // Final color calculation - ensure no NaNs
    vec3 finalCol = col * dayLighting;
    
    // Add emissive separately
    vec3 emissive = (windowMask * isLit * currentWindowCol) * uLampIntensity * 0.8;
    
    gl_FragColor = vec4(max(finalCol + emissive, 0.0), 1.0);
}
