import { Button, Stack, Text, Collapse, useComputedColorScheme, useMantineTheme } from "@mantine/core";
import { useModals } from "@mantine/modals";
type ModalsContextProps = ReturnType<typeof useModals>;
import { useState } from "react";
import { dayjs } from "../../../utils/date.util";
import { useRouter } from "next/router";
import { FormattedMessage } from "react-intl";
import useTranslate, {
  translateOutsideContext,
} from "../../../hooks/useTranslate.hook";
import { CompletedShare } from "../../../types/share.type";
import CopyTextField from "../CopyTextField";
import QRCode from "../../share/QRCode";

const showCompletedUploadModal = (
  modals: ModalsContextProps,
  share: CompletedShare,
  appUrl: string,
  defaultAppUrl: string,
) => {
  const t = translateOutsideContext();
  return modals.openModal({
    closeOnClickOutside: false,
    withCloseButton: false,
    closeOnEscape: false,
    title: t("upload.modal.completed.share-ready"),
    children: (
      <Body share={share} appUrl={appUrl} defaultAppUrl={defaultAppUrl} />
    ),
  });
};

const Body = ({
  share,
  appUrl,
  defaultAppUrl,
}: {
  share: CompletedShare;
  appUrl: string;
  defaultAppUrl: string;
}) => {
  const modals = useModals();
  const router = useRouter();
  const t = useTranslate();
  const colorScheme = useComputedColorScheme("light");
  const theme = useMantineTheme();

  const [showQR, setShowQR] = useState(false);

  const handleToggleQR = () => {
    setShowQR(!showQR);
  };

  const link = `${appUrl !== defaultAppUrl ? appUrl : window.location.origin}/s/${share.id}`;

  return (
    <Stack align="stretch">
      <CopyTextField link={link} toggleQR={handleToggleQR} />
      <Collapse expanded={showQR}>
        <QRCode link={link} />
      </Collapse>
      <Text
        size="xs"
        style={{ color: theme.colors.gray[6] }}
      >
        {/* If our share.expiration is timestamp 0, show a different message */}
        {dayjs(share.expiration).unix() === 0
          ? t("upload.modal.completed.never-expires")
          : t("upload.modal.completed.expires-on", {
              expiration: dayjs(share.expiration).format("LLL"),
            })}
      </Text>

      <Button
        onClick={() => {
          modals.closeAll();
          router.push("/upload");
        }}
      >
        <FormattedMessage id="common.button.done" />
      </Button>
    </Stack>
  );
};

export default showCompletedUploadModal;
