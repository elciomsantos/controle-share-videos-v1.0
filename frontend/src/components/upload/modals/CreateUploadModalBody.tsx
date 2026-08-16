import {
  Accordion,
  Alert,
  Button,
  Group,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useModals } from "@mantine/modals";
import React, { useState } from "react";
import { TbAlertCircle } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import useTranslate from "../../../hooks/useTranslate.hook";
import shareService from "../../../services/share.service";
import { FileUpload } from "../../../types/File.type";
import { CreateShare } from "../../../types/share.type";
import { dayjs, type DurationUnitType } from "../../../utils/date.util";
import { showBlockingErrorModal } from "../../core/showBlockingErrorModal";
import { generateShareId } from "../../../utils/shareId.util";
import { Timespan } from "../../../types/timespan.type";
import type { CreateUploadFormValues } from "./CreateUploadForm";
import ExpirationFields from "./sections/ExpirationFields";
import FileDescriptionFields from "./sections/FileDescriptionFields";
import RecipientsField from "./sections/RecipientsField";
import SecurityFields from "./sections/SecurityFields";

export type CreateUploadModalOptions = {
  isUserSignedIn: boolean;
  appUrl: string;
  defaultAppUrl: string;
  enableEmailRecepients: boolean;
  maxExpiration: Timespan;
  defaultExpiration: Timespan;
  shareIdLength: number;
  simplified: boolean;
  autoGeneratePassword: boolean;
  generatedPasswordLength: number;
};

const CreateUploadModalBody = ({
  uploadCallback,
  files,
  options,
}: {
  files: FileUpload[];
  uploadCallback: (createShare: CreateShare, files: FileUpload[]) => void;
  options: CreateUploadModalOptions;
}) => {
  const modals = useModals();
  const t = useTranslate();

  const generatedLink = generateShareId(options.shareIdLength);

  const [showNotSignedInAlert, setShowNotSignedInAlert] = useState(true);
  const [fileDescriptions, setFileDescriptions] = useState<Record<number, string>>({});

  const validationSchema = yup.object().shape({
    link: yup
      .string()
      .required(t("common.error.field-required"))
      .min(3, t("common.error.too-short", { length: 3 }))
      .max(50, t("common.error.too-long", { length: 50 }))
      .matches(new RegExp("^[a-zA-Z0-9_-]*$"), {
        message: t("upload.modal.link.error.invalid"),
      }),
    name: yup
      .string()
      .transform((value) => value || undefined)
      .min(3, t("common.error.too-short", { length: 3 }))
      .max(30, t("common.error.too-long", { length: 30 })),
    password: yup
      .string()
      .transform((value) => value || undefined)
      .min(3, t("common.error.too-short", { length: 3 }))
      .max(30, t("common.error.too-long", { length: 30 })),
    maxViews: yup
      .number()
      .transform((value) => value || undefined)
      .min(1),
  });

  const defaultTimespan = options.defaultExpiration
    ? options.defaultExpiration
    : { value: 7, unit: "days" };

  const form = useForm<CreateUploadFormValues>({
    initialValues: {
      name: undefined,
      link: generatedLink,
      recipients: [],
      password: undefined,
      maxViews: undefined,
      maxDownloads: undefined,
      description: undefined,
      expiration_num: defaultTimespan.value,
      expiration_unit: `-${defaultTimespan.unit}`,
      never_expires: false,
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

  const handleRecipientsKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      e.preventDefault();
      const inputValue = (e.currentTarget.value || "").trim();
      if (
        inputValue.match(/^\S+@\S+\.\S+$/) &&
        !form.values.recipients.includes(inputValue)
      ) {
        form.setFieldValue("recipients", [
          ...form.values.recipients,
          inputValue,
        ]);
      }
    } else if (e.key === " ") {
      e.preventDefault();
    }
  };

  const onSubmit = form.onSubmit(async (values) => {
    let isAvailable: boolean;
    try {
      isAvailable = await shareService.isShareIdAvailable(values.link);
    } catch (e: any) {
      showBlockingErrorModal(modals, {
        title: t("common.error"),
        description: t("common.error.unknown"),
        actions: [
          {
            label: t("common.button.retry"),
            color: "blue",
            variant: "filled",
            onClick: async () => {
              await shareService.isShareIdAvailable(values.link);
            },
          },
        ],
      });
      return;
    }

    if (!isAvailable) {
      form.setFieldError("link", t("upload.modal.link.error.taken"));
      return;
    }

    const expirationString = form.values.never_expires
      ? "never"
      : form.values.expiration_num + form.values.expiration_unit;

    const expirationDate = dayjs().add(
      form.values.expiration_num,
      form.values.expiration_unit.replace(
        "-",
        "",
      ) as DurationUnitType,
    );

    if (
      options.maxExpiration.value != 0 &&
      (form.values.never_expires ||
        expirationDate.isAfter(
          dayjs().add(
            options.maxExpiration.value,
            options.maxExpiration.unit,
          ),
        ))
    ) {
      form.setFieldError(
        "expiration_num",
        t("upload.modal.expires.error.too-long", {
          max: dayjs
            .duration(options.maxExpiration.value, options.maxExpiration.unit)
            .humanize(),
        }),
      );
      return;
    }

    uploadCallback(
      {
        id: values.link,
        name: values.name,
        expiration: expirationString,
        recipients: values.recipients,
        description: values.description,
        security: {
          password: values.password || undefined,
          maxViews: values.maxViews || undefined,
          maxDownloads: values.maxDownloads || undefined,
        },
      },
      files.map((file, index) => ({
        ...file,
        description: fileDescriptions[index] || undefined,
      })),
    );
  });

  return (
    <>
      {showNotSignedInAlert && !options.isUserSignedIn && (
        <Alert
          withCloseButton
          onClose={() => setShowNotSignedInAlert(false)}
          icon={<TbAlertCircle size={16} />}
          title={t("upload.modal.not-signed-in")}
          color="yellow"
        >
          <FormattedMessage id="upload.modal.not-signed-in-description" />
        </Alert>
      )}
      <form onSubmit={onSubmit}>
        <Stack align="stretch">
          <Group align={form.errors.link ? "center" : "flex-end"}>
            <TextInput
              style={{ flex: "1" }}
              variant="filled"
              label={t("upload.modal.link.label")}
              placeholder="myAwesomeShare"
              {...form.getInputProps("link")}
            />
            <Button
              style={{ flex: "0 0 auto" }}
              variant="outline"
              onClick={() =>
                form.setFieldValue(
                  "link",
                  generateShareId(options.shareIdLength),
                )
              }
            >
              <FormattedMessage id="common.button.generate" />
            </Button>
          </Group>

          <Text
            truncate
            fs="italic"
            size="xs"
            style={{ color: "var(--mantine-color-gray-6)" }}
          >
            {`${options.appUrl !== options.defaultAppUrl ? options.appUrl : window.location.origin}/share/${form.values.link}`}
          </Text>
          <ExpirationFields
            form={form}
            maxExpiration={options.maxExpiration}
          />
          <Accordion multiple defaultValue={["security"]}>
            <Accordion.Item value="description" style={{ borderBottom: "none" }}>
              <Accordion.Control>
                <FormattedMessage id="upload.modal.accordion.name-and-description.title" />
              </Accordion.Control>
              <Accordion.Panel>
                <Stack align="stretch">
                  <TextInput
                    variant="filled"
                    placeholder="Descrição do compartilhamento"
                    {...form.getInputProps("name")}
                  />
                  <Textarea
                    variant="filled"
                    placeholder={t(
                      "upload.modal.accordion.name-and-description.description.placeholder",
                    )}
                    {...form.getInputProps("description")}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
            {files.length > 0 && (
              <Accordion.Item value="file-descriptions" style={{ borderBottom: "none" }}>
                <Accordion.Control>
                  <FormattedMessage id="upload.modal.accordion.file-descriptions.title" />
                </Accordion.Control>
                <Accordion.Panel>
                  <FileDescriptionFields
                    files={files}
                    fileDescriptions={fileDescriptions}
                    onFileDescriptionChange={(index, value) => {
                      setFileDescriptions((prev) => ({
                        ...prev,
                        [index]: value,
                      }));
                    }}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}
            {options.enableEmailRecepients && (
              <Accordion.Item value="recipients" style={{ borderBottom: "none" }}>
                <Accordion.Control>
                  <FormattedMessage id="upload.modal.accordion.email.title" />
                </Accordion.Control>
                <Accordion.Panel>
                  <RecipientsField
                    form={form}
                    onKeyDown={handleRecipientsKeyDown}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}

            <Accordion.Item value="security" style={{ borderBottom: "none" }}>
              <Accordion.Control>
                <FormattedMessage id="upload.modal.accordion.security.title" />
              </Accordion.Control>
              <Accordion.Panel>
                <SecurityFields
                  form={form}
                  autoGeneratePassword={options.autoGeneratePassword}
                  generatedPasswordLength={options.generatedPasswordLength}
                />
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
          <Button type="submit" data-autofocus>
            <FormattedMessage id="common.button.share" />
          </Button>
        </Stack>
      </form>
    </>
  );
};

export default CreateUploadModalBody;