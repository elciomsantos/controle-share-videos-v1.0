import {
  Center,
  Grid,
  Paper,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import Link from "next/link";
import { TbLink, TbSettings, TbUsers } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import Meta from "../../components/Meta";
import useTranslate from "../../hooks/useTranslate.hook";
import useUser from "../../hooks/user.hook";

const Admin = () => {
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme("light");
  const t = useTranslate();
  const { user } = useUser();
  const role = user?.role || (user?.isAdmin ? "admin" : "operador");

  const allOptions = [
    {
      title: t("admin.button.users"),
      icon: TbUsers,
      route: "/admin/users",
      roles: ["admin"],
    },
    {
      title: t("admin.button.shares"),
      icon: TbLink,
      route: "/admin/shares",
      roles: ["admin", "auditor"],
    },
    {
      title: t("admin.button.config"),
      icon: TbSettings,
      route: "/admin/config/general",
      roles: ["admin"],
    },
  ];

  const managementOptions = allOptions.filter((option) =>
    option.roles.includes(role),
  );

  return (
    <>
      <Meta title={t("admin.title")} />
      <Title mb={30} order={3}>
        <FormattedMessage id="admin.title" />
      </Title>
      <Stack justify="space-between" style={{ height: "calc(100vh - 180px)" }}>
        <Paper withBorder p={40}>
          <Grid>
            {managementOptions.map((item) => {
              return (
                <Grid.Col key={item.route} span={6}>
                  <Paper
                    withBorder
                    component={Link}
                    href={item.route}
                    key={item.title}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      height: 90,
                    }}
                  >
                    <item.icon
                      color={
                        theme.colors[theme.primaryColor][
                          colorScheme === "dark" ? 3 : 7
                        ]
                      }
                      size={35}
                    />
                    <Text mt={7}>{item.title}</Text>
                  </Paper>
                </Grid.Col>
              );
            })}
          </Grid>
        </Paper>

        <Center>
          <Text size="xs" color="dimmed">
            <FormattedMessage id="admin.version" /> {process.env.VERSION}
          </Text>
        </Center>
      </Stack>
    </>
  );
};

export default Admin;
