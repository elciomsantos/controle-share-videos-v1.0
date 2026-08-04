import {
  Box,
  Burger,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  Transition,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import Link from "next/link";
import { useRouter } from "next/router";
import { ReactNode, useEffect, useState } from "react";
import { TbChevronLeft } from "react-icons/tb";
import useConfig from "../../hooks/config.hook";
import useUser from "../../hooks/user.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import authService from "../../services/auth.service";
import ActionAvatar from "./ActionAvatar";
import NavbarShareMenu from "./NavbarShareMenu";
import isAdminOrAuditor from "../../utils/userRole.util";

const HEADER_HEIGHT = 60;

type NavLink = {
  link?: string;
  label?: string;
  component?: ReactNode;
  action?: () => Promise<void>;
};

type MobileMenuView = "root" | "shares" | "profile";

const Header = () => {
  const { user } = useUser();
  const router = useRouter();
  const config = useConfig();
  const t = useTranslate();
  const theme = useMantineTheme();

  const [opened, { toggle, close }] = useDisclosure(false);
  const [currentRoute, setCurrentRoute] = useState("");
  const [mobileMenuView, setMobileMenuView] = useState<MobileMenuView>("root");

  useEffect(() => {
    setCurrentRoute(router.pathname);
    close();
    setMobileMenuView("root");
  }, [close, router.pathname]);

  const authenticatedLinks: NavLink[] = [
    {
      link: "/upload",
      label: t("navbar.upload"),
    },
    ...(isAdminOrAuditor(user)
      ? [{ link: "/admin", label: t("navbar.avatar.admin") }]
      : []),
    {
      component: <NavbarShareMenu />,
    },
    {
      component: <ActionAvatar />,
    },
  ];

  let unauthenticatedLinks: NavLink[] = [
    {
      link: "/auth/signIn",
      label: t("navbar.signin"),
    },
  ];

  if (config.get("share.allowUnauthenticatedShares")) {
    unauthenticatedLinks.unshift({
      link: "/upload",
      label: t("navbar.upload"),
    });
  }

  if (config.get("share.allowRegistration"))
    unauthenticatedLinks.push({
      link: "/auth/signUp",
      label: t("navbar.signup"),
    });

  const mobileRootLinks: NavLink[] = user
    ? [
        {
          link: "/upload",
          label: t("navbar.upload"),
        },
        {
          label: t("common.button.shares"),
        },
        {
          label: t("common.button.profile"),
        },
      ]
    : unauthenticatedLinks;

  const mobileShareLinks: NavLink[] = [
    {
      link: "/account/shares",
      label: t("navbar.links.shares"),
    },
  ];

  const mobileProfileLinks: NavLink[] = [
    {
      link: "/account",
      label: t("navbar.avatar.account"),
    },
    ...(isAdminOrAuditor(user)
      ? [
          {
            link: "/admin",
            label: t("navbar.avatar.admin"),
          },
        ]
      : []),
    {
      label: t("navbar.avatar.signout"),
      action: async () => {
        await authService.signOut();
        close();
        setMobileMenuView("root");
      },
    },
  ];

  const linkColor = "light-dark(" + theme.colors.gray[7] + ", " + theme.colors.dark[0] + ")";
  const hoverBg = "light-dark(" + theme.colors.gray[0] + ", " + theme.colors.dark[6] + ")";
  const activeBg = "light-dark(" + theme.colors[theme.primaryColor][0] + ", rgba(" + theme.colors[theme.primaryColor][9] + ", 0.25))";
  const activeColor = theme.colors[theme.primaryColor][7];

  const linkStyle = {
    display: "block",
    lineHeight: 1,
    padding: "8px 12px",
    borderRadius: theme.radius.sm,
    textDecoration: "none",
    color: linkColor,
    fontSize: theme.fontSizes.sm,
    fontWeight: 500,
  };

  const linkActiveStyle = {
    ...linkStyle,
    backgroundColor: activeBg,
    color: activeColor,
  };

  const mobileMenuButtonStyle = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.md,
    color: linkColor,
  };

  const desktopItems = (
    <>
      {(user ? authenticatedLinks : unauthenticatedLinks).map((link, i) => {
        if (link.component) {
          return (
            <Box pl={5} py={15} key={i}>
              {link.component}
            </Box>
          );
        }
        const isActive = currentRoute === link.link;
        return (
          <Link
            key={link.label}
            href={link.link ?? ""}
            onClick={close}
            style={isActive ? linkActiveStyle : linkStyle}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );

  const currentMobileLinks =
    mobileMenuView === "shares"
      ? mobileShareLinks
      : mobileMenuView === "profile"
        ? mobileProfileLinks
        : mobileRootLinks;

  const renderMobileEntry = (link: NavLink) => {
    const isSharesEntry =
      mobileMenuView === "root" && link.label === t("common.button.shares");
    const isProfileEntry =
      mobileMenuView === "root" && link.label === t("common.button.profile");

    if (isSharesEntry || isProfileEntry) {
      return (
        <UnstyledButton
          key={link.label}
          style={mobileMenuButtonStyle}
          onClick={() =>
            setMobileMenuView(isSharesEntry ? "shares" : "profile")
          }
        >
          <span style={{ display: "flex", alignItems: "center" }}>
            <Text style={{ fontSize: theme.fontSizes.sm, fontWeight: 500 }}>
              {link.label}
            </Text>
          </span>
        </UnstyledButton>
      );
    }

    if (link.action) {
      return (
        <UnstyledButton
          key={link.label}
          style={mobileMenuButtonStyle}
          onClick={() => void link.action?.()}
        >
          <span style={{ display: "flex", alignItems: "center" }}>
            <Text style={{ fontSize: theme.fontSizes.sm, fontWeight: 500 }}>
              {link.label}
            </Text>
          </span>
        </UnstyledButton>
      );
    }

    const isActive = currentRoute === link.link;
    return (
      <Link
        key={link.label}
        href={link.link ?? ""}
        onClick={() => {
          close();
          setMobileMenuView("root");
        }}
        style={isActive ? linkActiveStyle : linkStyle}
      >
        {link.label}
      </Link>
    );
  };
  return (
    <>
      <Box
        component="header"
        h={HEADER_HEIGHT}
        mb={0}
        style={{ zIndex: 1 }}
      >
        <Container
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            height: "100%",
          }}
        >
          <Link href="/" passHref>
            <Group>
              <img
                src="/img/brasao.png"
                alt="logo"
                height={38}
                width={38}
                style={{ objectFit: "contain" }}
              />
              <Text fw={600}>{config.get("general.appName")}</Text>
            </Group>
          </Link>
          <Group gap={5} style={{ "@media (max-width: 767px)": { display: "none" } } as React.CSSProperties}>
            <Group>{desktopItems}</Group>
          </Group>
          <Burger
            opened={opened}
            onClick={toggle}
            style={{ "@media (min-width: 768px)": { display: "none" } } as React.CSSProperties}
            size="sm"
          />
        </Container>
      </Box>
      <Transition transition="scale-y" duration={20} mounted={opened}>
        {(styles) => (
          <Paper
            style={{
              marginBottom: theme.spacing.md,
              borderTopRightRadius: 0,
              borderTopLeftRadius: 0,
              overflow: "hidden",
              width: "100%",
              "@media (min-width: 768px)": { display: "none" },
              ...styles,
            } as React.CSSProperties}
            withBorder
          >
            <Stack gap={0}>
              {mobileMenuView !== "root" && (
                <UnstyledButton
                  style={mobileMenuButtonStyle}
                  onClick={() => setMobileMenuView("root")}
                >
                  <span style={{ display: "flex", alignItems: "center" }}>
                    <TbChevronLeft size={18} />
                  </span>
                </UnstyledButton>
              )}
              {currentMobileLinks.map((link) => renderMobileEntry(link))}
            </Stack>
          </Paper>
        )}
      </Transition>
      {!opened && <Box mb={40} />}
    </>
  );
};

export default Header;
