import { createHash } from 'node:crypto';

export function sha256(data: Buffer | string): string { return createHash('sha256').update(data).digest('hex'); }
export function checkedU64(b: Buffer, p: number): number {
  const n = b.readBigUInt64LE(p);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('超出安全范围的 64 位整数');
  return Number(n);
}
export interface PackageEntry { name: string; offset: number; size: number; data: Buffer }
export class GamePackage {
  readonly entries: PackageEntry[] = [];
  readonly tocOffset: number;
  constructor(readonly buffer: Buffer) {
    if (buffer.length < 128 || buffer.toString('ascii', 0, 4) !== 'simp' || buffer.readUInt32LE(4) !== 1 || buffer.readBigUInt64LE(8) !== 0n) throw new Error('不支持的关卡包头或版本');
    this.tocOffset = checkedU64(buffer, 16);
    const t = this.tocOffset;
    if (t < 64 || t + 64 > buffer.length || buffer.toString('ascii', t, t + 4) !== 'toc!') throw new Error('无效的包目录');
    const count = checkedU64(buffer, t + 8);
    if (count > 100_000) throw new Error('包条目数量异常');
    let p = t + 64;
    const names = new Set<string>();
    for (let i = 0; i < count; i++) {
      const length = buffer.readUInt32LE(p); p += 4;
      if (length === 0 || length > 4096 || p + length + 17 > buffer.length) throw new Error('条目名称或目录被截断');
      const name = buffer.toString('utf8', p, p + length); p += length;
      if (buffer[p++] !== 0 || names.has(name) || name.includes('..') || name.includes('\\') || name.startsWith('/')) throw new Error('无效或重复的包路径');
      names.add(name);
      const size = checkedU64(buffer, p), offset = checkedU64(buffer, p + 8); p += 16;
      if (offset < 64 || offset + size > t) throw new Error(`条目越界：${name}`);
      this.entries.push({ name, size, offset, data: buffer.subarray(offset, offset + size) });
    }
    if (p !== buffer.length) throw new Error('目录尾部存在未识别数据');
    const sorted = [...this.entries].sort((a,b) => a.offset-b.offset);
    for (let i=1;i<sorted.length;i++) if (sorted[i].offset < sorted[i-1].offset+sorted[i-1].size) throw new Error('包条目相互重叠');
  }
  get(name: string): Buffer {
    const entry = this.entries.find(e => e.name === name);
    if (!entry) throw new Error(`包内不存在：${name}`);
    return entry.data;
  }
  rebuild(changes = new Map<string, Buffer>()): Buffer {
    if (!changes.size) return Buffer.from(this.buffer);
    const list = this.entries.map(e => ({ name: e.name, data: changes.get(e.name) ?? e.data }));
    for (const [name, data] of changes) if (!this.entries.some(e => e.name === name)) list.push({ name, data });
    const header = Buffer.from(this.buffer.subarray(0,64));
    const toc = Buffer.from(this.buffer.subarray(this.tocOffset,this.tocOffset+64));
    toc.writeBigUInt64LE(BigInt(list.length),8);
    const payloads: Buffer[] = [], rows: Buffer[] = [];
    let offset = 64;
    for (const e of list) {
      const name = Buffer.from(e.name,'utf8'), row = Buffer.alloc(4+name.length+1+16);
      row.writeUInt32LE(name.length,0); name.copy(row,4);
      row.writeBigUInt64LE(BigInt(e.data.length),5+name.length); row.writeBigUInt64LE(BigInt(offset),13+name.length);
      rows.push(row); payloads.push(e.data); offset += e.data.length;
    }
    header.writeBigUInt64LE(BigInt(offset),16);
    const result = Buffer.concat([header,...payloads,toc,...rows]);
    new GamePackage(result);
    return result;
  }
}
