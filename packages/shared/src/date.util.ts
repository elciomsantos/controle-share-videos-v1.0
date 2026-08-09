import dayjs from "dayjs";
import type { PluginFunc } from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import customParseFormat from "dayjs/plugin/customParseFormat";
import localizedFormat from "dayjs/plugin/localizedFormat";
import "dayjs/locale/pt-br";
import type { DurationUnitType } from "dayjs/plugin/duration";

dayjs.extend(duration as PluginFunc);
dayjs.extend(relativeTime as PluginFunc);
dayjs.extend(customParseFormat as PluginFunc);
dayjs.extend(localizedFormat as PluginFunc);
dayjs.locale("pt-br");

export { dayjs };
export { type DurationUnitType };

export const EPOCH_ZERO = new Date(0);

export function parseRelativeDateToAbsolute(relativeDate: string): Date | null {
  if (relativeDate == "never") return null;

  return dayjs()
    .add(
      Number(relativeDate.split("-")[0]),
      relativeDate.split("-")[1] as DurationUnitType,
    )
    .toDate();
}

/**
 * Returns true when the date represents "never expires". After BDB-05, the
 * canonical sentinel is `null` in the database; the legacy `EPOCH_ZERO`
 * (`new Date(0)`) is kept for backwards compatibility with migrations and
 * any rows that still use it.
 */
export function isEpochZero(date: Date | string | number | null | undefined) {
  if (date === null || date === undefined) return true;
  return dayjs(date).isSame(dayjs(0));
}

export type Timespan = {
  value: number;
  unit: "minutes" | "hours" | "days" | "weeks" | "months" | "years";
};

export function stringToTimespan(value: string): Timespan {
  const [time, unit] = value.split(" ");
  return {
    value: parseInt(time),
    unit: unit as Timespan["unit"],
  };
}

export function timespanToString(timespan: Timespan) {
  return `${timespan.value} ${timespan.unit}`;
}
