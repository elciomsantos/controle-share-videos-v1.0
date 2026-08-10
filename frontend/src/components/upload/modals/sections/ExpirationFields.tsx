import { Grid, NumberInput, Select, Text, Checkbox } from "@mantine/core";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../../../hooks/useTranslate.hook";
import { getExpirationPreview, dayjs } from "../../../../utils/date.util";
import { Timespan } from "../../../../types/timespan.type";
import type { CreateUploadForm } from "../CreateUploadForm";

const ExpirationFields = ({
  form,
  maxExpiration,
}: {
  form: CreateUploadForm;
  maxExpiration: Timespan;
}) => {
  const t = useTranslate();

  return (
    <>
      <Grid align={form.errors.expiration_num ? "center" : "flex-end"}>
        <Grid.Col span={6}>
          <NumberInput
            min={1}
            max={99999}

            variant="filled"
            label={t("upload.modal.expires.label")}
            disabled={form.values.never_expires}
            {...form.getInputProps("expiration_num")}
          />
        </Grid.Col>
        <Grid.Col span={6}>
          <Select
            disabled={form.values.never_expires}
            {...form.getInputProps("expiration_unit")}
            data={[
              {
                value: "-minutes",
                label:
                  form.values.expiration_num == 1
                    ? t("upload.modal.expires.minute-singular")
                    : t("upload.modal.expires.minute-plural"),
              },
              {
                value: "-hours",
                label:
                  form.values.expiration_num == 1
                    ? t("upload.modal.expires.hour-singular")
                    : t("upload.modal.expires.hour-plural"),
              },
              {
                value: "-days",
                label:
                  form.values.expiration_num == 1
                    ? t("upload.modal.expires.day-singular")
                    : t("upload.modal.expires.day-plural"),
              },
              {
                value: "-weeks",
                label:
                  form.values.expiration_num == 1
                    ? t("upload.modal.expires.week-singular")
                    : t("upload.modal.expires.week-plural"),
              },
              {
                value: "-months",
                label:
                  form.values.expiration_num == 1
                    ? t("upload.modal.expires.month-singular")
                    : t("upload.modal.expires.month-plural"),
              },
              {
                value: "-years",
                label:
                  form.values.expiration_num == 1
                    ? t("upload.modal.expires.year-singular")
                    : t("upload.modal.expires.year-plural"),
              },
            ]}
          />
        </Grid.Col>
      </Grid>
      {maxExpiration.value == 0 && (
        <Checkbox
          label={t("upload.modal.expires.never-long")}
          {...form.getInputProps("never_expires")}
        />
      )}
      <Text
        fs="italic"
        size="xs"
        style={{ color: "var(--mantine-color-gray-6)" }}
      >
        {getExpirationPreview(t, form)}
      </Text>
    </>
  );
};

export default ExpirationFields;