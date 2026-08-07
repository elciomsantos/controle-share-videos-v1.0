import { Module } from "@nestjs/common";
import { CacheModule } from "@nestjs/cache-manager";
import { CacheableMemory } from "cacheable";
import { createKeyv } from "@keyv/redis";
import { Keyv } from "keyv";
import { ConfigModule } from "../config/config.module";
import { ConfigService } from "../config/config.service";

@Module({
  imports: [
    ConfigModule,
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const useRedis = configService.getBoolean("cache.redis-enabled");
        const ttl = configService.getNumber("cache.ttl");
        const max = configService.getNumber("cache.maxItems");

        // Always provision an in-memory store so cache.get()/set() actually
        // work even without Redis. Previously stores was empty when Redis was
        // disabled, making the cache a silent no-op (view dedup and download
        // notification dedup never worked).
        const stores: Keyv[] = [
          new Keyv({ store: new CacheableMemory({ ttl, lruSize: 5000 }) }),
        ];

        if (useRedis) {
          const redisUrl = configService.getString("cache.redis-url");
          stores.push(createKeyv(redisUrl));
        }

        return { ttl, max, stores };
      },
    }),
  ],
  exports: [CacheModule],
})
export class AppCacheModule {}
