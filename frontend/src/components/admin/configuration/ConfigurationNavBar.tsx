import {
  Box,
  Button,
  Group,
  Stack,
  Text,
  ThemeIcon,
  useMantineTheme,
} from "@mantine/core";
import Link from "next/link";
import { Dispatch, SetStateAction } from "react";
import {
  TbAt,
  TbMail,
  TbPalette,
  TbScale,
  TbServerBolt,
  TbSettings,
  TbShare,
} from "react-icons/tb";
import { FormattedMessage } from "react-intl";

export const categories = [
  { name: "General", icon: <TbSettings /> },
  { name: "Appearance", icon: <TbPalette /> },
  { name: "Email", icon: <TbMail /> },
  { name: "Share", icon: <TbShare /> },
  { name: "SMTP", icon: <TbAt /> },
  { name: "Legal", icon: <TbScale /> },
  { name: "Cache", icon: <TbServerBolt /> },
];

const ConfigurationNavBar = ({
  categoryId,
  isMobileNavBarOpened,
  setIsMobileNavBarOpened,
}: {
  categoryId: string;
  isMobileNavBarOpened: boolean;
  setIsMobileNavBarOpened: Dispatch<SetStateAction<boolean>>;
}) => {
  const theme = useMantineTheme();

  const activeLinkStyle: React.CSSProperties = {
    backgroundColor: theme.colors[theme.primaryColor][0],
    color: theme.colors[theme.primaryColor][6],
    borderRadius: theme.radius.sm,
    fontWeight: 600,
  };

  return (
    <Box
      component="nav"
      p="md"
      hidden={!isMobileNavBarOpened}
      w={{ sm: 200, lg: 300 }}
      style={{
        "@media (max-width: 767px)": {
          height: "calc(100dvh - 60px)",
          maxHeight: "calc(100dvh - 60px)",
          overflowY: "auto",
        },
      } as React.CSSProperties}
    >
      <Box>
        <Text size="xs" c="dimmed" mb="sm">
          <FormattedMessage id="admin.config.title" />
        </Text>
        <Stack gap="xs">
          {categories.map((category) => (
            <Box
              p="xs"
              component={Link}
              onClick={() => setIsMobileNavBarOpened(false)}
              style={
                categoryId == category.name.toLowerCase()
                  ? activeLinkStyle
                  : undefined
              }
              key={category.name}
              href={`/admin/config/${category.name.toLowerCase()}`}
            >
              <Group>
                <ThemeIcon
                  variant={
                    categoryId == category.name.toLowerCase()
                      ? "filled"
                      : "light"
                  }
                >
                  {category.icon}
                </ThemeIcon>
                <Text size="sm">
                  <FormattedMessage
                    id={`admin.config.category.${category.name.toLowerCase()}`}
                  />
                </Text>
              </Group>
            </Box>
          ))}
        </Stack>
      </Box>
      <Box style={{ "@media (min-width: 768px)": { display: "none" } }}>
        <Button
          mt="xl"
          pt="sm"
          pb="sm"
          variant="light"
          component={Link}
          href="/admin"
        >
          <FormattedMessage id="common.button.go-back" />
        </Button>
      </Box>
    </Box>
  );
};

export default ConfigurationNavBar;
