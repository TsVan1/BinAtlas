/**
 * 交叉矩阵派生：行 = 子领域，列 = 载体 kind，值 = 覆盖该 kind 的技术数。
 *
 * 为什么不是「技术 × 载体」全表：193 × 12 会是一张没人读得完的表。
 * 按子领域聚合后每个格子回答的是「这个方向的活主要在什么载体上」，
 * 这才是选方向时要看的那个量。
 */
import { artifactKindLabel, artifactKindShort, sortArtifactKinds } from './enums';
import type { AtlasTree } from './tree';
import { techniquesUnder } from './tree';
import type { ArtifactKindTable } from './types';

export interface MatrixUnit {
  /** 行 id：子领域 id；试点领域（无子领域）是顶级领域 id */
  id: string;
  name: string;
  topId: string;
  topName: string;
  /** true = 该领域没有子领域，技术直挂（固件 / 移动 / 恶意分析） */
  flat: boolean;
  techniqueCount: number;
}

export interface MatrixColumn {
  kind: string;
  label: string;
  short: string;
  /** 有多少行在该列上有覆盖，用来判断这个载体是不是主线 */
  coverage: number;
}

export interface MatrixCell {
  count: number;
  /** 覆盖该 kind 的技术名（tooltip 直接显示，避免二次查表） */
  techniques: string[];
}

export interface MatrixModel {
  units: MatrixUnit[];
  columns: MatrixColumn[];
  cells: Map<string, MatrixCell>;
  max: number;
  coveredCells: number;
  totalCells: number;
  /** artifact 节点缺 artifact_kind 的 id：矩阵如实显示「未归类」而不是猜 */
  missingKinds: string[];
}

export const cellKey = (unitId: string, kind: string): string => `${unitId}\u0000${kind}`;

const UNKNOWN_KIND = 'unknown';

export function buildMatrix(tree: AtlasTree, kindTable: ArtifactKindTable): MatrixModel {
  const units: MatrixUnit[] = [];

  for (const root of tree.roots) {
    if (root.children.length === 0) {
      if (root.ownTechniques.length > 0) {
        units.push({
          id: root.node.id,
          name: root.node.name,
          topId: root.node.id,
          topName: root.node.name,
          flat: true,
          techniqueCount: root.ownTechniques.length,
        });
      }
      continue;
    }

    for (const child of root.children) {
      units.push({
        id: child.node.id,
        name: child.node.name,
        topId: root.node.id,
        topName: root.node.name,
        flat: false,
        techniqueCount: techniquesUnder(child).length,
      });
    }
  }

  const cells = new Map<string, MatrixCell>();
  const referencedKinds = new Set<string>();

  for (const root of tree.roots) {
    if (root.children.length === 0) {
      addUnitCells(root.node.id, root.ownTechniques, kindTable, cells, referencedKinds);
      continue;
    }
    for (const child of root.children) {
      addUnitCells(child.node.id, techniquesUnder(child), kindTable, cells, referencedKinds);
    }
  }

  const orderedKinds = sortArtifactKinds(referencedKinds);
  const columns: MatrixColumn[] = orderedKinds.map((kind) => ({
    kind,
    label: kind === UNKNOWN_KIND ? '未归类' : artifactKindLabel(kind),
    short: kind === UNKNOWN_KIND ? '未归类' : artifactKindShort(kind),
    coverage: units.reduce((sum, unit) => sum + ((cells.get(cellKey(unit.id, kind))?.count ?? 0) > 0 ? 1 : 0), 0),
  }));

  let max = 0;
  let coveredCells = 0;
  for (const unit of units) {
    for (const column of columns) {
      const count = cells.get(cellKey(unit.id, column.kind))?.count ?? 0;
      if (count > max) max = count;
      if (count > 0) coveredCells += 1;
    }
  }

  return {
    units,
    columns,
    cells,
    max,
    coveredCells,
    totalCells: units.length * columns.length,
    missingKinds: kindTable.missing,
  };
}

function addUnitCells(
  unitId: string,
  techniques: readonly { artifacts: string[]; name: string }[],
  kindTable: ArtifactKindTable,
  cells: Map<string, MatrixCell>,
  referencedKinds: Set<string>,
): void {
  for (const technique of techniques) {
    const seenKinds = new Set<string>();
    for (const artifactId of technique.artifacts) {
      const kind = kindTable.byId.get(artifactId) ?? UNKNOWN_KIND;
      if (seenKinds.has(kind)) continue;
      seenKinds.add(kind);
      referencedKinds.add(kind);

      const key = cellKey(unitId, kind);
      const cell = cells.get(key);
      if (cell === undefined) cells.set(key, { count: 1, techniques: [technique.name] });
      else {
        cell.count += 1;
        cell.techniques.push(technique.name);
      }
    }
  }
}
