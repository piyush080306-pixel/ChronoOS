import type { MemoryAlgorithm, MemoryBlock } from '../types';

export function initialMemoryBlocks(totalMb: number): MemoryBlock[] {
  return [{ start: 0, size: totalMb, pid: null }];
}

export function findHole(
  blocks: MemoryBlock[],
  size: number,
  algorithm: MemoryAlgorithm,
  lastAllocStart: number,
): number | null {
  const holes = blocks.filter((block) => block.pid === null && block.size >= size);
  if (holes.length === 0) return null;

  if (algorithm === 'FIRST_FIT') return holes[0].start;

  if (algorithm === 'BEST_FIT' || algorithm === 'WORST_FIT') {
    const direction = algorithm === 'BEST_FIT' ? 1 : -1;
    let chosen = holes[0];
    for (const hole of holes.slice(1)) {
      if ((hole.size - chosen.size) * direction < 0) chosen = hole;
    }
    return chosen.start;
  }

  const startIndex = blocks.findIndex((block) => block.start >= lastAllocStart);
  const origin = startIndex === -1 ? 0 : startIndex;
  for (let offset = 0; offset < blocks.length; offset += 1) {
    const block = blocks[(origin + offset) % blocks.length];
    if (block.pid === null && block.size >= size) return block.start;
  }
  return null;
}

export function allocateAt(blocks: MemoryBlock[], pid: string, start: number, size: number): MemoryBlock[] {
  const index = blocks.findIndex(
    (block) => block.pid === null && block.start <= start && start + size <= block.start + block.size,
  );
  if (index === -1) throw new Error(`No free memory at ${start} for ${pid}`);
  const hole = blocks[index];
  const pieces: MemoryBlock[] = [];
  if (start > hole.start) pieces.push({ start: hole.start, size: start - hole.start, pid: null });
  pieces.push({ start, size, pid });
  const tail = hole.start + hole.size - (start + size);
  if (tail > 0) pieces.push({ start: start + size, size: tail, pid: null });
  return [...blocks.slice(0, index), ...pieces, ...blocks.slice(index + 1)];
}

export function releaseOwner(blocks: MemoryBlock[], pid: string): MemoryBlock[] {
  const released = blocks.map((block) => (block.pid === pid ? { ...block, pid: null } : block));
  const merged: MemoryBlock[] = [];
  for (const block of released) {
    const last = merged[merged.length - 1];
    if (last && last.pid === null && block.pid === null) {
      last.size += block.size;
    } else {
      merged.push({ ...block });
    }
  }
  return merged;
}

export interface MemoryStats {
  usedMb: number;
  freeMb: number;
  largestFreeMb: number;
  freeHoles: number;
  utilizationPct: number;
  externalFragmentationMb: number;
  fragmentationPct: number;
}

export function memoryStats(blocks: MemoryBlock[], totalMb: number): MemoryStats {
  const free = blocks.filter((block) => block.pid === null);
  const freeMb = free.reduce((sum, block) => sum + block.size, 0);
  const largestFreeMb = free.reduce((max, block) => Math.max(max, block.size), 0);
  const usedMb = totalMb - freeMb;
  const externalFragmentationMb = freeMb - largestFreeMb;
  return {
    usedMb,
    freeMb,
    largestFreeMb,
    freeHoles: free.length,
    utilizationPct: totalMb > 0 ? (usedMb / totalMb) * 100 : 0,
    externalFragmentationMb,
    fragmentationPct: freeMb > 0 ? (externalFragmentationMb / freeMb) * 100 : 0,
  };
}
