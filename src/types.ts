/**
 * 零件（Part）
 */
export interface Part {
  id: string;
  name: string;
}

/**
 * 六个拆卸方向
 */
export type Direction = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export const DIRECTIONS: Direction[] = ['+x', '-x', '+y', '-y', '+z', '-z'];

/**
 * 干涉矩阵条目
 *
 * interferenceMatrix[movingPartId][direction][blockingPartId] = 1 表示
 * movingPartId 沿 direction 方向移动时，会被 blockingPartId 阻挡。
 */
export type InterferenceMatrix = {
  [movingPartId: string]: {
    [D in Direction]: {
      [blockingPartId: string]: 0 | 1;
    };
  };
};
