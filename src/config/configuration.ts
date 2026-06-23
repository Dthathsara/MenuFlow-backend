export default () => ({
  port: parseInt(process.env.PORT, 10) || 3001,
  database: { url: process.env.DATABASE_URL },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '30m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL, 10),
    limit: parseInt(process.env.THROTTLE_LIMIT, 10),
  },
});
