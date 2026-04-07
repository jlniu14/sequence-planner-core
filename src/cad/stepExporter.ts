/**
 * src/cad/stepExporter.ts
 *
 * 将内部装配体模型导出为 STEP AP214 格式（ISO 10303-21）。
 *
 * 文件结构：
 *   - 全局上下文（单位、精度、应用协议）
 *   - 每个零件：PRODUCT → PRODUCT_DEFINITION → 形状表示（线框几何体）
 *   - 装配结构：NEXT_ASSEMBLY_USAGE_OCCURENCE
 *
 * 几何方案（线框）：
 *   Box      → 12 条 POLYLINE 边（8 顶点连成线框）
 *   Cylinder → 近似为正八棱柱（8 顶点×顶/底各 1 圈 + 8 条侧棱）
 *
 * 生成的 .stp 文件可被 FreeCAD、Rhino、Fusion 360 等工具导入，
 * 显示为线框；装配层级与零件位置与原模型完全对应。
 */

import * as fs from 'fs';
import * as path from 'path';
import { Assembly, AssemblyPart, BoxGeometry, CylinderGeometry, Vec3 } from '../types';

// ─────────────────────────────────────────────────
// STEP 实体计数器
// ─────────────────────────────────────────────────
class StepWriter {
  private lines: string[] = [];
  private counter = 0;

  /** 分配下一个实体 ID，并记录该行 */
  add(entityDef: string): number {
    const id = ++this.counter;
    this.lines.push(`#${id} = ${entityDef};`);
    return id;
  }

  /** 仅分配 ID，不写行（用于事先占位） */
  reserve(): number {
    return ++this.counter;
  }

  /** 补写一个已占位 ID 对应的实体行 */
  write(id: number, entityDef: string): void {
    this.lines.push(`#${id} = ${entityDef};`);
  }

  comment(text: string): void {
    this.lines.push(`/* ${text} */`);
  }

  blank(): void {
    this.lines.push('');
  }

  getDataLines(): string[] {
    return this.lines;
  }
}

// ─────────────────────────────────────────────────
// 辅助函数
// ─────────────────────────────────────────────────

function fmt(n: number): string {
  return Number.isInteger(n) ? `${n}.` : String(n);
}

function pt(p: Vec3): string {
  return `CARTESIAN_POINT('',(${fmt(p.x)},${fmt(p.y)},${fmt(p.z)}))`;
}

function polyline(pts: number[]): string {
  return `POLYLINE('',(${pts.map(id => `#${id}`).join(',')}))`;
}

// ─────────────────────────────────────────────────
// Box 线框几何（12 条边）
// ─────────────────────────────────────────────────

function addBoxWireframe(w: StepWriter, g: BoxGeometry, pos: Vec3): number[] {
  const { x, y, z } = pos;
  const { width: W, height: H, depth: D } = g;

  // 8 顶点
  const v = [
    w.add(pt({ x,     y,     z     })),  // v0
    w.add(pt({ x: x+W, y,     z     })),  // v1
    w.add(pt({ x: x+W, y: y+H, z     })),  // v2
    w.add(pt({ x,     y: y+H, z     })),  // v3
    w.add(pt({ x,     y,     z: z+D })),  // v4
    w.add(pt({ x: x+W, y,     z: z+D })),  // v5
    w.add(pt({ x: x+W, y: y+H, z: z+D })),  // v6
    w.add(pt({ x,     y: y+H, z: z+D })),  // v7
  ];

  // 12 条边（POLYLINE 2 点）
  const edges = [
    // 底面 4 条
    [v[0], v[1]], [v[1], v[2]], [v[2], v[3]], [v[3], v[0]],
    // 顶面 4 条
    [v[4], v[5]], [v[5], v[6]], [v[6], v[7]], [v[7], v[4]],
    // 侧面 4 条
    [v[0], v[4]], [v[1], v[5]], [v[2], v[6]], [v[3], v[7]],
  ];

  return edges.map(([a, b]) => w.add(polyline([a!, b!])));
}

// ─────────────────────────────────────────────────
// Cylinder 线框几何（正八棱柱近似）
// ─────────────────────────────────────────────────

function addCylinderWireframe(w: StepWriter, g: CylinderGeometry, pos: Vec3): number[] {
  const { x: cx, y: cy, z: bz } = pos;
  const { radius: r, height: h } = g;
  const sides = 8;
  const edgeIds: number[] = [];

  const bottomPts: number[] = [];
  const topPts: number[] = [];

  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides;
    const dx = r * Math.cos(angle);
    const dy = r * Math.sin(angle);
    bottomPts.push(w.add(pt({ x: cx + dx, y: cy + dy, z: bz })));
    topPts.push(w.add(pt({ x: cx + dx, y: cy + dy, z: bz + h })));
  }

  // 底圈边
  for (let i = 0; i < sides; i++) {
    edgeIds.push(w.add(polyline([bottomPts[i]!, bottomPts[(i + 1) % sides]!])));
  }
  // 顶圈边
  for (let i = 0; i < sides; i++) {
    edgeIds.push(w.add(polyline([topPts[i]!, topPts[(i + 1) % sides]!])));
  }
  // 侧棱
  for (let i = 0; i < sides; i++) {
    edgeIds.push(w.add(polyline([bottomPts[i]!, topPts[i]!])));
  }

  return edgeIds;
}

// ─────────────────────────────────────────────────
// 主导出函数
// ─────────────────────────────────────────────────

export function exportToStep(assembly: Assembly, outputPath: string): void {
  const w = new StepWriter();

  // ── 全局上下文 ──────────────────────────────────
  w.comment('Global context');
  const idAppCtx    = w.add(`APPLICATION_CONTEXT('core data for automotive mechanical design processes')`);
  const idAppProto  = w.add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2010,#${idAppCtx})`);
  const idLenUnit   = w.add(`( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )`);
  const idAngUnit   = w.add(`( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )`);
  const idSolUnit   = w.add(`( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )`);
  const idUncert    = w.add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.01),#${idLenUnit},'distance_accuracy_value','Confusion accuracy')`);
  const idGeomCtx   = w.add(
    `( GEOMETRIC_REPRESENTATION_CONTEXT(3) ` +
    `GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${idUncert})) ` +
    `GLOBAL_UNIT_ASSIGNED_CONTEXT((#${idLenUnit},#${idAngUnit},#${idSolUnit})) ` +
    `REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY') )`
  );

  // 装配根产品
  w.blank();
  w.comment('Root assembly product');
  const idAsmPCtx  = w.add(`PRODUCT_CONTEXT('',#${idAppCtx},'mechanical')`);
  const idAsmProd  = w.add(`PRODUCT('${assembly.name}','${assembly.name}','',(#${idAsmPCtx}))`);
  const idAsmForm  = w.add(`PRODUCT_DEFINITION_FORMATION('','',#${idAsmProd})`);
  const idAsmPDCtx = w.add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${idAppCtx},'design')`);
  const idAsmPDef  = w.add(`PRODUCT_DEFINITION('design','',#${idAsmForm},#${idAsmPDCtx})`);
  const idAsmPDS   = w.add(`PRODUCT_DEFINITION_SHAPE('','',#${idAsmPDef})`);

  // 装配根形状（仅包含放置轴系）
  const idOrgPt    = w.add(`CARTESIAN_POINT('origin',(0.,0.,0.))`);
  const idDirZ     = w.add(`DIRECTION('z_axis',(0.,0.,1.))`);
  const idDirX     = w.add(`DIRECTION('x_axis',(1.,0.,0.))`);
  const idAsmAx    = w.add(`AXIS2_PLACEMENT_3D('assembly_frame',#${idOrgPt},#${idDirZ},#${idDirX})`);
  const idAsmSR    = w.add(`SHAPE_REPRESENTATION('assembly_shape',(#${idAsmAx}),#${idGeomCtx})`);
  w.add(`SHAPE_DEFINITION_REPRESENTATION(#${idAsmPDS},#${idAsmSR})`);

  // ── 每个零件 ────────────────────────────────────
  const partPDefIds: Record<string, number> = {};

  for (const part of assembly.parts) {
    w.blank();
    w.comment(`Part: ${part.id} — ${part.name}`);

    const idPCtx  = w.add(`PRODUCT_CONTEXT('',#${idAppCtx},'mechanical')`);
    const idProd  = w.add(`PRODUCT('${part.id}','${part.name}','',(#${idPCtx}))`);
    const idForm  = w.add(`PRODUCT_DEFINITION_FORMATION('','',#${idProd})`);
    const idPDCtx = w.add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${idAppCtx},'design')`);
    const idPDef  = w.add(`PRODUCT_DEFINITION('design','',#${idForm},#${idPDCtx})`);
    const idPDS   = w.add(`PRODUCT_DEFINITION_SHAPE('','',#${idPDef})`);

    partPDefIds[part.id] = idPDef;

    // 几何线框
    let edgeIds: number[];
    if (part.geometry.type === 'box') {
      edgeIds = addBoxWireframe(w, part.geometry as BoxGeometry, part.transform.position);
    } else {
      edgeIds = addCylinderWireframe(w, part.geometry as CylinderGeometry, part.transform.position);
    }

    const itemRefs = edgeIds.map(id => `#${id}`).join(',');
    const idGCS = w.add(`GEOMETRIC_CURVE_SET('${part.id}_edges',(${itemRefs}))`);
    const idSR  = w.add(
      `GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION('${part.id}_shape',(#${idGCS}),#${idGeomCtx})`
    );
    w.add(`SHAPE_DEFINITION_REPRESENTATION(#${idPDS},#${idSR})`);

    // NAUO：将零件关联到装配根
    w.add(
      `NEXT_ASSEMBLY_USAGE_OCCURENCE('${part.id}_in_asm','${part.name} occurrence','',` +
      `#${idAsmPDef},#${idPDef},$)`
    );
  }

  // 抑制 TS 的"已声明未使用"警告
  void idAppProto;

  // ── 生成文件 ────────────────────────────────────
  const now = new Date().toISOString().slice(0, 19);
  const header = [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('${assembly.name} — Assembly Sequence Planner Scene'),'2;1');`,
    `FILE_NAME('${path.basename(outputPath)}','${now}',('sequence-planner-core'),(''),`,
    `  'ts-step-gen 1.0','ISO TC184/SC4/WG3 T24 AP214 IS','');`,
    `FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));`,
    'ENDSEC;',
    'DATA;',
  ].join('\n');

  const footer = ['ENDSEC;', 'END-ISO-10303-21;'].join('\n');

  const content = [header, ...w.getDataLines(), footer].join('\n');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');
}
