import {
  Button,
  Collapse,
  Divider,
  Flex,
  Progress,
  Stack,
  Text,
} from "@mantine/core";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import { dayjs, isEpochZero } from "../../utils/date.util";
import { translateOutsideContext } from "../../hooks/useTranslate.hook";
import { MyShare } from "../../types/share.type";
import { Timespan } from "../../types/timespan.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import CopyTextField from "../upload/CopyTextField";
import QRCode from "./QRCode";
import EditShareBody from "./EditShareBody";

const ShareInformationsBody = ({
  share,
  maxShareSize,
  appUrl,
  defaultAppUrl,
  maxExpiration,
  onShareUpdated,
  initiallyEditing,
}: {
  share: MyShare;
  maxShareSize: number;
  appUrl: string;
  defaultAppUrl: string;
  maxExpiration?: Timespan;
  onShareUpdated?: (share: MyShare) => void;
  initiallyEditing: boolean;
}) => {
  const t = translateOutsideContext();
  const [currentShare, setCurrentShare] = useState(share);
  const [showQR, setShowQR] = useState(false);
  const [isEditing, setIsEditing] = useState(initiallyEditing);

  const handleToggleQR = () => {
    setShowQR(!showQR);
  };

  const link = `${appUrl !== defaultAppUrl ? appUrl : window.location.origin}/share/${currentShare.id}`;

  const resolvedMaxShareSize = maxShareSize;

  const shareSizeRatio =
    resolvedMaxShareSize > 0 ? currentShare.size / resolvedMaxShareSize : 0;

  const formattedShareSize = byteToHumanSizeString(currentShare.size);
  const formattedMaxShareSize = byteToHumanSizeString(resolvedMaxShareSize);
  const shareSizeProgress = shareSizeRatio * 100;

  const formattedCreatedAt = dayjs(currentShare.createdAt).format("LLL");
  const formattedExpiration = isEpochZero(currentShare.expiration)
    ? "Never"
    : dayjs(currentShare.expiration).format("LLL");

  if (isEditing) {
    return (
      <EditShareBody
        share={currentShare}
        maxExpiration={maxExpiration}
        onCancel={() => setIsEditing(false)}
        onShareUpdated={(updatedShare) => {
          setCurrentShare(updatedShare);
          onShareUpdated?.(updatedShare);
          setIsEditing(false);
        }}
      />
    );
  }

  return (
    <Stack align="stretch" gap="md">
      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.id" />:{" "}
        </b>
        {currentShare.id}
      </Text>
      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.name" />:{" "}
        </b>
        {currentShare.name || "-"}
      </Text>

      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.description" />:{" "}
        </b>
        {currentShare.description || "-"}
      </Text>

      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.createdAt" />:{" "}
        </b>
        {formattedCreatedAt}
      </Text>

      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.expiresAt" />:{" "}
        </b>
        {formattedExpiration}
      </Text>
      <Divider />
      <CopyTextField link={link} toggleQR={handleToggleQR} />
      <Collapse expanded={showQR}>
        <QRCode link={link} />
      </Collapse>
      <Divider />
      <Text size="sm">
        <b>
          <FormattedMessage id="account.shares.table.size" />:{" "}
        </b>
        {formattedShareSize} / {formattedMaxShareSize} (
        {shareSizeProgress.toFixed(1)}%)
      </Text>

      <Flex align="center" justify="center">
        {shareSizeRatio < 0.1 && (
          <Text size="xs" style={{ marginRight: "4px" }}>
            {formattedShareSize}
          </Text>
        )}
        <Progress
          value={shareSizeProgress}
          style={{
            width: shareSizeRatio < 0.1 ? "70%" : "80%",
          }}
          size="xl"
          radius="xl"
        >{shareSizeRatio >= 0.1 && <Progress.Section value={shareSizeProgress}><Progress.Label>{formattedShareSize}</Progress.Label></Progress.Section>}</Progress>
        <Text size="xs" style={{ marginLeft: "4px" }}>
          {formattedMaxShareSize}
        </Text>
      </Flex>
      <Button variant="light" onClick={() => setIsEditing(true)}>
        {t("common.button.edit")}
      </Button>
    </Stack>
  );
};

export default ShareInformationsBody;