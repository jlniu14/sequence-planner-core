/**
 * src/constraints/processRules.ts
 *
 * 工艺规则库 + 规则驱动的约束过滤器。
 *
 * 规则定义来源：
 *   1. 从装配体 prerequisites 字段自动提取先决条件规则
 *   2. 手工编写典型工艺规则（交叉紧固、方向优选、工具分组等）
 *
 * 过滤器功能：
 *   给定候选序列，返回违反哪些规则（violatedRules）。
 */

import { Assembly, ProcessRule, AssemblySequence } from '../types';

// ─────────────────────────────────────────────────
// 规则库构建
// ─────────────────────────────────────────────────

export function buildProcessRules(assembly: Assembly): ProcessRule[] {
  const rules: ProcessRule[] = [];

  // 1. 从 prerequisites 自动生成先决条件规则
  for (const part of assembly.parts) {
    for (const prereq of part.prerequisites) {
      rules.push({
        id: `prereq_${prereq}_before_${part.id}`,
        type: 'prerequisite',
        description: `${prereq} 必须先于 ${part.id} 安装`,
        affectedParts: [prereq, part.id],
        priority: 10,
        prerequisitePart: prereq,
        dependentPart: part.id,
      });
    }
  }

  // 2. 找出所有 bolt_tighten 类零件 → 生成组合规则
  const bolts = assembly.parts
    .filter(p => p.assemblyMethod === 'bolt_tighten')
    .map(p => p.id);

  if (bolts.length >= 2) {
    rules.push({
      id: 'rule_bolt_concurrent_group',
      type: 'concurrent_group',
      description: '所有螺栓应集中连续安装，避免交叉穿插其他操作',
      affectedParts: bolts,
      priority: 7,
    });

    rules.push({
      id: 'rule_bolt_cross_pattern',
      type: 'cross_pattern',
      description: '4 只螺栓应按交叉对称顺序紧固（1→3→2→4）',
      affectedParts: bolts,
      priority: 8,
    });
  }

  // 3. 优选安装方向：+z（从上往下放入）
  for (const part of assembly.parts) {
    rules.push({
      id: `rule_dir_${part.id}`,
      type: 'direction_prefer',
      description: `${part.id} 优选沿 +z 方向（重力辅助）安装`,
      affectedParts: [part.id],
      priority: 3,
      preferredDirection: '+z',
    });
  }

  // 4. 工具分组：螺栓紧固工序集中
  if (bolts.length >= 2) {
    rules.push({
      id: 'rule_tool_group_bolts',
      type: 'tool_group',
      description: '螺栓紧固使用扭矩扳手，工序应集中以减少换刀次数',
      affectedParts: bolts,
      priority: 5,
    });
  }

  return rules;
}

// ─────────────────────────────────────────────────
// 约束过滤器
// ─────────────────────────────────────────────────

/**
 * 检查序列是否违反某条规则，返回违规信息（null = 合规）
 */
function checkRule(seq: AssemblySequence, rule: ProcessRule): string | null {
  const order = seq.steps.map(s => s.partId);

  switch (rule.type) {
    case 'prerequisite': {
      const { prerequisitePart, dependentPart } = rule;
      if (!prerequisitePart || !dependentPart) return null;
      const idxPre = order.indexOf(prerequisitePart);
      const idxDep = order.indexOf(dependentPart);
      if (idxPre === -1 || idxDep === -1) return null;
      if (idxPre >= idxDep) {
        return `rule ${rule.id}: ${prerequisitePart} 出现在 ${dependentPart} 之后`;
      }
      return null;
    }

    case 'concurrent_group': {
      // 同组零件的步骤应连续（中间不插入组外零件）
      const groupIds = new Set(rule.affectedParts);
      const groupPositions = order
        .map((id, idx) => (groupIds.has(id) ? idx : -1))
        .filter(idx => idx >= 0);
      if (groupPositions.length < 2) return null;
      const min = Math.min(...groupPositions);
      const max = Math.max(...groupPositions);
      // 检查 [min, max] 区间内是否有非组成员
      for (let i = min; i <= max; i++) {
        if (!groupIds.has(order[i]!)) {
          return `rule ${rule.id}: 螺栓安装被 ${order[i]} 打断，未集中连续安装`;
        }
      }
      return null;
    }

    case 'cross_pattern': {
      // 4 螺栓的"交叉对称"：理想顺序为 bolt_1→bolt_3→bolt_2→bolt_4 或等效
      const bolts = rule.affectedParts;
      if (bolts.length !== 4) return null;
      const positions = bolts.map(b => order.indexOf(b));
      if (positions.some(p => p === -1)) return null;
      // 允许 4 种交叉顺序：(0→2→1→3), (1→3→0→2), (0→3→1→2), (1→2→0→3)
      const crossPatterns = [
        [0, 2, 1, 3], [1, 3, 0, 2], [0, 3, 1, 2], [1, 2, 0, 3],
      ];
      const actualOrder = positions
        .map((p, i) => ({ pos: p, idx: i }))
        .sort((a, b) => a.pos - b.pos)
        .map(x => x.idx);
      const isValid = crossPatterns.some(pattern =>
        pattern.every((v, i) => v === actualOrder[i])
      );
      if (!isValid) {
        return `rule ${rule.id}: 螺栓未按交叉对称顺序紧固`;
      }
      return null;
    }

    case 'direction_prefer':
      // 软约束：仅记录，不强制违规
      return null;

    case 'tool_group':
      // 与 concurrent_group 重叠，此处不再重复检查
      return null;
  }
}

/**
 * 对给定序列运行所有规则检查，更新 violatedRules 并设置 isValid
 */
export function filterByRules(
  seq: AssemblySequence,
  rules: ProcessRule[],
): AssemblySequence {
  const violated: string[] = [];

  for (const rule of rules) {
    const violation = checkRule(seq, rule);
    if (violation) {
      violated.push(rule.id);
    }
  }

  return {
    ...seq,
    isValid: violated.length === 0,
    violatedRules: violated,
  };
}

/**
 * 批量过滤候选序列，返回合规序列列表
 */
export function filterSequences(
  candidates: AssemblySequence[],
  rules: ProcessRule[],
): AssemblySequence[] {
  return candidates
    .map(seq => filterByRules(seq, rules))
    .filter(seq => seq.isValid);
}
