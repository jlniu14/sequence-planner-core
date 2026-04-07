/**
 * src/analysis/geometricAnalysis.ts
 *
 * 基于装配体几何信息（AABB）计算：
 *   1. 各零件的轴对齐包围盒（AABB）
 *   2. 接触/干涉关系（LiaisonGraph）
 *   3. 拆卸干涉矩阵（InterferenceMatrix）
 *
 * AABB 碰撞判定：
 *   两零件在 XYZ 三轴上的投影区间均有重叠（含接触容差 ε）时认为存在接触。
 *
 * 拆卸方向干涉：
 *   零件 A 沿方向 d 移动时，若 B 的 AABB 在该方向上挡住 A，则 A 被 B 阻挡。
 *   判定方法：XYZ 横截面投影重叠 + 沿移动方向 B 在 A 的前方（或同层）。
 */

import {
  Assembly,
  AssemblyPart,
  AABB,
  Vec3,
  Direction,
  DIRECTIONS,
  InterferenceMatrix,
  LiaisonGraph,
  ContactInfo,
  BoxGeometry,
  CylinderGeometry,
} from '../types';

// ─────────────────────────────────────────────────
// AABB 计算
// ─────────────────────────────────────────────────

export function computeAABB(part: AssemblyPart): AABB {
  const { position: p } = part.transform;
  if (part.geometry.type === 'box') {
    const g = part.geometry as BoxGeometry;
    return {
      min: { x: p.x, y: p.y, z: p.z },
      max: { x: p.x + g.width, y: p.y + g.height, z: p.z + g.depth },
    };
  } else {
    const g = part.geometry as CylinderGeometry;
    return {
      min: { x: p.x - g.radius, y: p.y - g.radius, z: p.z },
      max: { x: p.x + g.radius, y: p.y + g.radius, z: p.z + g.height },
    };
  }
}

export function computeAllAABBs(assembly: Assembly): Map<string, AABB> {
  const map = new Map<string, AABB>();
  for (const part of assembly.parts) {
    map.set(part.id, computeAABB(part));
  }
  return map;
}

// ─────────────────────────────────────────────────
// 接触检测（LiaisonGraph）
// ─────────────────────────────────────────────────

const CONTACT_EPS = 1.0;  // mm，接触容差

function intervalsOverlap(a0: number, a1: number, b0: number, b1: number, eps: number): boolean {
  return a0 <= b1 + eps && b0 <= a1 + eps;
}

function aabbsContact(a: AABB, b: AABB): boolean {
  return (
    intervalsOverlap(a.min.x, a.max.x, b.min.x, b.max.x, CONTACT_EPS) &&
    intervalsOverlap(a.min.y, a.max.y, b.min.y, b.max.y, CONTACT_EPS) &&
    intervalsOverlap(a.min.z, a.max.z, b.min.z, b.max.z, CONTACT_EPS)
  );
}

function dominantContactNormal(a: AABB, b: AABB): Direction {
  // 判断 A→B 的主接触方向（最大分离或最小重叠轴）
  const cx = (b.min.x + b.max.x) / 2 - (a.min.x + a.max.x) / 2;
  const cy = (b.min.y + b.max.y) / 2 - (a.min.y + a.max.y) / 2;
  const cz = (b.min.z + b.max.z) / 2 - (a.min.z + a.max.z) / 2;

  const ax = Math.abs(cx), ay = Math.abs(cy), az = Math.abs(cz);
  if (az >= ax && az >= ay) return cz >= 0 ? '+z' : '-z';
  if (ay >= ax) return cy >= 0 ? '+y' : '-y';
  return cx >= 0 ? '+x' : '-x';
}

export function buildLiaisonGraph(
  assembly: Assembly,
  aabbMap: Map<string, AABB>,
): LiaisonGraph {
  const contacts: ContactInfo[] = [];
  const parts = assembly.parts;

  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i]!;
      const b = parts[j]!;
      const bbA = aabbMap.get(a.id)!;
      const bbB = aabbMap.get(b.id)!;

      if (aabbsContact(bbA, bbB)) {
        const normal = dominantContactNormal(bbA, bbB);
        const ct: ContactInfo = {
          partA: a.id,
          partB: b.id,
          contactNormal: normal,
          contactType: 'face_to_face',
        };
        contacts.push(ct);
      }
    }
  }

  return { contacts };
}

// ─────────────────────────────────────────────────
// 拆卸干涉矩阵
// ─────────────────────────────────────────────────

/**
 * 判断零件 blocker 是否在方向 dir 上阻挡 mover 的移动。
 *
 * 规则：mover 沿 dir 移动，若 blocker 的 AABB 在横截面投影与 mover 重叠，
 * 且 blocker 在该方向上位于 mover 的"前方"（移动路径上），则阻挡。
 */
function isBlocking(moverBB: AABB, blockerBB: AABB, dir: Direction): boolean {
  switch (dir) {
    case '+z': {
      const xyOverlap =
        intervalsOverlap(moverBB.min.x, moverBB.max.x, blockerBB.min.x, blockerBB.max.x, -0.5) &&
        intervalsOverlap(moverBB.min.y, moverBB.max.y, blockerBB.min.y, blockerBB.max.y, -0.5);
      return xyOverlap && blockerBB.min.z >= moverBB.min.z - CONTACT_EPS;
    }
    case '-z': {
      const xyOverlap =
        intervalsOverlap(moverBB.min.x, moverBB.max.x, blockerBB.min.x, blockerBB.max.x, -0.5) &&
        intervalsOverlap(moverBB.min.y, moverBB.max.y, blockerBB.min.y, blockerBB.max.y, -0.5);
      return xyOverlap && blockerBB.max.z <= moverBB.max.z + CONTACT_EPS;
    }
    case '+x': {
      const yzOverlap =
        intervalsOverlap(moverBB.min.y, moverBB.max.y, blockerBB.min.y, blockerBB.max.y, -0.5) &&
        intervalsOverlap(moverBB.min.z, moverBB.max.z, blockerBB.min.z, blockerBB.max.z, -0.5);
      return yzOverlap && blockerBB.min.x >= moverBB.min.x - CONTACT_EPS;
    }
    case '-x': {
      const yzOverlap =
        intervalsOverlap(moverBB.min.y, moverBB.max.y, blockerBB.min.y, blockerBB.max.y, -0.5) &&
        intervalsOverlap(moverBB.min.z, moverBB.max.z, blockerBB.min.z, blockerBB.max.z, -0.5);
      return yzOverlap && blockerBB.max.x <= moverBB.max.x + CONTACT_EPS;
    }
    case '+y': {
      const xzOverlap =
        intervalsOverlap(moverBB.min.x, moverBB.max.x, blockerBB.min.x, blockerBB.max.x, -0.5) &&
        intervalsOverlap(moverBB.min.z, moverBB.max.z, blockerBB.min.z, blockerBB.max.z, -0.5);
      return xzOverlap && blockerBB.min.y >= moverBB.min.y - CONTACT_EPS;
    }
    case '-y': {
      const xzOverlap =
        intervalsOverlap(moverBB.min.x, moverBB.max.x, blockerBB.min.x, blockerBB.max.x, -0.5) &&
        intervalsOverlap(moverBB.min.z, moverBB.max.z, blockerBB.min.z, blockerBB.max.z, -0.5);
      return xzOverlap && blockerBB.max.y <= moverBB.max.y + CONTACT_EPS;
    }
  }
}

export function buildInterferenceMatrix(
  assembly: Assembly,
  aabbMap: Map<string, AABB>,
): InterferenceMatrix {
  const matrix: InterferenceMatrix = {};

  for (const mover of assembly.parts) {
    matrix[mover.id] = {} as InterferenceMatrix[string];
    const moverBB = aabbMap.get(mover.id)!;

    for (const dir of DIRECTIONS) {
      matrix[mover.id]![dir] = {};
      for (const blocker of assembly.parts) {
        if (blocker.id === mover.id) continue;
        const blockerBB = aabbMap.get(blocker.id)!;
        matrix[mover.id]![dir][blocker.id] = isBlocking(moverBB, blockerBB, dir) ? 1 : 0;
      }
    }
  }

  return matrix;
}

// ─────────────────────────────────────────────────
// 打印摘要（供 CLI 输出）
// ─────────────────────────────────────────────────

export function summarizeLiaisonGraph(graph: LiaisonGraph): string {
  if (graph.contacts.length === 0) return '  （无接触关系）';
  return graph.contacts
    .map(c => `  ${c.partA} ↔ ${c.partB}  [法向量: ${c.contactNormal}]`)
    .join('\n');
}

export function freeDirections(partId: string, matrix: InterferenceMatrix): Direction[] {
  const result: Direction[] = [];
  for (const dir of DIRECTIONS) {
    const row = matrix[partId]?.[dir] ?? {};
    if (!Object.values(row).some(v => v === 1)) {
      result.push(dir);
    }
  }
  return result;
}
