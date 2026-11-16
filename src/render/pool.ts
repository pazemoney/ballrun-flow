import { BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, type Material } from 'three';

const ZERO = new Matrix4().makeScale(0, 0, 0);

/**
 * Pool de instâncias (um draw call por tipo de objeto). acquire() reaproveita vagas liberadas;
 * release() zera a matriz (objeto some e não colide: colisão é só na simulação).
 */
export class InstancePool {
  readonly mesh: InstancedMesh;
  private free: number[] = [];
  readonly scale: InstancedBufferAttribute | null;
  used = 0;

  readonly extras = new Map<string, InstancedBufferAttribute>();

  constructor(geometry: BufferGeometry, material: Material, readonly capacity: number, withScale = true, extras: Record<string, number> = {}) {
    for (const [name, size] of Object.entries(extras)) {
      const a = new InstancedBufferAttribute(new Float32Array(capacity * size), size);
      a.setUsage(DynamicDrawUsage);
      geometry.setAttribute(name, a);
      this.extras.set(name, a);
    }
    this.scale = withScale ? new InstancedBufferAttribute(new Float32Array(capacity * 3), 3) : null;
    if (this.scale) {
      this.scale.setUsage(DynamicDrawUsage);
      geometry.setAttribute('aScale', this.scale);
    }
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = capacity - 1; i >= 0; i--) {
      this.free.push(i);
      this.mesh.setMatrixAt(i, ZERO);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  acquire(): number {
    const i = this.free.pop();
    if (i === undefined) return -1; // pool cheio: o objeto não é desenhado (nunca trava)
    this.used++;
    return i;
  }

  set(i: number, m: Matrix4, sx: number, sy: number, sz: number): void {
    if (i < 0) return;
    this.mesh.setMatrixAt(i, m);
    if (this.scale) this.scale.setXYZ(i, sx, sy, sz);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.scale) this.scale.needsUpdate = true;
  }

  /** grava um atributo extra da instância (ex.: rosto, semente) */
  setExtra(i: number, name: string, ...values: number[]): void {
    const a = this.extras.get(name);
    if (!a || i < 0) return;
    for (let k = 0; k < values.length; k++) a.array[i * a.itemSize + k] = values[k] ?? 0;
    a.needsUpdate = true;
  }

  release(i: number): void {
    if (i < 0) return;
    for (const a of this.extras.values()) {
      for (let k = 0; k < a.itemSize; k++) a.array[i * a.itemSize + k] = 0;
      a.needsUpdate = true;
    }
    this.mesh.setMatrixAt(i, ZERO);
    if (this.scale) this.scale.setXYZ(i, 0, 0, 0);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.free.push(i);
    this.used--;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as Material).dispose();
    this.mesh.dispose();
  }
}
