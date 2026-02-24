const isStaticBuild = !!(process.env.IS_MOBILE_BUILD || process.env.NEXT_PUBLIC_IS_ELECTRON);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isStaticBuild ? 'export' : undefined,
  images: {
    unoptimized: isStaticBuild,
  },
  trailingSlash: isStaticBuild,
};

module.exports = nextConfig;
