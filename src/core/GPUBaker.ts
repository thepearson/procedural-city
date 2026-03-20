import * as THREE from 'three';
import bakeVertexShader from '../shaders/bake.vert.glsl';
import bakeFragmentShader from '../shaders/bake.frag.glsl';
import { TERRAIN_SIZE } from './RoadGenerator.js';

export const BAKE_SIZE = 1024;

export class GPUBaker {
    renderTarget: THREE.WebGLRenderTarget;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    material: THREE.ShaderMaterial;
    quad: THREE.Mesh;

    constructor(initialState: any) {
        this.renderTarget = new THREE.WebGLRenderTarget(BAKE_SIZE, BAKE_SIZE, {
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter
        });

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                numSegments: { value: 0 },
                roadSegments: { value: new Array(256).fill(new THREE.Vector4()) },
                roadTypes: { value: new Float32Array(256) },
                roadWidth: { value: initialState.roadWidth },
                footpathWidth: { value: initialState.footpathWidth },
                lampInterval: { value: initialState.lampInterval },
                lampRadius: { value: initialState.lampRadius },
                uTerrainSize: { value: TERRAIN_SIZE }
            },
            vertexShader: bakeVertexShader,
            fragmentShader: bakeFragmentShader
        });
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
        this.scene.add(this.quad);
    }

    bake(renderer: THREE.WebGLRenderer, numSegments: number, segments: THREE.Vector4[], types: Float32Array, state: any) {
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
