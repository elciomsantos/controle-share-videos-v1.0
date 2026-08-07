import {
  ActionIcon,
  Box,
  Group,
  Skeleton,
  Table,
  Text,
} from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { useModals } from "@mantine/modals";
import { dayjs } from "../../../utils/date.util";
import { TbInfoCircle, TbLink, TbTrash } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import useConfig from "../../../hooks/config.hook";
import useTranslate from "../../../hooks/useTranslate.hook";
import { MyShare } from "../../../types/share.type";
import { byteToHumanSizeString } from "../../../utils/fileSize.util";
import toast from "../../../utils/toast.util";
import showShareInformationsModal from "../../share/showShareInformationsModal";
import showShareLinkModal from "../../account/showShareLinkModal";
import { HoverTip } from "../../core/HoverTip";

const ManageShareTable = ({
  shares,
  updateShare,
  deleteShare,
  isLoading,
}: {
  shares: MyShare[];
  updateShare: (share: MyShare) => void;
  deleteShare: (share: MyShare) => void;
  isLoading: boolean;
}) => {
  const modals = useModals();
  const clipboard = useClipboard();
  const config = useConfig();
  const t = useTranslate();

  // Check if file retention is enabled
  const fileRetentionPeriod = config.get("share.fileRetentionPeriod");
  const fileRetentionEnabled = fileRetentionPeriod.value !== 0 ? true : false;

  return (
    <Box style={{ display: "block", overflowX: "auto" }}>
      <style>{`.hide-on-mobile { display: none; } @media (min-width: 992px) { .hide-on-mobile { display: table-cell; } }`}</style>
      <Table verticalSpacing="sm">
        <thead>
          <tr>
            <th>
              <FormattedMessage id="account.shares.table.id" />
            </th>
            <th>
              <FormattedMessage id="account.shares.table.name" />
            </th>
            <th>
              <FormattedMessage id="admin.shares.table.username" />
            </th>
            <th>
              <FormattedMessage id="account.shares.table.visitors" />
            </th>
            <th className="hide-on-mobile">
              <FormattedMessage id="account.shares.table.downloads" />
            </th>
            <th>
              <FormattedMessage id="account.shares.table.size" />
            </th>
            <th>
              <FormattedMessage id="account.shares.table.expiresAt" />
            </th>
            {fileRetentionEnabled ? (
              <th>
                <FormattedMessage id="admin.shares.table.deletes" />
              </th>
            ) : (
              <></>
            )}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? skeletonRows
            : shares.map((share) => (
                <tr key={share.id}>
                  <td>{share.id}</td>
                  <td>{share.name}</td>
                  <td>
                    {share.creator ? (
                      share.creator.username
                    ) : (
                      <Text color="dimmed">Anonymous</Text>
                    )}
                  </td>
                  <td>{share.views}</td>
                  <td className="hide-on-mobile">
                    {share.downloads ?? 0}
                    {share.security?.maxDownloads ? `/${share.security.maxDownloads}` : ""}
                  </td>
                  <td>{byteToHumanSizeString(share.size)}</td>
                  <td>
                    {dayjs(share.expiration).unix() === 0
                      ? "Never"
                      : dayjs(share.expiration).locale("pt-br").format("LLL")}
                  </td>
                  {fileRetentionEnabled ? (
                    <td>
                      {dayjs(share.expiration).unix() === 0 ||
                      fileRetentionPeriod.value === -1
                        ? "Never"
                        : dayjs(share.expiration)
                            .locale("pt-br")
                            .add(
                              fileRetentionPeriod.value,
                              fileRetentionPeriod.unit,
                            )
                            .format("LLL")}
                    </td>
                  ) : (
                    <></>
                  )}
                  <td>
                    <Group justify="flex-end">
                      <HoverTip label={t("common.button.info")}>
                        <ActionIcon
                          color="blue"
                          variant="light"
                          size={25}
                          onClick={() => {
                            showShareInformationsModal(
                              modals,
                              share,
                              config.get("share.maxSize"),
                              config.get("general.appUrl"),
                              config.get("general.appUrl", true),
                              { value: 0, unit: "days" },
                              updateShare,
                            );
                          }}
                        >
                          <TbInfoCircle />
                        </ActionIcon>
                      </HoverTip>
                      <HoverTip label={t("common.button.copy-link")}>
                        <ActionIcon
                          color="victoria"
                          variant="light"
                          size={25}
                          onClick={() => {
                            if (window.isSecureContext) {
                              clipboard.copy(
                                `${config.get("general.appUrl") !== config.get("general.appUrl", true) ? config.get("general.appUrl") : window.location.origin}/share/${share.id}`,
                              );
                              toast.success(t("common.notify.copied-link"));
                            } else {
                              showShareLinkModal(
                                modals,
                                share.id,
                                config.get("general.appUrl"),
                                config.get("general.appUrl", true),
                              );
                            }
                          }}
                        >
                          <TbLink />
                        </ActionIcon>
                      </HoverTip>
                      <HoverTip label={t("common.button.delete")}>
                        <ActionIcon
                          variant="light"
                          color="red"
                          size={25}
                          onClick={() => deleteShare(share)}
                        >
                          <TbTrash />
                        </ActionIcon>
                      </HoverTip>
                    </Group>
                  </td>
                </tr>
              ))}
        </tbody>
      </Table>
    </Box>
  );
};

const skeletonRows = [...Array(10)].map((v, i) => (
  <tr key={i}>
    <td>
      <Skeleton key={i} height={20} />
    </td>
    <td className="hide-on-mobile">
      <Skeleton key={i} height={20} />
    </td>
    <td>
      <Skeleton key={i} height={20} />
    </td>
    <td>
      <Skeleton key={i} height={20} />
    </td>
    <td className="hide-on-mobile">
      <Skeleton key={i} height={20} />
    </td>
    <td>
      <Skeleton key={i} height={20} />
    </td>
  </tr>
));

export default ManageShareTable;
