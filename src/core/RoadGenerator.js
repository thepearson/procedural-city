import * as THREE from 'three';
export const TERRAIN_SIZE = 1000.0;
export class RoadGenerator {
    segments = [];
    queue = [];
    snapRadius = 2.0;
    highwayStepSize = 15.0;
    streetStepSize = 8.0;
    maxSegments = 256;
    branchProbability = 0.5;
    generate(pattern = 'grid') {
        this.segments = [];
        this.queue = [];
        // Initial highway segments to start from center in 4 directions
        const directions = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
        directions.forEach(angle => {
            this.queue.push({
                start: new THREE.Vector2(0, 0),
                end: new THREE.Vector2(Math.cos(angle) * this.highwayStepSize, Math.sin(angle) * this.highwayStepSize),
                angle: angle,
                type: 'highway',
                status: 'active'
            });
        });
        while (this.queue.length > 0 && this.segments.length < this.maxSegments) {
            const s = this.queue.shift();
            this.applyLocalConstraints(s);
            if (s.status !== 'rejected') {
                this.segments.push(s);
                if (s.status === 'active') {
                    this.proposeSuccessors(s, pattern);
                }
            }
        }
        return this.segments;
    }
    applyLocalConstraints(s) {
        let closestIntersection = null;
        let minT = 1.1;
        // Boundary check: Clip to terrain bounds
        const limit = TERRAIN_SIZE * 0.5;
        if (Math.abs(s.end.x) > limit || Math.abs(s.end.y) > limit) {
            const tX = s.end.x > limit ? (limit - s.start.x) / (s.end.x - s.start.x) : (s.end.x < -limit ? (-limit - s.start.x) / (s.end.x - s.start.x) : 1.0);
            const tY = s.end.y > limit ? (limit - s.start.y) / (s.end.y - s.start.y) : (s.end.y < -limit ? (-limit - s.start.y) / (s.end.y - s.start.y) : 1.0);
            const t = Math.min(tX, tY);
            if (t < 1.0) {
                s.end.set(s.start.x + (s.end.x - s.start.x) * t, s.start.y + (s.end.y - s.start.y) * t);
                s.status = 'end';
            }
        }
        for (const existing of this.segments) {
            const intersect = this.lineIntersect(s.start, s.end, existing.start, existing.end);
            if (intersect) {
                const distToStart = s.start.distanceTo(intersect);
                if (distToStart > 0.1) {
                    const t = distToStart / s.start.distanceTo(s.end);
                    if (t < minT) {
                        minT = t;
                        closestIntersection = intersect;
                    }
                }
            }
        }
        if (closestIntersection) {
            s.end.copy(closestIntersection);
            s.status = 'end';
            return;
        }
        for (const existing of this.segments) {
            const distToEnd = s.end.distanceTo(existing.end);
            if (distToEnd > 0.1 && distToEnd < this.snapRadius) {
                s.end.copy(existing.end);
                s.status = 'end';
                return;
            }
            const distToStart = s.end.distanceTo(existing.start);
            if (distToStart > 0.1 && distToStart < this.snapRadius) {
                s.end.copy(existing.start);
                s.status = 'end';
                return;
            }
        }
        for (const existing of this.segments) {
            const closest = this.closestPointOnSegment(s.end, existing.start, existing.end);
            const dist = s.end.distanceTo(closest);
            if (dist > 0.1 && dist < this.snapRadius) {
                s.end.copy(closest);
                s.status = 'end';
                return;
            }
        }
    }
    proposeSuccessors(s, pattern) {
        const baseAngle = s.angle;
        let choices = [];
        const stepSize = s.type === 'highway' ? this.highwayStepSize : this.streetStepSize;
        if (pattern === 'grid') {
            const globalAngles = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
            for (const angle of globalAngles) {
                const diff = Math.abs(this.normalizeAngle(angle - baseAngle));
                if (diff < 0.1) {
                    choices.push({ angle, type: s.type });
                }
                else if (diff > Math.PI / 2 - 0.1 && diff < Math.PI / 2 + 0.1) {
                    if (Math.random() < this.branchProbability) {
                        choices.push({ angle, type: 'street' });
                    }
                }
            }
        }
        else if (pattern === 'radial') {
            const center = new THREE.Vector2(0, 0);
            const angleToCenter = Math.atan2(s.end.y - center.y, s.end.x - center.x);
            choices.push({ angle: angleToCenter, type: s.type });
            if (Math.random() < this.branchProbability) {
                choices.push({ angle: angleToCenter + Math.PI / 2, type: 'street' });
                choices.push({ angle: angleToCenter - Math.PI / 2, type: 'street' });
            }
        }
        else {
            choices.push({ angle: baseAngle + THREE.MathUtils.randFloat(-0.2, 0.2), type: s.type });
            if (Math.random() < this.branchProbability) {
                choices.push({ angle: baseAngle + Math.PI / 2 + THREE.MathUtils.randFloat(-0.3, 0.3), type: 'street' });
            }
            if (Math.random() < this.branchProbability) {
                choices.push({ angle: baseAngle - Math.PI / 2 + THREE.MathUtils.randFloat(-0.3, 0.3), type: 'street' });
            }
        }
        for (const choice of choices) {
            const currentStep = choice.type === 'highway' ? this.highwayStepSize : this.streetStepSize;
            const newEnd = s.end.clone().add(new THREE.Vector2(Math.cos(choice.angle) * currentStep, Math.sin(choice.angle) * currentStep));
            if (newEnd.distanceTo(s.start) < currentStep * 0.5)
                continue;
            this.queue.push({
                start: s.end.clone(),
                end: newEnd,
                angle: choice.angle,
                type: choice.type,
                status: 'active'
            });
        }
    }
    normalizeAngle(a) {
        while (a > Math.PI)
            a -= 2 * Math.PI;
        while (a < -Math.PI)
            a += 2 * Math.PI;
        return a;
    }
    lineIntersect(p0, p1, p2, p3) {
        const s1_x = p1.x - p0.x, s1_y = p1.y - p0.y, s2_x = p3.x - p2.x, s2_y = p3.y - p2.y;
        const det = (-s2_x * s1_y + s1_x * s2_y);
        if (Math.abs(det) < 0.0001)
            return null;
        const s = (-s1_y * (p0.x - p2.x) + s1_x * (p0.y - p2.y)) / det;
        const t = (s2_x * (p0.y - p2.y) - s2_y * (p0.x - p2.x)) / det;
        if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
            return new THREE.Vector2(p0.x + (t * s1_x), p0.y + (t * s1_y));
        }
        return null;
    }
    closestPointOnSegment(p, a, b) {
        const v = b.clone().sub(a), w = p.clone().sub(a);
        const c1 = w.dot(v), c2 = v.dot(v);
        if (c1 <= 0)
            return a.clone();
        if (c2 <= c1)
            return b.clone();
        return a.clone().add(v.multiplyScalar(c1 / c2));
    }
}
//# sourceMappingURL=RoadGenerator.js.map