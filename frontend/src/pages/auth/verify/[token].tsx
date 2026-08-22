import {
  Container,
  Title,
  Text,
  Button,
  Paper,
  Stack,
  Loader,
} from "@mantine/core";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import authService from "../../../services/auth.service";
import toast from "../../../utils/toast.util";
import useTranslate from "../../../hooks/useTranslate.hook";
import Meta from "../../../components/Meta";
import { getHashValue } from "../../../utils/hash.util";

export default function VerifyAccount() {
  const router = useRouter();
  const { token: queryToken } = router.query;
  const t = useTranslate();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );

  useEffect(() => {
    // SEC-NEW-1: o token chega no fragment (#token=...), fora do path.
    // Fallback para o query token (links antigos com token no path).
    const token = (getHashValue("token") as string) || (queryToken as string);
    if (!token) {
      setStatus("error");
      return;
    }

    authService
      .verifyAccount(token)
      .then(() => setStatus("success"))
      .catch((e) => {
        toast.axiosError(e);
        setStatus("error");
      });
  }, [queryToken]);

  return (
    <>
      <Meta title={t("verify.title")} />
      <Container size={420} my={40}>
        <Title order={2} ta="center" fw={900}>
          <FormattedMessage id="verify.title" />
        </Title>
        <Paper withBorder shadow="md" p={30} mt={30} radius="md">
          <Stack align="center">
            {status === "loading" && <Loader />}
            {status === "success" && (
              <>
                <Text ta="center">
                  <FormattedMessage id="verify.success" />
                </Text>
                <Button
                  fullWidth
                  mt="xl"
                  onClick={() => router.replace("/auth/signIn")}
                >
                  <FormattedMessage id="verify.button.signin" />
                </Button>
              </>
            )}
            {status === "error" && (
              <>
                <Text ta="center">
                  <FormattedMessage id="verify.error" />
                </Text>
                <Button
                  fullWidth
                  mt="xl"
                  variant="outline"
                  onClick={() => router.replace("/auth/signIn")}
                >
                  <FormattedMessage id="error.button.back" />
                </Button>
              </>
            )}
          </Stack>
        </Paper>
      </Container>
    </>
  );
}