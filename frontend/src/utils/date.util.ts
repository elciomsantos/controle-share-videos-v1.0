import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import customParseFormat from "dayjs/plugin/customParseFormat";
import localizedFormat from "dayjs/plugin/localizedFormat";
import "dayjs/locale/pt-br";
import type { DurationUnitType } from "dayjs/plugin/duration";
import { Timespan } from "../types/timespan.type";
import useTranslate from "../hooks/useTranslate.hook";

dayjs.extend(duration as any);
dayjs.extend(relativeTime as any);
dayjs.extend(customParseFormat as any);
dayjs.extend(localizedFormat as any);

dayjs.locale("pt-br");

export { dayjs };
export type { DurationUnitType };

type TranslateFn = ReturnType<typeof useTranslate>;

export const getExpirationPreview = (
  t: TranslateFn,
  form: {
    values: {
      never_expires?: boolean;
      expiration_num: number;
      expiration_unit: string;
    };
  },
) => {
  const value = form.values.never_expires
    ? "never"
    : form.values.expiration_num + form.values.expiration_unit;
  if (value === "never") return t("upload.modal.completed.never-expires");

  const expirationDate = dayjs()
    .add(
      parseInt(value.split("-")[0]),
      value.split("-")[1] as DurationUnitType,
    )
    .toDate();

  return t("upload.modal.completed.expires-on", {
    expiration: dayjs(expirationDate).format("LLL"),
  });
};

export const timespanToString = (timespan: Timespan) => {
  return `${timespan.value} ${timespan.unit}`;
};

export const stringToTimespan = (value: string): Timespan => {
  return {
    value: parseInt(value.split(" ")[0]),
    unit: value.split(" ")[1],
  } as Timespan;
};
