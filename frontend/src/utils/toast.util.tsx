import { showNotification, type NotificationData } from "@mantine/notifications";
import { TbCheck, TbX } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import { getApiErrorMessage, AxiosErrorWithResponse } from "./error.util";
import { ReactNode } from "react";

const error = (
  message: ReactNode,
  config?: Omit<NotificationData, "message">,
) =>
  showNotification({
    icon: <TbX />,
    color: "red",
    radius: "md",
    title: <FormattedMessage id="common.error" />,
    message: message,
    autoClose: true,
    ...config,
  });

const axiosError = (err: unknown) => {
  const axiosErr = err as AxiosErrorWithResponse;
  error(
    getApiErrorMessage(axiosErr) ?? (
      <FormattedMessage id="common.error.unknown" />
    ),
  );
};

const success = (
  message: ReactNode,
  config?: Omit<NotificationData, "message">,
) =>
  showNotification({
    icon: <TbCheck />,
    color: "green",
    radius: "md",
    title: <FormattedMessage id="common.success" />,
    message: message,
    autoClose: true,
    ...config,
  });

const toast = {
  error,
  success,
  axiosError,
};
export default toast;
