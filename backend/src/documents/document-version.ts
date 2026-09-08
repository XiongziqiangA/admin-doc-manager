export function nextVersionNumber(currentVersionCount: number): string {
  return `V${currentVersionCount + 1}.0`;
}
