import { useMantineColorScheme } from "@mantine/core";
import { useEffect, useState } from "react";

const defaultLogoSrc = "/img/tela-fundo.png";
const darkLogoSrc = "/img/logo-dark.png";

const Logo = ({ height, width }: { height: number; width: number }) => {
  const { colorScheme } = useMantineColorScheme();
  const preferredLogoSrc =
    colorScheme === "dark" ? darkLogoSrc : defaultLogoSrc;
  const [logoSrc, setLogoSrc] = useState(preferredLogoSrc);

  useEffect(() => {
    setLogoSrc(preferredLogoSrc);
  }, [preferredLogoSrc]);

  return (
    <img
      src={logoSrc}
      alt="logo"
      style={{ height, width: "auto", maxWidth: width, objectFit: "contain" }}
      onError={() => {
        if (logoSrc !== defaultLogoSrc) setLogoSrc(defaultLogoSrc);
      }}
    />
  );
};
export default Logo;
