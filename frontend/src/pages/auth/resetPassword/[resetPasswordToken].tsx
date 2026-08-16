import { useRouter } from "next/router";
import ResetPasswordForm from "../../../components/auth/ResetPasswordForm";

const ResetPassword = () => {
  const router = useRouter();
  const resetPasswordToken = router.query.resetPasswordToken as string;

  if (!resetPasswordToken) return null;

  return <ResetPasswordForm token={resetPasswordToken} />;
};

export default ResetPassword;