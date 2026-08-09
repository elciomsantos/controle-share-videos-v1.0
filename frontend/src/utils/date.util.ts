import {
  dayjs,
  type DurationUnitType,
  EPOCH_ZERO,
  parseRelativeDateToAbsolute,
  isEpochZero,
  type Timespan,
  stringToTimespan,
  timespanToString,
} from "@controle-share/shared";
import useTranslate from "../hooks/useTranslate.hook";

export {
  dayjs,
  type DurationUnitType,
  EPOCH_ZERO,
  parseRelativeDateToAbsolute,
  isEpochZero,
  type Timespan,
  stringToTimespan,
  timespanToString,
};

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
