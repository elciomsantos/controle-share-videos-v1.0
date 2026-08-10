import shareService from "../services/share.service";

const ALPHANUMERIC_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const PASSWORD_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export const generateShareId = (length: number = 16): string => {
  const randomArray = new Uint8Array(length >= 3 ? length : 3);
  crypto.getRandomValues(randomArray);
  return Array.from(randomArray)
    .map((number) => ALPHANUMERIC_CHARS[number % ALPHANUMERIC_CHARS.length])
    .join("");
};

export const generateAvailableLink = async (
  shareIdLength: number,
  times: number = 10,
): Promise<string> => {
  if (times <= 0) {
    throw new Error("Could not generate available link");
  }
  const _link = generateShareId(shareIdLength);
  if (!(await shareService.isShareIdAvailable(_link))) {
    return await generateAvailableLink(shareIdLength, times - 1);
  } else {
    return _link;
  }
};

export const generateRandomPassword = (length: number = 12): string => {
  const randomArray = new Uint8Array(length);
  crypto.getRandomValues(randomArray);
  return Array.from(randomArray)
    .map((b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length])
    .join("");
};