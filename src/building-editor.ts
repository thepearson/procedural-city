import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as dat from 'dat.gui';
import { BuildingRenderer } from './core/BuildingRenderer.js';
import { state } from './state.js';
import type { BuildingShape, RoofFeature } from './core/CityPlanner.js';

// Simple hash for building editor features
function pseudoHash(x: number): number {
    const val = Math.sin(x) * 43758.5453123;
    return val - Math.floor(val);
}

// --- Building Editor State ---
const buildingState = {
    shape: 'square' as BuildingShape,
    width: 15.0,
    height: 30.0,
    depth: 12.0,
    rotation: 0.0,
    taperAmount: 0.0,
    color: 0x888888,
    seed: Math.random(),
    winWidth: state.buildingWinWidth,
    winHeight: state.buildingWinHeight,
    spacingX: state.buildingSpacingX,
    spacingY: state.buildingSpacingY,
    winShininess: state.buildingWinShininess,
    numRoofFeatures: 3,
    roofFeatureMinSize: 0.5,
    roofFeatureMaxSize: 1.5,
    roofFeatureMinHeight: 0.5,
    roofFeatureMaxHeight: 2.0,
    sunIntensity: 1.0,
    sunColor: 0xffffff,
    ambientColor: 0x222222,
    lampIntensity: 0.75,
    lampOnTime: 18.5,
    lampOffTime: 6.5,
    previewLights: false,
    timeOfDay: 12.0,
    autoRotate: false
};

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
sunLight.position.set(10, 20, 10);
sunLight.castShadow = true;
scene.add(sunLight);

const controls = new OrbitControls(camera, renderer.domElement);
camera.position.set(30, 30, 30);
controls.target.set(0, 10, 0);
controls.update();

// --- Ground Plane ---
const groundGeo = new THREE.PlaneGeometry(200, 200);
groundGeo.rotateX(-Math.PI / 2);
const groundMat = new THREE.MeshStandardMaterial({ color: state.grassColor });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = true;
scene.add(ground);

// --- Building Renderer ---
const buildingRenderer = new BuildingRenderer(scene, 1);

function updateBuilding() {
    const topScale = 1.0 - buildingState.taperAmount;
    
    // Generate roof features based on state and seed
    const roofFeatures: RoofFeature[] = [];
    for (let i = 0; i < buildingState.numRoofFeatures; i++) {
        const fRand = pseudoHash(buildingState.seed + i * 17.1);
        const fSizeRand = pseudoHash(fRand * 31.4);
        
        // Much smaller defaults
        const fWidth = buildingState.roofFeatureMinSize + fSizeRand * (buildingState.roofFeatureMaxSize - buildingState.roofFeatureMinSize);
        const fDepth = buildingState.roofFeatureMinSize + pseudoHash(fSizeRand * 7.1) * (buildingState.roofFeatureMaxSize - buildingState.roofFeatureMinSize);
        const fHeight = buildingState.roofFeatureMinHeight + pseudoHash(fSizeRand * 13.1) * (buildingState.roofFeatureMaxHeight - buildingState.roofFeatureMinHeight);

        // Offset within building bounds, scaled by topScale
        const offsetX = (fRand * 2.0 - 1.0) * (buildingState.width * 0.5 * topScale - fWidth * 0.5);
        const offsetZ = (pseudoHash(fRand * 5.1) * 2.0 - 1.0) * (buildingState.depth * 0.5 * topScale - fDepth * 0.5);

        roofFeatures.push({
            pos: new THREE.Vector3(offsetX, 0, offsetZ),
            scale: new THREE.Vector3(fWidth, fHeight, fDepth)
        });
    }

    const buildingData = {
        pos: new THREE.Vector3(0, 0, 0),
        scale: new THREE.Vector3(buildingState.width, buildingState.height, buildingState.depth),
        rotation: buildingState.rotation,
        seed: buildingState.seed,
        taperAmount: buildingState.taperAmount,
        color: new THREE.Color(buildingState.color),
        shape: buildingState.shape,
        roofFeatures: roofFeatures
    };

    buildingRenderer.render([buildingData]);

    // Update Window Uniforms
    buildingRenderer.material.uniforms.uWinWidth!.value = buildingState.winWidth;
    buildingRenderer.material.uniforms.uWinHeight!.value = buildingState.winHeight;
    buildingRenderer.material.uniforms.uSpacingX!.value = buildingState.spacingX;
    buildingRenderer.material.uniforms.uSpacingY!.value = buildingState.spacingY;
    buildingRenderer.material.uniforms.uWinShininess!.value = buildingState.winShininess;
}

function updateEnvironment() {
    const t = buildingState.timeOfDay;
    const sunAngle = ((t - 6) / 12) * Math.PI;
    const isDay = t >= 6 && t <= 18;
    const sunPos = new THREE.Vector3(Math.cos(sunAngle) * 50, Math.sin(sunAngle) * 50, 20);
    sunLight.position.copy(sunPos);
    
    let sunInt = isDay ? Math.pow(Math.sin(sunAngle), 0.5) : 0;
    sunLight.intensity = sunInt * buildingState.sunIntensity;
    
    const sky = new THREE.Color();
    if (isDay) sky.lerpColors(new THREE.Color(0x87ceeb), new THREE.Color(0x0a0a20), 1.0 - Math.sin(sunAngle));
    else sky.set(0x050510);
    scene.background = sky;

    // Calculate Lamp Power based on time
    let lampPower = 0;
    const isNight = buildingState.lampOnTime > buildingState.lampOffTime 
        ? (t >= buildingState.lampOnTime || t <= buildingState.lampOffTime) 
        : (t >= buildingState.lampOnTime && t <= buildingState.lampOffTime);
    
    if (isNight || buildingState.previewLights) {
        lampPower = buildingState.lampIntensity;
        if (!buildingState.previewLights) {
            const fade = 0.5;
            // Simple fade logic for editor
            if (t >= buildingState.lampOnTime && t < buildingState.lampOnTime + fade) {
                lampPower *= THREE.MathUtils.smoothstep(t, buildingState.lampOnTime, buildingState.lampOnTime + fade);
            } else if (t > buildingState.lampOffTime - fade && t <= buildingState.lampOffTime) {
                lampPower *= (1.0 - THREE.MathUtils.smoothstep(t, buildingState.lampOffTime - fade, buildingState.lampOffTime));
            }
        }
    }

    // Update Building Material Uniforms
    buildingRenderer.material.uniforms.uSunDirection!.value.copy(sunLight.position).normalize();
    buildingRenderer.material.uniforms.uSunColor!.value.set(buildingState.sunColor);
    buildingRenderer.material.uniforms.uSunIntensity!.value = sunInt * buildingState.sunIntensity;
    buildingRenderer.material.uniforms.uAmbientColor!.value.set(buildingState.ambientColor);
    buildingRenderer.material.uniforms.uLampIntensity!.value = lampPower;
}

// --- GUI ---
const gui = new dat.GUI();

const bFolder = gui.addFolder('Building Dimensions');
bFolder.add(buildingState, 'shape', ['square', 'rectangular', 'circular', 'hexagonal', 'L', 'U']).onChange(updateBuilding);
bFolder.add(buildingState, 'width', 1, 50).onChange(updateBuilding);
bFolder.add(buildingState, 'height', 1, 200).onChange(updateBuilding);
bFolder.add(buildingState, 'depth', 1, 50).onChange(updateBuilding);
bFolder.add(buildingState, 'rotation', 0, Math.PI * 2).onChange(updateBuilding);
bFolder.add(buildingState, 'taperAmount', 0, 1.0).name('Taper Amount').onChange(updateBuilding);
bFolder.addColor(buildingState, 'color').onChange(updateBuilding);
bFolder.add(buildingState, 'seed', 0, 1).onChange(updateBuilding);
bFolder.add({ randomizeSeed: () => { buildingState.seed = Math.random(); gui.updateDisplay(); updateBuilding(); } }, 'randomizeSeed');
bFolder.open();

const wFolder = gui.addFolder('Window Style');
wFolder.add(buildingState, 'winWidth', 0.1, 1.0).name('Window Width').onChange(updateBuilding);
wFolder.add(buildingState, 'winHeight', 0.1, 1.0).name('Window Height').onChange(updateBuilding);
wFolder.add(buildingState, 'spacingX', 0.1, 5.0).name('Spacing X').onChange(updateBuilding);
wFolder.add(buildingState, 'spacingY', 0.1, 10.0).name('Spacing Y').onChange(updateBuilding);
wFolder.add(buildingState, 'winShininess', 0.0, 20.0).name('Shininess').onChange(updateBuilding);
wFolder.open();

const rFolder = gui.addFolder('Roof Features');
rFolder.add(buildingState, 'numRoofFeatures', 0, 10).step(1).name('Count').onChange(updateBuilding);
rFolder.add(buildingState, 'roofFeatureMinSize', 0.1, 5.0).name('Min Size').onChange(updateBuilding);
rFolder.add(buildingState, 'roofFeatureMaxSize', 0.1, 10.0).name('Max Size').onChange(updateBuilding);
rFolder.add(buildingState, 'roofFeatureMinHeight', 0.1, 5.0).name('Min Height').onChange(updateBuilding);
rFolder.add(buildingState, 'roofFeatureMaxHeight', 0.1, 10.0).name('Max Height').onChange(updateBuilding);
rFolder.open();

const eFolder = gui.addFolder('Environment');
eFolder.add(buildingState, 'timeOfDay', 0, 24).onChange(updateEnvironment);
eFolder.add(buildingState, 'sunIntensity', 0, 5).onChange(updateEnvironment);
eFolder.addColor(buildingState, 'sunColor').onChange(updateEnvironment);
eFolder.addColor(buildingState, 'ambientColor').onChange(updateEnvironment);
eFolder.add(buildingState, 'lampIntensity', 0, 10).onChange(updateEnvironment);
eFolder.add(buildingState, 'previewLights').name('Preview Lights').onChange(updateEnvironment);
eFolder.add(buildingState, 'autoRotate');
eFolder.open();

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    if (buildingState.autoRotate) {
        buildingState.rotation += 0.01;
        updateBuilding();
    }
    controls.update();
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initial update
updateBuilding();
updateEnvironment();
animate();
