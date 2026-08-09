import {
  Button,
  Checkbox,
  Collapse,
  Divider,
  Flex,
  Group,
  NumberInput,
  PasswordInput,
  Progress,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useModals } from "@mantine/modals";
import { dayjs, isEpochZero } from "../../utils/date.util";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import { translateOutsideContext } from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import { MyShare, UpdateShare } from "../../types/share.type";
import { Timespan } from "../../types/timespan.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import toast from "../../utils/toast.util";
import CopyTextField from "../upload/CopyTextField";
import QRCode from "./QRCode";
import { useState } from "react";

type ModalsContextProps = ReturnType<typeof useModals>;

const showShareInformationsModal = (
  modals: ModalsContextProps,
  share: MyShare,
  maxShareSize: number,
  appUrl: string,
  defaultAppUrl: string,
  maxExpiration?: Timespan,
  onShareUpdated?: (share: MyShare) => void,
  initiallyEditing = false,
) => {
  const t = translateOutsideContext();

  return modals.openModal({
    title: t("account.shares.modal.share-informations"),
    children: (
      <Body
        share={share}
        maxShareSize={maxShareSize}
        appUrl={appUrl}
        defaultAppUrl={defaultAppUrl}
        maxExpiration={maxExpiration}
        onShareUpdated={onShareUpdated}
        initiallyEditing={initiallyEditing}
      />
    ),
  });
};

const Body = ({
  share,
  maxShareSize,
  appUrl,
  defaultAppUrl,
  maxExpiration,
  onShareUpdated,
  initiallyEditing,
}: {
  share: MyShare;
  maxShareSize: number;
  appUrl: string;
  defaultAppUrl: string;
  maxExpiration?: Timespan;
  onShareUpdated?: (share: MyShare) => void;
  initiallyEditing: boolean;
}) => {
  const t = translateOutsideContext();
  const [currentShare, setCurrentShare] = useState(share);
  const [showQR, setShowQR] = useState(false);
  const [isEditing, setIsEditing] = useState(initiallyEditing);

  const handleToggleQR = () => {
    setShowQR(!showQR);
  };

  const link = `${appUrl !== defaultAppUrl ? appUrl : window.location.origin}/share/${currentShare.id}`;

  const resolvedMaxShareSize = maxShareSize;

  const shareSizeRatio =
    resolvedMaxShareSize > 0 ? currentShare.size / resolvedMaxShareSize : 0;

  const formattedShareSize = byteToHumanSizeString(currentShare.size);
  const formattedMaxShareSize = byteToHumanSizeString(resolvedMaxShareSize);
  const shareSizeProgress = shareSizeRatio * 100;

  const formattedCreatedAt = dayjs(currentShare.createdAt).format("LLL");
  const formattedExpiration = isEpochZero(currentShare.expiration)
    ? "Never"
    : dayjs(currentShare.expiration).format("LLL");

  if (isEditing) {
    return (
      <EditShareBody
        share={currentShare}
        maxExpiration={maxExpiration}
        onCancel={() => setIsEditing(false)}
        onShareUpdated={(updatedShare) => {
          setCurrentShare(updatedShare);
          onShareUpdated?.(updatedShare);
          setIsEditing(false);
        }}
      />
    );
  }

  return (
    <Stack align="stretch" gap="md">
      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.id" />:{" "}
        </b>
        {currentShare.id}
      </Text>
      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.name" />:{" "}
        </b>
        {currentShare.name || "-"}
      </Text>

      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.description" />:{" "}
        </b>
        {currentShare.description || "-"}
      </Text>

      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.createdAt" />:{" "}
        </b>
        {formattedCreatedAt}
      </Text>

      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.expiresAt" />:{" "}
        </b>
        {formattedExpiration}
      </Text>
      <Divider />
      <CopyTextField link={link} toggleQR={handleToggleQR} />
      <Collapse expanded={showQR}>
        <QRCode link={link} />
      </Collapse>
      <Divider />
      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.size" />:{" "}
        </b>
        {formattedShareSize} / {formattedMaxShareSize} (
        {shareSizeProgress.toFixed(1)}%)
      </Text>

      <Flex align="center" justify="center">
        {shareSizeRatio < 0.1 && (
          <Text size="xs" style={{ marginRight: "4px" }}>
            {formattedShareSize}
          </Text>
        )}
        <Progress
          value={shareSizeProgress}
          style={{
            width: shareSizeRatio < 0.1 ? "70%" : "80%",
          }}
          size="xl"
          radius="xl"
        >{shareSizeRatio >= 0.1 && <Progress.Section value={shareSizeProgress}><Progress.Label>{formattedShareSize}</Progress.Label></Progress.Section>}</Progress>
        <Text size="xs" style={{ marginLeft: "4px" }}>
          {formattedMaxShareSize}
        </Text>
      </Flex>
      <Button variant="light" onClick={() => setIsEditing(true)}>
        {t("common.button.edit")}
      </Button>
    </Stack>
  );
};

const formatDateTimeLocal = (date: Date) => {
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

export default showShareInformationsModal;
