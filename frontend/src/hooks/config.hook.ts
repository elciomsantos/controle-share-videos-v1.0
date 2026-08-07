import { createContext, useContext } from "react";
import configService from "../services/config.service";
import { ConfigHook } from "../types/config.type";
import type { GetReturn } from "../types/config.type";

export const ConfigContext = createContext<ConfigHook>({
  configVariables: [],
  refresh: async () => {},
});

const useConfig = () => {
  const configContext = useContext(ConfigContext);
  return {
    get: <K extends string>(key: K, returnDefault?: boolean): GetReturn<K> =>
      configService.get(key, configContext.configVariables, returnDefault),
    refresh: async () => configContext.refresh(),
  };
};

export default useConfig;
