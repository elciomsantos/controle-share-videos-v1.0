import { LoadingOverlay } from "@mantine/core";
import { GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import SignInForm from "../../components/auth/SignInForm";
import Meta from "../../components/Meta";
import useUser from "../../hooks/user.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import { safeRedirectPath } from "../../utils/router.util";

export function getServerSideProps(context: GetServerSidePropsContext) {
  return {
    props: { redirectPath: context.query.redirect ?? null },
  };
}

const SignIn = ({ redirectPath }: { redirectPath?: string | null }) => {
  const { refreshUser } = useUser();
  const router = useRouter();
  const t = useTranslate();

  // Sanitiza uma única vez: query ?redirect= nunca vai direto ao
  // router.replace (open redirect via "//host" — issue #41).
  const safeRedirect = safeRedirectPath(redirectPath ?? undefined);

  const [isLoading, setIsLoading] = useState(safeRedirect !== "/" ? true : false);

  // If the access token is expired, the middleware redirects to this page.
  // If the refresh token is still valid, the user will be redirected to the last page.
  useEffect(() => {
    refreshUser().then((user) => {
      if (user) {
        router.replace(safeRedirect);
      } else {
        setIsLoading(false);
      }
    });
  }, []);

  if (isLoading) return <LoadingOverlay visible zIndex={1000} />;

  return (
    <>
      <Meta title={t("signin.title")} />
      <SignInForm redirectPath={safeRedirect} />
    </>
  );
};
export default SignIn;
