/** Conversão de uma unidade de tempo da config (timespan) para milissegundos. */
export function unitToMs(unit: string): number {
  switch (unit) {
    case "seconds":
      return 1_000;
    case "minutes":
      return 60_000;
    case "hours":
      return 3_600_000;
    case "days":
      return 86_400_000;
    case "weeks":
      return 7 * 86_400_000;
    case "months":
      return 30 * 86_400_000;
    case "years":
      return 365 * 86_400_000;
    default:
      return 60_000;
  }
}

export function timespanToMs(span: { value: number; unit: string }): number {
  return span.value * unitToMs(span.unit);
}
