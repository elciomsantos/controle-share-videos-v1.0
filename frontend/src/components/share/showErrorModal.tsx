import { Image } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { showBlockingErrorModal } from "../core/showBlockingErrorModal";
import { translateOutsideContext } from "../../hooks/useTranslate.hook";

type ModalsContextProps = ReturnType<typeof useModals>;

const showErrorModal = (
  modals: ModalsContextProps,
  title: string,
  text: string,
  action: "go-back" | "go-home" | "stay" = "go-back",
  imageUrl?: string,
) => {
  const t = translateOutsideContext();

  const handleClick = () => {
    modals.closeAll();
  };

  return showBlockingErrorModal(modals, {
    title,
    description: (
      <>
        {imageUrl && (
          <Image src={imageUrl} alt="" mx="auto" my="md" maw={300} />
        )}
        <div>{text}</div>
      </>
    ),
    actions: [
      {
        label: t(`common.button.${action === "stay" ? "ok" : action}`),
        variant: "filled",
        color: "blue",
        onClick: handleClick,
      },
    ],
  });
};

export default showErrorModal;

