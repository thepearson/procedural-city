import * as THREE from 'three';
export declare const TERRAIN_SIZE = 1000;
export interface Segment {
    start: THREE.Vector2;
    end: THREE.Vector2;
    angle: number;
    type: 'highway' | 'street';
    status: 'active' | 'end' | 'rejected';
}
export declare class RoadGenerator {
    segments: Segment[];
    queue: Segment[];
    snapRadius: number;
    highwayStepSize: number;
    streetStepSize: number;
    maxSegments: number;
    branchProbability: number;
    generate(pattern?: 'grid' | 'radial' | 'organic'): Segment[];
    applyLocalConstraints(s: Segment): void;
    proposeSuccessors(s: Segment, pattern: string): void;
    normalizeAngle(a: number): number;
    lineIntersect(p0: THREE.Vector2, p1: THREE.Vector2, p2: THREE.Vector2, p3: THREE.Vector2): THREE.Vector2 | null;
    closestPointOnSegment(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2): THREE.Vector2;
}
//# sourceMappingURL=RoadGenerator.d.ts.map