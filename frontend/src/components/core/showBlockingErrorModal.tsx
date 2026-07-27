import { Button, Group, Stack, Text } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { ReactNode } from "react";

type ModalsContextProps = ReturnType<typeof useModals>;

export interface BlockingErrorAction {
  label: string;
  onClick?: () => void | Promise<unknown>;
  variant?: "default" | "filled" | "light" | "outline" | "subtle" | "white" | "transparent";
  color?: string;
}

export interface BlockingErrorParams {
  title: string;
  description?: string | ReactNode;
  actions: BlockingErrorAction[];
  onClose?: () => void;
}

const BlockingBody = ({
  description,
  actions,
  onClose,
}: {
  description?: string | ReactNode;
  actions: BlockingErrorAction[];
  onClose?: () => void;
}) => {
  const modals = useModals();

  const handleClick = (action: BlockingErrorAction) => {
    const result = action.onClick?.();
    const close = () => {
      modals.closeAll();
      onClose?.();
    };
    if (result instanceof Promise) {
      result.finally(close);
    } else {
      close();
    }
  };

  return (
    <Stack align="stretch">
      {description && typeof description === "string" ? (
        <Text size="sm">{description}</Text>
      ) : (
        description
      )}
      <Group justify="flex-end" mt="md">
        {actions.map((action, idx) => (
          <Button
            key={idx}
            variant={action.variant ?? "light"}
            color={action.color ?? "gray"}
            onClick={() => handleClick(action)}
          >
            {action.label}
          </Button>
        ))}
      </Group>
    </Stack>
  );
};

export const showBlockingErrorModal = (
  modals: ModalsContextProps,
  params: BlockingErrorParams,
) => {
  return modals.openModal({
    closeOnClickOutside: false,
    withCloseButton: false,
    closeOnEscape: false,
    title: params.title,
    children: (
      <BlockingBody
        description={params.description}
        actions={params.actions}
        onClose={params.onClose}
      />
    ),
  });
};

export default showBlockingErrorModal;
