/**
 * src/planner/sequenceGenerator.ts
 *
 * 同时基于几何干涉矩阵和工艺先决条件约束，生成有效装配序列。
 *
 * 算法：约束导向贪心 + 多路径枚举（有界）
 *
 *   1. 初始化"可安装集合"：所有先决条件已满足且几何上可放入的零件。
 *   2. 从可安装集合中选一个零件安装，更新已安装集合。
 *   3. 重复直至所有零件安装完毕。
 *   4. 通过维护候选队列（BFS），枚举多条不同路径（上限 MAX_CANDIDATES）。
 *
 * 几何可行性判断：
 *   拆卸分析逆向：若零件 P 在某方向无阻挡，则 P 可从该方向移入（装配方向相反）。
 */

import {
  Assembly,
  AssemblyPart,
  AssemblySequence,
  AssemblyStep,
  InterferenceMatrix,
  Direction,
  DIRECTIONS,
} from '../types';

const MAX_CANDIDATES = 20;   // 最多生成多少条候选序列

// ─────────────────────────────────────────────────
// 辅助：在当前矩阵中找零件的无干涉安装方向
// ─────────────────────────────────────────────────

function findInstallDirection(
  partId: string,
  matrix: InterferenceMatrix,
  installedIds: Set<string>,
): Direction | null {
  const row = matrix[partId];
  if (!row) return null;

  for (const dir of DIRECTIONS) {
    const interferences = row[dir];
    // 只检查"已安装"零件是否阻挡
    const blockedByInstalled = Object.entries(interferences).some(
      ([blockerId, val]) => val === 1 && installedIds.has(blockerId),
    );
    if (!blockedByInstalled) return dir;
  }
  return null;
}

// ─────────────────────────────────────────────────
// 候选序列状态
// ─────────────────────────────────────────────────

interface SearchState {
  steps: AssemblyStep[];
  installed: Set<string>;
  remaining: Set<string>;
}

// ─────────────────────────────────────────────────
// 主函数
// ─────────────────────────────────────────────────

export function generateCandidateSequences(
  assembly: Assembly,
  matrix: InterferenceMatrix,
): AssemblySequence[] {
  const allPartIds = new Set(assembly.parts.map(p => p.id));
  const partMap = new Map<string, AssemblyPart>(assembly.parts.map(p => [p.id, p]));

  const initialState: SearchState = {
    steps: [],
    installed: new Set<string>(),
    remaining: new Set<string>(allPartIds),
  };

  const completed: AssemblySequence[] = [];
  const queue: SearchState[] = [initialState];
  let seqCounter = 0;

  while (queue.length > 0 && completed.length < MAX_CANDIDATES) {
    const state = queue.shift()!;

    if (state.remaining.size === 0) {
      seqCounter++;
      completed.push({
        id: `seq_${String(seqCounter).padStart(2, '0')}`,
        steps: state.steps,
        isValid: true,
        violatedRules: [],
      });
      continue;
    }

    // 找出当前可安装的零件
    const installable: Array<{ part: AssemblyPart; dir: Direction }> = [];

    for (const partId of state.remaining) {
      const part = partMap.get(partId)!;

      // 检查先决条件
      const prereqsSatisfied = part.prerequisites.every(p => state.installed.has(p));
      if (!prereqsSatisfied) continue;

      // 检查几何可行性
      const dir = findInstallDirection(partId, matrix, state.installed);
      if (dir !== null) {
        installable.push({ part, dir });
      }
    }

    if (installable.length === 0) continue;  // 死锁分支，丢弃

    // 为每个可安装零件各创建一条分支（BFS 枚举）
    for (const { part, dir } of installable) {
      if (completed.length + queue.length >= MAX_CANDIDATES * 3) break;

      const newStep: AssemblyStep = {
        stepNumber: state.steps.length + 1,
        partId: part.id,
        partName: part.name,
        assemblyMethod: part.assemblyMethod,
        installDirection: dir,
      };

      const newInstalled = new Set(state.installed);
      newInstalled.add(part.id);
      const newRemaining = new Set(state.remaining);
      newRemaining.delete(part.id);

      queue.push({
        steps: [...state.steps, newStep],
        installed: newInstalled,
        remaining: newRemaining,
      });
    }
  }

  // 若 BFS 未找到完整序列，回退为贪心单序列
  if (completed.length === 0) {
    const greedySeq = greedySequence(assembly, matrix, partMap);
    if (greedySeq) completed.push(greedySeq);
  }

  return completed;
}

// ─────────────────────────────────────────────────
// 贪心回退：每步选"先决条件已满足且几何可行"的第一个零件
// ─────────────────────────────────────────────────

function greedySequence(
  assembly: Assembly,
  matrix: InterferenceMatrix,
  partMap: Map<string, AssemblyPart>,
): AssemblySequence | null {
  const installed = new Set<string>();
  const remaining = new Set<string>(assembly.parts.map(p => p.id));
  const steps: AssemblyStep[] = [];

  while (remaining.size > 0) {
    let placed = false;

    for (const partId of remaining) {
      const part = partMap.get(partId)!;
      const prereqOk = part.prerequisites.every(p => installed.has(p));
      if (!prereqOk) continue;

      const dir = findInstallDirection(partId, matrix, installed);
      if (dir !== null) {
        steps.push({
          stepNumber: steps.length + 1,
          partId: part.id,
          partName: part.name,
          assemblyMethod: part.assemblyMethod,
          installDirection: dir,
        });
        installed.add(partId);
        remaining.delete(partId);
        placed = true;
        break;
      }
    }

    if (!placed) return null;  // 无法继续
  }

  return { id: 'seq_greedy', steps, isValid: true, violatedRules: [] };
}
