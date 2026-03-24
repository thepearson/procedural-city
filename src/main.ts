import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as dat from 'dat.gui';
import Stats from 'stats.js';

import vertexShader from './shaders/ground.vert.glsl';
import fragmentShader from './shaders/ground.frag.glsl';

import { getTerrainHeight } from './utils/terrain.js';
import { RoadGenerator, TERRAIN_SIZE } from './core/RoadGenerator.js';
import { GPUBaker } from './core/GPUBaker.js';
import { RoadTexture } from './core/RoadTexture.js';
import { BuildingRenderer } from './core/BuildingRenderer.js';
import { CityPlanner } from './core/CityPlanner.js';
import { state } from './state.js';

// --- Performance Monitor ---
const stats = new Stats();
stats.showPanel(0); 
stats.dom.style.display = 'none';
document.body.appendChild(stats.dom);

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0x101015, 1.0);
scene.add(ambientLight);
const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
sunLight.position.set(100, 200, 100);
scene.add(sunLight);

const controls = new OrbitControls(camera, renderer.domElement);
camera.position.set(0, 150, 150);
controls.update();

// --- Components ---
const roadGenerator = new RoadGenerator();
const gpuBaker = new GPUBaker(state);
const roadTexture = new RoadTexture(8192);
const buildingRenderer = new BuildingRenderer(scene, 8192);

// --- Materials ---
const material = new THREE.ShaderMaterial({
    uniforms: {
        grassColor: { value: new THREE.Color(state.grassColor) },
        zoneCentralColor: { value: new THREE.Color(state.zoneCentralColor) },
        zoneCommercialColor: { value: new THREE.Color(state.zoneCommercialColor) },
        zoneResidentialColor: { value: new THREE.Color(state.zoneResidentialColor) },
        zoneBuildingColor: { value: new THREE.Color(state.zoneBuildingColor) },
        roadColor: { value: new THREE.Color(state.roadColor) },
        footpathColor: { value: new THREE.Color(state.footpathColor) },
        centerLineColor: { value: new THREE.Color(state.centerLineColor) },
        laneLineColor: { value: new THREE.Color(state.laneLineColor) },
        roadWidth: { value: state.roadWidth },
        footpathWidth: { value: state.footpathWidth },
        dashLength: { value: state.dashLength },
        dashWidth: { value: state.dashWidth },
        numSegments: { value: 0 },
        numBuildings: { value: 0 },
        uRoadData: { value: roadTexture.texture },
        lampIntensity: { value: state.lampIntensity },
        lampColor: { value: new THREE.Color(state.lampColor) },
        lampRadius: { value: state.lampRadius },
        uNoiseScale: { value: state.noiseScale },
        uNoiseHeight: { value: state.noiseHeight },
        uNoiseOffset: { value: new THREE.Vector2() },
        uSunDirection: { value: new THREE.Vector3() },
        uSunColor: { value: new THREE.Color() },
        uSunIntensity: { value: 1.0 },
        uAmbientColor: { value: new THREE.Color() },
        uBakeMap: { value: gpuBaker.renderTarget.texture },
        uTerrainSize: { value: TERRAIN_SIZE },
        uDebugMode: { value: 0 },
        uShowBuildingZones: { value: state.showBuildingZones ? 1 : 0 },
        uBuildingDensity: { value: state.buildingDensity }
    },
    vertexShader,
    fragmentShader
});

const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, state.groundSegments, state.groundSegments);
geometry.rotateX(-Math.PI / 2);
const ground = new THREE.Mesh(geometry, material);
scene.add(ground);

// --- Lamps ---
const MAX_LAMPS = 2048;
const lampMat = new THREE.MeshStandardMaterial({ color: 0x666666, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.2 });
const lampPoleGeo = new THREE.PlaneGeometry(0.2, 3);
const lampArmGeo = new THREE.PlaneGeometry(0.2, 0.9);
const poleInstances = new THREE.InstancedMesh(lampPoleGeo, lampMat, MAX_LAMPS);
const armInstances = new THREE.InstancedMesh(lampArmGeo, lampMat, MAX_LAMPS);
scene.add(poleInstances, armInstances);

const dummy = new THREE.Object3D();

function distanceToSegmentSq(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return (px - x1) ** 2 + (py - y1) ** 2;
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return (px - (x1 + t * (x2 - x1))) ** 2 + (py - (y1 + t * (y2 - y1))) ** 2;
}

function updateLamps() {
    let lampCount = 0;
    const segments = roadGenerator.segments;
    const interval = state.lampInterval;

    segments.forEach((s: any) => {
        const len = s.start.distanceTo(s.end);
        const dir = s.end.clone().sub(s.start).normalize();
        const normal = new THREE.Vector2(-dir.y, dir.x);
        const angle = Math.atan2(dir.y, dir.x);

        const currentRoadWidth = state.roadWidth * (s.type === 'highway' ? 1.5 : 1.0);
        const halfRoadWidth = currentRoadWidth * 0.5;
        const currentFootpathWidth = (s.type === 'street') ? state.footpathWidth : 0.0;
        const totalWidth = halfRoadWidth + currentFootpathWidth;

        for (let d = 0; d <= len; d += interval) {
            [-1, 1].forEach(side => {
                if (lampCount >= MAX_LAMPS) return;
                const pos = s.start.clone().add(dir.clone().multiplyScalar(d)).add(normal.clone().multiplyScalar(side * totalWidth));
                let onOtherRoad = false;
                for (const other of segments) {
                    if (other === s) continue;
                    const otherWidth = state.roadWidth * (other.type === 'highway' ? 1.5 : 1.0);
                    if (distanceToSegmentSq(pos.x, pos.y, other.start.x, other.start.y, other.end.x, other.end.y) < (otherWidth * 0.5 + 0.5) ** 2) {
                        onOtherRoad = true; break;
                    }
                }
                if (onOtherRoad) return;

                const height = getTerrainHeight(pos.x, pos.y);
                dummy.position.set(pos.x, height + 1.5, pos.y);
                dummy.rotation.set(0, -angle, 0); dummy.updateMatrix();
                poleInstances.setMatrixAt(lampCount, dummy.matrix);

                const armDir = normal.clone().multiplyScalar(-side);
                dummy.position.set(pos.x + armDir.x * 0.45, height + 3, pos.y + armDir.y * 0.45);
                dummy.rotation.set(Math.PI / 2, 0, -angle + Math.PI); dummy.updateMatrix();
                armInstances.setMatrixAt(lampCount, dummy.matrix);
                lampCount++;
            });
        }
    });
    poleInstances.count = lampCount; armInstances.count = lampCount;
    poleInstances.instanceMatrix.needsUpdate = true; armInstances.instanceMatrix.needsUpdate = true;
}

// --- Updates ---
function updateTimeOfDay() {
    const t = state.timeOfDay;
    const sunAngle = ((t - 6) / 12) * Math.PI;
    const isDay = t >= 6 && t <= 18;
    const sunPos = new THREE.Vector3(Math.cos(sunAngle) * 200, Math.sin(sunAngle) * 200, 50);
    sunLight.position.copy(sunPos);
    material.uniforms.uSunDirection!.value.copy(sunPos).normalize();

    let sunInt = isDay ? Math.pow(Math.sin(sunAngle), 0.5) : 0;
    let ambInt = isDay ? 0.2 + 0.5 * sunInt : 0.1;
    let lampPower = 0;
    const isNight = state.lampOnTime > state.lampOffTime ? (t >= state.lampOnTime || t <= state.lampOffTime) : (t >= state.lampOnTime && t <= state.lampOffTime);
    if (isNight) {
        lampPower = state.lampIntensity;
        const fade = 0.5;
        if (state.lampOnTime > state.lampOffTime) {
            if (t >= state.lampOnTime && t < state.lampOnTime + fade) lampPower *= THREE.MathUtils.smoothstep(t, state.lampOnTime, state.lampOnTime + fade);
            else if (t > state.lampOffTime - fade && t <= state.lampOffTime) lampPower *= (1.0 - THREE.MathUtils.smoothstep(t, state.lampOffTime - fade, state.lampOffTime));
        }
    }

    material.uniforms.uSunIntensity!.value = sunInt;
    material.uniforms.uSunColor!.value.lerpColors(new THREE.Color(0xffaa44), new THREE.Color(0xffffff), Math.sin(sunAngle));
    material.uniforms.uAmbientColor!.value.setRGB(ambInt, ambInt, ambInt * 1.1);
    material.uniforms.lampIntensity!.value = lampPower;

    // Update Building Material
    buildingRenderer.material.uniforms.uSunDirection!.value.copy(sunLight.position).normalize();
    buildingRenderer.material.uniforms.uSunColor!.value.copy(material.uniforms.uSunColor!.value);
    buildingRenderer.material.uniforms.uSunIntensity!.value = sunInt;
    buildingRenderer.material.uniforms.uAmbientColor!.value.copy(material.uniforms.uAmbientColor!.value);
    buildingRenderer.material.uniforms.uLampIntensity!.value = lampPower;

    const lerp = isDay ? THREE.MathUtils.smoothstep(Math.sin(sunAngle), 0.0, 0.2) : 0;
    const d = 0.3;
    material.uniforms.grassColor!.value.lerpColors(new THREE.Color(state.grassColor).multiplyScalar(d), new THREE.Color(state.grassColor), lerp);
    material.uniforms.roadColor!.value.lerpColors(new THREE.Color(state.roadColor).multiplyScalar(d), new THREE.Color(state.roadColor), lerp);
    material.uniforms.footpathColor!.value.lerpColors(new THREE.Color(state.footpathColor).multiplyScalar(d), new THREE.Color(state.footpathColor), lerp);
    material.uniforms.centerLineColor!.value.lerpColors(new THREE.Color(state.centerLineColor).multiplyScalar(d), new THREE.Color(state.centerLineColor), lerp);
    material.uniforms.laneLineColor!.value.lerpColors(new THREE.Color(state.laneLineColor).multiplyScalar(d), new THREE.Color(state.laneLineColor), lerp);

    const sky = new THREE.Color();
    if (isDay) sky.lerpColors(new THREE.Color(0x87ceeb), new THREE.Color(0x0a0a20), 1.0 - Math.sin(sunAngle));
    else sky.set(0x050510);
    scene.background = sky;
}

function updateRoads() {
    roadGenerator.maxSegments = state.maxSegments; roadGenerator.highwayStepSize = state.highwayStep; roadGenerator.streetStepSize = state.streetStep;
    roadGenerator.snapRadius = state.snapRadius; roadGenerator.branchProbability = state.branchProbability;
    const segments = roadGenerator.generate(state.pattern);
    console.log(`Generated ${segments.length} road segments.`);
    
    // 1. Plan Buildings (Unified Source of Truth)
    const buildings = CityPlanner.planBuildings(segments);
    
    // 2. Update Texture
    const shaderSegs = segments.map((s: any) => new THREE.Vector4(s.start.x, s.start.y, s.end.x, s.end.y));
    const shaderTypes = segments.map((s: any) => s.type === 'highway' ? 1.0 : 0.0);
    roadTexture.update(shaderSegs, new Float32Array(shaderTypes), buildings);

    // 3. Update Material Uniforms
    material.uniforms.numSegments!.value = Math.min(segments.length, 1024);
    material.uniforms.numBuildings!.value = Math.min(buildings.length, 8192);

    // 4. Update Renderer & Baker
    if (renderer) {
        gpuBaker.bake(renderer, material.uniforms.numSegments!.value, material.uniforms.numBuildings!.value, roadTexture.texture, state);
    }
    updateLamps();
    buildingRenderer.render(buildings);
}

// --- GUI ---
const gui = new dat.GUI();

const roadFolder = gui.addFolder('Roads');
roadFolder.add(state, 'pattern', ['grid', 'radial', 'organic']).onChange(() => updateRoads());
roadFolder.add(state, 'roadWidth', 1.0, 10.0).onChange((v: number) => material.uniforms.roadWidth!.value = v);
roadFolder.add(state, 'footpathWidth', 0.0, 5.0).onChange((v: number) => { material.uniforms.footpathWidth!.value = v; updateLamps(); });
roadFolder.addColor(state, 'roadColor').onChange(() => updateTimeOfDay());
roadFolder.addColor(state, 'footpathColor').onChange(() => updateTimeOfDay());
roadFolder.addColor(state, 'centerLineColor').onChange(() => updateTimeOfDay());
roadFolder.addColor(state, 'laneLineColor').onChange(() => updateTimeOfDay());
roadFolder.add(state, 'dashLength', 0.1, 5.0).onChange((v: number) => material.uniforms.dashLength!.value = v);
roadFolder.add(state, 'dashWidth', 0.01, 0.5).onChange((v: number) => material.uniforms.dashWidth!.value = v);
roadFolder.add(state, 'branchProbability', 0.0, 1.0).name('density').onChange(() => updateRoads());
roadFolder.add(state, 'maxSegments', 10, 1024).step(1).onChange(() => updateRoads());
roadFolder.add(state, 'highwayStep', 5.0, 30.0).onChange(() => updateRoads());
roadFolder.add(state, 'streetStep', 2.0, 20.0).onChange(() => updateRoads());
roadFolder.add(state, 'snapRadius', 1.0, 10.0).onChange(() => updateRoads());
roadFolder.add({ generate: updateRoads }, 'generate').name('Generate');
roadFolder.open();

const lampFolder = gui.addFolder('Streetlamps');
lampFolder.add(state, 'lampInterval', 5.0, 50.0).onChange((v: number) => { material.uniforms.lampInterval!.value = v; updateLamps(); });
lampFolder.add(state, 'lampIntensity', 0.0, 10.0).onChange(() => updateTimeOfDay());
lampFolder.add(state, 'lampRadius', 5.0, 50.0).onChange((v: number) => material.uniforms.lampRadius!.value = v);
lampFolder.addColor(state, 'lampColor').onChange((v: any) => { material.uniforms.lampColor!.value.set(v); updateLamps(); });
lampFolder.add(state, 'lampOnTime', 0, 24).name('On Time').onChange(() => updateTimeOfDay());
lampFolder.add(state, 'lampOffTime', 0, 24).name('Off Time').onChange(() => updateTimeOfDay());
lampFolder.open();

const terrainFolder = gui.addFolder('Terrain');
terrainFolder.add(state, 'noiseScale', 0.0001, 0.02).onChange((v: number) => { 
    material.uniforms.uNoiseScale!.value = v; 
    updateLamps(); 
    updateTimeOfDay(); 
    updateRoads();
});
terrainFolder.add(state, 'noiseHeight', 0.0, 100.0).onChange((v: number) => { 
    material.uniforms.uNoiseHeight!.value = v; 
    updateLamps(); 
    updateTimeOfDay(); 
    updateRoads();
});
terrainFolder.add(state, 'noiseOffsetX', -100.0, 100.0).onChange((v: number) => { 
    material.uniforms.uNoiseOffset!.value.x = v; 
    updateLamps(); 
    updateTimeOfDay(); 
    updateRoads();
});
terrainFolder.add(state, 'noiseOffsetZ', -100.0, 100.0).onChange((v: number) => { 
    material.uniforms.uNoiseOffset!.value.y = v; 
    updateLamps(); 
    updateTimeOfDay(); 
    updateRoads();
});
terrainFolder.addColor(state, 'grassColor').onChange((v: number) => {
    state.grassColor = v;
    updateTimeOfDay();
});
terrainFolder.add(state, 'groundSegments', 1, 512).step(1).name('segments').onChange(() => {
    ground.geometry.dispose();
    ground.geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, state.groundSegments, state.groundSegments);
    ground.geometry.rotateX(-Math.PI / 2);
});
terrainFolder.open();

const environmentFolder = gui.addFolder('Environment');
const zoningFolder = gui.addFolder('Zoning');
zoningFolder.add(state, 'showBuildingZones').name('Show Building Zones').onChange((v: boolean) => material.uniforms.uShowBuildingZones!.value = v ? 1 : 0);
zoningFolder.add(state, 'buildingDensity', 0.0, 1.0).name('Building Density').onChange((v: number) => {
    material.uniforms.uBuildingDensity!.value = v;
    updateRoads();
});
zoningFolder.addColor(state, 'zoneCentralColor').name('Central Color').onChange((v: number) => material.uniforms.zoneCentralColor!.value.set(v));
zoningFolder.addColor(state, 'zoneCommercialColor').name('Commercial Color').onChange((v: number) => material.uniforms.zoneCommercialColor!.value.set(v));
zoningFolder.addColor(state, 'zoneResidentialColor').name('Residential Color').onChange((v: number) => material.uniforms.zoneResidentialColor!.value.set(v));
zoningFolder.addColor(state, 'zoneBuildingColor').name('Building Color').onChange((v: number) => material.uniforms.zoneBuildingColor!.value.set(v));
zoningFolder.open();

environmentFolder.add(state, 'timeOfDay', 0, 24).name('Time (0-24)').onChange(() => updateTimeOfDay());
environmentFolder.add(state, 'showStats').name('Show Stats').onChange((v: boolean) => stats.dom.style.display = v ? 'block' : 'none');
environmentFolder.add(state, 'debugMode', { 'Off': 0, 'SDF': 1, 'Grid': 2, 'No Optimization': 3, 'BakeMap': 4, 'Buildings': 5 }).name('Debug Mode').onChange((v: number) => material.uniforms.uDebugMode!.value = v);
environmentFolder.open();

// --- Init ---
let frameCount = 0;

function animate() {
    frameCount++;
    // Wait until frame 2 to ensure everything is initialized
    if (frameCount === 2) {
        updateRoads();
        updateTimeOfDay();
    }
    stats.begin();
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    stats.end();
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
