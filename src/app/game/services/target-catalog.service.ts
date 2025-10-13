import { Injectable } from '@angular/core';
import { ITargetable, TargetType } from '../types/targeting.types';

@Injectable({ providedIn: 'root' })
export class TargetCatalogService {
  private buckets = new Map<TargetType, ITargetable[]>();

  register(type: TargetType, items: ITargetable[]): void {
    this.buckets.set(type, items);
  }

  add(type: TargetType, item: ITargetable): void {
    const arr = this.buckets.get(type) ?? [];
    arr.push(item);
    this.buckets.set(type, arr);
  }

  clear(type?: TargetType): void {
    if (type) this.buckets.delete(type);
    else this.buckets.clear();
  }

  getAllTargets(): ITargetable[] {
    const out: ITargetable[] = [];
    for (const arr of this.buckets.values()) out.push(...arr);
    return out;
  }

  getByType(type: TargetType): ITargetable[] {
    return this.buckets.get(type) ?? [];
  }
}
