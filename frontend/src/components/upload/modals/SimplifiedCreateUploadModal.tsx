import {
  Alert,
  Button,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useModals } from "@mantine/modals";
import { useState } from "react";
import { TbAlertCircle } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import useTranslate from "../../../hooks/useTranslate.hook";
import { FileUpload } from "../../../types/File.type";
import { CreateShare } from "../../../types/share.type";
import { showBlockingErrorModal } from "../../core/showBlockingErrorModal";
import toast from "../../../utils/toast.util";
import { generateAvailableLink } from "../../../utils/shareId.util";
import { Timespan } from "../../../types/timespan.type";
import FileDescriptionFields from "./sections/FileDescriptionFields";

const SimplifiedCreateUploadModal = ({
  uploadCallback,
  files,
  options,
}: {
  files: FileUpload[];
  uploadCallback: (createShare: CreateShare, files: FileUpload[]) => void;
  options: {
    isUserSignedIn: boolean;
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

  const [fileDescriptions, setFileDescriptions] = useState<Record<number, string>>({});

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
      files.map((file, index) => ({
        ...file,
        description: fileDescriptions[index] || undefined,
      })),
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
          {files.length > 0 && (
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
          )}
          <Button type="submit" data-autofocus>
            <FormattedMessage id="common.button.share" />
          </Button>
        </Stack>
      </form>
    </Stack>
  );
};

export default SimplifiedCreateUploadModal;