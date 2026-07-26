import routerSingleton from "next/router";
import { useModals } from "@mantine/modals";
import { showBlockingErrorModal } from "../core/showBlockingErrorModal";
import { translateOutsideContext } from "../../hooks/useTranslate.hook";

type ModalsContextProps = ReturnType<typeof useModals>;

const showErrorModal = (
  modals: ModalsContextProps,
  title: string,
  text: string,
  action: "go-back" | "go-home" = "go-back",
) => {
  const t = translateOutsideContext();

  const handleNavigate = () => {
    if (action === "go-back") {
      routerSingleton.back();
    } else if (action === "go-home") {
      routerSingleton.push("/");
    }
  };

  return showBlockingErrorModal(modals, {
    title,
    description: text,
    actions: [
      {
        label: t(`common.button.${action}`),
        variant: "filled",
        color: "blue",
        onClick: handleNavigate,
      },
    ],
  });
};

export default showErrorModal;

