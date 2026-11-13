/**
 * 数据装载层：遍历 data/**\/*.yaml，解析 YAML 并建立「字段路径 → 行号」索引。
 *
 * 只读，绝不写 data/。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { LineCounter, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import { NODE_TYPE_BY_NAME, type NodeType } from '../../schema/enums.js';
import { displayPath } from './text.js';

/** 一个 YAML 文件要么是节点库，要么是边库 */
export type FileKind = NodeType | 'edges';

export type PathKey = string | number;

const SEP = '\u0000';

/** 单个数组元素（一个节点或一条边） */
export interface SourceItem {
  /** 1-based，在文件里的序号 */
  index: number;
  /** 解析后的 JS 值（未知字段全保留） */
  value: unknown;
  /** 字段路径 → 行号；找不到就退化到最近的祖先 */
  line(path?: readonly PathKey[]): number;
}

export interface LoadedFile {
  absPath: string;
  /** 展示用：相对 cwd */
  relPath: string;
  kind: FileKind;
  items: SourceItem[];
}

export interface LoadFailure {
  relPath: string;
  line: number;
  /** 输出四段式里的「字段」一栏：语法错误没有字段，用 yaml / file 这类占位 */
  locator: string;
  message: string;
}

export interface LoadResult {
  files: LoadedFile[];
  /** 读不了 / YAML 语法错 / 顶层不是数组：由调用方报 V1 */
  failures: LoadFailure[];
  /** 找不到或空的目录，优雅跳过 */
  skipped: string[];
}

/** 递归收集 data/ 下的 yaml；跳过 `_` 开头与 `.` 开头的文件/目录（如 data/_audit） */
export function collectYamlFiles(rootAbs: string): string[] {
  const out: string[] = [];
  const walk = (dirAbs: string): void => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return; // 目录不存在 → 跳过，不崩
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const abs = path.join(dirAbs, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
        out.push(abs);
      }
    }
  };
  walk(rootAbs);
  return out.sort();
}

/**
 * 从相对 data/ 的路径推断文件用途。
 * 优先级：路径里出现 edges 目录 > 路径里出现类型目录 > 文件名（stem）。
 * 认不出来返回 null（调用方报错，而不是瞎猜）。
 */
export function resolveFileKind(relWithinData: string): FileKind | null {
  const parts = relWithinData.split('/').filter(Boolean);
  const stem = (parts.at(-1) ?? '').replace(/\.ya?ml$/i, '');
  const dirs = parts.slice(0, -1);
  if ([...dirs, stem].some((p) => p === 'edges' || p === 'edge')) return 'edges';
  for (const dir of [...dirs].reverse()) {
    const hit = NODE_TYPE_BY_NAME[dir];
    if (hit) return hit;
  }
  return NODE_TYPE_BY_NAME[stem] ?? null;
}

/** 把 YAML AST 里每个字段的位置登记成「路径 → 行号」 */
function indexLines(rootNode: unknown, lc: LineCounter, out: Map<string, number>): void {
  const record = (keys: PathKey[], offset: unknown): void => {
    if (typeof offset !== 'number') return;
    const key = keys.join(SEP);
    if (out.has(key)) return; // 先到先得：字段行优先于容器行
    out.set(key, lc.linePos(offset).line);
  };

  const visit = (node: unknown, keys: PathKey[]): void => {
    if (isMap(node)) {
      for (const pair of node.items) {
        if (!isScalar(pair.key)) continue;
        const childKeys = [...keys, String(pair.key.value)];
        record(childKeys, pair.key.range?.[0]);
        visit(pair.value, childKeys);
      }
    } else if (isSeq(node)) {
      node.items.forEach((item, i) => {
        const childKeys = [...keys, i];
        record(childKeys, (item as { range?: [number, number] } | null)?.range?.[0]);
        visit(item, childKeys);
      });
    }
  };

  visit(rootNode, []);
}

function makeLineLookup(rootNode: unknown, lc: LineCounter): (p?: readonly PathKey[]) => number {
  const lines = new Map<string, number>();
  indexLines(rootNode, lc, lines);
  // 根节点自己（path=[]）的行号 = 第一个 key 的行；空 map 退化到节点起点
  if (rootNode && typeof rootNode === 'object') {
    const node = rootNode as { range?: [number, number]; items?: unknown[] };
    const firstKey = isMap(rootNode) ? rootNode.items[0]?.key : undefined;
    const offset = isScalar(firstKey) ? firstKey.range?.[0] : node.range?.[0];
    if (typeof offset === 'number') lines.set('', lc.linePos(offset).line);
  }

  return (p): number => {
    if (!p || p.length === 0) return lines.get('') ?? 1;
    for (let n = p.length; n >= 0; n--) {
      const hit = lines.get(p.slice(0, n).join(SEP));
      if (hit !== undefined) return hit;
    }
    return lines.get('') ?? 1;
  };
}

/** 读一个 YAML 文件。语法错误不抛异常，转成 failure 让 V1 报告 */
function loadOneFile(absPath: string, cwd: string, rootAbs: string): { file: LoadedFile | null; failure: LoadFailure | null } {
  const relPath = displayPath(absPath, cwd);
  let text: string;
  try {
    text = readFileSync(absPath, 'utf8');
  } catch (err) {
    return { file: null, failure: { relPath, line: 0, locator: 'file', message: `文件不可读：${(err as Error).message}` } };
  }

  const relWithinData = path.relative(rootAbs, absPath).split(path.sep).join('/');
  const kind = resolveFileKind(relWithinData);

  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc });

  if (doc.errors.length > 0) {
    const first = doc.errors[0]!;
    const line = first.linePos?.[0]?.line ?? (typeof first.pos?.[0] === 'number' ? lc.linePos(first.pos[0]).line : 1);
    return { file: null, failure: { relPath, line, locator: 'yaml', message: `YAML 语法错误：${first.message}` } };
  }

  if (kind === null) {
    return {
      file: null,
      failure: {
        relPath,
        line: 1,
        locator: 'file.kind',
        message: '无法从路径推断类型：文件名应为 domains/techniques/tools/artifacts/concepts/formats/attacks/ecosystems/ai，或放在 data/edges/ 下',
      },
    };
  }

  const contents = doc.contents;
  if (contents === null) {
    return { file: { absPath, relPath, kind, items: [] }, failure: null }; // 空文件/仅注释：合法，0 条
  }
  if (!isSeq(contents)) {
    const line = isMap(contents) ? (contents.items[0]?.key?.range?.[0] ?? contents.range?.[0]) : contents.range?.[0];
    return {
      file: null,
      failure: {
        relPath,
        line: typeof line === 'number' ? lc.linePos(line).line : 1,
        locator: 'yaml.root',
        message: `顶层必须是数组（- id: ...），实际是 ${isMap(contents) ? '映射' : '标量'}`,
      },
    };
  }

  const items: SourceItem[] = contents.items.map((node, i) => {
    const lineOf = makeLineLookup(node, lc);
    // YAML 解析出的可能是 Map/Date 等包装对象，统一转成普通 JS 值
    const value: unknown = (node as { toJSON?: () => unknown } | null)?.toJSON?.() ?? node;
    return { index: i + 1, value, line: lineOf };
  });

  return { file: { absPath, relPath, kind, items }, failure: null };
}

/** 装载整棵 data/ 目录 */
export function loadDataDir(dataAbs: string, cwd: string): LoadResult {
  const files: LoadedFile[] = [];
  const failures: LoadFailure[] = [];
  const skipped: string[] = [];

  if (!statDirOk(dataAbs)) {
    skipped.push(displayPath(dataAbs, cwd));
    return { files, failures, skipped };
  }

  for (const abs of collectYamlFiles(dataAbs)) {
    const { file, failure } = loadOneFile(abs, cwd, dataAbs);
    if (file) files.push(file);
    if (failure) failures.push(failure);
  }
  // data/edges、data/tools 目前可能是空目录：显式记录，输出里说明「已跳过」而不是当成错
  for (const sub of ['edges', 'tools']) {
    const abs = path.join(dataAbs, sub);
    if (statDirOk(abs) && collectYamlFiles(abs).length === 0) skipped.push(`${displayPath(abs, cwd)}/（空目录，跳过）`);
  }
  return { files, failures, skipped };
}

function statDirOk(abs: string): boolean {
  try {
    return statSync(abs).isDirectory();
  } catch {
    return false;
  }
}
