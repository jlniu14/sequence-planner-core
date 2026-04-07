// ============================================================
// 几何类型 / Geometry Types
// ============================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface AABB {
  min: Vec3;
  max: Vec3;
}

export interface BoxGeometry {
  type: 'box';
  width: number;   // X 尺寸 (mm)
  height: number;  // Y 尺寸 (mm)
  depth: number;   // Z 尺寸 (mm)
}

export interface CylinderGeometry {
  type: 'cylinder';
  radius: number;  // 半径 (mm)
  height: number;  // Z 方向高度 (mm)
}

export type Geometry = BoxGeometry | CylinderGeometry;

export interface Transform {
  position: Vec3;   // 世界坐标系下零件原点（Box：角点；Cylinder：底面圆心）
}

// ============================================================
// 零件与装配体 / Part & Assembly
// ============================================================

export type AssemblyMethod =
  | 'place'          // 放置
  | 'press_fit'      // 压配合
  | 'bolt_tighten'   // 螺栓紧固
  | 'snap_fit'       // 卡扣
  | 'adhesive'       // 粘接
  | 'weld';          // 焊接

export interface AssemblyPart {
  id: string;
  name: string;
  material: string;
  geometry: Geometry;
  transform: Transform;
  assemblyMethod: AssemblyMethod;
  /** 必须在本零件之前安装的零件 ID 列表 */
  prerequisites: string[];
}

export interface Assembly {
  name: string;
  description: string;
  parts: AssemblyPart[];
}

// ============================================================
// 几何分析 / Geometric Analysis
// ============================================================

export type Direction = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
export const DIRECTIONS: Direction[] = ['+x', '-x', '+y', '-y', '+z', '-z'];

export interface ContactInfo {
  partA: string;
  partB: string;
  /** 从 A 指向 B 的接触法向量 */
  contactNormal: Direction;
  contactType: 'face_to_face' | 'coaxial' | 'embedded';
}

export interface LiaisonGraph {
  contacts: ContactInfo[];
}

/** interferenceMatrix[movingId][dir][blockingId] = 1 表示有干涉 */
export type InterferenceMatrix = {
  [movingPartId: string]: {
    [D in Direction]: {
      [blockingPartId: string]: 0 | 1;
    };
  };
};

// ============================================================
// 工艺规则 / Process Rules
// ============================================================

export type RuleType =
  | 'prerequisite'      // A 必须先于 B 安装
  | 'concurrent_group'  // 一组零件应连续安装（如所有螺栓）
  | 'cross_pattern'     // 交叉对称紧固（螺栓/螺母）
  | 'direction_prefer'  // 优选装配方向
  | 'tool_group';       // 同类工具的工序集中

export interface ProcessRule {
  id: string;
  type: RuleType;
  description: string;
  /** 该规则涉及的零件 ID */
  affectedParts: string[];
  priority: number;  // 1–10，越高越重要
  // prerequisite 专用
  prerequisitePart?: string;
  dependentPart?: string;
  // direction_prefer 专用
  preferredDirection?: Direction;
}

// ============================================================
// 序列 / Sequence
// ============================================================

export interface AssemblyStep {
  stepNumber: number;
  partId: string;
  partName: string;
  assemblyMethod: AssemblyMethod;
  /** 安装方向（从哪个方向放入） */
  installDirection: Direction;
}

export interface AssemblySequence {
  id: string;
  steps: AssemblyStep[];
  isValid: boolean;
  /** 被违反的规则 ID */
  violatedRules: string[];
}

// ============================================================
// 评价 / Evaluation
// ============================================================

export interface SequenceScore {
  sequenceId: string;
  total: number;            // 综合得分 0–100
  breakdown: {
    geometricFeasibility: number;  // 几何可行性   (0–25)
    processCompliance: number;     // 工艺符合性   (0–30)
    accessibility: number;         // 可达性       (0–20)
    efficiency: number;            // 装配效率     (0–15)
    stability: number;             // 中间体稳定性  (0–10)
  };
  comment: string;
}

// ============================================================
// 细化 / Refinement
// ============================================================

export type ToolType =
  | 'hand'
  | 'torque_wrench'
  | 'press'
  | 'crane'
  | 'screwdriver'
  | 'rubber_mallet';

export interface ProcessParameter {
  name: string;
  value: number | string;
  unit: string;
}

export interface RefinedOperation {
  stepNumber: number;
  partId: string;
  partName: string;
  operationDescription: string;
  assemblyMethod: AssemblyMethod;
  tool: ToolType;
  parameters: ProcessParameter[];
  qualityCheck: string;
  estimatedTimeMin: number;
  safetyNote?: string;
}

// ============================================================
// 工艺文件 / Process Document
// ============================================================

export interface ProcessDocument {
  documentId: string;
  createdAt: string;
  assemblyName: string;
  totalSteps: number;
  estimatedTotalTimeMin: number;
  operations: RefinedOperation[];
  qualitySummary: string;
}
