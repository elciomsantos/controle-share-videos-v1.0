import { Button, Stack, Text, Collapse, useComputedColorScheme, useMantineTheme, Divider } from "@mantine/core";
import { useModals } from "@mantine/modals";
type ModalsContextProps = ReturnType<typeof useModals>;
import { useState } from "react";
import { dayjs, isEpochZero } from "../../../utils/date.util";
import { useRouter } from "next/router";
import { FormattedMessage } from "react-intl";
import useTranslate, {
  translateOutsideContext,
} from "../../../hooks/useTranslate.hook";
import { CompletedShare } from "../../../types/share.type";
import CopyTextField from "../CopyTextField";
import QRCode from "../../share/QRCode";
import toast from "../../../utils/toast.util";
import { copyToClipboard } from "../../../utils/clipboard.util";
import shareService from "../../../services/share.service";
import { FileUpload } from "../../../types/File.type";
import { writeBlobToRelativeDirectory } from "../../../utils/fileSystem.util";

const showCompletedUploadModal = (
  modals: ModalsContextProps,
  share: CompletedShare,
  appUrl: string,
  defaultAppUrl: string,
  generatedPassword?: string,
  sourceFiles?: FileUpload[],
) => {
  const t = translateOutsideContext();
  return modals.openModal({
    closeOnClickOutside: false,
    withCloseButton: false,
    closeOnEscape: false,
    title: t("upload.modal.completed.share-ready"),
    children: (
      <Body share={share} appUrl={appUrl} defaultAppUrl={defaultAppUrl} generatedPassword={generatedPassword} sourceFiles={sourceFiles} />
    ),
  });
};

const Body = ({
  share,
  appUrl,
  defaultAppUrl,
  generatedPassword,
  sourceFiles,
}: {
  share: CompletedShare;
  appUrl: string;
  defaultAppUrl: string;
  generatedPassword?: string;
  sourceFiles?: FileUpload[];
}) => {
  const modals = useModals();
  const router = useRouter();
  const t = useTranslate();

  const theme = useMantineTheme();

  const [showQR, setShowQR] = useState(false);

  const handleToggleQR = () => {
    setShowQR(!showQR);
  };

  const baseUrl = `${appUrl !== defaultAppUrl ? appUrl : window.location.origin}/share/${share.id}`;
  const link = baseUrl;

  const handleCopyAll = async () => {
    const text = [
      `Link: ${link}`,
      generatedPassword ? `Senha: ${generatedPassword}` : null,
      isEpochZero(share.expiration)
        ? `Expira em: Nunca`
        : `Expira em: ${dayjs(share.expiration).format("LLL")}`,
      share.maxViews ? `Limite de visualizacoes: ${share.maxViews}` : null,
      share.maxDownloads ? `Limite de downloads: ${share.maxDownloads}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const ok = await copyToClipboard(text);
      if (ok) toast.success(t("upload.modal.completed.copy-all.success"));
      else toast.error(t("upload.modal.completed.copy-all.error"));
    } catch {
      toast.error(t("upload.modal.completed.copy-all.error"));
    }
  };

  return (
    <Stack align="stretch">
      <CopyTextField link={link} toggleQR={handleToggleQR} />
      <Collapse expanded={showQR}>
        <QRCode link={link} />
      </Collapse>

      {generatedPassword && (
        <>
          <Divider />
          <Text size="sm">
            <b>
              <FormattedMessage id="upload.modal.completed.generated-password" />:{" "}
            </b>
            <Text component="span" fw={700} c="blue">
              {generatedPassword}
            </Text>
          </Text>
        </>
      )}

      <Text size="xs" style={{ color: theme.colors.gray[6] }}>
        {isEpochZero(share.expiration)
          ? t("upload.modal.completed.never-expires")
          : t("upload.modal.completed.expires-on", {
              expiration: dayjs(share.expiration).format("LLL"),
            })}
      </Text>

      {share.maxViews && (
        <Text size="xs" style={{ color: theme.colors.gray[6] }}>
          <FormattedMessage id="upload.modal.completed.max-views" values={{ count: share.maxViews }} />
        </Text>
      )}
      {share.maxDownloads && (
        <Text size="xs" style={{ color: theme.colors.gray[6] }}>
          <FormattedMessage id="upload.modal.completed.max-downloads" values={{ count: share.maxDownloads }} />
        </Text>
      )}

      <Button variant="light" onClick={handleCopyAll}>
        <FormattedMessage id="upload.modal.completed.copy-all.button" />
      </Button>

      <Button
        onClick={async () => {
          const videoFiles = share.files.filter(
            (file) =>
              !file.name.endsWith(".certificado.pdf") &&
              !/\.assinado\.\w+$/.test(file.name),
          );
          for (const video of videoFiles) {
            const hasCert = share.files.some(
              (file) => file.name === `${video.name}.certificado.pdf`,
            );
            if (!hasCert) continue;

            const source = sourceFiles?.find(
              (file) => file.name === video.name,
            );

            try {
              if (source?.dirHandle) {
                const { blob, fileName } = await shareService.fetchCertificate(
                  share.id,
                  video.id,
                );
                const certBaseName = fileName.split("/").pop() || fileName;
                const saved = await writeBlobToRelativeDirectory(
                  source.dirHandle,
                  source.relativeDirPath ?? "",
                  certBaseName,
                  blob,
                );
                if (!saved) {
                  await shareService.downloadCertificate(share.id, video.id);
                }
              } else {
                await shareService.downloadCertificate(share.id, video.id);
              }
            } catch (e) {
              toast.axiosError(e);
            }
          }
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
