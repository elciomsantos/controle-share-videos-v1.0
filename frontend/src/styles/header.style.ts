import type { MantineTheme } from "@mantine/core";

const headerStyle = (theme: MantineTheme) => ({
  root: {
    position: "relative" as const,
    zIndex: 1,
  },

  dropdown: {
    position: "absolute" as const,
    top: 60,
    left: 0,
    right: 0,
    zIndex: 0,
    borderTopRightRadius: 0,
    borderTopLeftRadius: 0,
    borderTopWidth: 0,
    overflow: "hidden" as const,

    "@media (min-width: 768px)": {
      display: "none",
    },
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    height: "100%",
  },

  links: {
    "@media (max-width: 767px)": {
      display: "none",
    },
  },

  burger: {
    "@media (min-width: 768px)": {
      display: "none",
    },
  },

  link: {
    display: "block",
    lineHeight: 1,
    padding: "8px 12px",
    borderRadius: theme.radius.sm,
    textDecoration: "none",
    color:
      "light-dark(" + theme.colors.gray[7] + ", " + theme.colors.dark[0] + ")",
    fontSize: theme.fontSizes.sm,
    fontWeight: 500,

    "&:hover": {
      backgroundColor: "light-dark(" + theme.colors.gray[0] + ", " + theme.colors.dark[6] + ")",
    },

    "@media (max-width: 767px)": {
      borderRadius: 0,
      padding: theme.spacing.md,
    },
  },

  linkActive: {
    "&, &:hover": {
      backgroundColor: "light-dark(" + theme.colors[theme.primaryColor][0] + ", rgba(" + theme.colors[theme.primaryColor][9] + ", 0.25))",
      color: theme.colors[theme.primaryColor][7],
    },
  },
});

export default headerStyle;
