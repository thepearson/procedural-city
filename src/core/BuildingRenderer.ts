import * as THREE from 'three';
import { getTerrainHeight } from '../utils/terrain.js';
import { state } from '../state.js';
import type { BuildingData, BuildingShape } from './CityPlanner.js';

import vertexShader from '../shaders/building.vert.glsl';
import fragmentShader from '../shaders/building.frag.glsl';

export class BuildingRenderer {
    meshes: Map<BuildingShape, THREE.InstancedMesh> = new Map();
    roofMesh: THREE.InstancedMesh;
    private dummy = new THREE.Object3D();
    material: THREE.ShaderMaterial;

    constructor(scene: THREE.Scene, maxBuildings: number = 8192) {
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
                uSunColor: { value: new THREE.Color(0xffffff) },
                uSunIntensity: { value: 1.0 },
                uAmbientColor: { value: new THREE.Color(0x111111) },
                uLampIntensity: { value: 0.0 },
                uWinWidth: { value: state.buildingWinWidth },
                uWinHeight: { value: state.buildingWinHeight },
                uSpacingX: { value: state.buildingSpacingX },
                uSpacingY: { value: state.buildingSpacingY },
                uWinShininess: { value: state.buildingWinShininess }
            },
            vertexShader,
            fragmentShader
        });

        // Initialize meshes for each shape
        const shapes: BuildingShape[] = ['square', 'rectangular', 'circular', 'hexagonal', 'L', 'U'];
        shapes.forEach(shape => {
            const geometry = this.createGeometryForShape(shape);
            geometry.translate(0, 0.5, 0); // Pivot at bottom

            const mesh = new THREE.InstancedMesh(geometry, this.material, maxBuildings);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.frustumCulled = false;
            mesh.count = 0; // Start with 0 visible

            const colors = new Float32Array(maxBuildings * 3);
            mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

            const seeds = new Float32Array(maxBuildings);
            mesh.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));

            const tapers = new Float32Array(maxBuildings);
            mesh.geometry.setAttribute('aTaper', new THREE.InstancedBufferAttribute(tapers, 1));

            this.meshes.set(shape, mesh);
            scene.add(mesh);
        });

        // Roof features still use a simple box for now
        const roofGeo = new THREE.BoxGeometry(1, 1, 1);
        roofGeo.translate(0, 0.5, 0);
        const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        this.roofMesh = new THREE.InstancedMesh(roofGeo, roofMaterial, maxBuildings * 8); // Increased capacity
        this.roofMesh.castShadow = true;
        this.roofMesh.receiveShadow = true;
        this.roofMesh.count = 0;

        scene.add(this.roofMesh);
    }

    private createGeometryForShape(shape: BuildingShape): THREE.BufferGeometry {
        switch (shape) {
            case 'square':
            case 'rectangular':
                return new THREE.BoxGeometry(1, 1, 1);
            case 'circular':
                return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
            case 'hexagonal':
                return new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
            case 'L':
                return this.createLShapeGeometry();
            case 'U':
                return this.createUShapeGeometry();
            default:
                return new THREE.BoxGeometry(1, 1, 1);
        }
    }

    private createLShapeGeometry(): THREE.BufferGeometry {
        const shape = new THREE.Shape();
        shape.moveTo(-0.5, -0.5);
        shape.lineTo(0.5, -0.5);
        shape.lineTo(0.5, -0.1);
        shape.lineTo(-0.1, -0.1);
        shape.lineTo(-0.1, 0.5);
        shape.lineTo(-0.5, 0.5);
        shape.closePath();

        const extrudeSettings = { depth: 1, bevelEnabled: false };
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry.translate(0, 0, -0.5); // Center on Z before rotation
        geometry.rotateX(Math.PI / 2); // Align with box geometry (Z becomes Y)
        return geometry;
    }

    private createUShapeGeometry(): THREE.BufferGeometry {
        const shape = new THREE.Shape();
        shape.moveTo(-0.5, -0.5);
        shape.lineTo(0.5, -0.5);
        shape.lineTo(0.5, 0.5);
        shape.lineTo(0.1, 0.5);
        shape.lineTo(0.1, -0.1);
        shape.lineTo(-0.1, -0.1);
        shape.lineTo(-0.1, 0.5);
        shape.lineTo(-0.5, 0.5);
        shape.closePath();

        const extrudeSettings = { depth: 1, bevelEnabled: false };
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry.translate(0, 0, -0.5); // Center on Z before rotation
        geometry.rotateX(Math.PI / 2); // Align with box geometry (Z becomes Y)
        return geometry;
    }

    render(buildings: BuildingData[]) {
        // Clear counts
        this.meshes.forEach(mesh => mesh.count = 0);
        this.roofMesh.count = 0;

        const shapeCounts: Map<BuildingShape, number> = new Map();
        let roofFeatureCount = 0;

        for (const b of buildings) {
            const mesh = this.meshes.get(b.shape);
            if (!mesh) continue;

            const count = shapeCounts.get(b.shape) || 0;
            if (count >= mesh.instanceMatrix.count) continue;

            const h = getTerrainHeight(b.pos.x, b.pos.z);
            this.dummy.position.set(b.pos.x, h, b.pos.z);
            this.dummy.rotation.set(0, b.rotation, 0);
            this.dummy.scale.copy(b.scale);
            this.dummy.updateMatrix();

            mesh.setMatrixAt(count, this.dummy.matrix);
            mesh.setColorAt(count, b.color);
            
            const seedAttr = mesh.geometry.getAttribute('aSeed') as THREE.InstancedBufferAttribute;
            seedAttr.setX(count, b.seed);

            const taperAttr = mesh.geometry.getAttribute('aTaper') as THREE.InstancedBufferAttribute;
            taperAttr.setX(count, b.taperAmount);

            shapeCounts.set(b.shape, count + 1);

            // Handle roof features
            for (const f of b.roofFeatures) {
                if (roofFeatureCount >= this.roofMesh.instanceMatrix.count) break;
                
                // Position relative to building top center
                // 1. Start from building world pos
                // 2. Add height offset
                // 3. Add relative offset rotated by building rotation
                const localOffset = new THREE.Vector3(f.pos.x, 0, f.pos.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.rotation);
                this.dummy.position.set(b.pos.x + localOffset.x, h + b.scale.y, b.pos.z + localOffset.z);
                this.dummy.rotation.set(0, b.rotation, 0);
                this.dummy.scale.copy(f.scale);
                this.dummy.updateMatrix();
                this.roofMesh.setMatrixAt(roofFeatureCount++, this.dummy.matrix);
            }
        }

        // Update counts and buffers
        this.meshes.forEach((mesh, shape) => {
            const count = shapeCounts.get(shape) || 0;
            mesh.count = count;
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            (mesh.geometry.getAttribute('aSeed') as THREE.InstancedBufferAttribute).needsUpdate = true;
            (mesh.geometry.getAttribute('aTaper') as THREE.InstancedBufferAttribute).needsUpdate = true;
        });

        this.roofMesh.count = roofFeatureCount;
        this.roofMesh.instanceMatrix.needsUpdate = true;
    }
}
