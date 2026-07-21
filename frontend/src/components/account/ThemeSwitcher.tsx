import {
  Box,
  Center,
  SegmentedControl,
  Stack,
  useMantineColorScheme,
  useComputedColorScheme,
} from "@mantine/core";
import { TbDeviceLaptop, TbMoon, TbSun } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import userPreferences from "../../utils/userPreferences.util";

const ThemeSwitcher = () => {
  const { setColorScheme } = useMantineColorScheme();
  const systemColorScheme = useComputedColorScheme("light");
  const value = userPreferences.get("colorScheme") ?? "system";

  return (
    <Stack>
      <SegmentedControl
        value={value}
        data={[
          {
            label: (
              <Center>
                <TbMoon size={16} />
                <Box ml={10}>
                  <FormattedMessage id="account.theme.dark" />
                </Box>
              </Center>
            ),
            value: "dark",
          },
          {
            label: (
              <Center>
                <TbSun size={16} />
                <Box ml={10}>
                  <FormattedMessage id="account.theme.light" />
                </Box>
              </Center>
            ),
            value: "light",
          },
          {
            label: (
              <Center>
                <TbDeviceLaptop size={16} />
                <Box ml={10}>
                  <FormattedMessage id="account.theme.system" />
                </Box>
              </Center>
            ),
            value: "system",
          },
        ]}
      />
      <Box>
        <button
          onClick={() => {
            userPreferences.set("colorScheme", value);
          }}
        />
      </Box>
    </Stack>
  );
};

export default ThemeSwitcher;
