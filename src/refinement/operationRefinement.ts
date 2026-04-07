/**
 * src/refinement/operationRefinement.ts
 *
 * 序列细化模块：
 *   1. 基于工艺描述模板，为每个装配步骤生成详细操作描述
 *   2. 根据零件几何、材料、装配方法，确定具体工艺参数
 *   3. 输出 RefinedOperation 列表供工艺文件生成器使用
 */

import {
  Assembly,
  AssemblyStep,
  AssemblySequence,
  RefinedOperation,
  ProcessParameter,
  ToolType,
  AssemblyMethod,
  AssemblyPart,
  BoxGeometry,
  CylinderGeometry,
} from '../types';

// ─────────────────────────────────────────────────
// 工具选择
// ─────────────────────────────────────────────────

function selectTool(method: AssemblyMethod, part: AssemblyPart): ToolType {
  switch (method) {
    case 'bolt_tighten': return 'torque_wrench';
    case 'press_fit':    return 'press';
    case 'weld':         return 'hand';   // 焊接在此简化为手动操作
    case 'adhesive':     return 'hand';
    case 'snap_fit':     return 'rubber_mallet';
    case 'place': {
      // 体积超过一定阈值用吊车
      let vol = 0;
      if (part.geometry.type === 'box') {
        const g = part.geometry as BoxGeometry;
        vol = g.width * g.height * g.depth;
      } else {
        const g = part.geometry as CylinderGeometry;
        vol = Math.PI * g.radius * g.radius * g.height;
      }
      return vol > 500000 ? 'crane' : 'hand';
    }
  }
}

// ─────────────────────────────────────────────────
// 工艺参数生成
// ─────────────────────────────────────────────────

function generateParameters(
  method: AssemblyMethod,
  part: AssemblyPart,
  step: AssemblyStep,
): ProcessParameter[] {
  const params: ProcessParameter[] = [];

  params.push({ name: '安装方向', value: step.installDirection, unit: '' });

  switch (method) {
    case 'bolt_tighten': {
      // M10 螺栓标准扭矩
      params.push({ name: '紧固扭矩', value: 47, unit: 'N·m' });
      params.push({ name: '紧固方式', value: '交叉对称法（两次紧固）', unit: '' });
      params.push({ name: '螺纹规格', value: 'M10', unit: '' });
      params.push({ name: '润滑剂', value: '机油润滑', unit: '' });
      break;
    }
    case 'press_fit': {
      // 压配合压力估算（简化）
      let diameter = 0;
      if (part.geometry.type === 'cylinder') {
        diameter = (part.geometry as CylinderGeometry).radius * 2;
      }
      params.push({ name: '配合类型', value: 'H7/p6（过盈配合）', unit: '' });
      params.push({ name: '压入力', value: diameter > 20 ? 50 : 20, unit: 'kN' });
      params.push({ name: '压入速度', value: 2, unit: 'mm/s' });
      break;
    }
    case 'place': {
      if (part.geometry.type === 'box') {
        const g = part.geometry as BoxGeometry;
        params.push({ name: '零件尺寸', value: `${g.width}×${g.height}×${g.depth}`, unit: 'mm' });
      } else {
        const g = part.geometry as CylinderGeometry;
        params.push({ name: '零件尺寸', value: `φ${g.radius * 2}×${g.height}`, unit: 'mm' });
      }
      params.push({ name: '定位精度', value: '±0.1', unit: 'mm' });
      break;
    }
    default:
      break;
  }

  return params;
}

// ─────────────────────────────────────────────────
// 操作描述模板
// ─────────────────────────────────────────────────

function generateOperationDescription(
  method: AssemblyMethod,
  part: AssemblyPart,
  step: AssemblyStep,
): string {
  const dir = step.installDirection;
  switch (method) {
    case 'place':
      return `将 ${part.name} 沿 ${dir} 方向放置到位，` +
        `确保与接触面贴合，定位偏差 ≤ 0.1 mm。`;
    case 'bolt_tighten':
      return `将 ${part.name} 穿入螺栓孔，沿 ${dir} 方向插入，` +
        `手工预紧后使用扭矩扳手按交叉对称顺序紧固，扭矩 47 N·m。`;
    case 'press_fit':
      return `将 ${part.name} 与配合孔对中（偏心 ≤ 0.05 mm），` +
        `使用压力机沿 ${dir} 方向匀速压入，压入到位后检查端面齐平。`;
    case 'snap_fit':
      return `将 ${part.name} 对准卡扣位置，沿 ${dir} 方向施力，` +
        `用橡皮锤轻敲至卡扣完全锁定，听到"咔嗒"声确认到位。`;
    case 'adhesive':
      return `清洁 ${part.name} 及接触面（用酒精擦拭），` +
        `均匀涂覆结构胶后沿 ${dir} 方向压合，保压 5 min，固化 24 h。`;
    case 'weld':
      return `将 ${part.name} 定位后点焊固定（3 点），检查位置正确后` +
        `进行全焊，焊缝高度 4 mm，焊后检查变形。`;
  }
}

// ─────────────────────────────────────────────────
// 质量检验要求
// ─────────────────────────────────────────────────

function generateQualityCheck(method: AssemblyMethod, part: AssemblyPart): string {
  switch (method) {
    case 'place':
      return `目视检查 ${part.name} 位置正确，用塞尺检验接触间隙 ≤ 0.05 mm。`;
    case 'bolt_tighten':
      return `用扭矩扳手复查扭矩值 47±2 N·m；检查螺纹露出量 2–3 扣。`;
    case 'press_fit':
      return `用百分表检查压入深度误差 ≤ 0.1 mm；用手感检查配合是否松动。`;
    case 'snap_fit':
      return `用手拉拔检查卡扣锁定力 ≥ 50 N；目视检查无缺口或变形。`;
    case 'adhesive':
      return `24 h 后用切割法检查胶层厚度 0.1–0.3 mm；做剪切强度试样验证。`;
    case 'weld':
      return `外观检查焊缝均匀无气孔；超声波检测焊缝缺陷；测量变形量 ≤ 0.5 mm。`;
  }
}

// ─────────────────────────────────────────────────
// 预计工时（分钟）
// ─────────────────────────────────────────────────

function estimateTime(method: AssemblyMethod, part: AssemblyPart): number {
  const BASE: Record<AssemblyMethod, number> = {
    place: 3, bolt_tighten: 5, press_fit: 10,
    snap_fit: 2, adhesive: 15, weld: 30,
  };
  let t = BASE[method];

  // 大零件额外增加处理时间
  if (part.geometry.type === 'box') {
    const g = part.geometry as BoxGeometry;
    if (g.width * g.height * g.depth > 200000) t += 5;
  }
  return t;
}

// ─────────────────────────────────────────────────
// 安全注意事项
// ─────────────────────────────────────────────────

function safetyNote(method: AssemblyMethod): string | undefined {
  switch (method) {
    case 'press_fit': return '操作者须佩戴护目镜，严禁身体伸入压机工作区域。';
    case 'weld':      return '须在通风良好区域操作，佩戴焊接面罩和防护手套。';
    default:          return undefined;
  }
}

// ─────────────────────────────────────────────────
// 主细化函数
// ─────────────────────────────────────────────────

export function refineSequence(
  sequence: AssemblySequence,
  assembly: Assembly,
): RefinedOperation[] {
  const partMap = new Map<string, AssemblyPart>(assembly.parts.map(p => [p.id, p]));
  const operations: RefinedOperation[] = [];

  for (const step of sequence.steps) {
    const part = partMap.get(step.partId);
    if (!part) continue;

    const method = step.assemblyMethod;
    const tool = selectTool(method, part);

    const note = safetyNote(method);
    const op: RefinedOperation = {
      stepNumber: step.stepNumber,
      partId: part.id,
      partName: part.name,
      operationDescription: generateOperationDescription(method, part, step),
      assemblyMethod: method,
      tool,
      parameters: generateParameters(method, part, step),
      qualityCheck: generateQualityCheck(method, part),
      estimatedTimeMin: estimateTime(method, part),
    };
    if (note !== undefined) op.safetyNote = note;
    operations.push(op);
  }

  return operations;
}
