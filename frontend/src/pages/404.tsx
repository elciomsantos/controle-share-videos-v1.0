import { Button, Container, Group, Title, useMantineTheme } from "@mantine/core";
import Link from "next/link";
import { FormattedMessage } from "react-intl";
import Meta from "../components/Meta";

const ErrorNotFound = () => {
  const theme = useMantineTheme();

  return (
    <>
      <Meta title="Not found" />
      <Container style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div
          style={{
            textAlign: "center",
            fontWeight: 900,
            fontSize: 220,
            lineHeight: 1,
            marginBottom: 20,
            color: theme.colors.gray[2],
          }}
        >
          404
        </div>
        <Title ta="center" order={3}>
          <FormattedMessage id="404.description" />
        </Title>
        <Group justify="center" mt={50}>
          <Button component={Link} href="/" variant="light">
            <FormattedMessage id="404.button.home" />
          </Button>
        </Group>
      </Container>
    </>
  );
};
export default ErrorNotFound;
