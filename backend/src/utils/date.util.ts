import dayjs = require("dayjs");
import duration = require("dayjs/plugin/duration");
import relativeTime = require("dayjs/plugin/relativeTime");
import customParseFormat = require("dayjs/plugin/customParseFormat");

(dayjs as any).extend(duration);
(dayjs as any).extend(relativeTime);
(dayjs as any).extend(customParseFormat);

export const EPOCH_ZERO = new Date(0);

export function parseRelativeDateToAbsolute(relativeDate: string) {
  if (relativeDate == "never") return EPOCH_ZERO;

  return dayjs()
    .add(
      Number(relativeDate.split("-")[0]),
      relativeDate.split("-")[1] as duration.DurationUnitType,
    )
    .toDate();
}

export function isEpochZero(date: Date | string | number) {
  return dayjs(date).isSame(dayjs(0));
}

export { dayjs };

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
