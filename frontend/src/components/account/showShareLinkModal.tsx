import { Stack, TextInput } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { translateOutsideContext } from "../../hooks/useTranslate.hook";
import { safeShareLinkBase } from "../../utils/safe-url.util";

type ModalsContextProps = ReturnType<typeof useModals>;

const showShareLinkModal = (
  modals: ModalsContextProps,
  shareId: string,
  appUrl: string,
  defaultAppUrl: string,
) => {
  const t = translateOutsideContext();
  const link = `${safeShareLinkBase(appUrl !== defaultAppUrl ? appUrl : undefined)}/share/${shareId}`;
  return modals.openModal({
    title: t("account.shares.modal.share-link"),
    children: (
      <Stack align="stretch">
        <TextInput variant="filled" value={link} />
      </Stack>
    ),
  });
};

export default showShareLinkModal;
