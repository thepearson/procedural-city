import * as THREE from 'three';
import type { BuildingData } from './CityPlanner.js';

export class RoadTexture {
    texture: THREE.DataTexture;
    private data: Float32Array;
    private maxSegments: number;
    private maxBuildings: number;

    constructor(maxBuildings: number = 8192) {
        this.maxSegments = 1024;
        this.maxBuildings = maxBuildings;
        // 4 rows: 
        // 0: Road Coords (1024), 
        // 1: Road Types (1024), 
        // 2: Building Pos (x,z), Scale (width,depth) (8192)
        // 3: Building Rotation, Padding (8192)
        // Texture width will be 8192 to accommodate buildings
        this.data = new Float32Array(this.maxBuildings * 4 * 4); 
        this.texture = new THREE.DataTexture(
            this.data, 
            this.maxBuildings, 
            4, 
            THREE.RGBAFormat, 
            THREE.FloatType
        );
        this.texture.minFilter = THREE.NearestFilter;
        this.texture.magFilter = THREE.NearestFilter;
        this.texture.needsUpdate = true;
    }

    update(segments: THREE.Vector4[], types: Float32Array, buildings: BuildingData[]) {
        // 1. Reset data
        this.data.fill(0);

        // 2. Fill Roads (up to 1024)
        for (let i = 0; i < Math.min(segments.length, this.maxSegments); i++) {
            const seg = segments[i]!;
            const idx = i * 4;
            this.data[idx] = seg.x;
            this.data[idx + 1] = seg.y;
            this.data[idx + 2] = seg.z;
            this.data[idx + 3] = seg.w;
            // Row 1 (Road Types)
            this.data[this.maxBuildings * 4 + idx] = types[i]!;
        }

        // 3. Fill Buildings (up to 4096)
        for (let i = 0; i < Math.min(buildings.length, this.maxBuildings); i++) {
            const b = buildings[i]!;
            const idx = i * 4;
            
            // Row 2: X, Z (pos), W, D (scale)
            const row2 = this.maxBuildings * 8 + idx;
            this.data[row2] = b.pos.x;
            this.data[row2 + 1] = b.pos.z;
            this.data[row2 + 2] = b.scale.x;
            this.data[row2 + 3] = b.scale.z;

            // Row 3: Rotation
            const row3 = this.maxBuildings * 12 + idx;
            this.data[row3] = b.rotation;
        }

        this.texture.needsUpdate = true;
    }
}
