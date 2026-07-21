import { Box, Burger, Button, Group, Text } from "@mantine/core";
import Link from "next/link";
import { Dispatch, SetStateAction } from "react";
import { FormattedMessage } from "react-intl";
import useConfig from "../../../hooks/config.hook";
import Logo from "../../Logo";

const ConfigurationHeader = ({
  isMobileNavBarOpened,
  setIsMobileNavBarOpened,
}: {
  isMobileNavBarOpened: boolean;
  setIsMobileNavBarOpened: Dispatch<SetStateAction<boolean>>;
}) => {
  const config = useConfig();
  return (
    <Box component="header" h={60} p="md">
      <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
        <Group justify="space-between" w="100%">
          <Link href="/" passHref>
            <Group>
              <Logo height={35} width={35} />
              <Text fw={600}>{config.get("general.appName")}</Text>
            </Group>
          </Link>
          <Box style={{ "@media (max-width: 767px)": { display: "none" } }}>
            <Button variant="light" component={Link} href="/admin">
              <FormattedMessage id="common.button.go-back" />
            </Button>
          </Box>
        </Group>
        <Box style={{ "@media (min-width: 768px)": { display: "none" } }}>
          <Burger
            opened={isMobileNavBarOpened}
            onClick={() => setIsMobileNavBarOpened((o) => !o)}
            size="sm"
          />
        </Box>
      </div>
    </Box>
  );
};

export default ConfigurationHeader;
