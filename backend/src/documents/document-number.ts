export function buildDocumentNumber(prefix: string, date: Date, sequence: number): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const serial = String(sequence).padStart(3, "0");

  return `${prefix}-${yyyy}${mm}${dd}-${serial}`;
}

export function parseDocumentNumberSequence(documentNo: string): number | null {
  const match = documentNo.match(/-(\d{3,})$/);
  if (!match) {
    return null;
  }
  const sequence = Number.parseInt(match[1], 10);
  return Number.isFinite(sequence) ? sequence : null;
}
