import * as THREE from 'three';
import { snoise } from './noise.js';
import { state } from '../state.js';

export function getTerrainHeight(x: number, z: number): number {
    const fNoiseMultiplier = 16.0;
    const p = new THREE.Vector2(x, z);
    const n1 = snoise(p.clone().multiplyScalar(state.noiseScale).add(new THREE.Vector2(state.noiseOffsetX, state.noiseOffsetZ)));
    const n2 = snoise(new THREE.Vector2(n1, n1).multiplyScalar(state.noiseScale * fNoiseMultiplier).add(new THREE.Vector2(state.noiseOffsetX * fNoiseMultiplier, state.noiseOffsetZ * fNoiseMultiplier)));
    return n2 * state.noiseHeight;
}
