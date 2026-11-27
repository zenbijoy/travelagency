import path from 'path';

export interface BaseViteOptions {
  port?: number;
  rootPath?: string;
  aliases?: Record<string, string>;
}

/**
 * Creates a standard Vite configuration for ShopnoJatra frontends (web-agency, web-hotel, web-admin)
 */
export function createViteConfig(options: BaseViteOptions = {}) {
  const root = options.rootPath || process.cwd();
  const port = options.port || 3000;

  return {
    server: {
      port,
      host: true,
      strictPort: false,
    },
    resolve: {
      alias: {
        '@': path.resolve(root, './src'),
        '@shopnojatra/design-tokens': path.resolve(root, '../../packages/design-tokens/src'),
        '@shopnojatra/web-config': path.resolve(root, '../../packages/web-config/src'),
        '@shopnojatra/validation': path.resolve(root, '../../packages/validation/src'),
        '@shopnojatra/api-client': path.resolve(root, '../../packages/api-client/src'),
        '@shopnojatra/design-system': path.resolve(root, '../../packages/design-system/src'),
        ...options.aliases,
      },
    },
    build: {
      target: 'esnext',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) {
                return 'vendor-react';
              }
              if (id.includes('@tanstack')) {
                return 'vendor-tanstack';
              }
              if (id.includes('zod')) {
                return 'vendor-zod';
              }
            }
          },
        },
      },
    },
  };
}
