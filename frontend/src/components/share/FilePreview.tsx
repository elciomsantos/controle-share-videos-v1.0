import {
  ActionIcon,
  Box,
  Button,
  Center,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { modals, useModals } from "@mantine/modals";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { Dispatch, SetStateAction, useEffect, useState } from "react";
import { TbArrowsMaximize, TbArrowsMinimize } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import api from "../../services/api.service";
import showErrorModal from "./showErrorModal";
import useTranslate from "../../hooks/useTranslate.hook";
import MarkdownRenderer from "../../components/MarkdownRenderer";

const FilePreviewContext = React.createContext<{
  shareId: string;
  fileId: string;
  mimeType: string;
  fileDescription: string;
  setIsNotSupported: Dispatch<SetStateAction<boolean>>;
}>({
  shareId: "",
  fileId: "",
  mimeType: "",
  fileDescription: "",
  setIsNotSupported: () => {},
});

/**
 * Show the "max views exceeded" modal once per preview session when the limit
 * is reached (triggered either by POST /view returning 403 or by a stream
 * request returning 403). This avoids stacking multiple modals when the player
 * tries to retry.
 */
const useViewLimitModal = (): ((error: string | undefined) => void) => {
  const modals = useModals();
  const t = useTranslate();
  const shownRef = React.useRef(false);
  return (error: string | undefined) => {
    if (shownRef.current) return;
    if (error !== "share_max_views_exceeded") return;
    shownRef.current = true;
    showErrorModal(
      modals,
      t("share.error.visitor-limit-exceeded.title"),
      t("share.error.visitor-limit-exceeded.description"),
      "stay",
      "/img/images/fechado-down.png",
    );
  };
}

/**
 * Notify the backend that a media playback has started. Returns true if the
 * play is allowed (under the view limit), false if the limit was reached.
 *
 * Semantics: maxViews now counts *plays* rather than page loads — see
 * backend `POST /api/shares/:id/view`. The frontend calls this on the
 * <video>/<audio> `onPlay` event; on 403 (share_max_views_exceeded) the
 * caller pauses the player and shows the limit-exceeded modal.
 */
const useRecordPlayView = (
  shareId: string,
  onError: (error: string | undefined) => void,
): ((allowCallback: () => void) => Promise<void>) => {
  return React.useCallback(
    async (allowCallback: () => void) => {
      try {
        await api.post(`/shares/${shareId}/view`);
        allowCallback();
      } catch (e) {
        const err = e as { response?: { data?: { error?: string } } };
        const error = err?.response?.data?.error;
        onError(error);
      }
    },
    [shareId, onError],
  );
}

/**
 * Probe the file endpoint with a HEAD-style GET request before mounting a
 * native media element (<video>/<img>/<audio>). If the backend rejects with
 * an HTTP error we get the structured error code (e.g.
 * share_max_views_exceeded) and can show the proper popup instead of the
 * opaque "onError" fallback that masks the real cause as "Visualização não
 * suportada".
 *
 * Returns true if the media element can be safely rendered (stream not yet
 * blocked); the per-play view accounting happens on `onPlay` via
 * useRecordPlayView.
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
}

const FilePreview = ({
  shareId,
  fileId,
  mimeType,
  description,
}: {
  shareId: string;
  fileId: string;
  mimeType: string;
  description?: string;
}) => {
  const [isNotSupported, setIsNotSupported] = useState(false);
  if (isNotSupported) return <UnSupportedFile />;

  return (
    <Stack>
      <FilePreviewContext.Provider
        value={{
          shareId,
          fileId,
          mimeType,
          fileDescription: description ?? "",
          setIsNotSupported,
        }}
      >
        <FileDecider />
      </FilePreviewContext.Provider>
      <Button
        variant="subtle"
        component={Link}
        onClick={() => modals.closeAll()}
        target="_blank"
        rel="noopener noreferrer"
        href={`/api/shares/${shareId}/files/${fileId}?download=false`}
      >
        View original file
        {/* Add translation? */}
      </Button>
    </Stack>
  );
}

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
}

const AudioPreview = () => {
  const { shareId, fileId, setIsNotSupported } =
    React.useContext(FilePreviewContext);
  const allowed = useFileProbe(shareId, fileId, setIsNotSupported);
  const showError = useViewLimitModal();
  const recordView = useRecordPlayView(shareId, showError);
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const recordingRef = React.useRef(false);
  if (!allowed) return null;
  return (
    <Center style={{ minHeight: 200 }}>
      <Stack align="center" gap={10} style={{ width: "100%" }}>
        <audio
          ref={audioRef}
          controls
          style={{ width: "100%" }}
          onPlay={async () => {
            const a = audioRef.current;
            if (!a || recordingRef.current) return;
            recordingRef.current = true;
            a.pause();
            await recordView(() => {
              a.play().catch(() => setIsNotSupported(true));
            });
            window.setTimeout(() => {
              recordingRef.current = false;
            }, 2000);
          }}
          onError={() => setIsNotSupported(true)}
        >
          <source
            src={`/api/shares/${shareId}/files/${fileId}?download=false`}
          />
        </audio>
      </Stack>
    </Center>
  );
}

const getFullscreenElement = (): Element | null => {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return doc.fullscreenElement || doc.webkitFullscreenElement || null;
};

const requestFullscreen = (el: HTMLElement): void => {
  const target = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  if (target.requestFullscreen) {
    target.requestFullscreen().catch(() => {});
  } else if (target.webkitRequestFullscreen) {
    target.webkitRequestFullscreen();
  }
};

const exitFullscreen = (): void => {
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };
  if (doc.exitFullscreen) {
    doc.exitFullscreen().catch(() => {});
  } else if (doc.webkitExitFullscreen) {
    doc.webkitExitFullscreen();
  }
};

const VideoPreview = () => {
  const { shareId, fileId, fileDescription, setIsNotSupported } =
    React.useContext(FilePreviewContext);
  const allowed = useFileProbe(shareId, fileId, setIsNotSupported);
  const showError = useViewLimitModal();
  const recordView = useRecordPlayView(shareId, showError);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const recordingRef = React.useRef(false);
  const wrapperFullscreenRef = React.useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const t = useTranslate();

  useEffect(() => {
    const handleFullscreenChange = () => {
      const video = videoRef.current;
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const fullscreenElement = getFullscreenElement();
      const wrapperWasFullscreen = wrapperFullscreenRef.current;
      wrapperFullscreenRef.current = fullscreenElement === wrapper;
      setIsFullscreen(fullscreenElement === wrapper);
      // A tarja de proteção é irmã do <video> e só é exibida enquanto o wrapper
      // (vídeo + tarja) estiver em fullscreen. Se o navegador colocar o <video>
      // em fullscreen direto (botão nativo em navegadores sem o CSS de ocultação
      // ou outro caminho), movemos o fullscreen para o wrapper para manter a
      // tarja visível. O guard wrapperWasFullscreen evita reentrar em fullscreen
      // durante a transição de saída (senão o usuário ficaria preso em tela cheia).
      if (fullscreenElement === video && !wrapperWasFullscreen) {
        requestFullscreen(wrapper);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange,
      );
    };
  }, []);

  const toggleFullscreen = () => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    if (getFullscreenElement() === wrapper) {
      exitFullscreen();
    } else {
      requestFullscreen(wrapper);
    }
  };

  if (!allowed) return null;
  return (
    <Box pos="relative" ref={wrapperRef}>
      <video
        ref={videoRef}
        width="100%"
        controls
        onPlay={async () => {
          const v = videoRef.current;
          if (!v || recordingRef.current) return;
          recordingRef.current = true;
          v.pause();
          await recordView(() => {
            v.play().catch(() => setIsNotSupported(true));
          });
          window.setTimeout(() => {
            recordingRef.current = false;
          }, 2000);
        }}
        onPlaying={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => setIsNotSupported(true)}
      >
        <source
          src={`/api/shares/${shareId}/files/${fileId}?download=false`}
        />
      </video>
      <ActionIcon
        size="lg"
        variant="filled"
        radius="sm"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 10,
          backgroundColor: "rgba(0, 0, 0, 0.55)",
          color: "#fff",
        }}
        onClick={toggleFullscreen}
        aria-label={
          isFullscreen
            ? t("share.video.fullscreen-exit")
            : t("share.video.fullscreen-enter")
        }
      >
        {isFullscreen ? <TbArrowsMinimize /> : <TbArrowsMaximize />}
      </ActionIcon>
      {isPlaying && (
        <Text
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 5,
            pointerEvents: "none",
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            color: "#fff",
            padding: "4px 12px",
            borderRadius: 4,
            fontSize: 12,
            maxWidth: "90%",
            textAlign: "center",
          }}
        >
          {t("share.video.protection-notice")}
          {fileDescription ? ` ${fileDescription}` : ""}
        </Text>
      )}
    </Box>
  );
}

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
}

const TextPreview = () => {
  const { shareId, fileId } = React.useContext(FilePreviewContext);
  const [text, setText] = useState<string>("");
  const colorScheme = useComputedColorScheme("light");

  useEffect(() => {
    api
      .get(`/shares/${shareId}/files/${fileId}?download=false`)
      .then((res) => setText(res.data ?? "Preview couldn't be fetched."));
  }, [shareId, fileId]);

  return <MarkdownRenderer forceBlock>{text}</MarkdownRenderer>;
}

const PdfPreview = () => {
  const { shareId, fileId } = React.useContext(FilePreviewContext);
  const [loaded, setLoaded] = useState(false);

  return (
    <iframe
      src={`/api/shares/${shareId}/files/${fileId}?download=false`}
      width="100%"
      height="600px"
      style={{ border: "none", borderRadius: 8 }}
      title="PDF Preview"
      onLoad={() => setLoaded(true)}
      sandbox="allow-scripts allow-same-origin"
    />
  );
}

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
}

export default FilePreview;
