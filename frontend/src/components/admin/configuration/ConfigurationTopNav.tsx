import {
  Box,
  Button,
  Group,
  SegmentedControl,
  Stack,
  Text,
  ThemeIcon,
  useComputedColorScheme,
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

const ConfigurationTopNav = ({
  categoryId,
  onCategoryChange,
}: {
  categoryId: string;
  onCategoryChange: (category: string) => void;
}) => {
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme("light");

  return (
    <Box
      component="nav"
      p="md"
      pb={0}
      style={{
        backgroundColor:
          colorScheme === "dark"
            ? "var(--mantine-color-dark-8)"
            : "var(--mantine-color-gray-0)",
        borderBottom: `1px solid ${
          colorScheme === "dark"
            ? "var(--mantine-color-dark-4)"
            : "var(--mantine-color-gray-3)"
        }`,
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between" w="100%">
          <Text size="xs" c="dimmed" fw={600} tt="uppercase">
            <FormattedMessage id="admin.config.title" />
          </Text>
          <Box style={{ "@media (min-width: 768px)": { display: "none" } }}>
            <Button variant="light" component={Link} href="/admin">
              <FormattedMessage id="common.button.go-back" />
            </Button>
          </Box>
        </Group>
        <SegmentedControl
          fullWidth
          data={categories.map((cat) => ({
            value: cat.name.toLowerCase(),
            label: (
              <Group gap="xs" justify="center">
                <ThemeIcon
                  variant={
                    categoryId === cat.name.toLowerCase() ? "filled" : "light"
                  }
                  size="sm"
                  style={{ width: 20, height: 20 }}
                >
                  {cat.icon}
                </ThemeIcon>
                <FormattedMessage
                  id={`admin.config.category.${cat.name.toLowerCase()}`}
                />
              </Group>
            ),
          }))}
          value={categoryId}
          onChange={(value) => onCategoryChange(value)}
          styles={{
            label: { padding: "8px 12px", fontSize: "0.875rem" },
          }}
        />
      </Stack>
    </Box>
  );
};

export default ConfigurationTopNav;