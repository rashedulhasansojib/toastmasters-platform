/** DI token for the shared ioredis client — Redis itself isn't a class Nest can key providers by. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
