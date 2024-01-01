/** @type {import('next').NextConfig} */
const nextConfig = {
  // images: {
  //   remotePatterns: [
  //     {
  //       protocol: 'https',
  //       hostname: 'www.gravatar.com',
  //       port: '',
  //       pathname: '',
  //     },
  //   ],
  // },
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },

}

module.exports = nextConfig
