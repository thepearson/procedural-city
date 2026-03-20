import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as dat from 'dat.gui';
import Stats from 'stats.js';

import vertexShader from './shaders/ground.vert.glsl';
import fragmentShader from './shaders/ground.frag.glsl';
import bakeVertexShader from './shaders/bake.vert.glsl';
import bakeFragmentShader from './shaders/bake.frag.glsl';

// --- Performance Monitor ---
const stats = new Stats();
stats.showPanel(0); 
stats.dom.style.display = 'none';
document.body.appendChild(stats.dom);

// --- Noise Logic (Matching Shader) ---
function permute(x: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(
        ((x.x * 34.0) + 1.0) * x.x % 289.0,
        ((x.y * 34.0) + 1.0) * x.y % 289.0,
        ((x.z * 34.0) + 1.0) * x.z % 289.0
    );
}

function snoise(v: THREE.Vector2): number {
    const C = new THREE.Vector4(
        (3.0 - Math.sqrt(3.0)) / 6.0,
        0.5 * (Math.sqrt(3.0) - 1.0),
        -1.0 + 2.0 * ((3.0 - Math.sqrt(3.0)) / 6.0),
        1.0 / 41.0
    );

    let i = new THREE.Vector2(Math.floor(v.x + (v.x + v.y) * C.y), Math.floor(v.y + (v.x + v.y) * C.y));
    let x0 = new THREE.Vector2(v.x - i.x + (i.x + i.y) * C.x, v.y - i.y + (i.x + i.y) * C.x);

    let i1 = (x0.x > x0.y) ? new THREE.Vector2(1.0, 0.0) : new THREE.Vector2(0.0, 1.0);
    let x12 = new THREE.Vector4(x0.x + C.x - i1.x, x0.y + C.x - i1.y, x0.x + C.z, x0.y + C.z);

    let i_mod = new THREE.Vector2(i.x % 289.0, i.y % 289.0);
    let p = permute(permute(new THREE.Vector3(i_mod.y, i_mod.y + i1.y, i_mod.y + 1.0))
        .add(new THREE.Vector3(i_mod.x, i_mod.x + i1.x, i_mod.x + 1.0)));

    let m = new THREE.Vector3(
        Math.max(0.5 - (x0.x * x0.x + x0.y * x0.y), 0.0),
        Math.max(0.5 - (x12.x * x12.x + x12.y * x12.y), 0.0),
        Math.max(0.5 - (x12.z * x12.z + x12.w * x12.w), 0.0)
    );
    m.x = m.x * m.x * m.x * m.x;
    m.y = m.y * m.y * m.y * m.y;
    m.z = m.z * m.z * m.z * m.z;

    let x = new THREE.Vector3(
        2.0 * (p.x * C.w % 1.0) - 1.0,
        2.0 * (p.y * C.w % 1.0) - 1.0,
        2.0 * (p.z * C.w % 1.0) - 1.0
    );
    let h = new THREE.Vector3(Math.abs(x.x) - 0.5, Math.abs(x.y) - 0.5, Math.abs(x.z) - 0.5);
    let ox = new THREE.Vector3(Math.floor(x.x + 0.5), Math.floor(x.y + 0.5), Math.floor(x.z + 0.5));
    let a0 = new THREE.Vector3(x.x - ox.x, x.y - ox.y, x.z - ox.z);

    m.x *= 1.79284291400159 - 0.85373472095314 * (a0.x * a0.x + h.x * h.x);
    m.y *= 1.79284291400159 - 0.85373472095314 * (a0.y * a0.y + h.y * h.y);
    m.z *= 1.79284291400159 - 0.85373472095314 * (a0.z * a0.z + h.z * h.z);

    let g = new THREE.Vector3(
        a0.x * x0.x + h.x * x0.y,
        a0.y * x12.x + h.y * x12.y,
        a0.z * x12.z + h.z * x12.w
    );
    return 130.0 * (m.x * g.x + m.y * g.y + m.z * g.z);
}

function getTerrainHeight(x: number, z: number): number {
    const fNoiseMultiplier = 16.0;
    const p = new THREE.Vector2(x, z);
    const n1 = snoise(p.clone().multiplyScalar(state.noiseScale).add(new THREE.Vector2(state.noiseOffsetX, state.noiseOffsetZ)));
    const n2 = snoise(new THREE.Vector2(n1, n1).multiplyScalar(state.noiseScale * fNoiseMultiplier).add(new THREE.Vector2(state.noiseOffsetX * fNoiseMultiplier, state.noiseOffsetZ * fNoiseMultiplier)));
    return n2 * state.noiseHeight;
}

// --- Road Network Generator (Parish/Müller 2001) ---
interface Segment {
    start: THREE.Vector2;
    end: THREE.Vector2;
    angle: number;
    type: 'highway' | 'street';
    status: 'active' | 'end' | 'rejected';
}

class RoadGenerator {
    segments: Segment[] = [];
    queue: Segment[] = [];
    snapRadius = 2.0;
    highwayStepSize = 15.0;
    streetStepSize = 8.0;
    maxSegments = 250;
    branchProbability = 0.5;

    generate(pattern: 'grid' | 'radial' | 'organic' = 'grid'): Segment[] {
        this.segments = [];
        this.queue = [];
        
        // Initial highway segments to start from center in 4 directions
        const directions = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
        directions.forEach(angle => {
            this.queue.push({
                start: new THREE.Vector2(0, 0),
                end: new THREE.Vector2(Math.cos(angle) * this.highwayStepSize, Math.sin(angle) * this.highwayStepSize),
                angle: angle,
                type: 'highway',
                status: 'active'
            });
        });

        while (this.queue.length > 0 && this.segments.length < this.maxSegments) {
            const s = this.queue.shift()!;
            this.applyLocalConstraints(s);
            
            if (s.status !== 'rejected') {
                this.segments.push(s);
                if (s.status === 'active') {
                    this.proposeSuccessors(s, pattern);
                }
            }
        }
        return this.segments;
    }

    applyLocalConstraints(s: Segment) {
        let closestIntersection: THREE.Vector2 | null = null;
        let minT = 1.1;

        // Boundary check: Clip to terrain bounds
        const limit = TERRAIN_SIZE * 0.5;
        if (Math.abs(s.end.x) > limit || Math.abs(s.end.y) > limit) {
            const tX = s.end.x > limit ? (limit - s.start.x) / (s.end.x - s.start.x) : (s.end.x < -limit ? (-limit - s.start.x) / (s.end.x - s.start.x) : 1.0);
            const tY = s.end.y > limit ? (limit - s.start.y) / (s.end.y - s.start.y) : (s.end.y < -limit ? (-limit - s.start.y) / (s.end.y - s.start.y) : 1.0);
            const t = Math.min(tX, tY);
            if (t < 1.0) {
                s.end.set(s.start.x + (s.end.x - s.start.x) * t, s.start.y + (s.end.y - s.start.y) * t);
                s.status = 'end';
            }
        }

        for (const existing of this.segments) {
            const intersect = this.lineIntersect(s.start, s.end, existing.start, existing.end);
            if (intersect) {
                const distToStart = s.start.distanceTo(intersect);
                if (distToStart > 0.1) {
                    const t = distToStart / s.start.distanceTo(s.end);
                    if (t < minT) {
                        minT = t;
                        closestIntersection = intersect;
                    }
                }
            }
        }

        if (closestIntersection) {
            s.end.copy(closestIntersection);
            s.status = 'end';
            return;
        }

        for (const existing of this.segments) {
            const distToEnd = s.end.distanceTo(existing.end);
            if (distToEnd > 0.1 && distToEnd < this.snapRadius) {
                s.end.copy(existing.end);
                s.status = 'end';
                return;
            }
            const distToStart = s.end.distanceTo(existing.start);
            if (distToStart > 0.1 && distToStart < this.snapRadius) {
                s.end.copy(existing.start);
                s.status = 'end';
                return;
            }
        }

        for (const existing of this.segments) {
            const closest = this.closestPointOnSegment(s.end, existing.start, existing.end);
            const dist = s.end.distanceTo(closest);
            if (dist > 0.1 && dist < this.snapRadius) {
                s.end.copy(closest);
                s.status = 'end';
                return;
            }
        }
    }

    proposeSuccessors(s: Segment, pattern: string) {
        const baseAngle = s.angle;
        let choices: { angle: number, type: 'highway' | 'street' }[] = [];
        const stepSize = s.type === 'highway' ? this.highwayStepSize : this.streetStepSize;

        if (pattern === 'grid') {
            const globalAngles = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
            for (const angle of globalAngles) {
                const diff = Math.abs(this.normalizeAngle(angle - baseAngle));
                if (diff < 0.1) {
                    choices.push({ angle, type: s.type });
                } else if (diff > Math.PI / 2 - 0.1 && diff < Math.PI / 2 + 0.1) {
                    if (Math.random() < this.branchProbability) {
                        choices.push({ angle, type: 'street' });
                    }
                }
            }
        } else if (pattern === 'radial') {
            const center = new THREE.Vector2(0, 0);
            const angleToCenter = Math.atan2(s.end.y - center.y, s.end.x - center.x);
            choices.push({ angle: angleToCenter, type: s.type });
            if (Math.random() < this.branchProbability) {
                choices.push({ angle: angleToCenter + Math.PI / 2, type: 'street' });
                choices.push({ angle: angleToCenter - Math.PI / 2, type: 'street' });
            }
        } else {
            choices.push({ angle: baseAngle + THREE.MathUtils.randFloat(-0.2, 0.2), type: s.type });
            if (Math.random() < this.branchProbability) {
                choices.push({ angle: baseAngle + Math.PI / 2 + THREE.MathUtils.randFloat(-0.3, 0.3), type: 'street' });
            }
            if (Math.random() < this.branchProbability) {
                choices.push({ angle: baseAngle - Math.PI / 2 + THREE.MathUtils.randFloat(-0.3, 0.3), type: 'street' });
            }
        }

        for (const choice of choices) {
            const currentStep = choice.type === 'highway' ? this.highwayStepSize : this.streetStepSize;
            const newEnd = s.end.clone().add(new THREE.Vector2(
                Math.cos(choice.angle) * currentStep,
                Math.sin(choice.angle) * currentStep
            ));
            
            if (newEnd.distanceTo(s.start) < currentStep * 0.5) continue;

            this.queue.push({
                start: s.end.clone(),
                end: newEnd,
                angle: choice.angle,
                type: choice.type,
                status: 'active'
            });
        }
    }

    normalizeAngle(a: number) {
        while (a > Math.PI) a -= 2 * Math.PI;
        while (a < -Math.PI) a += 2 * Math.PI;
        return a;
    }

    lineIntersect(p0: THREE.Vector2, p1: THREE.Vector2, p2: THREE.Vector2, p3: THREE.Vector2): THREE.Vector2 | null {
        const s1_x = p1.x - p0.x, s1_y = p1.y - p0.y, s2_x = p3.x - p2.x, s2_y = p3.y - p2.y;
        const det = (-s2_x * s1_y + s1_x * s2_y);
        if (Math.abs(det) < 0.0001) return null;
        const s = (-s1_y * (p0.x - p2.x) + s1_x * (p0.y - p2.y)) / det;
        const t = ( s2_x * (p0.y - p2.y) - s2_y * (p0.x - p2.x)) / det;
        if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
            return new THREE.Vector2(p0.x + (t * s1_x), p0.y + (t * s1_y));
        }
        return null;
    }

    closestPointOnSegment(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2): THREE.Vector2 {
        const v = b.clone().sub(a), w = p.clone().sub(a);
        const c1 = w.dot(v), c2 = v.dot(v);
        if (c1 <= 0) return a.clone();
        if (c2 <= c1) return b.clone();
        return a.clone().add(v.multiplyScalar(c1 / c2));
    }
}

// --- Scene ---
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

const roadGenerator = new RoadGenerator();

// --- State and GUI ---
const state = {
    pattern: 'grid' as 'grid' | 'radial' | 'organic',
    roadWidth: 3.0, footpathWidth: 1.2, dashLength: 0.8, dashWidth: 0.05,
    maxSegments: 250, highwayStep: 15.0, streetStep: 8.0, branchProbability: 0.2, snapRadius: 2.0,
    noiseScale: 0.005, noiseHeight: 20.0, noiseOffsetX: 0.0, noiseOffsetZ: 0.0,
    grassColor: 0x547a54, roadColor: 0x333333, footpathColor: 0x999999, centerLineColor: 0xffff00, laneLineColor: 0xffffff,
    lampInterval: 12.0, lampIntensity: 2.0, lampRadius: 15.0, lampColor: 0xffaa44, lampOnTime: 18.5, lampOffTime: 6.5,
    groundSegments: 64, timeOfDay: 12.0, showStats: false, debugMode: 0,
    generate: () => updateRoads()
};

// --- GPU Baker ---
const BAKE_SIZE = 1024;
const TERRAIN_SIZE = 1000.0;

class GPUBaker {
    renderTarget: THREE.WebGLRenderTarget;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    material: THREE.ShaderMaterial;
    quad: THREE.Mesh;

    constructor() {
        this.renderTarget = new THREE.WebGLRenderTarget(BAKE_SIZE, BAKE_SIZE, {
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter
        });

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                numSegments: { value: 0 },
                roadSegments: { value: new Array(256).fill(new THREE.Vector4()) },
                roadTypes: { value: new Float32Array(256) },
                roadWidth: { value: state.roadWidth },
                footpathWidth: { value: state.footpathWidth },
                lampInterval: { value: state.lampInterval },
                lampRadius: { value: state.lampRadius },
                uTerrainSize: { value: TERRAIN_SIZE }
            },
            vertexShader: bakeVertexShader,
            fragmentShader: bakeFragmentShader
        });
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
        this.scene.add(this.quad);
    }

    bake(renderer: THREE.WebGLRenderer, numSegments: number, segments: THREE.Vector4[], types: Float32Array) {
        this.material.uniforms.numSegments!.value = numSegments;
        this.material.uniforms.roadSegments!.value = segments;
        this.material.uniforms.roadTypes!.value = types;
        this.material.uniforms.roadWidth!.value = state.roadWidth;
        this.material.uniforms.footpathWidth!.value = state.footpathWidth;
        this.material.uniforms.lampInterval!.value = state.lampInterval;
        this.material.uniforms.lampRadius!.value = state.lampRadius;

        const oldTarget = renderer.getRenderTarget();
        renderer.setRenderTarget(this.renderTarget);
        renderer.render(this.scene, this.camera);
        renderer.setRenderTarget(oldTarget);
    }
}

const gpuBaker = new GPUBaker();

// --- Material & Mesh ---
const material = new THREE.ShaderMaterial({
    uniforms: {
        grassColor: { value: new THREE.Color(state.grassColor) },
        roadColor: { value: new THREE.Color(state.roadColor) },
        footpathColor: { value: new THREE.Color(state.footpathColor) },
        centerLineColor: { value: new THREE.Color(state.centerLineColor) },
        laneLineColor: { value: new THREE.Color(state.laneLineColor) },
        roadWidth: { value: state.roadWidth },
        footpathWidth: { value: state.footpathWidth },
        dashLength: { value: state.dashLength },
        dashWidth: { value: state.dashWidth },
        numSegments: { value: 0 },
        roadSegments: { value: new Array(256).fill(new THREE.Vector4()) },
        roadTypes: { value: new Float32Array(256) },
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
        uDebugMode: { value: 0 }
    },
    vertexShader,
    fragmentShader
});

const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, state.groundSegments, state.groundSegments);
geometry.rotateX(-Math.PI / 2);
const ground = new THREE.Mesh(geometry, material);
scene.add(ground);

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
roadFolder.add(state, 'maxSegments', 10, 250).step(1).onChange(() => updateRoads());
roadFolder.add(state, 'highwayStep', 5.0, 30.0).onChange(() => updateRoads());
roadFolder.add(state, 'streetStep', 2.0, 20.0).onChange(() => updateRoads());
roadFolder.add(state, 'snapRadius', 1.0, 10.0).onChange(() => updateRoads());
roadFolder.add(state, 'generate');
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
terrainFolder.add(state, 'noiseScale', 0.0001, 0.02).onChange((v: number) => { material.uniforms.uNoiseScale!.value = v; updateLamps(); updateTimeOfDay(); });
terrainFolder.add(state, 'noiseHeight', 0.0, 100.0).onChange((v: number) => { material.uniforms.uNoiseHeight!.value = v; updateLamps(); updateTimeOfDay(); });
terrainFolder.add(state, 'noiseOffsetX', -100.0, 100.0).onChange((v: number) => { material.uniforms.uNoiseOffset!.value.x = v; updateLamps(); updateTimeOfDay(); });
terrainFolder.add(state, 'noiseOffsetZ', -100.0, 100.0).onChange((v: number) => { material.uniforms.uNoiseOffset!.value.y = v; updateLamps(); updateTimeOfDay(); });
terrainFolder.addColor(state, 'grassColor').onChange(() => updateTimeOfDay());
terrainFolder.add(state, 'groundSegments', 1, 512).step(1).name('segments').onChange(() => updateGroundGeometry());
terrainFolder.open();

const environmentFolder = gui.addFolder('Environment');
environmentFolder.add(state, 'timeOfDay', 0, 24).name('Time (0-24)').onChange(() => updateTimeOfDay());
environmentFolder.add(state, 'showStats').name('Show Stats').onChange((v: boolean) => stats.dom.style.display = v ? 'block' : 'none');
environmentFolder.add(state, 'debugMode', { 'Off': 0, 'SDF': 1, 'Grid': 2, 'No Optimization': 3, 'BakeMap': 4 }).name('Debug Mode').onChange((v: number) => material.uniforms.uDebugMode!.value = v);
environmentFolder.open();

// --- Lamp Meshes ---
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
    if (l2 === 0) return (px - x1) * (px - x1) + (py - y1) * (py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return (px - (x1 + t * (x2 - x1))) ** 2 + (py - (y1 + t * (y2 - y1))) ** 2;
}

function updateLamps() {
    let lampCount = 0;
    const segments = roadGenerator.segments;
    const interval = state.lampInterval;
    const halfRoadWidth = state.roadWidth * 0.5;
    const totalWidth = halfRoadWidth + state.footpathWidth;

    segments.forEach(s => {
        const len = s.start.distanceTo(s.end);
        const dir = s.end.clone().sub(s.start).normalize();
        const normal = new THREE.Vector2(-dir.y, dir.x);
        const angle = Math.atan2(dir.y, dir.x);

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
    const fade = 0.5;
    const isNight = state.lampOnTime > state.lampOffTime ? (t >= state.lampOnTime || t <= state.lampOffTime) : (t >= state.lampOnTime && t <= state.lampOffTime);
    if (isNight) {
        lampPower = state.lampIntensity;
        if (state.lampOnTime > state.lampOffTime) {
            if (t >= state.lampOnTime && t < state.lampOnTime + fade) lampPower *= THREE.MathUtils.smoothstep(t, state.lampOnTime, state.lampOnTime + fade);
            else if (t > state.lampOffTime - fade && t <= state.lampOffTime) lampPower *= (1.0 - THREE.MathUtils.smoothstep(t, state.lampOffTime - fade, state.lampOffTime));
        }
    }

    material.uniforms.uSunIntensity!.value = sunInt;
    material.uniforms.uSunColor!.value.lerpColors(new THREE.Color(0xffaa44), new THREE.Color(0xffffff), Math.sin(sunAngle));
    material.uniforms.uAmbientColor!.value.setRGB(ambInt, ambInt, ambInt * 1.1);
    material.uniforms.lampIntensity!.value = lampPower;

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

function updateGroundGeometry() {
    ground.geometry.dispose();
    ground.geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, state.groundSegments, state.groundSegments);
    ground.geometry.rotateX(-Math.PI / 2);
}

function updateRoads() {
    roadGenerator.maxSegments = state.maxSegments; roadGenerator.highwayStepSize = state.highwayStep; roadGenerator.streetStepSize = state.streetStep;
    roadGenerator.snapRadius = state.snapRadius; roadGenerator.branchProbability = state.branchProbability;
    const segments = roadGenerator.generate(state.pattern);
    const shaderSegs = segments.map(s => new THREE.Vector4(s.start.x, s.start.y, s.end.x, s.end.y));
    const shaderTypes = segments.map(s => s.type === 'highway' ? 1.0 : 0.0);
    while (shaderSegs.length < 256) { shaderSegs.push(new THREE.Vector4()); shaderTypes.push(0); }

    material.uniforms.numSegments!.value = Math.min(segments.length, 256);
    material.uniforms.roadSegments!.value = shaderSegs;
    material.uniforms.roadTypes!.value = new Float32Array(shaderTypes);

    gpuBaker.bake(renderer, material.uniforms.numSegments!.value, shaderSegs, new Float32Array(shaderTypes));
    updateLamps();
}

updateRoads(); updateTimeOfDay();

function animate() {
    stats.begin(); requestAnimationFrame(animate);
    controls.update(); renderer.render(scene, camera);
    stats.end();
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
