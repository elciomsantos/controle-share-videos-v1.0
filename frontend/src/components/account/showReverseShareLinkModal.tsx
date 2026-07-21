import { Stack, TextInput } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { translateOutsideContext } from "../../hooks/useTranslate.hook";

type ModalsContextProps = ReturnType<typeof useModals>;

const showReverseShareLinkModal = (
  modals: ModalsContextProps,
  reverseShareToken: string,
  appUrl: string,
  defaultAppUrl: string,
) => {
  const t = translateOutsideContext();
  const link = `${appUrl !== defaultAppUrl ? appUrl : window.location.origin}/upload/${reverseShareToken}`;
  return modals.openModal({
    title: t("account.reverseShares.modal.reverse-share-link"),
    children: (
      <Stack align="stretch">
        <TextInput variant="filled" value={link} />
      </Stack>
    ),
  });
};

export default showReverseShareLinkModal;
