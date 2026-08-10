import type { UseFormReturnType } from "@mantine/form";

export type CreateUploadFormValues = {
  name: string | undefined;
  link: string;
  recipients: string[];
  password: string | undefined;
  maxViews: number | undefined;
  maxDownloads: number | undefined;
  description: string | undefined;
  expiration_num: number;
  expiration_unit: string;
  never_expires: boolean;
};

export type CreateUploadForm = UseFormReturnType<CreateUploadFormValues>;