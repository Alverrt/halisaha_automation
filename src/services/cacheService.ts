import Redis from 'ioredis';
import { config } from '../config';

class CacheService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError(err) {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
    });

    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    this.redis.on('connect', () => {
      console.log('Redis connected successfully');
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set(key: string, value: any, expirationSeconds?: number): Promise<void> {
    try {
      const stringValue = JSON.stringify(value);
      if (expirationSeconds) {
        await this.redis.setex(key, expirationSeconds, stringValue);
      } else {
        await this.redis.set(key, stringValue);
      }
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error('Cache invalidate pattern error:', error);
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  // Helper methods for common cache patterns
  async getOrSet<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    expirationSeconds?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await fetchFunction();
    await this.set(key, fresh, expirationSeconds);
    return fresh;
  }

  // Generate cache key for week table
  getWeekTableCacheKey(weekOffset: number): string {
    return `week_table:${weekOffset}`;
  }

  // Generate cache key for analytics
  getAnalyticsCacheKey(type: string, startDate: string, endDate: string): string {
    return `analytics:${type}:${startDate}:${endDate}`;
  }
}

export const cacheService = new CacheService();
