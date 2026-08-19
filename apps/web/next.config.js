/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // @unodigit/ba-bot-contract publishes raw TypeScript (`main: ./src/index.ts`)
  // rather than a build step, so Next has to compile it like first-party source.
  transpilePackages: ['@unodigit/ba-bot-contract'],
};

module.exports = nextConfig;
