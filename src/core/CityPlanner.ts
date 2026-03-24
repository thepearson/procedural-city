import * as THREE from 'three';
import { state } from '../state.js';
import type { Segment } from './RoadGenerator.js';

export interface BuildingData {
    pos: THREE.Vector3;
    scale: THREE.Vector3;
    rotation: number;
    seed: number;
    color: THREE.Color;
    hasRoofFeature: boolean;
    roofFeatureScale?: THREE.Vector3;
}

function hash12(x: number, y: number): number {
    const dot = x * 12.9898 + y * 78.233;
    const val = Math.sin(dot) * 43758.5453123;
    return val - Math.floor(val);
}

function distanceToSegmentSq(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return (px - x1) ** 2 + (py - y1) ** 2;
    let t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2));
    const nx = x1 + t * (x2 - x1);
    const ny = y1 + t * (y2 - y1);
    return (px - nx) ** 2 + (py - ny) ** 2;
}

function getCorners(x: number, y: number, w: number, h: number, angle: number) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const hw = w / 2;
    const hh = h / 2;
    return [
        { x: x + hw * cos - hh * sin, y: y + hw * sin + hh * cos },
        { x: x - hw * cos - hh * sin, y: y - hw * sin + hh * cos },
        { x: x - hw * cos + hh * sin, y: y - hw * sin - hh * cos },
        { x: x + hw * cos + hh * sin, y: y + hw * sin - hh * cos }
    ];
}

function isOBBOverlapping(
    x1: number, y1: number, w1: number, h1: number, a1: number,
    x2: number, y2: number, w2: number, h2: number, a2: number
): boolean {
    // 1. Broad phase circular check
    const r1 = Math.sqrt(w1 * w1 + h1 * h1) * 0.5;
    const r2 = Math.sqrt(w2 * w2 + h2 * h2) * 0.5;
    const distSq = (x1 - x2) ** 2 + (y1 - y2) ** 2;
    if (distSq > (r1 + r2) ** 2) return false;

    // 2. Narrow phase SAT check
    const c1 = getCorners(x1, y1, w1, h1, a1);
    const c2 = getCorners(x2, y2, w2, h2, a2);

    const axes = [
        { x: Math.cos(a1), y: Math.sin(a1) },
        { x: -Math.sin(a1), y: Math.cos(a1) },
        { x: Math.cos(a2), y: Math.sin(a2) },
        { x: -Math.sin(a2), y: Math.cos(a2) }
    ];

    for (const axis of axes) {
        let min1 = Infinity, max1 = -Infinity;
        for (const p of c1) {
            const dot = p.x * axis.x + p.y * axis.y;
            min1 = Math.min(min1, dot);
            max1 = Math.max(max1, dot);
        }
        let min2 = Infinity, max2 = -Infinity;
        for (const p of c2) {
            const dot = p.x * axis.x + p.y * axis.y;
            min2 = Math.min(min2, dot);
            max2 = Math.max(max2, dot);
        }
        if (max1 < min2 || max2 < min1) return false;
    }
    return true;
}

export class CityPlanner {
    static planBuildings(segments: Segment[]): BuildingData[] {
        const buildings: BuildingData[] = [];
        const roadWidth = state.roadWidth;
        const footpathWidth = state.footpathWidth;
        const occupancyThreshold = 1.0 - state.buildingDensity;

        segments.forEach((s, segIdx) => {
            const dx = s.end.x - s.start.x;
            const dy = s.end.y - s.start.y;
            const L = Math.sqrt(dx * dx + dy * dy);
            if (L < 5.0) return;

            const vDir = new THREE.Vector2(dx / L, dy / L);
            const nNorm = new THREE.Vector2(-vDir.y, vDir.x);
            const angle = Math.atan2(dy, dx);
            const bRotation = -angle;

            const roadHalfWidth = roadWidth * (s.type === 'highway' ? 1.5 : 1.0) * 0.5;
            const sidewalkEnd = roadHalfWidth + (s.type === 'street' ? footpathWidth : 0.0) + 0.1;

            const lotLength = 20.0;
            const numLots = Math.max(1, Math.floor(L / lotLength));

            for (let i = 0; i < numLots; i++) {
                for (let side = -1; side <= 1; side += 2) {
                    // Unique seed for each side by offseting the second parameter
                    const lotRand = hash12(segIdx, i * 13 + (side + 1));
                    const plotB = ((i + 0.5) / numLots) * L;
                    const plotCenterX = s.start.x + vDir.x * plotB;
                    const plotCenterY = s.start.y + vDir.y * plotB;

                    const distToCenter = Math.sqrt(plotCenterX * plotCenterX + plotCenterY * plotCenterY);
                    if (distToCenter > 150.0) continue;

                    if (lotRand > occupancyThreshold) {
                        const bWidth = (2.0 + (lotRand * 7.0 % 1.0) * 2.5) * roadWidth;
                        const bDepth = (1.5 + (lotRand * 11.0 % 1.0) * 1.5) * roadWidth;
                        const finalWidth = Math.max(bWidth, bDepth * 0.8);

                        const posX = plotCenterX + nNorm.x * side * (sidewalkEnd + bDepth * 0.5);
                        const posY = plotCenterY + nNorm.y * side * (sidewalkEnd + bDepth * 0.5);

                        // --- 1. ROAD COLLISION CHECK ---
                        let roadCollide = false;
                        const bRadius = Math.sqrt(finalWidth * finalWidth + bDepth * bDepth) * 0.45;
                        for (const other of segments) {
                            // Skip self (the segment we are placing buildings for)
                            if (other === s) continue;
                            
                            const oHalfWidth = roadWidth * (other.type === 'highway' ? 1.5 : 1.0) * 0.5;
                            const safetyDist = oHalfWidth + (other.type === 'street' ? footpathWidth : 0.0) + 0.2;
                            if (distanceToSegmentSq(posX, posY, other.start.x, other.start.y, other.end.x, other.end.y) < (safetyDist + bRadius) ** 2) {
                                roadCollide = true;
                                break;
                            }
                        }
                        if (roadCollide) continue;

                        // --- 2. BUILDING-TO-BUILDING OVERLAP CHECK ---
                        let bCollide = false;
                        for (const existing of buildings) {
                            if (isOBBOverlapping(
                                posX, posY, finalWidth, bDepth, bRotation,
                                existing.pos.x, existing.pos.z, existing.scale.x + 1.0, existing.scale.z + 1.0, existing.rotation
                            )) {
                                bCollide = true;
                                break;
                            }
                        }
                        if (bCollide) continue;

                        const heightMult = 1.0 / (1.0 + distToCenter * 0.015);
                        const height = 8.0 + (lotRand * 6.0) + (heightMult * 50.0);

                        // Random building color
                        const hue = (lotRand * 0.1) + 0.05; // Browns/Greys/Beiges
                        const saturation = lotRand * 0.2;
                        const lightness = 0.4 + (lotRand * 0.3);
                        const color = new THREE.Color().setHSL(hue, saturation, lightness);

                        // Decide on roof feature (30% chance)
                        const hasRoofFeature = (lotRand * 131.0 % 1.0) > 0.7;
                        let roofFeatureScale;
                        if (hasRoofFeature) {
                            roofFeatureScale = new THREE.Vector3(
                                finalWidth * (0.3 + (lotRand * 7.0 % 0.4)),
                                2.0 + (lotRand * 11.0 % 3.0),
                                bDepth * (0.3 + (lotRand * 5.0 % 0.4))
                            );
                        }

                        buildings.push({
                            pos: new THREE.Vector3(posX, 0, posY),
                            scale: new THREE.Vector3(finalWidth - 1.0, height, bDepth - 1.0),
                            rotation: bRotation,
                            seed: lotRand,
                            color: color,
                            hasRoofFeature,
                            roofFeatureScale
                        });
                    }
                }
            }
        });

        return buildings;
    }
}
