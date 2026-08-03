import {
  Badge,
  Box,
  Button,
  Container,
  Group,
  Paper,
  SimpleGrid,
  Text,
  ThemeIcon,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { TbInfinity, TbServer, TbShieldLock } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import Logo from "../components/Logo";
import Meta from "../components/Meta";
import useConfig from "../hooks/config.hook";
import useUser from "../hooks/user.hook";

export default function Home() {
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme("light");
  const { refreshUser } = useUser();
  const config = useConfig();
  const router = useRouter();
  const [signupEnabled, setSignupEnabled] = useState(true);
  const isMobile = useMediaQuery("(max-width: 575px)");

  // If user is already authenticated, redirect to the upload page
  useEffect(() => {
    refreshUser().then((user) => {
      if (user) {
        router.replace("/upload");
      }
    });

    // If registration is disabled, the "start" button should redirect to the sign-in page
    try {
      const allowRegistration = config.get("share.allowRegistration");
      setSignupEnabled(allowRegistration !== false);
    } catch (error) {
      setSignupEnabled(true);
    }
  }, [config]);

  const isDark = colorScheme === "dark";
  const primary = theme.colors[theme.primaryColor];
  const surfaceColor = isDark ? theme.colors.dark[6] : theme.white;
  const borderColor = isDark ? theme.colors.dark[4] : theme.colors.gray[2];

  const getButtonHref = () => (signupEnabled ? "/auth/signUp" : "/auth/signIn");

  const heroBackground = isDark
    ? `radial-gradient(800px 420px at 85% -10%, ${primary[8]}40, transparent 60%), ${theme.colors.dark[7]}`
    : `radial-gradient(800px 420px at 85% -10%, ${primary[1]}, transparent 60%), ${theme.colors.gray[0]}`;

  const features = [
    { icon: TbServer, name: "home.bullet.a.name", desc: "home.bullet.a.description" },
    { icon: TbShieldLock, name: "home.bullet.b.name", desc: "home.bullet.b.description" },
    { icon: TbInfinity, name: "home.bullet.c.name", desc: "home.bullet.c.description" },
  ];

  return (
    <>
      <Meta title="Home" />
      <Container size="lg" py={48}>
        <Paper
          radius="lg"
          p={{ base: "xl", md: 56 }}
          style={{
            background: heroBackground,
            border: `1px solid ${borderColor}`,
          }}
        >
          <SimpleGrid
            cols={{ base: 1, md: 2 }}
            spacing={{ base: 40, md: 56 }}
            style={{ alignItems: "center" }}
          >
            <Box>
              <Badge
                variant="light"
                size="lg"
                radius="xl"
                tt="none"
                leftSection={<TbShieldLock size={14} />}
              >
                {config.get("general.appName")}
              </Badge>
              <Title
                order={1}
                style={{
                  color: isDark ? theme.white : theme.black,
                  fontSize: isMobile ? 30 : 42,
                  lineHeight: 1.15,
                  fontWeight: 900,
                  marginTop: theme.spacing.md,
                }}
              >
                <FormattedMessage id="home.title" />
              </Title>
              <Text c="dimmed" mt="md" size="lg" style={{ maxWidth: 480 }}>
                <FormattedMessage id="home.description" />
              </Text>
              <Text
                mt="md"
                size="md"
                fw={600}
                style={{ color: isDark ? primary[3] : primary[7] }}
              >
                <FormattedMessage id="home.subtitle" />
              </Text>
              <Group mt={32}>
                <Button
                  component={Link}
                  href={getButtonHref()}
                  radius="xl"
                  size="md"
                >
                  <FormattedMessage id="home.button.start" />
                </Button>
              </Group>
            </Box>

            <Box
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Paper
                radius="lg"
                p={{ base: 32, md: 48 }}
                shadow="md"
                style={{
                  backgroundColor: surfaceColor,
                  border: `1px solid ${borderColor}`,
                }}
              >
                <Logo height={140} width={140} />
              </Paper>
            </Box>
          </SimpleGrid>
        </Paper>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg" mt={24}>
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Paper
                key={feature.name}
                p="lg"
                radius="md"
                withBorder
                style={{ backgroundColor: surfaceColor }}
              >
                <ThemeIcon size={44} radius="md" variant="light">
                  <Icon size={24} />
                </ThemeIcon>
                <Text mt="sm" fw={600} size="md">
                  <FormattedMessage id={feature.name} />
                </Text>
                <Text mt={4} size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>
                  <FormattedMessage id={feature.desc} />
                </Text>
              </Paper>
            );
          })}
        </SimpleGrid>
      </Container>
    </>
  );
}
