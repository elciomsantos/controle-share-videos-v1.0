import { TagsInput } from "@mantine/core";
import React from "react";
import useTranslate from "../../../../hooks/useTranslate.hook";
import type { CreateUploadForm } from "../CreateUploadForm";

const RecipientsField = ({
  form,
  onKeyDown,
}: {
  form: CreateUploadForm;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) => {
  const t = useTranslate();

  return (
    <TagsInput
      data={form.values.recipients}
      placeholder={t("upload.modal.accordion.email.placeholder")}
      splitChars={[",", ";"]}
      id="recipient-emails"
      inputMode="email"
      {...form.getInputProps("recipients")}
      onKeyDown={onKeyDown}
    />
  );
};

export default RecipientsField;