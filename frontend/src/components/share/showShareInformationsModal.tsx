import { useModals } from "@mantine/modals";
import { translateOutsideContext } from "../../hooks/useTranslate.hook";
import { MyShare } from "../../types/share.type";
import { Timespan } from "../../types/timespan.type";
import ShareInformationsBody from "./ShareInformationsBody";

type ModalsContextProps = ReturnType<typeof useModals>;

const showShareInformationsModal = (
  modals: ModalsContextProps,
  share: MyShare,
  maxShareSize: number,
  appUrl: string,
  defaultAppUrl: string,
  maxExpiration?: Timespan,
  onShareUpdated?: (share: MyShare) => void,
  initiallyEditing = false,
) => {
  const t = translateOutsideContext();

  return modals.openModal({
    title: t("account.shares.modal.share-informations"),
    children: (
      <ShareInformationsBody
        share={share}
        maxShareSize={maxShareSize}
        appUrl={appUrl}
        defaultAppUrl={defaultAppUrl}
        maxExpiration={maxExpiration}
        onShareUpdated={onShareUpdated}
        initiallyEditing={initiallyEditing}
      />
    ),
  });
};

export default showShareInformationsModal;