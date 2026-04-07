/**
 * src/planner/sequenceEvaluator.ts
 *
 * 装配序列评价模块 — 工艺性是核心指标。
 *
 * 评分维度（共 100 分）：
 *
 *  1. 几何可行性（25 分）
 *     每一步中零件安装方向与其"自由方向"匹配，且不违反剩余零件的干涉约束。
 *
 *  2. 工艺符合性（30 分）
 *     - 先决条件全部满足 (15 分)
 *     - 同类工序集中、减少换刀次数 (10 分)
 *     - 螺栓按交叉对称顺序 (5 分)
 *
 *  3. 可达性（20 分）
 *     越早安装的零件越容易访问；大件/基础件优先安装得高分。
 *
 *  4. 装配效率（15 分）
 *     - 安装方向变化次数少（减少重新定位）(10 分)
 *     - 工具切换次数少 (5 分)
 *
 *  5. 中间体稳定性（10 分）
 *     每步完成后，已安装件重心尽可能低、支撑面积大。
 */

import {
  Assembly,
  AssemblySequence,
  SequenceScore,
  AssemblyStep,
  Direction,
  InterferenceMatrix,
} from '../types';

// ─────────────────────────────────────────────────
// 辅助
// ─────────────────────────────────────────────────

function methodToTool(method: AssemblyStep['assemblyMethod']): string {
  switch (method) {
    case 'bolt_tighten': return 'torque_wrench';
    case 'press_fit':    return 'press';
    case 'place':        return 'hand';
    default:             return 'hand';
  }
}

// ─────────────────────────────────────────────────
// 1. 几何可行性
// ─────────────────────────────────────────────────

function scoreGeometricFeasibility(seq: AssemblySequence, matrix: InterferenceMatrix): number {
  let score = 25;
  const installed = new Set<string>();

  for (const step of seq.steps) {
    const row = matrix[step.partId];
    if (!row) { score -= 3; installed.add(step.partId); continue; }

    // 检查安装方向在当前已安装状态下是否无干涉
    const dirRow = row[step.installDirection];
    const blocked = Object.entries(dirRow).some(
      ([id, v]) => v === 1 && installed.has(id),
    );
    if (blocked) score -= 4;

    installed.add(step.partId);
  }
  return Math.max(0, score);
}

// ─────────────────────────────────────────────────
// 2. 工艺符合性
// ─────────────────────────────────────────────────

function scoreProcessCompliance(seq: AssemblySequence, assembly: Assembly): number {
  let score = 0;
  const order = seq.steps.map(s => s.partId);

  // 2a. 先决条件全部满足（15 分）
  const installed = new Set<string>();
  let prereqOk = true;
  for (const step of seq.steps) {
    const part = assembly.parts.find(p => p.id === step.partId)!;
    if (!part.prerequisites.every(p => installed.has(p))) {
      prereqOk = false;
      break;
    }
    installed.add(step.partId);
  }
  if (prereqOk) score += 15;

  // 2b. 同类工序集中（10 分）— 计算方法类型切换次数
  const methods = seq.steps.map(s => s.assemblyMethod);
  let switches = 0;
  for (let i = 1; i < methods.length; i++) {
    if (methods[i] !== methods[i - 1]) switches++;
  }
  // 理想切换次数 = 方法种类 - 1
  const uniqueMethods = new Set(methods).size;
  const idealSwitches = Math.max(0, uniqueMethods - 1);
  const extraSwitches = Math.max(0, switches - idealSwitches);
  score += Math.max(0, 10 - extraSwitches * 2);

  // 2c. 螺栓交叉对称（5 分）
  const bolts = assembly.parts
    .filter(p => p.assemblyMethod === 'bolt_tighten')
    .map(p => p.id);
  if (bolts.length === 4) {
    const positions = bolts.map(b => order.indexOf(b));
    if (positions.every(p => p !== -1)) {
      const actualOrder = positions
        .map((p, i) => ({ pos: p, idx: i }))
        .sort((a, b) => a.pos - b.pos)
        .map(x => x.idx);
      const crossPatterns = [
        [0, 2, 1, 3], [1, 3, 0, 2], [0, 3, 1, 2], [1, 2, 0, 3],
      ];
      const isCross = crossPatterns.some(pat => pat.every((v, i) => v === actualOrder[i]));
      if (isCross) score += 5;
      else score += 2;  // 非交叉但先紧固对角也给部分分
    }
  } else {
    score += 5;  // 非 4 螺栓，不扣分
  }

  return score;
}

// ─────────────────────────────────────────────────
// 3. 可达性
// ─────────────────────────────────────────────────

function scoreAccessibility(seq: AssemblySequence, assembly: Assembly): number {
  let score = 20;
  // 基础件（无先决条件）应尽早安装
  const baseParts = new Set(
    assembly.parts.filter(p => p.prerequisites.length === 0).map(p => p.id),
  );

  const n = seq.steps.length;
  seq.steps.forEach((step, i) => {
    if (baseParts.has(step.partId)) {
      // 基础件位置越靠前越好；在前一半得满分，后一半扣分
      if (i > n / 2) score -= 3;
    }
  });
  return Math.max(0, score);
}

// ─────────────────────────────────────────────────
// 4. 装配效率
// ─────────────────────────────────────────────────

function scoreEfficiency(seq: AssemblySequence): number {
  let score = 15;

  // 4a. 安装方向变化（10 分）
  const dirs = seq.steps.map(s => s.installDirection);
  let dirChanges = 0;
  for (let i = 1; i < dirs.length; i++) {
    if (dirs[i] !== dirs[i - 1]) dirChanges++;
  }
  score -= Math.min(10, dirChanges);

  // 4b. 工具切换（5 分）
  const tools = seq.steps.map(s => methodToTool(s.assemblyMethod));
  let toolSwitches = 0;
  for (let i = 1; i < tools.length; i++) {
    if (tools[i] !== tools[i - 1]) toolSwitches++;
  }
  score -= Math.min(5, toolSwitches);

  return Math.max(0, score);
}

// ─────────────────────────────────────────────────
// 5. 中间体稳定性
// ─────────────────────────────────────────────────

function scoreStability(seq: AssemblySequence, assembly: Assembly): number {
  let score = 10;
  const partMap = new Map(assembly.parts.map(p => [p.id, p]));

  // 简化：每步检查是否先安装大型底座件
  const sortedByMass = [...assembly.parts].sort((a, b) => {
    const vol = (p: typeof a) => {
      if (p.geometry.type === 'box') {
        const g = p.geometry;
        return g.width * g.height * g.depth;
      }
      const g = p.geometry;
      return Math.PI * g.radius * g.radius * g.height;
    };
    return vol(b) - vol(a);
  });

  // 最大件（体积最大）若不是前三步安装，扣分
  const largestId = sortedByMass[0]!.id;
  const largestStep = seq.steps.findIndex(s => s.partId === largestId);
  if (largestStep > 2) score -= 4;

  void partMap;
  return Math.max(0, score);
}

// ─────────────────────────────────────────────────
// 综合评分
// ─────────────────────────────────────────────────

export function evaluateSequence(
  seq: AssemblySequence,
  assembly: Assembly,
  matrix: InterferenceMatrix,
): SequenceScore {
  const gf = scoreGeometricFeasibility(seq, matrix);
  const pc = scoreProcessCompliance(seq, assembly);
  const ac = scoreAccessibility(seq, assembly);
  const ef = scoreEfficiency(seq);
  const st = scoreStability(seq, assembly);

  const total = gf + pc + ac + ef + st;

  let comment = '';
  if (total >= 90) comment = '优秀序列，工艺性优，推荐采用';
  else if (total >= 75) comment = '良好序列，工艺性较优';
  else if (total >= 60) comment = '合格序列，可接受但有改进空间';
  else comment = '较差序列，工艺性不足，建议重新规划';

  return {
    sequenceId: seq.id,
    total,
    breakdown: {
      geometricFeasibility: gf,
      processCompliance: pc,
      accessibility: ac,
      efficiency: ef,
      stability: st,
    },
    comment,
  };
}

/** 对多条序列评分并按总分降序排列 */
export function rankSequences(
  sequences: AssemblySequence[],
  assembly: Assembly,
  matrix: InterferenceMatrix,
): Array<{ sequence: AssemblySequence; score: SequenceScore }> {
  return sequences
    .map(seq => ({ sequence: seq, score: evaluateSequence(seq, assembly, matrix) }))
    .sort((a, b) => b.score.total - a.score.total);
}
