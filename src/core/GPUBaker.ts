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
                uRoadData: { value: null },
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

    bake(renderer: THREE.WebGLRenderer, numSegments: number, roadTexture: THREE.Texture, inputState: any) {
        if (!inputState) {
            console.error('GPUBaker.bake called with undefined state');
            return;
        }
        
        const u = this.material.uniforms;
        if (u['numSegments']) u['numSegments'].value = numSegments;
        if (u['uRoadData']) u['uRoadData'].value = roadTexture;
        
        if (u['roadWidth']) u['roadWidth'].value = inputState.roadWidth;
        if (u['footpathWidth']) u['footpathWidth'].value = inputState.footpathWidth;
        if (u['lampInterval']) u['lampInterval'].value = inputState.lampInterval;
        if (u['lampRadius']) u['lampRadius'].value = inputState.lampRadius;

        const oldTarget = renderer.getRenderTarget();
        renderer.setRenderTarget(this.renderTarget);
        renderer.render(this.scene, this.camera);
        renderer.setRenderTarget(oldTarget);
    }
}
