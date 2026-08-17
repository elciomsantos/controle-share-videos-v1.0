import useTranslate from "../../../../hooks/useTranslate.hook";
import Meta from "../../../../components/Meta";
import TotpEnrollForm from "../../../../components/auth/TotpEnrollForm";
import { useRouter } from "next/router";

const TotpEnroll = () => {
  const t = useTranslate();
  const router = useRouter();

  return (
    <>
      <Meta title={t("totp.enroll.title")} />
      <TotpEnrollForm
        loginToken={router.query.loginToken as string}
        redirectPath={(router.query.redirect as string) || "/upload"}
      />
    </>
  );
};

export default TotpEnroll;