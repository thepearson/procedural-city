import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as dat from 'dat.gui';

import vertexShader from './shaders/ground.vert.glsl';
import fragmentShader from './shaders/ground.frag.glsl';

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
        
        // Initial highway segments to start from center
        this.queue.push({
            start: new THREE.Vector2(-this.highwayStepSize, 0),
            end: new THREE.Vector2(0, 0),
            angle: 0,
            type: 'highway',
            status: 'active'
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
            // Grid pattern: Aligned to global axes
            const globalAngles = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
            for (const angle of globalAngles) {
                // Check if this angle is roughly in the direction of growth (don't go backwards)
                const diff = Math.abs(this.normalizeAngle(angle - baseAngle));
                if (diff < 0.1) { // Forward
                    choices.push({ angle, type: s.type });
                } else if (diff > Math.PI / 2 - 0.1 && diff < Math.PI / 2 + 0.1) { // Perpendicular
                    if (Math.random() < this.branchProbability) {
                        choices.push({ angle, type: 'street' });
                    }
                }
            }
        } else if (pattern === 'radial') {
            // Radial pattern: Towards/away from center or tangential
            const center = new THREE.Vector2(0, 0);
            const angleToCenter = Math.atan2(s.end.y - center.y, s.end.x - center.x);
            
            // 1. Radial (outward)
            choices.push({ angle: angleToCenter, type: s.type });
            
            // 2. Tangential (circular)
            if (Math.random() < this.branchProbability) {
                choices.push({ angle: angleToCenter + Math.PI / 2, type: 'street' });
                choices.push({ angle: angleToCenter - Math.PI / 2, type: 'street' });
            }
        } else {
            // Organic: Random walks with branching
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
        const s1_x = p1.x - p0.x;
        const s1_y = p1.y - p0.y;
        const s2_x = p3.x - p2.x;
        const s2_y = p3.y - p2.y;

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
        const v = b.clone().sub(a);
        const w = p.clone().sub(a);
        const c1 = w.dot(v);
        const c2 = v.dot(v);
        if (c1 <= 0) return a.clone();
        if (c2 <= c1) return b.clone();
        const b_norm = c1 / c2;
        return a.clone().add(v.multiplyScalar(b_norm));
    }
}

// --- Scene ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue background

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0x404040, 1.0); // Soft white light
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
sunLight.position.set(100, 200, 100);
scene.add(sunLight);

const controls = new OrbitControls(camera, renderer.domElement);
camera.position.set(0, 150, 150);
controls.update();

// --- Generator Instance ---
const roadGenerator = new RoadGenerator();

// --- State and GUI ---
const state = {
    pattern: 'grid' as 'grid' | 'radial' | 'organic',
    roadWidth: 3.0,
    dashLength: 0.8,
    dashWidth: 0.05,
    maxSegments: 250,
    highwayStep: 15.0,
    streetStep: 8.0,
    branchProbability: 0.5,
    snapRadius: 2.0,
    noiseScale: 0.005,
    noiseHeight: 20.0,
    noiseOffsetX: 0.0,
    noiseOffsetZ: 0.0,
    grassColor: 0x33aa33,
    groundSegments: 256,
    sunIntensity: 1.0,
    sunColor: 0xffffff,
    generate: () => updateRoads()
};

const gui = new dat.GUI();
// ... (Roads folder remains)
const roadFolder = gui.addFolder('Roads');
roadFolder.add(state, 'pattern', ['grid', 'radial', 'organic']).onChange(() => updateRoads());
roadFolder.add(state, 'roadWidth', 1.0, 10.0).onChange((v: number) => material.uniforms.roadWidth!.value = v);
roadFolder.add(state, 'dashLength', 0.1, 5.0).onChange((v: number) => material.uniforms.dashLength!.value = v);
roadFolder.add(state, 'dashWidth', 0.01, 0.5).onChange((v: number) => material.uniforms.dashWidth!.value = v);
roadFolder.add(state, 'branchProbability', 0.0, 1.0).name('density').onChange(() => updateRoads());
roadFolder.add(state, 'maxSegments', 10, 250).step(1).onChange(() => updateRoads());
roadFolder.add(state, 'highwayStep', 5.0, 30.0).onChange(() => updateRoads());
roadFolder.add(state, 'streetStep', 2.0, 20.0).onChange(() => updateRoads());
roadFolder.add(state, 'snapRadius', 1.0, 10.0).onChange(() => updateRoads());
roadFolder.add(state, 'generate');
roadFolder.open();

const terrainFolder = gui.addFolder('Terrain');
terrainFolder.add(state, 'noiseScale', 0.0001, 0.02).onChange((v: number) => material.uniforms.uNoiseScale!.value = v);
terrainFolder.add(state, 'noiseHeight', 0.0, 100.0).onChange((v: number) => material.uniforms.uNoiseHeight!.value = v);
terrainFolder.add(state, 'noiseOffsetX', -100.0, 100.0).onChange((v: number) => material.uniforms.uNoiseOffset!.value.x = v);
terrainFolder.add(state, 'noiseOffsetZ', -100.0, 100.0).onChange((v: number) => material.uniforms.uNoiseOffset!.value.y = v);
terrainFolder.addColor(state, 'grassColor').onChange((v: any) => material.uniforms.grassColor!.value.set(v));
terrainFolder.add(state, 'groundSegments', 1, 512).step(1).name('segments').onChange(() => updateGroundGeometry());
terrainFolder.open();

const sunFolder = gui.addFolder('Sun');
sunFolder.add(state, 'sunIntensity', 0.0, 2.0).onChange((v: number) => {
    sunLight.intensity = v;
    material.uniforms.uSunIntensity!.value = v;
});
sunFolder.addColor(state, 'sunColor').onChange((v: any) => {
    sunLight.color.set(v);
    material.uniforms.uSunColor!.value.set(v);
});
sunFolder.open();

// --- Material & Mesh ---
const material = new THREE.ShaderMaterial({
    uniforms: {
        grassColor: { value: new THREE.Color(0x33aa33) },
        roadColor: { value: new THREE.Color(0x222222) },
        centerLineColor: { value: new THREE.Color(0xffff00) },
        laneLineColor: { value: new THREE.Color(0xffffff) },
        roadWidth: { value: state.roadWidth },
        dashLength: { value: state.dashLength },
        dashWidth: { value: state.dashWidth },
        numSegments: { value: 0 },
        roadSegments: { value: new Array(256).fill(new THREE.Vector4(0, 0, 0, 0)) },
        roadTypes: { value: new Float32Array(256).fill(0) },
        uNoiseScale: { value: state.noiseScale },
        uNoiseHeight: { value: state.noiseHeight },
        uNoiseOffset: { value: new THREE.Vector2(state.noiseOffsetX, state.noiseOffsetZ) },
        uSunDirection: { value: sunLight.position.clone().normalize() },
        uSunColor: { value: new THREE.Color(state.sunColor) },
        uSunIntensity: { value: state.sunIntensity },
        uAmbientColor: { value: new THREE.Color(0x404040) }
    },
    vertexShader,
    fragmentShader
});

const geometry = new THREE.PlaneGeometry(1000, 1000, state.groundSegments, state.groundSegments);
geometry.rotateX(-Math.PI / 2);
const ground = new THREE.Mesh(geometry, material);
scene.add(ground);

function updateGroundGeometry() {
    ground.geometry.dispose();
    const newGeo = new THREE.PlaneGeometry(1000, 1000, state.groundSegments, state.groundSegments);
    newGeo.rotateX(-Math.PI / 2);
    ground.geometry = newGeo;
}

function updateRoads() {
    roadGenerator.maxSegments = state.maxSegments;
    roadGenerator.highwayStepSize = state.highwayStep;
    roadGenerator.streetStepSize = state.streetStep;
    roadGenerator.snapRadius = state.snapRadius;
    roadGenerator.branchProbability = state.branchProbability;
    
    const segments = roadGenerator.generate(state.pattern);
    const shaderSegments = segments.map(s => new THREE.Vector4(s.start.x, s.start.y, s.end.x, s.end.y));
    const shaderTypes = segments.map(s => s.type === 'highway' ? 1.0 : 0.0);
    
    while (shaderSegments.length < 256) {
        shaderSegments.push(new THREE.Vector4(0, 0, 0, 0));
        shaderTypes.push(0.0);
    }
    
    material.uniforms.numSegments!.value = Math.min(segments.length, 256);
    material.uniforms.roadSegments!.value = shaderSegments;
    material.uniforms.roadTypes!.value = new Float32Array(shaderTypes);
}

// Initial Generation
updateRoads();

// Animation
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
