import {
  Button,
  Center,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { modals, useModals } from "@mantine/modals";
import Markdown, { MarkdownToJSX } from "markdown-to-jsx/react";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { Dispatch, SetStateAction, useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import api from "../../services/api.service";
import showErrorModal from "./showErrorModal";
import useTranslate from "../../hooks/useTranslate.hook";

const FilePreviewContext = React.createContext<{
  shareId: string;
  fileId: string;
  mimeType: string;
  setIsNotSupported: Dispatch<SetStateAction<boolean>>;
}>({
  shareId: "",
  fileId: "",
  mimeType: "",
  setIsNotSupported: () => {},
});

/**
 * Probe the file endpoint with a HEAD request before mounting a native
 * media element (<video>/<img>/<audio>). If the backend rejects with an
 * HTTP error we get the structured error code (e.g. share_max_views_exceeded)
 * and can show the proper popup instead of the opaque "onError" fallback
 * that masks the real cause as "Visualização não suportada".
 *
 * Returns true if the media element can be safely rendered.
 */
const useFileProbe = (
  shareId: string,
  fileId: string,
  setIsNotSupported: (v: boolean) => void,
): boolean => {
  const modals = useModals();
  const router = useRouter();
  const t = useTranslate();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/shares/${shareId}/files/${fileId}?download=false`, {
        validateStatus: () => true,
      })
      .then((res) => {
        if (cancelled) return;
        if (res.status >= 200 && res.status < 400) {
          setAllowed(true);
          return;
        }
        const error =
          (res.data && (res.data.error as string)) ||
          (res.headers && (res.headers["x-error"] as string));
        if (error === "share_max_views_exceeded") {
          showErrorModal(
            modals,
            t("share.error.visitor-limit-exceeded.title"),
            t("share.error.visitor-limit-exceeded.description"),
            "stay",
            "/img/images/fechado-down.png",
          );
        } else if (error === "share_password_required" || error === "share_token_required") {
          router.reload();
        } else {
          setIsNotSupported(true);
        }
      })
      .catch(() => {
        if (!cancelled) setIsNotSupported(true);
      });
    return () => {
      cancelled = true;
    };
  }, [shareId, fileId]);

  return allowed;
};

const FilePreview = ({
  shareId,
  fileId,
  mimeType,
}: {
  shareId: string;
  fileId: string;
  mimeType: string;
}) => {
  const [isNotSupported, setIsNotSupported] = useState(false);
  if (isNotSupported) return <UnSupportedFile />;

  return (
    <Stack>
      <FilePreviewContext.Provider
        value={{ shareId, fileId, mimeType, setIsNotSupported }}
      >
        <FileDecider />
      </FilePreviewContext.Provider>
      <Button
        variant="subtle"
        component={Link}
        onClick={() => modals.closeAll()}
        target="_blank"
        href={`/api/shares/${shareId}/files/${fileId}?download=false`}
      >
        View original file
        {/* Add translation? */}
      </Button>
    </Stack>
  );
};

const FileDecider = () => {
  const { mimeType, setIsNotSupported } = React.useContext(FilePreviewContext);

  if (mimeType == "application/pdf") {
    return <PdfPreview />;
  } else if (mimeType.startsWith("video/")) {
    return <VideoPreview />;
  } else if (mimeType.startsWith("image/")) {
    return <ImagePreview />;
  } else if (mimeType.startsWith("audio/")) {
    return <AudioPreview />;
  } else if (mimeType.startsWith("text/")) {
    return <TextPreview />;
  } else {
    setIsNotSupported(true);
    return null;
  }
};

const AudioPreview = () => {
  const { shareId, fileId, setIsNotSupported } =
    React.useContext(FilePreviewContext);
  const allowed = useFileProbe(shareId, fileId, setIsNotSupported);
  if (!allowed) return null;
  return (
    <Center style={{ minHeight: 200 }}>
      <Stack align="center" gap={10} style={{ width: "100%" }}>
        <audio controls style={{ width: "100%" }}>
          <source
            src={`/api/shares/${shareId}/files/${fileId}?download=false`}
            onError={() => setIsNotSupported(true)}
          />
        </audio>
      </Stack>
    </Center>
  );
};

const VideoPreview = () => {
  const { shareId, fileId, setIsNotSupported } =
    React.useContext(FilePreviewContext);
  const allowed = useFileProbe(shareId, fileId, setIsNotSupported);
  if (!allowed) return null;
  return (
    <video width="100%" controls>
      <source
        src={`/api/shares/${shareId}/files/${fileId}?download=false`}
        onError={() => setIsNotSupported(true)}
      />
    </video>
  );
};

const ImagePreview = () => {
  const { shareId, fileId, setIsNotSupported } =
    React.useContext(FilePreviewContext);
  const allowed = useFileProbe(shareId, fileId, setIsNotSupported);
  if (!allowed) return null;
  return (
    <img
      src={`/api/shares/${shareId}/files/${fileId}?download=false`}
      alt={`${fileId}_preview`}
      width="100%"
      onError={() => setIsNotSupported(true)}
    />
  );
};

const TextPreview = () => {
  const { shareId, fileId } = React.useContext(FilePreviewContext);
  const [text, setText] = useState<string>("");
  const colorScheme = useComputedColorScheme("light");

  useEffect(() => {
    api
      .get(`/shares/${shareId}/files/${fileId}?download=false`)
      .then((res) => setText(res.data ?? "Preview couldn't be fetched."));
  }, [shareId, fileId]);

  const options: MarkdownToJSX.Options = {
    disableParsingRawHTML: true,
    overrides: {
      pre: {
        props: {
          style: {
            backgroundColor:
              colorScheme == "dark"
                ? "rgba(50, 50, 50, 0.5)"
                : "rgba(220, 220, 220, 0.5)",
            padding: "0.75em",
            whiteSpace: "pre-wrap",
          },
        },
      },
      table: {
        props: {
          className: "md",
        },
      },
    },
  };

  return <Markdown options={options}>{text}</Markdown>;
};

const PdfPreview = () => {
  const { shareId, fileId } = React.useContext(FilePreviewContext);
  if (typeof window !== "undefined") {
    window.location.href = `/api/shares/${shareId}/files/${fileId}?download=false`;
  }
  return null;
};

const UnSupportedFile = () => {
  return (
    <Center style={{ minHeight: 200 }}>
      <Stack align="center" gap={10}>
        <Title order={3}>
          <FormattedMessage id="share.modal.file-preview.error.not-supported.title" />
        </Title>
        <Text>
          <FormattedMessage id="share.modal.file-preview.error.not-supported.description" />
        </Text>
      </Stack>
    </Center>
  );
};

export default FilePreview;
