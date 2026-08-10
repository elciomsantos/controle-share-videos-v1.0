import {
  Button,
  Checkbox,
  Divider,
  Group,
  NumberInput,
  PasswordInput,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { dayjs, isEpochZero } from "../../utils/date.util";
import * as yup from "yup";
import { translateOutsideContext } from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import { MyShare, UpdateShare } from "../../types/share.type";
import { Timespan } from "../../types/timespan.type";
import toast from "../../utils/toast.util";
import { useState } from "react";

const formatDateTimeLocal = (date: Date): string => {
  return dayjs(date).format("YYYY-MM-DDTHH:mm");
};

const EditShareBody = ({
  share,
  maxExpiration,
  onCancel,
  onShareUpdated,
}: {
  share: MyShare;
  maxExpiration?: Timespan;
  onCancel: () => void;
  onShareUpdated: (share: MyShare) => void;
}) => {
  const t = translateOutsideContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isPermanentShare = isEpochZero(share.expiration);
  const security = share.security ?? {
    passwordProtected: false,
    maxViews: undefined,
    maxDownloads: undefined,
  };

  const validationSchema = yup.object().shape({
    name: yup
      .string()
      .transform((value) => value || undefined)
      .min(3, t("common.error.too-short", { length: 3 }))
      .max(30, t("common.error.too-long", { length: 30 })),
    description: yup
      .string()
      .transform((value) => value || undefined)
      .max(512, t("common.error.too-long", { length: 512 })),
    password: yup
      .string()
      .transform((value) => value || undefined)
      .min(3, t("common.error.too-short", { length: 3 }))
      .max(30, t("common.error.too-long", { length: 30 })),
    maxViews: yup
      .number()
      .nullable()
      .transform((value) => value || undefined)
      .min(1, t("common.error.number-too-small", { min: 1 })),
  });

  const form = useForm({
    initialValues: {
      name: share.name || "",
      description: share.description || "",
      expiration: isPermanentShare
        ? formatDateTimeLocal(dayjs().add(1, "day").toDate())
        : formatDateTimeLocal(share.expiration),
      never_expires: isPermanentShare,
      password: "",
      removePassword: false,
      maxViews: security.maxViews || undefined,
      maxDownloads: security.maxDownloads || undefined,
    },
    validate: (values) => {
      try {
        validationSchema.validateSync(values, { abortEarly: false });
        return {};
      } catch (err: any) {
        const errors: Record<string, string> = {};
        err.inner?.forEach((e: any) => {
          if (e.path) errors[e.path] = e.message;
        });
        return errors;
      }
    },
  });

  const onSubmit = form.onSubmit(async (values) => {
    const expirationDate = dayjs(values.expiration);

    if (!values.never_expires && !expirationDate.isValid()) {
      form.setFieldError("expiration", t("common.error.field-required"));
      return;
    }

    if (
      !values.never_expires &&
      maxExpiration &&
      maxExpiration.value !== 0 &&
      expirationDate.isAfter(
        dayjs().add(maxExpiration.value, maxExpiration.unit),
      )
    ) {
      form.setFieldError(
        "expiration",
        t("upload.modal.expires.error.too-long", {
          max: dayjs
            .duration(maxExpiration.value, maxExpiration.unit)
            .humanize(),
        }),
      );
      return;
    }

    const updateShare: UpdateShare = {
      name: values.name || null,
      description: values.description || null,
      expiration: values.never_expires ? "never" : expirationDate.toISOString(),
      security: {
        password: values.password || undefined,
        removePassword: values.removePassword,
        maxViews: values.maxViews ?? undefined,
        maxDownloads: values.maxDownloads ?? undefined,
      },
    };

    setIsSubmitting(true);
    try {
      const updatedShare = await shareService.update(share.id, updateShare);
      toast.success(t("share.edit.notify.save-success"));
      onShareUpdated(updatedShare);
    } catch (e) {
      toast.axiosError(e);
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <form onSubmit={onSubmit}>
      <Stack align="stretch">
        <TextInput
          variant="filled"
          label={t("account.shares.table.name")}
          placeholder={t(
            "upload.modal.accordion.name-and-description.name.placeholder",
          )}
          {...form.getInputProps("name")}
        />
        <Textarea
          variant="filled"
          label={t("account.shares.table.description")}
          placeholder={t(
            "upload.modal.accordion.name-and-description.description.placeholder",
          )}
          {...form.getInputProps("description")}
        />
        <TextInput
          variant="filled"
          type="datetime-local"
          label={t("account.shares.table.expiresAt")}
          disabled={form.values.never_expires}
          {...form.getInputProps("expiration")}
        />
        {(!maxExpiration || maxExpiration.value === 0) && (
          <Checkbox
            label={t("upload.modal.expires.never-long")}
            {...form.getInputProps("never_expires", { type: "checkbox" })}
          />
        )}
        <Divider />
        <PasswordInput
          variant="filled"
          label={t("upload.modal.accordion.security.password.label")}
          placeholder={
            security.passwordProtected
              ? t("account.shares.modal.edit.password.keep")
              : t("upload.modal.accordion.security.password.placeholder")
          }
          autoComplete="new-password"
          disabled={form.values.removePassword}
          {...form.getInputProps("password")}
        />
        {security.passwordProtected && (
          <Checkbox
            label={t("account.shares.modal.edit.password.remove")}
            {...form.getInputProps("removePassword", { type: "checkbox" })}
          />
        )}
        <NumberInput
          min={1}
          variant="filled"
          placeholder={t(
            "upload.modal.accordion.security.max-views.placeholder",
          )}
          label={t("upload.modal.accordion.security.max-views.label")}
          {...form.getInputProps("maxViews")}
        />
        <NumberInput
          min={0}
          variant="filled"
          placeholder={t(
            "upload.modal.accordion.security.max-downloads.placeholder",
          )}
          label={t("upload.modal.accordion.security.max-downloads.label")}
          {...form.getInputProps("maxDownloads")}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel}>
            {t("common.button.cancel")}
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {t("common.button.save")}
          </Button>
        </Group>
      </Stack>
    </form>
  );
};

export default EditShareBody;