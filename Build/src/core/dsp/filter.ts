import type { FormantTarget } from "../types";
import { elementAt } from "../validation";

export class FormantFilter {
  private a1 = 0;
  private a2 = 0;
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private y1 = 0;
  private y2 = 0;
  private x1 = 0;
  private x2 = 0;

  setResonator(freq: number, bw: number, sampleRate: number): void {
    const safeFreq = Math.max(0, Math.min(sampleRate / 2 - 1, freq));
    const safeBw = Math.max(0.01, bw);
    const theta = (2 * Math.PI * safeFreq) / sampleRate;
    const r = Math.exp((-Math.PI * safeBw) / sampleRate);
    const B = 2 * r * Math.cos(theta);
    const C = -(r * r);
    this.b0 = 1 - B - C;
    this.b1 = 0;
    this.b2 = 0;
    this.a1 = -B;
    this.a2 = -C;
  }

  setAntiResonator(freq: number, bw: number, sampleRate: number): void {
    const safeFreq = Math.max(0, Math.min(sampleRate / 2 - 1, freq));
    const safeBw = Math.max(0.01, bw);
    const theta = (2 * Math.PI * safeFreq) / sampleRate;
    const rz = Math.exp((-Math.PI * safeBw) / sampleRate);
    this.b0 = 1;
    this.b1 = -2 * rz * Math.cos(theta);
    this.b2 = rz * rz;
    const rp = Math.exp((-Math.PI * safeBw * 1.5) / sampleRate);
    this.a1 = -2 * rp * Math.cos(theta);
    this.a2 = rp * rp;
  }

  setPassthrough(): void {
    this.b0 = 1;
    this.b1 = 0;
    this.b2 = 0;
    this.a1 = 0;
    this.a2 = 0;
  }

  processSample(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }

  process(input: Float32Array): Float32Array {
    const out = new Float32Array(input.length);
    for (const [i, sample] of input.entries()) out[i] = this.processSample(sample);
    return out;
  }

  reset(): void {
    this.y1 = 0;
    this.y2 = 0;
    this.x1 = 0;
    this.x2 = 0;
  }
}

export class FormantCascade {
  private resonators: FormantFilter[];
  private antiResonators: FormantFilter[];

  constructor(numFormants = 5) {
    this.resonators = Array.from({ length: numFormants }, () => new FormantFilter());
    this.antiResonators = Array.from({ length: numFormants }, () => new FormantFilter());
  }

  setFormants(targets: FormantTarget[], sampleRate: number, antiformants?: FormantTarget[]): void {
    for (const [i, resonator] of this.resonators.entries()) {
      const target = targets[i];
      if (target) {
        resonator.setResonator(target.f, target.bw, sampleRate);
      } else {
        resonator.setResonator(5000, sampleRate * 0.5, sampleRate);
      }
    }
    for (const [i, resonator] of this.antiResonators.entries()) {
      if (antiformants && i < antiformants.length) {
        const target = elementAt(antiformants, i);
        resonator.setAntiResonator(target.f, target.bw, sampleRate);
      } else {
        resonator.setPassthrough();
      }
    }
  }

  processSample(x: number): number {
    for (const ar of this.antiResonators) x = ar.processSample(x);
    for (const res of this.resonators) x = res.processSample(x);
    return x;
  }

  reset(): void {
    for (const res of this.resonators) res.reset();
    for (const ar of this.antiResonators) ar.reset();
  }
}

export function interpolateFormants(a: FormantTarget[], b: FormantTarget[], t: number, count = 5): FormantTarget[] {
  const result: FormantTarget[] = [];
  for (let i = 0; i < count; i++) {
    const fa = a[i] ?? { f: 5000, bw: 200 };
    const fb = b[i] ?? { f: 5000, bw: 200 };
    const st = t * t * (3 - 2 * t);
    result.push({ f: fa.f + (fb.f - fa.f) * st, bw: fa.bw + (fb.bw - fa.bw) * st });
  }
  return result;
}
