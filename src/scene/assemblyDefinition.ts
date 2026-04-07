/**
 * src/scene/assemblyDefinition.ts
 *
 * 典型工艺示例：端盖螺栓连接装配体（7 零件）
 *
 * 场景说明：
 *   - housing（箱体）：底部基础件，box 120×80×60 mm，位于原点
 *   - gasket （密封垫片）：放置在箱体顶面，box 120×80×3 mm
 *   - end_cap（端盖）：压在垫片上，box 120×80×20 mm
 *   - bolt_1..4（螺栓×4）：穿过端盖和箱体，cylinder r=5, h=86 mm
 *
 * 零件位置约定：
 *   Box      → position 为 -X/-Y/-Z 角点
 *   Cylinder → position 为底面圆心（-Z 端）
 */

import { Assembly, AssemblyPart } from '../types';

export function getAssembly(): Assembly {
  const parts: AssemblyPart[] = [
    {
      id: 'housing',
      name: '箱体',
      material: 'HT200（灰铸铁）',
      geometry: { type: 'box', width: 120, height: 80, depth: 60 },
      transform: { position: { x: 0, y: 0, z: 0 } },
      assemblyMethod: 'place',
      prerequisites: [],
    },
    {
      id: 'gasket',
      name: '密封垫片',
      material: 'NBR（丁腈橡胶）',
      geometry: { type: 'box', width: 120, height: 80, depth: 3 },
      transform: { position: { x: 0, y: 0, z: 60 } },
      assemblyMethod: 'place',
      prerequisites: ['housing'],
    },
    {
      id: 'end_cap',
      name: '端盖',
      material: 'HT150（灰铸铁）',
      geometry: { type: 'box', width: 120, height: 80, depth: 20 },
      transform: { position: { x: 0, y: 0, z: 63 } },
      assemblyMethod: 'place',
      prerequisites: ['housing', 'gasket'],
    },
    {
      id: 'bolt_1',
      name: '螺栓1（M10×86）',
      material: '45 钢（调质）',
      geometry: { type: 'cylinder', radius: 5, height: 86 },
      transform: { position: { x: 15, y: 15, z: -3 } },
      assemblyMethod: 'bolt_tighten',
      prerequisites: ['housing', 'gasket', 'end_cap'],
    },
    {
      id: 'bolt_2',
      name: '螺栓2（M10×86）',
      material: '45 钢（调质）',
      geometry: { type: 'cylinder', radius: 5, height: 86 },
      transform: { position: { x: 105, y: 15, z: -3 } },
      assemblyMethod: 'bolt_tighten',
      prerequisites: ['housing', 'gasket', 'end_cap'],
    },
    {
      id: 'bolt_3',
      name: '螺栓3（M10×86）',
      material: '45 钢（调质）',
      geometry: { type: 'cylinder', radius: 5, height: 86 },
      transform: { position: { x: 15, y: 65, z: -3 } },
      assemblyMethod: 'bolt_tighten',
      prerequisites: ['housing', 'gasket', 'end_cap'],
    },
    {
      id: 'bolt_4',
      name: '螺栓4（M10×86）',
      material: '45 钢（调质）',
      geometry: { type: 'cylinder', radius: 5, height: 86 },
      transform: { position: { x: 105, y: 65, z: -3 } },
      assemblyMethod: 'bolt_tighten',
      prerequisites: ['housing', 'gasket', 'end_cap'],
    },
  ];

  return {
    name: '端盖螺栓连接装配体',
    description:
      '典型端盖密封螺栓连接结构，含箱体、密封垫片、端盖及 4 只 M10 螺栓，' +
      '用于验证 CAD 模型驱动的装配序列规划全流程。',
    parts,
  };
}
