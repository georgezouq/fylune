import path from "node:path";

/**
 * Compatibility repairs for workbooks ExcelJS cannot open.
 *
 * Two constructs are valid OOXML, accepted by Excel, and emitted by common writers
 * outside Microsoft's own tooling, yet unreadable by ExcelJS:
 *
 *   1. Namespace-prefixed markup (`<x:workbook>` rather than `<workbook>`), which its
 *      tag-name-matching parser never matches, so the part parses to nothing.
 *   2. Absolute relationship targets (`/xl/tables/table1.xml`), which it resolves as
 *      though they were relative, so the referenced part is never found.
 *
 * Both are rewritten in memory only. The file on disk is untouched until a save, and a
 * save writes ordinary unprefixed OOXML with relative targets, which Excel reads.
 */

const SPREADSHEET_NAMESPACE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

/**
 * Rewrites prefixed spreadsheetml markup into the default namespace. Returns null when
 * the part is already unprefixed, so callers can tell a repair from a no-op.
 */
export function stripNamespacePrefix(xml, namespace = SPREADSHEET_NAMESPACE) {
  if (typeof xml !== "string" || !xml) return null;
  const declaration = new RegExp(`xmlns:([A-Za-z_][\\w.-]*)="${namespace}"`).exec(xml);
  if (!declaration) return null;
  const prefix = declaration[1];
  // `r` belongs to the relationships namespace, which ExcelJS reads by prefix.
  if (prefix === "r" || !xml.includes(`<${prefix}:`)) return null;
  return xml
    .replaceAll(`<${prefix}:`, "<")
    .replaceAll(`</${prefix}:`, "</")
    .replace(new RegExp(`xmlns:${prefix}="${namespace}"`, "g"), `xmlns="${namespace}"`)
    .replace(new RegExp(`\\s${prefix}:([A-Za-z][\\w.-]*)=`, "g"), " $1=");
}

/**
 * Rewrites absolute relationship targets as paths relative to the part that owns the
 * rels file. `xl/worksheets/_rels/sheet1.xml.rels` owns `xl/worksheets/sheet1.xml`, so
 * `/xl/tables/table1.xml` becomes `../tables/table1.xml`.
 */
export function relativizeRelationshipTargets(xml, relsPath) {
  if (typeof xml !== "string" || !xml.includes('Target="/')) return null;
  const ownerDirectory = path.posix.dirname(path.posix.dirname(relsPath));
  const base = ownerDirectory === "." ? "" : ownerDirectory;
  return xml.replace(/Target="\/([^"]*)"/g, (whole, target) => {
    const relative = path.posix.relative(base, target);
    return relative ? `Target="${relative}"` : whole;
  });
}

/**
 * Applies both repairs across a workbook package. Returns null when nothing needed
 * changing, so the caller can skip a pointless rezip.
 */
export async function normalizeWorkbookPackage(buffer) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  let repaired = false;

  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    if (name.endsWith(".rels")) {
      const next = relativizeRelationshipTargets(await entry.async("string"), name);
      if (next) {
        zip.file(name, next);
        repaired = true;
      }
      continue;
    }
    if (!name.endsWith(".xml")) continue;
    const next = stripNamespacePrefix(await entry.async("string"));
    if (next) {
      zip.file(name, next);
      repaired = true;
    }
  }

  if (!repaired) return null;
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/**
 * Loads a workbook, repairing the package only if the direct read fails. The happy path
 * stays a plain ExcelJS load with no rezip cost.
 */
export async function loadWorkbookBuffer(workbook, buffer) {
  try {
    await workbook.xlsx.load(buffer);
    return { repaired: false };
  } catch (error) {
    const normalized = await normalizeWorkbookPackage(buffer).catch(() => null);
    if (!normalized) throw error;
    await workbook.xlsx.load(normalized);
    return { repaired: true };
  }
}
