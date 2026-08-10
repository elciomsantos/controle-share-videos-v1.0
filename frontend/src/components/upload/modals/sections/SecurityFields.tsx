import {
  Button,
  Checkbox,
  Group,
  NumberInput,
  PasswordInput,
  Stack,
  Text,
} from "@mantine/core";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import { TbRefresh } from "react-icons/tb";
import useTranslate from "../../../../hooks/useTranslate.hook";
import { generateRandomPassword } from "../../../../utils/shareId.util";
import type { CreateUploadForm } from "../CreateUploadForm";

const SecurityFields = ({
  form,
  autoGeneratePassword,
  generatedPasswordLength,
}: {
  form: CreateUploadForm;
  autoGeneratePassword: boolean;
  generatedPasswordLength: number;
}) => {
  const t = useTranslate();
  const [useManualPassword, setUseManualPassword] = useState(false);

  return (
    <Stack align="stretch">
      {!useManualPassword && autoGeneratePassword && (
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
              const pwd = generateRandomPassword(generatedPasswordLength);
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
  );
};

export default SecurityFields;