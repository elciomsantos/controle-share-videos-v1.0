import { Button } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import showErrorModal from "./showErrorModal";
import toast from "../../utils/toast.util";

const DownloadAllButton = ({
  shareId,
  recipientId,
}: {
  shareId: string;
  recipientId?: string;
}) => {
  const [isZipReady, setIsZipReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const modals = useModals();
  const t = useTranslate();

  const downloadAll = async () => {
    setIsLoading(true);
    try {
      await shareService.downloadFile(shareId, "zip", recipientId);
    } catch (e: any) {
      const error = e?.response?.data?.error;
      if (error === "share_max_downloads_exceeded") {
        showErrorModal(
          modals,
          t("share.error.download-limit-exceeded.title"),
          t("share.error.download-limit-exceeded.description"),
          "go-home",
        );
      } else if (error === "share_max_views_exceeded") {
        showErrorModal(
          modals,
          t("share.error.visitor-limit-exceeded.title"),
          t("share.error.visitor-limit-exceeded.description"),
          "go-home",
        );
      } else {
        toast.axiosError(e);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    shareService
      .getMetaData(shareId)
      .then((share) => setIsZipReady(share.isZipReady))
      .catch(() => {});

    const timer = setInterval(() => {
      shareService
        .getMetaData(shareId)
        .then((share) => {
          setIsZipReady(share.isZipReady);
          if (share.isZipReady) clearInterval(timer);
        })
        .catch(() => clearInterval(timer));
    }, 5000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <Button
      variant="light"
      color="cyan"
      loading={isLoading}
      onClick={() => {
        if (!isZipReady) {
          toast.error(t("share.notify.download-all-preparing"));
        } else {
          downloadAll();
        }
      }}
    >
      <FormattedMessage id="share.button.download-all" />
    </Button>
  );
};

export default DownloadAllButton;
