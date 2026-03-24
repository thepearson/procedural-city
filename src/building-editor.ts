import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as dat from 'dat.gui';
import { BuildingRenderer } from './core/BuildingRenderer.js';
import { state } from './state.js';
import type { BuildingShape } from './core/CityPlanner.js';

// --- Building Editor State ---
const buildingState = {
    shape: 'square' as BuildingShape,
    width: 15.0,
    height: 30.0,
    depth: 12.0,
    rotation: 0.0,
    color: 0x888888,
    seed: Math.random(),
    hasRoofFeature: true,
    roofFeatureWidth: 5.0,
    roofFeatureHeight: 4.0,
    roofFeatureDepth: 5.0,
    sunIntensity: 1.0,
    sunColor: 0xffffff,
    ambientColor: 0x222222,
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
    const buildingData = {
        pos: new THREE.Vector3(0, 0, 0),
        scale: new THREE.Vector3(buildingState.width, buildingState.height, buildingState.depth),
        rotation: buildingState.rotation,
        seed: buildingState.seed,
        color: new THREE.Color(buildingState.color),
        shape: buildingState.shape,
        hasRoofFeature: buildingState.hasRoofFeature,
        roofFeatureScale: buildingState.hasRoofFeature ? new THREE.Vector3(buildingState.roofFeatureWidth, buildingState.roofFeatureHeight, buildingState.roofFeatureDepth) : undefined
    };

    buildingRenderer.render([buildingData]);
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

    // Update Building Material Uniforms
    buildingRenderer.material.uniforms.uSunDirection!.value.copy(sunLight.position).normalize();
    buildingRenderer.material.uniforms.uSunColor!.value.set(buildingState.sunColor);
    buildingRenderer.material.uniforms.uSunIntensity!.value = sunInt * buildingState.sunIntensity;
    buildingRenderer.material.uniforms.uAmbientColor!.value.set(buildingState.ambientColor);
}

// --- GUI ---
const gui = new dat.GUI();

const bFolder = gui.addFolder('Building Dimensions');
bFolder.add(buildingState, 'shape', ['square', 'rectangular', 'circular', 'hexagonal', 'L', 'U']).onChange(updateBuilding);
bFolder.add(buildingState, 'width', 1, 50).onChange(updateBuilding);
bFolder.add(buildingState, 'height', 1, 200).onChange(updateBuilding);
bFolder.add(buildingState, 'depth', 1, 50).onChange(updateBuilding);
bFolder.add(buildingState, 'rotation', 0, Math.PI * 2).onChange(updateBuilding);
bFolder.addColor(buildingState, 'color').onChange(updateBuilding);
bFolder.add(buildingState, 'seed', 0, 1).onChange(updateBuilding);
bFolder.add({ randomizeSeed: () => { buildingState.seed = Math.random(); gui.updateDisplay(); updateBuilding(); } }, 'randomizeSeed');
bFolder.open();

const rFolder = gui.addFolder('Roof Features');
rFolder.add(buildingState, 'hasRoofFeature').onChange(updateBuilding);
rFolder.add(buildingState, 'roofFeatureWidth', 1, 40).onChange(updateBuilding);
rFolder.add(buildingState, 'roofFeatureHeight', 1, 20).onChange(updateBuilding);
rFolder.add(buildingState, 'roofFeatureDepth', 1, 40).onChange(updateBuilding);
rFolder.open();

const eFolder = gui.addFolder('Environment');
eFolder.add(buildingState, 'timeOfDay', 0, 24).onChange(updateEnvironment);
eFolder.add(buildingState, 'sunIntensity', 0, 5).onChange(updateEnvironment);
eFolder.addColor(buildingState, 'sunColor').onChange(updateEnvironment);
eFolder.addColor(buildingState, 'ambientColor').onChange(updateEnvironment);
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
