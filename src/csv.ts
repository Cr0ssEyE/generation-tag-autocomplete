import Papa from "papaparse";
import { tagKey, type Row } from "./model.ts";
export interface ImportReport {
  total: number;
  valid: number;
  skipped: number;
  duplicates: number;
  errors: Record<string, number>;
  locations: { record: number; reason: string }[];
}
export function parseCSV(text: string, progress?: (n: number) => void) {
  const rows: Row[] = [],
    seen = new Set<string>();
  const report: ImportReport = {
    total: 0,
    valid: 0,
    skipped: 0,
    duplicates: 0,
    errors: {},
    locations: [],
  };
  let first = true;
  const fail = (reason: string) => {
    report.skipped++;
    report.errors[reason] = (report.errors[reason] || 0) + 1;
    if (report.locations.length < 20)
      report.locations.push({ record: report.total, reason });
  };
  Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    delimiter: ",",
    skipEmptyLines: false,
    step(result) {
      if (result.errors.some((e) => e.type === "Quotes"))
        throw new Error("따옴표 형식 오류: 기존 사전을 보존했습니다.");
      const cells = result.data;
      if (cells.length === 1 && !cells[0].trim()) return;
      if (first) {
        first = false;
        const header = cells.map((x) => x.trim().toLowerCase()).join(",");
        if (
          [
            "태그,유형코드,태그카운트,설명",
            "tag,category,count,description",
          ].includes(header)
        )
          return;
      }
      report.total++;
      if (report.total % 2000 === 0) progress?.(report.total);
      if (cells.length !== 4) {
        fail("열 수");
        return;
      }
      const [tag, category, count, description] = cells;
      if (!tag.trim() || /[,\r\n]/.test(tag)) {
        fail("태그 형식");
        return;
      }
      const integer = (value: string) =>
        /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value));
      if (!integer(category) || !integer(count)) {
        fail("유형/카운트 정수");
        return;
      }
      const key = tagKey(tag);
      if (seen.has(key)) {
        report.duplicates++;
        return;
      }
      seen.add(key);
      rows.push({
        tag,
        category: Number(category),
        count: Number(count),
        description,
      });
    },
  });
  if (!rows.length)
    throw new Error("유효한 태그가 없습니다. 기존 사전을 보존했습니다.");
  report.valid = rows.length;
  return { rows, report };
}
