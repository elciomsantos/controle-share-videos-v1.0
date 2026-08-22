import { Title } from "@mantine/core";
import Meta from "../../components/Meta";
import useTranslate from "../../hooks/useTranslate.hook";
import { FormattedMessage } from "react-intl";
import useConfig from "../../hooks/config.hook";
import MarkdownRenderer from "../../components/MarkdownRenderer";

const Imprint = () => {
  const t = useTranslate();
  const config = useConfig();
  return (
    <>
      <Meta title={t("imprint.title")} />
      <Title mb={30} order={1}>
        <FormattedMessage id="imprint.title" />
      </Title>
      <MarkdownRenderer forceBlock>
        {config.get("legal.imprintText")}
      </MarkdownRenderer>
    </>
  );
};

export default Imprint;
