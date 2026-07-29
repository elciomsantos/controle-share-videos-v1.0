import { Anchor, Title, useComputedColorScheme } from "@mantine/core";
import Meta from "../../components/Meta";
import useTranslate from "../../hooks/useTranslate.hook";
import { FormattedMessage } from "react-intl";
import useConfig from "../../hooks/config.hook";
import MarkdownRenderer from "../../components/MarkdownRenderer";

const PrivacyPolicy = () => {
  const t = useTranslate();
  const colorScheme = useComputedColorScheme("light");
  const config = useConfig();
  return (
    <>
      <Meta title={t("privacy.title")} />
      <Title mb={30} order={1}>
        <FormattedMessage id="privacy.title" />
      </Title>
      <MarkdownRenderer forceBlock>
        {config.get("legal.privacyPolicyText")}
      </MarkdownRenderer>
    </>
  );
};

export default PrivacyPolicy;
