import * as THREE from 'three';

function mod(x: number, y: number): number {
    return x - y * Math.floor(x / y);
}

function permute(x: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(
        mod(((x.x * 34.0) + 1.0) * x.x, 289.0),
        mod(((x.y * 34.0) + 1.0) * x.y, 289.0),
        mod(((x.z * 34.0) + 1.0) * x.z, 289.0)
    );
}

export function snoise(v: THREE.Vector2): number {
    const C = new THREE.Vector4(
        (3.0 - Math.sqrt(3.0)) / 6.0,
        0.5 * (Math.sqrt(3.0) - 1.0),
        -1.0 + 2.0 * ((3.0 - Math.sqrt(3.0)) / 6.0),
        1.0 / 41.0
    );

    let i = new THREE.Vector2(Math.floor(v.x + (v.x + v.y) * C.y), Math.floor(v.y + (v.x + v.y) * C.y));
    let x0 = new THREE.Vector2(v.x - i.x + (i.x + i.y) * C.x, v.y - i.y + (i.x + i.y) * C.x);

    let i1 = (x0.x > x0.y) ? new THREE.Vector2(1.0, 0.0) : new THREE.Vector2(0.0, 1.0);
    let x12 = new THREE.Vector4(x0.x + C.x - i1.x, x0.y + C.x - i1.y, x0.x + C.z, x0.y + C.z);

    let p = permute(permute(new THREE.Vector3(mod(i.y, 289.0), mod(i.y + i1.y, 289.0), mod(i.y + 1.0, 289.0)))
        .add(new THREE.Vector3(mod(i.x, 289.0), mod(i.x + i1.x, 289.0), mod(i.x + 1.0, 289.0))));

    let m = new THREE.Vector3(
        Math.max(0.5 - (x0.x * x0.x + x0.y * x0.y), 0.0),
        Math.max(0.5 - (x12.x * x12.x + x12.y * x12.y), 0.0),
        Math.max(0.5 - (x12.z * x12.z + x12.w * x12.w), 0.0)
    );
    m.x = m.x * m.x * m.x * m.x;
    m.y = m.y * m.y * m.y * m.y;
    m.z = m.z * m.z * m.z * m.z;

    let x = new THREE.Vector3(
        2.0 * mod(p.x * C.w, 1.0) - 1.0,
        2.0 * mod(p.y * C.w, 1.0) - 1.0,
        2.0 * mod(p.z * C.w, 1.0) - 1.0
    );
    let h = new THREE.Vector3(Math.abs(x.x) - 0.5, Math.abs(x.y) - 0.5, Math.abs(x.z) - 0.5);
    let ox = new THREE.Vector3(Math.floor(x.x + 0.5), Math.floor(x.y + 0.5), Math.floor(x.z + 0.5));
    let a0 = new THREE.Vector3(x.x - ox.x, x.y - ox.y, x.z - ox.z);

    m.x *= 1.79284291400159 - 0.85373472095314 * (a0.x * a0.x + h.x * h.x);
    m.y *= 1.79284291400159 - 0.85373472095314 * (a0.y * a0.y + h.y * h.y);
    m.z *= 1.79284291400159 - 0.85373472095314 * (a0.z * a0.z + h.z * h.z);

    let g = new THREE.Vector3(
        a0.x * x0.x + h.x * x0.y,
        a0.y * x12.x + h.y * x12.y,
        a0.z * x12.z + h.z * x12.w
    );
    return 130.0 * (m.x * g.x + m.y * g.y + m.z * g.z);
}
