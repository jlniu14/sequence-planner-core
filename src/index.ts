/**
 * src/index.ts — 装配序列规划核心算法 CLI 主入口
 *
 * 完整流程：
 *   CAD 模型场景 → 几何分析 → 约束过滤 → 序列生成 → 序列评价 → 序列细化 → 工艺文件
 */

import * as path from 'path';
import { getAssembly }                    from './scene/assemblyDefinition';
import { exportToStep }                   from './cad/stepExporter';
import {
  computeAllAABBs,
  buildLiaisonGraph,
  buildInterferenceMatrix,
  summarizeLiaisonGraph,
  freeDirections,
}                                         from './analysis/geometricAnalysis';
import { buildProcessRules, filterSequences } from './constraints/processRules';
import { generateCandidateSequences }     from './planner/sequenceGenerator';
import { rankSequences }                  from './planner/sequenceEvaluator';
import { refineSequence }                 from './refinement/operationRefinement';
import {
  buildProcessDocument,
  writeJsonDocument,
  writeTxtDocument,
}                                         from './refinement/processDocGenerator';

const OUTPUT_DIR = path.resolve(__dirname, '../output');

// ─────────────────────────────────────────────────
// 打印分隔线
// ─────────────────────────────────────────────────
function banner(title: string): void {
  const w = 62;
  console.log('\n' + '═'.repeat(w));
  console.log(`  ${title}`);
  console.log('═'.repeat(w));
}

function section(title: string): void {
  console.log(`\n${'─'.repeat(62)}`);
  console.log(`  【${title}】`);
  console.log('─'.repeat(62));
}

// ─────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────
function main(): void {
  banner('装配序列规划核心算法 CLI  —  完整流程演示');

  // ════════════════════════════════════════════════
  // STEP 1  加载 CAD 场景（装配体定义）
  // ════════════════════════════════════════════════
  section('第一阶段 · 加载 CAD 场景（基本几何体搭建）');

  const assembly = getAssembly();
  console.log(`\n  装配体名称：${assembly.name}`);
  console.log(`  描  述    ：${assembly.description}`);
  console.log(`\n  零件清单（共 ${assembly.parts.length} 件）：`);
  for (const p of assembly.parts) {
    const g = p.geometry;
    const geomStr = g.type === 'box'
      ? `Box ${g.width}×${g.height}×${g.depth} mm`
      : `Cylinder φ${g.radius * 2}×${g.height} mm`;
    console.log(`    · ${p.id.padEnd(10)} ${p.name.padEnd(14)} ${geomStr}`);
  }

  // 导出 STEP 文件
  const stepPath = path.join(OUTPUT_DIR, 'assembly.stp');
  exportToStep(assembly, stepPath);
  console.log(`\n  ✓ STEP AP214 文件已导出 → ${stepPath}`);

  // ════════════════════════════════════════════════
  // STEP 2  几何分析
  // ════════════════════════════════════════════════
  section('第二阶段 · 几何分析（基于装配文件）');

  const aabbMap = computeAllAABBs(assembly);
  console.log('\n  各零件 AABB（轴对齐包围盒）：');
  for (const [id, bb] of aabbMap) {
    console.log(
      `    · ${id.padEnd(10)} ` +
      `min(${fmt3(bb.min)})  max(${fmt3(bb.max)})`,
    );
  }

  const liaison = buildLiaisonGraph(assembly, aabbMap);
  console.log(`\n  接触关系（Liaison Graph，${liaison.contacts.length} 对）：`);
  console.log(summarizeLiaisonGraph(liaison));

  const matrix = buildInterferenceMatrix(assembly, aabbMap);
  console.log('\n  各零件初始自由方向（几何干涉矩阵分析）：');
  for (const part of assembly.parts) {
    const free = freeDirections(part.id, matrix);
    console.log(`    · ${part.id.padEnd(10)} 自由方向：${free.join(', ') || '（无）'}`);
  }

  // ════════════════════════════════════════════════
  // STEP 3  工艺规则约束过滤
  // ════════════════════════════════════════════════
  section('第三阶段 · 工艺规则 & 约束过滤');

  const rules = buildProcessRules(assembly);
  console.log(`\n  共加载 ${rules.length} 条工艺规则：`);
  const uniqueTypes = [...new Set(rules.map(r => r.type))];
  for (const type of uniqueTypes) {
    const count = rules.filter(r => r.type === type).length;
    console.log(`    · ${type.padEnd(20)} ${count} 条`);
  }

  // ════════════════════════════════════════════════
  // STEP 4  序列生成（几何 + 工艺双约束）
  // ════════════════════════════════════════════════
  section('第四阶段 · 序列生成（几何约束 + 工艺规则）');

  const candidates = generateCandidateSequences(assembly, matrix);
  console.log(`\n  几何可行候选序列数：${candidates.length}`);

  const validSequences = filterSequences(candidates, rules);
  console.log(`  工艺规则过滤后有效序列数：${validSequences.length}`);

  if (validSequences.length === 0) {
    console.log('\n  ⚠ 未找到满足所有约束的有效序列，使用评分最高的候选序列。');
  }

  const poolToRank = validSequences.length > 0 ? validSequences : candidates;

  // ════════════════════════════════════════════════
  // STEP 5  序列评价（工艺性为核心指标）
  // ════════════════════════════════════════════════
  section('第五阶段 · 序列评价（工艺性为核心指标）');

  const ranked = rankSequences(poolToRank, assembly, matrix);
  console.log(`\n  候选序列评分排名（前 5）：`);
  const top5 = ranked.slice(0, 5);
  for (const { sequence, score } of top5) {
    console.log(
      `    · ${sequence.id.padEnd(12)} ` +
      `总分 ${String(score.total).padStart(3)}/100  ` +
      `[几何:${score.breakdown.geometricFeasibility}` +
      ` 工艺:${score.breakdown.processCompliance}` +
      ` 可达:${score.breakdown.accessibility}` +
      ` 效率:${score.breakdown.efficiency}` +
      ` 稳定:${score.breakdown.stability}]`,
    );
  }

  const bestEntry = ranked[0];
  if (!bestEntry) {
    console.log('\n  ✖ 无法生成任何有效序列，流程终止。');
    return;
  }
  console.log(`\n  ★ 最优序列：${bestEntry.sequence.id}（${bestEntry.score.total}/100 分）`);
  console.log(`  ${bestEntry.score.comment}`);

  console.log('\n  最优序列装配步骤：');
  for (const step of bestEntry.sequence.steps) {
    console.log(
      `    步骤 ${String(step.stepNumber).padStart(2, '0')}：` +
      `安装 ${step.partName.padEnd(16)} ` +
      `[${step.assemblyMethod}]  方向：${step.installDirection}`,
    );
  }

  // ════════════════════════════════════════════════
  // STEP 6  序列细化（操作描述 + 工艺参数）
  // ════════════════════════════════════════════════
  section('第六阶段 · 序列细化（工艺描述 + 工艺参数）');

  const operations = refineSequence(bestEntry.sequence, assembly);
  console.log(`\n  已生成 ${operations.length} 道细化工序：`);
  for (const op of operations) {
    console.log(`\n  步骤 ${String(op.stepNumber).padStart(2, '0')} ─ ${op.partName}`);
    console.log(`    操作：${op.operationDescription}`);
    console.log(`    工具：${op.tool}   预计工时：${op.estimatedTimeMin} min`);
    console.log(`    参数：${op.parameters.map(p => `${p.name}=${p.value}${p.unit}`).join('  ')}`);
    console.log(`    检验：${op.qualityCheck}`);
    if (op.safetyNote) console.log(`    安全：${op.safetyNote}`);
  }

  // ════════════════════════════════════════════════
  // STEP 7  生成工艺文件
  // ════════════════════════════════════════════════
  section('第七阶段 · 生成工艺文件');

  const doc = buildProcessDocument(
    assembly.name,
    bestEntry.sequence,
    bestEntry.score,
    operations,
  );

  const jsonPath = path.join(OUTPUT_DIR, 'process_document.json');
  const txtPath  = path.join(OUTPUT_DIR, 'process_document.txt');

  writeJsonDocument(doc, jsonPath);
  writeTxtDocument(doc, txtPath);

  console.log(`\n  ✓ JSON 工艺文件 → ${jsonPath}`);
  console.log(`  ✓ TXT  工艺卡片 → ${txtPath}`);

  // ════════════════════════════════════════════════
  // 完成
  // ════════════════════════════════════════════════
  banner('全流程执行完毕  ·  所有输出文件位于 output/ 目录');
}

// ─────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────
function fmt3(v: { x: number; y: number; z: number }): string {
  return `${v.x},${v.y},${v.z}`;
}

main();

