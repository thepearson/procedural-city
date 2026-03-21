import * as THREE from 'three';

export class RoadTexture {
    texture: THREE.DataTexture;
    private data: Float32Array;
    private size: number;

    constructor(maxSegments: number = 1024) {
        this.size = maxSegments;
        // Each segment needs: start.x, start.y, end.x, end.y, type
        // We'll use an RGBA texture where:
        // Pixel i: R=start.x, G=start.y, B=end.x, A=end.y
        // Pixel i+maxSegments: R=type, G=0, B=0, A=0 (or similar packing)
        // More efficient: 2 pixels per segment or a larger texture.
        // Let's use 2 rows: Row 0 = Coordinates, Row 1 = Types
        this.data = new Float32Array(this.size * 2 * 4); 
        this.texture = new THREE.DataTexture(
            this.data, 
            this.size, 
            2, 
            THREE.RGBAFormat, 
            THREE.FloatType
        );
        this.texture.minFilter = THREE.NearestFilter;
        this.texture.magFilter = THREE.NearestFilter;
        this.texture.needsUpdate = true;
    }

    update(segments: THREE.Vector4[], types: Float32Array) {
        for (let i = 0; i < this.size; i++) {
            const seg = segments[i] || new THREE.Vector4();
            const type = types[i] || 0;

            // Row 0: Coords (x1, y1, x2, y2)
            const coordIdx = i * 4;
            this.data[coordIdx] = seg.x;
            this.data[coordIdx + 1] = seg.y;
            this.data[coordIdx + 2] = seg.z;
            this.data[coordIdx + 3] = seg.w;

            // Row 1: Type (using R channel)
            const typeIdx = (this.size + i) * 4;
            this.data[typeIdx] = type;
        }
        this.texture.needsUpdate = true;
    }
}
