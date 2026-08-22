import {
  Box,
  Group,
  SegmentedControl,
  Stack,
  Text,
  ThemeIcon,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";

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
import AdminBackButton from "../AdminBackButton";

/**
 * Category definitions — value is the lowercase key used by the backend API.
 * Display labels are capitalized via i18n keys.
 */
export const categories = [
  { name: "general", icon: <TbSettings /> },
  { name: "appearance", icon: <TbPalette /> },
  { name: "email", icon: <TbMail /> },
  { name: "share", icon: <TbShare /> },
  { name: "smtp", icon: <TbAt /> },
  { name: "legal", icon: <TbScale /> },
  { name: "cache", icon: <TbServerBolt /> },
];

const ConfigurationTopNav = ({
  categoryId,
  onCategoryChange,
}: {
  categoryId: string;
  onCategoryChange: (category: string) => void;
}) => {

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
        <Group gap="md" w="100%">
          <AdminBackButton />
          <Text size="xs" c="dimmed" fw={600} tt="uppercase">
            <FormattedMessage id="admin.config.title" />
          </Text>
        </Group>
        <SegmentedControl
          fullWidth
          data={categories.map((cat) => ({
            value: cat.name,
            label: (
              <Group gap="xs" justify="center">
                <ThemeIcon
                  variant={categoryId === cat.name ? "filled" : "light"}
                  size="sm"
                  style={{ width: 20, height: 20 }}
                >
                  {cat.icon}
                </ThemeIcon>
                <FormattedMessage
                  id={`admin.config.category.${cat.name}`}
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
