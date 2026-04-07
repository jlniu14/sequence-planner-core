/**
 * src/refinement/processDocGenerator.ts
 *
 * 工艺文件生成器：
 *   - 输出 JSON 格式工艺文件（机器可读）
 *   - 输出 TXT 格式工艺卡片（人工阅读）
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProcessDocument, RefinedOperation, AssemblySequence, SequenceScore } from '../types';

// ─────────────────────────────────────────────────
// 构建 ProcessDocument
// ─────────────────────────────────────────────────

export function buildProcessDocument(
  assemblyName: string,
  sequence: AssemblySequence,
  score: SequenceScore,
  operations: RefinedOperation[],
): ProcessDocument {
  const totalTime = operations.reduce((sum, op) => sum + op.estimatedTimeMin, 0);

  const qualitySummary =
    `综合工艺评分：${score.total}/100 分 — ${score.comment}。` +
    `序列含 ${operations.length} 道工序，` +
    `估计总工时约 ${totalTime} 分钟。`;

  return {
    documentId: `PD-${Date.now()}`,
    createdAt: new Date().toISOString(),
    assemblyName,
    totalSteps: operations.length,
    estimatedTotalTimeMin: totalTime,
    operations,
    qualitySummary,
  };
}

// ─────────────────────────────────────────────────
// 输出 JSON
// ─────────────────────────────────────────────────

export function writeJsonDocument(doc: ProcessDocument, outputPath: string): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(doc, null, 2), 'utf8');
}

// ─────────────────────────────────────────────────
// 输出 TXT 工艺卡片
// ─────────────────────────────────────────────────

function pad(s: string, len: number): string {
  const str = String(s);
  // CJK 字符（常用中文/日文/韩文）按 2 宽计算，其余按 1 宽
  let width = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0) ?? 0;
    const isCJK =
      (cp >= 0x4e00 && cp <= 0x9fff) ||   // CJK Unified Ideographs
      (cp >= 0x3040 && cp <= 0x30ff) ||   // Hiragana / Katakana
      (cp >= 0xac00 && cp <= 0xd7af) ||   // Hangul Syllables
      (cp >= 0xff00 && cp <= 0xffef);     // Fullwidth & Halfwidth Forms
    width += isCJK ? 2 : 1;
  }
  const spaces = Math.max(0, len - width);
  return str + ' '.repeat(spaces);
}

function line(char = '─', len = 70): string { return char.repeat(len); }

export function writeTxtDocument(doc: ProcessDocument, outputPath: string): void {
  const rows: string[] = [];

  rows.push(line('═'));
  rows.push(`  装配工艺规程卡片`);
  rows.push(`  文件编号：${doc.documentId}`);
  rows.push(`  装配体  ：${doc.assemblyName}`);
  rows.push(`  生成时间：${doc.createdAt}`);
  rows.push(`  总工序数：${doc.totalSteps}  步`);
  rows.push(`  估计工时：${doc.estimatedTotalTimeMin}  分钟`);
  rows.push(line('═'));
  rows.push('');
  rows.push(`  【工艺评价】${doc.qualitySummary}`);
  rows.push('');

  for (const op of doc.operations) {
    rows.push(line('─'));
    rows.push(
      `  步骤 ${String(op.stepNumber).padStart(2, '0')}  ${op.partName}` +
      `  [${op.assemblyMethod}]  工具：${op.tool}  工时：${op.estimatedTimeMin} min`,
    );
    rows.push(line('─'));
    rows.push(`  【操作描述】${op.operationDescription}`);
    rows.push('');
    rows.push('  【工艺参数】');
    for (const param of op.parameters) {
      rows.push(`    · ${pad(param.name, 12)}${param.value} ${param.unit}`);
    }
    rows.push('');
    rows.push(`  【质量检验】${op.qualityCheck}`);
    if (op.safetyNote) {
      rows.push(`  【安全注意】${op.safetyNote}`);
    }
    rows.push('');
  }

  rows.push(line('═'));
  rows.push('  （文件由装配序列规划核心算法自动生成）');
  rows.push(line('═'));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, rows.join('\n'), 'utf8');
}
