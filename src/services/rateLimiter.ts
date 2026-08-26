import { redis } from '../queue/redis.js';

const rateLimitLua = `
local key = KEYS[1]
local maxAllowed = tonumber(ARGV[1])
local ttlMs = tonumber(ARGV[2])
local current = tonumber(redis.call('GET', key) or '0')
if current >= maxAllowed then
  return {0, redis.call('PTTL', key)}
end
current = redis.call('INCR', key)
if current == 1 then
  redis.call('PEXPIRE', key, ttlMs)
end
return {1, current}
`;

function getMsUntilNextHour(now: Date): number {
  const next = new Date(now);
  next.setMinutes(60, 0, 0);
  return Math.max(1, next.getTime() - now.getTime());
}

export async function tryAcquireHourlySlot(senderEmail: string, maxAllowed: number): Promise<{ allowed: boolean; retryInMs: number }> {
  const now = new Date();
  const hourWindow = new Date(now);
  hourWindow.setMinutes(0, 0, 0);

  const key = `email-rate:${senderEmail}:${hourWindow.toISOString()}`;
  const ttlMs = getMsUntilNextHour(now);

  const result = (await redis.eval(rateLimitLua, 1, key, String(maxAllowed), String(ttlMs))) as [number, number];
  const allowed = Number(result[0]) === 1;

  if (allowed) {
    return { allowed: true, retryInMs: 0 };
  }

  const pttl = Number(result[1]);
  return { allowed: false, retryInMs: pttl > 0 ? pttl : ttlMs };
}
