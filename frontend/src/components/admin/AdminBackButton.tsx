import { Button } from "@mantine/core";
import Link from "next/link";
import { TbArrowLeft } from "react-icons/tb";
import { FormattedMessage } from "react-intl";

const AdminBackButton = () => (
  <Button
    variant="light"
    component={Link}
    href="/admin"
    leftSection={<TbArrowLeft size={14} />}
  >
    <FormattedMessage id="common.button.go-back" />
  </Button>
);

export default AdminBackButton;