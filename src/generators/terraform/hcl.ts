/**
 * HCL helpers for Terraform module generation.
 */

/** Escape hatch for unquoted HCL expressions such as `module.x.id`. */
export interface HclRaw {
  raw: string;
}

export type HclValue =
  | string
  | number
  | boolean
  | HclRaw
  | HclValue[]
  | { [key: string]: HclValue }
  | null
  | undefined;

/**
 * Emit a Terraform module block.
 * Pass `{ raw: "module.x.id" }` for unquoted references.
 */
export function renderModuleCall(
  moduleName: string,
  variables: Record<string, HclValue>
): string {
  const source = variables.source;
  if (typeof source !== 'string') {
    throw new Error(`Module "${moduleName}" is missing a string "source"`);
  }

  const lines: string[] = [
    `module "${moduleName}" {`,
    `  source = "${source}"`,
    '',
  ];

  for (const [key, value] of Object.entries(variables)) {
    if (key === 'source') continue;
    lines.push(`  ${key} = ${formatHclValue(value, 1)}`);
  }

  lines.push('}');
  return lines.join('\n');
}

function isRaw(value: object): value is HclRaw {
  return 'raw' in value && typeof (value as HclRaw).raw === 'string';
}

/**
 * Render a JS value as an HCL expression.
 * `depth` is the indentation level of the line the value starts on, so nested
 * maps and lists line up with their parent attribute.
 */
export function formatHclValue(value: HclValue, depth = 0): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return `"${escapeHclString(value)}"`;
  }
  if (Array.isArray(value)) {
    return formatHclList(value, depth);
  }
  if (isRaw(value)) {
    return value.raw;
  }
  return formatHclMap(value, depth);
}

function formatHclList(values: HclValue[], depth: number): string {
  if (values.length === 0) return '[]';

  if (values.every(isScalar)) {
    return `[${values.map((v) => formatHclValue(v, depth)).join(', ')}]`;
  }

  const pad = '  '.repeat(depth + 1);
  const items = values.map((v) => `${pad}${formatHclValue(v, depth + 1)}`);
  return `[\n${items.join(',\n')}\n${'  '.repeat(depth)}]`;
}

function formatHclMap(map: { [key: string]: HclValue }, depth: number): string {
  const entries = Object.entries(map).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '{}';

  const pad = '  '.repeat(depth + 1);
  const lines = entries.map(
    ([key, v]) => `${pad}${quoteKeyIfNeeded(key)} = ${formatHclValue(v, depth + 1)}`
  );
  return `{\n${lines.join('\n')}\n${'  '.repeat(depth)}}`;
}

function isScalar(value: HclValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'object') return isRaw(value);
  return true;
}

/** HCL identifiers are unquoted; anything else needs quoting as an object key. */
function quoteKeyIfNeeded(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : `"${escapeHclString(key)}"`;
}

function escapeHclString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
