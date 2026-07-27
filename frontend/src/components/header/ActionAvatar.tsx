import { ActionIcon, Avatar, Menu } from "@mantine/core";
import Link from "next/link";
import { TbDoorExit, TbUser } from "react-icons/tb";
import authService from "../../services/auth.service";
import { FormattedMessage } from "react-intl";
import { HoverTip } from "../../components/core/HoverTip";
import useTranslate from "../../hooks/useTranslate.hook";
import { useState } from "react";

const ActionAvatar = () => {
  const t = useTranslate();
  const [menuOpened, setMenuOpened] = useState(false);

  return (
    <Menu position="bottom-start" withinPortal onChange={setMenuOpened}>
      <Menu.Target>
        <ActionIcon>
          <HoverTip label={t("common.button.profile")} disabled={menuOpened}>
            <Avatar size={28} />
          </HoverTip>
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component={Link} href="/account" leftSection={<TbUser size={14} />}>
          <FormattedMessage id="navbar.avatar.account" />
        </Menu.Item>

        <Menu.Item
          onClick={async () => {
            await authService.signOut();
          }}
          leftSection={<TbDoorExit size={14} />}
        >
          <FormattedMessage id="navbar.avatar.signout" />
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};

export default ActionAvatar;
