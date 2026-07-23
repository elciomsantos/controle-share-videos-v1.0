import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import customParseFormat from "dayjs/plugin/customParseFormat";
import type { DurationUnitType } from "dayjs/plugin/duration";

dayjs.extend(duration as any);
dayjs.extend(relativeTime as any);
dayjs.extend(customParseFormat as any);

export { dayjs };
export { type DurationUnitType };

export const EPOCH_ZERO = new Date(0);

export function parseRelativeDateToAbsolute(relativeDate: string) {
  if (relativeDate == "never") return EPOCH_ZERO;

  return dayjs()
    .add(
      Number(relativeDate.split("-")[0]),
      relativeDate.split("-")[1] as DurationUnitType,
    )
    .toDate();
}

export function isEpochZero(date: Date | string | number) {
  return dayjs(date).isSame(dayjs(0));
}

type Timespan = {
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
