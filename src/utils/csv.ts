/** Xuất CSV (UTF-8 kèm BOM để Excel mở đúng tiếng Việt) */
export function exportCsv(fileName: string, headers: string[], rows: Array<Array<string | number | null | undefined>>): void {
  const escape = (value: string | number | null | undefined): string => {
    if (value == null) return '';
    const s = String(value);
    if (s.includes(';') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))];
  const content = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
