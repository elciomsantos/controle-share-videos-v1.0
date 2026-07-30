import {
  Button,
  Container,
  Group,
  List,
  Text,
  ThemeIcon,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { TbCheck } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import Logo from "../components/Logo";
import Meta from "../components/Meta";
import useUser from "../hooks/user.hook";
import useConfig from "../hooks/config.hook";

export default function Home() {
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme("light");
  const { refreshUser } = useUser();
  const router = useRouter();
  const config = useConfig();
  const [signupEnabled, setSignupEnabled] = useState(false);

  // If user is already authenticated, redirect to the upload page
  useEffect(() => {
    refreshUser().then((user) => {
      if (user) {
        router.replace("/upload");
      }
    });

    // If registration is disabled, get started button should redirect to the sign in page
    try {
      const allowRegistration = config.get("share.allowRegistration");
      setSignupEnabled(allowRegistration !== false);
    } catch (error) {
      setSignupEnabled(false);
    }
  }, [config]);

  const getButtonHref = () => {
    return signupEnabled ? "/auth/signUp" : "/auth/signIn";
  };

  const isDark = colorScheme === "dark";

  return (
    <>
      <Meta title="Home" />
      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "50%",
            height: "100%",
            opacity: 0.7,
            backgroundImage: `url(/img/logo.png)`,
            backgroundSize: "300%",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundColor: "white",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
        <Container>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              paddingTop: `calc(${theme.spacing.md} * 4)`,
              paddingBottom: `calc(${theme.spacing.md} * 4)`,
            }}
          >
            <div
              style={{
                maxWidth: 480,
                marginRight: `calc(${theme.spacing.md} * 3)`,
              }}
            >
              <Title
                style={{
                  color: isDark ? theme.white : theme.black,
                  fontSize: 44,
                  lineHeight: 1.2,
                  fontWeight: 900,
                }}
              >
                <FormattedMessage
                  id="home.title"
                  values={{
                    h: (chunks) => (
                      <span
                        style={{
                          position: "relative",
                          backgroundColor:
                            "light-dark(" + theme.colors[theme.primaryColor][0] + ", rgba(" + theme.colors[theme.primaryColor][6] + ", 0.55))",
                          borderRadius: theme.radius.sm,
                          padding: "4px 12px",
                        }}
                      >
                        {chunks}
                      </span>
                    ),
                  }}
                />
              </Title>
              <Text color="dimmed" mt="md">
                <FormattedMessage id="home.description" />
              </Text>

              <List
                mt={30}
                spacing="sm"
                size="sm"
                icon={
                  <ThemeIcon size={20} radius="xl">
                    <TbCheck size={12} />
                  </ThemeIcon>
                }
              >
                <List.Item>
                  <div>
                    <b>
                      <FormattedMessage id="home.bullet.a.name" />
                    </b>{" "}
                    - <FormattedMessage id="home.bullet.a.description" />
                  </div>
                </List.Item>
                <List.Item>
                  <div>
                    <b>
                      <FormattedMessage id="home.bullet.b.name" />
                    </b>{" "}
                    - <FormattedMessage id="home.bullet.b.description" />
                  </div>
                </List.Item>
                <List.Item>
                  <div>
                    <b>
                      <FormattedMessage id="home.bullet.c.name" />
                    </b>{" "}
                    - <FormattedMessage id="home.bullet.c.description" />
                  </div>
                </List.Item>
              </List>

              <Group mt={30}>
                <Button
                  component={Link}
                  href={getButtonHref()}
                  radius="xl"
                  size="md"
                >
                  <FormattedMessage id="home.button.start" />
                </Button>
              </Group>
            </div>
            <Group align="center">
              <Logo width={200} height={200} />
            </Group>
          </div>
        </Container>
      </div>
    </>
  );
}
