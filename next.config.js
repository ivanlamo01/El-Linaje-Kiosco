const isFirebaseHosting =
  Boolean(process.env.FIREBASE_CONFIG) ||
  Boolean(process.env.GOOGLE_CLOUD_PROJECT) ||
  Boolean(process.env.K_SERVICE);

const isStaticBuild =
  !isFirebaseHosting &&
  (process.env.IS_MOBILE_BUILD === "true" ||
    process.env.NEXT_PUBLIC_IS_ELECTRON === "true");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isStaticBuild ? 'export' : undefined,
  images: {
    unoptimized: isStaticBuild,
  },
  trailingSlash: isStaticBuild,
};

module.exports = nextConfig;
