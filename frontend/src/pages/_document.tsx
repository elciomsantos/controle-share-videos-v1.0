import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import { Head, Html, Main, NextScript } from "next/document";

export default function _Document() {
  return (
    <Html lang="pt-BR" {...mantineHtmlProps}>
      <Head>
        <ColorSchemeScript defaultColorScheme="light" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/x-icon" href="/img/favicon.ico" />
        <link rel="apple-touch-icon" href="/img/icons/icon-128x128.png" />

        <meta name="robots" content="noindex" />
        <meta name="theme-color" content="#46509e" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
