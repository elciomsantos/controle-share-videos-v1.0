import { NextApiRequest, NextApiResponse } from "next";
import httpProxy from "http-proxy";

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

const apiURL = process.env.API_URL || "http://localhost:8080";

const proxy = httpProxy.createProxyServer();

export default (req: NextApiRequest, res: NextApiResponse) => {
  return new Promise<void>((resolve) => {
    proxy.web(req, res, {
      headers: {
        "X-Forwarded-For": (req.socket?.remoteAddress ?? "") as string,
      },
      target: apiURL,
    }, () => {
      resolve();
    });
  });
};
