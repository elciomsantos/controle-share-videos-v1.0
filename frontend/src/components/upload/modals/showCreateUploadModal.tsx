import {
  Accordion,
  Alert,
  Button,
  Checkbox,
  Grid,
  Group,
  MultiSelect,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useModals } from "@mantine/modals";
import React, { useState } from "react";
import { TbAlertCircle, TbRefresh } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import useTranslate, {
  translateOutsideContext,
} from "../../../hooks/useTranslate.hook";
import shareService from "../../../services/share.service";
import { FileUpload } from "../../../types/File.type";
import { CreateShare } from "../../../types/share.type";
import {
  stringToTimespan,
  getExpirationPreview,
  dayjs,
  type DurationUnitType,
} from "../../../utils/date.util";
import { showBlockingErrorModal } from "../../core/showBlockingErrorModal";
import toast from "../../../utils/toast.util";
import { Timespan } from "../../../types/timespan.type";

type ModalsContextProps = ReturnType<typeof useModals>;

const showCreateUploadModal = (
  modals: ModalsContextProps,
  options: {
    isUserSignedIn: boolean;
    appUrl: string;
    defaultAppUrl: string;
    allowUnauthenticatedShares: boolean;
    enableEmailRecepients: boolean;
    maxExpiration: Timespan;
    defaultExpiration: Timespan;
    shareIdLength: number;
    simplified: boolean;
    autoGeneratePassword: boolean;
    generatedPasswordLength: number;
  },
  files: FileUpload[],
  uploadCallback: (createShare: CreateShare, files: FileUpload[]) => void,
) => {
  const t = translateOutsideContext();

  if (options.simplified) {
    return modals.openModal({
      title: t("upload.modal.title"),
      children: (
        <SimplifiedCreateUploadModalModal
          options={options}
          files={files}
          uploadCallback={uploadCallback}
        />
      ),
    });
  }

  return modals.openModal({
    title: t("upload.modal.title"),
    children: (
      <CreateUploadModalBody
        options={options}
        files={files}
        uploadCallback={uploadCallback}
      />
    ),
  });
};

const generateShareId = (length: number = 16) => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomArray = new Uint8Array(length >= 3 ? length : 3);
  crypto.getRandomValues(randomArray);
  randomArray.forEach((number) => {
    result += chars[number % chars.length];
  });
  return result;
};

const generateAvailableLink = async (
  shareIdLength: number,
  times: number = 10,
): Promise<string> => {
  if (times <= 0) {
    throw new Error("Could not generate available link");
  }
  const _link = generateShareId(shareIdLength);
  if (!(await shareService.isShareIdAvailable(_link))) {
    return await generateAvailableLink(shareIdLength, times - 1);
  } else {
    return _link;
  }
};

const generateRandomPassword = (length: number = 12) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const randomArray = new Uint8Array(length);
  crypto.getRandomValues(randomArray);
  return Array.from(randomArray)
    .map((b) => chars[b % chars.length])
    .join("");
};

const CreateUploadModalBody = ({
  uploadCallback,
  files,
  options,
}: {
  files: FileUpload[];
  uploadCallback: (createShare: CreateShare, files: FileUpload[]) => void;
  options: {
    isUserSignedIn: boolean;
    appUrl: string;
    defaultAppUrl: string;
    allowUnauthenticatedShares: boolean;
    enableEmailRecepients: boolean;
    maxExpiration: Timespan;
    defaultExpiration: Timespan;
    shareIdLength: number;
    autoGeneratePassword: boolean;
    generatedPasswordLength: number;
  };
}) => {
  const modals = useModals();
  const t = useTranslate();

  const generatedLink = generateShareId(options.shareIdLength);

  const [showNotSignedInAlert, setShowNotSignedInAlert] = useState(true);
  const [emailSearch, setEmailSearch] = useState("");
  const [useManualPassword, setUseManualPassword] = useState(false);

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

  const form = useForm({
    initialValues: {
      name: undefined as string | undefined,
      link: generatedLink,
      recipients: [] as string[],
      password: undefined as string | undefined,
      maxViews: undefined as number | undefined,
      maxDownloads: undefined as number | undefined,
      description: undefined as string | undefined,
      expiration_num: defaultTimespan.value,
      expiration_unit: `-${defaultTimespan.unit}` as string,
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
      files,
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
          {options.maxExpiration.value == 0 && (
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
            {getExpirationPreview(
              {
                neverExpires: t("upload.modal.completed.never-expires"),
                expiresOn: t("upload.modal.completed.expires-on"),
              },
              form,
            )}
          </Text>
          <Accordion multiple defaultValue={["security"]}>
            <Accordion.Item value="description" style={{ borderBottom: "none" }}>
              <Accordion.Control>
                <FormattedMessage id="upload.modal.accordion.name-and-description.title" />
              </Accordion.Control>
              <Accordion.Panel>
                <Stack align="stretch">
                  <TextInput
                    variant="filled"
                    placeholder={t(
                      "upload.modal.accordion.name-and-description.name.placeholder",
                    )}
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
            {options.enableEmailRecepients && (
              <Accordion.Item value="recipients" style={{ borderBottom: "none" }}>
                <Accordion.Control>
                  <FormattedMessage id="upload.modal.accordion.email.title" />
                </Accordion.Control>
                <Accordion.Panel>
                  <TagsInput
                    data={form.values.recipients}
                    placeholder={t("upload.modal.accordion.email.placeholder")}
                    splitChars={[",", ";"]}
                    id="recipient-emails"
                    inputMode="email"
                    {...form.getInputProps("recipients")}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
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
                        setEmailSearch("");
                      } else if (e.key === " ") {
                        e.preventDefault();
                        setEmailSearch("");
                      }
                    }}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}

            <Accordion.Item value="security" style={{ borderBottom: "none" }}>
              <Accordion.Control>
                <FormattedMessage id="upload.modal.accordion.security.title" />
              </Accordion.Control>
              <Accordion.Panel>
                <Stack align="stretch">
                  {!useManualPassword && options.autoGeneratePassword && (
                    <Text size="sm" color="dimmed">
                      <FormattedMessage id="upload.modal.accordion.security.auto-generate.description" />
                    </Text>
                  )}
                  <Checkbox
                    label={t("upload.modal.accordion.security.manual-password.label")}
                    checked={useManualPassword}
                    onChange={(e) => {
                      setUseManualPassword(e.currentTarget.checked);
                      if (!e.currentTarget.checked) {
                        form.setFieldValue("password", undefined);
                      }
                    }}
                  />
                  {useManualPassword && (
                    <Group align="flex-end">
                      <PasswordInput
                        variant="filled"
                        placeholder={t(
                          "upload.modal.accordion.security.password.placeholder",
                        )}
                        label={t("upload.modal.accordion.security.password.label")}
                        autoComplete="new-password"
                        style={{ flex: 1 }}
                        {...form.getInputProps("password")}
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          const pwd = generateRandomPassword(options.generatedPasswordLength);
                          form.setFieldValue("password", pwd);
                        }}
                        mb={2}
                      >
                        <TbRefresh size={16} style={{ marginRight: 4 }} />
                        <FormattedMessage id="upload.modal.accordion.security.generate-password.button" />
                      </Button>
                    </Group>
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
                </Stack>
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

const SimplifiedCreateUploadModalModal = ({
  uploadCallback,
  files,
  options,
}: {
  files: FileUpload[];
  uploadCallback: (createShare: CreateShare, files: FileUpload[]) => void;
  options: {
    isUserSignedIn: boolean;
    allowUnauthenticatedShares: boolean;
    enableEmailRecepients: boolean;
    maxExpiration: Timespan;
    shareIdLength: number;
  };
}) => {
  const modals = useModals();
  const t = useTranslate();

  const [showNotSignedInAlert, setShowNotSignedInAlert] = useState(true);

  const validationSchema = yup.object().shape({
    name: yup
      .string()
      .transform((value) => value || undefined)
      .min(3, t("common.error.too-short", { length: 3 }))
      .max(30, t("common.error.too-long", { length: 30 })),
  });

  const form = useForm({
    initialValues: {
      name: undefined,
      description: undefined,
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
    let link: string | undefined;
    try {
      link = await generateAvailableLink(options.shareIdLength);
    } catch (e: any) {
      const errorCode = e?.response?.data?.error;
      if (errorCode === "idInUse") {
        // should not normally happen — recursive generation would have tried another id
        toast.error(t("upload.modal.link.error.taken"));
        return;
      }
      showBlockingErrorModal(modals, {
        title: t("common.error"),
        description: t("common.error.unknown"),
        actions: [
          {
            label: t("common.button.retry"),
            color: "blue",
            variant: "filled",
            onClick: () => generateAvailableLink(options.shareIdLength),
          },
        ],
      });
      return;
    }

    if (!link) {
      return;
    }

    uploadCallback(
      {
        id: link,
        name: values.name,
        expiration: "never",
        recipients: [],
        description: values.description,
        security: {
          password: undefined,
          maxViews: undefined,
        },
      },
      files,
    );
  });

  return (
    <Stack>
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
          <Stack align="stretch">
            <TextInput
              variant="filled"
              placeholder={t(
                "upload.modal.accordion.name-and-description.name.placeholder",
              )}
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
          <Button type="submit" data-autofocus>
            <FormattedMessage id="common.button.share" />
          </Button>
        </Stack>
      </form>
    </Stack>
  );
};

export default showCreateUploadModal;
