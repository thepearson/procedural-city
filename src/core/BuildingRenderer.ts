import * as THREE from 'three';
import { getTerrainHeight } from '../main.js';
import type { BuildingData } from './CityPlanner.js';

import vertexShader from '../shaders/building.vert.glsl';
import fragmentShader from '../shaders/building.frag.glsl';

export class BuildingRenderer {
    mesh: THREE.InstancedMesh;
    roofMesh: THREE.InstancedMesh;
    private dummy = new THREE.Object3D();
    material: THREE.ShaderMaterial;

    constructor(scene: THREE.Scene, maxBuildings: number = 8192) {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        geometry.translate(0, 0.5, 0);

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
                uSunColor: { value: new THREE.Color(0xffffff) },
                uSunIntensity: { value: 1.0 },
                uAmbientColor: { value: new THREE.Color(0x111111) },
                uLampIntensity: { value: 0.0 }
            },
            vertexShader,
            fragmentShader
        });

        this.mesh = new THREE.InstancedMesh(geometry, this.material, maxBuildings);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.frustumCulled = false;

        // Initialize instanceColor attribute explicitly to avoid shader compilation errors
        const colors = new Float32Array(maxBuildings * 3);
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

        // Add custom seed attribute
        const seeds = new Float32Array(maxBuildings);
        this.mesh.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));

        // Create a simple material for roof features (could be a separate shader later)
        const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        this.roofMesh = new THREE.InstancedMesh(geometry, roofMaterial, maxBuildings);
        this.roofMesh.castShadow = true;
        this.roofMesh.receiveShadow = true;

        scene.add(this.mesh, this.roofMesh);
    }

    render(buildings: BuildingData[]) {
        const capacity = this.mesh.instanceMatrix.count;
        const count = Math.min(buildings.length, capacity);
        const seedAttr = this.mesh.geometry.getAttribute('aSeed') as THREE.InstancedBufferAttribute;

        let roofFeatureCount = 0;

        for (let i = 0; i < count; i++) {
            const b = buildings[i]!;
            
            const h = getTerrainHeight(b.pos.x, b.pos.z);
            this.dummy.position.set(b.pos.x, h, b.pos.z);
            this.dummy.rotation.set(0, b.rotation, 0);
            this.dummy.scale.copy(b.scale);
            this.dummy.updateMatrix();
            
            this.mesh.setMatrixAt(i, this.dummy.matrix);
            this.mesh.setColorAt(i, b.color);
            seedAttr.setX(i, b.seed);

            // Handle roof feature
            if (b.hasRoofFeature && b.roofFeatureScale) {
                this.dummy.position.set(b.pos.x, h + b.scale.y, b.pos.z);
                this.dummy.scale.copy(b.roofFeatureScale);
                this.dummy.updateMatrix();
                this.roofMesh.setMatrixAt(roofFeatureCount++, this.dummy.matrix);
            }
        }

        this.mesh.count = count;
        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
        seedAttr.needsUpdate = true;

        this.roofMesh.count = roofFeatureCount;
        this.roofMesh.instanceMatrix.needsUpdate = true;
    }
}
