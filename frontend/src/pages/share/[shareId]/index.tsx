import { ActionIcon, Box, Container, Group, Text, Title } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import { TbEdit, TbPlusMinus } from "react-icons/tb";
import Meta from "../../../components/Meta";
import DownloadAllButton from "../../../components/share/DownloadAllButton";
import FileList from "../../../components/share/FileList";
import showEnterPasswordModal from "../../../components/share/showEnterPasswordModal";
import showErrorModal from "../../../components/share/showErrorModal";
import showShareInformationsModal from "../../../components/share/showShareInformationsModal";
import useConfig from "../../../hooks/config.hook";
import useTranslate from "../../../hooks/useTranslate.hook";
import useUser from "../../../hooks/user.hook";
import shareService from "../../../services/share.service";
import { MyShare, Share as ShareType } from "../../../types/share.type";
import toast from "../../../utils/toast.util";
import { byteToHumanSizeString } from "../../../utils/fileSize.util";
import isAdminOrAuditor from "../../../utils/userRole.util";
import { getQueryString } from "../../../utils/router.util";
import { HoverTip } from "../../../components/core/HoverTip";

export function getServerSideProps(context: GetServerSidePropsContext) {
  return {
    props: { shareId: context.params!.shareId },
  };
}

const Share = ({ shareId }: { shareId: string }) => {
  const modals = useModals();
  const router = useRouter();
  const [share, setShare] = useState<ShareType>();
  const { user } = useUser();
  const config = useConfig();
  const t = useTranslate();

  const isOwner = !!user && !!share && share.creator?.id === user.id;

  const isOwnerOrAdmin =
    !!user && !!share && (share.creator?.id === user.id || isAdminOrAuditor(user));
  const recipientId = getQueryString(router.query.recipient);

  const handleEditClick = async () => {
    try {
      // R03: getMyShares() agora retorna Page<MyShare>. Buscamos o share
      // na primeira página (perPage=100). Se o owner tiver mais de 100
      // shares ativos e o alvo não estiver aqui, o modal não abre — mesmo
      // comportamento anterior ("return early if not found"). Follow-up
      // poderia trocar esta chamada por um `getMyShareById` dedicado.
      const page = await shareService.getMyShares({ page: 1, perPage: 100 });
      const myShare = page.items.find((s) => s.id === shareId);
      if (!myShare) return;
      showShareInformationsModal(
        modals,
        myShare,
        parseInt(config.get("share.maxSize")),
        config.get("general.appUrl"),
        config.get("general.appUrl", true),
        isAdminOrAuditor(user)
          ? { value: 0, unit: "days" }
          : config.get("share.maxExpiration"),
        (updatedShare: MyShare) => {
          setShare((prev) =>
            prev
              ? {
                  ...prev,
                  name: updatedShare.name,
                  description: updatedShare.description,
                  expiration: updatedShare.expiration,
                  hasPassword:
                    updatedShare.security?.passwordProtected ??
                    prev.hasPassword,
                }
              : prev,
          );
        },
        true,
      );
    } catch (e) {
      toast.axiosError(e);
    }
  };

  const getShareToken = async (password?: string) => {
    await shareService
      .getShareToken(shareId, password)
      .then(() => {
        modals.closeAll();
        getFiles();
      })
      .catch((e) => {
        const { error } = e.response.data;
        if (error == "share_max_views_exceeded") {
          showErrorModal(
            modals,
            t("share.error.visitor-limit-exceeded.title"),
            t("share.error.visitor-limit-exceeded.description"),
            "stay",
            "/img/images/fechado-down.png",
          );
        } else if (error == "share_password_required") {
          showEnterPasswordModal(modals, getShareToken);
        } else {
          toast.axiosError(e);
        }
      });
  };

  const getFiles = async () => {
    shareService
      .get(shareId)
      .then((share) => {
        setShare(share);
      })
      .catch((e) => {
        const { error } = e.response.data;
        if (e.response.status == 404) {
          if (error == "share_removed") {
            showErrorModal(
              modals,
              t("share.error.removed.title"),
              e.response.data.message,
              "go-home",
            );
          } else {
            showErrorModal(
              modals,
              t("share.error.not-found.title"),
              t("share.error.not-found.description"),
              "go-home",
            );
          }
        } else if (e.response.status == 403 && error == "private_share") {
          showErrorModal(
            modals,
            t("share.error.access-denied.title"),
            t("share.error.access-denied.description"),
          );
        } else if (error == "share_max_views_exceeded") {
          showErrorModal(
            modals,
            t("share.error.visitor-limit-exceeded.title"),
            t("share.error.visitor-limit-exceeded.description"),
            "stay",
            "/img/images/fechado-down.png",
          );
        } else if (error == "share_password_required") {
          showEnterPasswordModal(modals, getShareToken);
        } else if (error == "share_token_required") {
          getShareToken();
        } else {
          showErrorModal(
            modals,
            t("common.error"),
            t("common.error.unknown"),
            "go-home",
          );
        }
      });
  };

  useEffect(() => {
    getFiles();
  }, []);

  return (
    <Container size="md" py="xl">
      <Meta
        title={t("share.title", { shareId: share?.name || shareId })}
        description={t("share.description")}
      />

      <Group justify="space-between" mb="lg">
        <Box style={{ maxWidth: "70%" }}>
          <Title order={3}>{share?.name || share?.id}</Title>
          <Text size="sm">{share?.description}</Text>
          {share?.files?.length > 0 && (
            <Text size="sm" color="dimmed" mt={5}>
              <FormattedMessage
                id="share.fileCount"
                values={{
                  count: share?.files?.length || 0,
                  size: byteToHumanSizeString(
                    share?.files?.reduce(
                      (total: number, file: { size: string }) =>
                        total + Number(file.size),
                      0,
                    ) || 0,
                  ),
                }}
              />
            </Text>
          )}
        </Box>

        <Group gap="xs">
          {isOwner && (
            <HoverTip label={t("account.shares.button.edit")}>
              <Link href={`/share/${shareId}/edit`}>
                <ActionIcon variant="light" color="orange" size="lg">
                  <TbPlusMinus />
                </ActionIcon>
              </Link>
            </HoverTip>
          )}
          {isOwnerOrAdmin && (
            <HoverTip label={t("common.button.edit")}>
              <ActionIcon
                variant="light"
                color="blue"
                size="lg"
                onClick={handleEditClick}
              >
                <TbEdit />
              </ActionIcon>
            </HoverTip>
          )}
          {share?.files.length > 1 && (
            <DownloadAllButton shareId={shareId} recipientId={recipientId} />
          )}
        </Group>
      </Group>

      <FileList
        files={share?.files}
        setShare={setShare}
        share={share!}
        isLoading={!share}
        recipientId={recipientId}
      />
    </Container>
  );
};

export default Share;
