import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 启用 forbidden()/unauthorized()，班级模块用它对非成员返回真实 403
    authInterrupts: true,
  },
};

export default nextConfig;
