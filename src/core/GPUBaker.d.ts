import * as THREE from 'three';
export declare const BAKE_SIZE = 1024;
export declare class GPUBaker {
    renderTarget: THREE.WebGLRenderTarget;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    material: THREE.ShaderMaterial;
    quad: THREE.Mesh;
    constructor(initialState: any);
    bake(renderer: THREE.WebGLRenderer, numSegments: number, segments: THREE.Vector4[], types: Float32Array, state: any): void;
}
//# sourceMappingURL=GPUBaker.d.ts.map